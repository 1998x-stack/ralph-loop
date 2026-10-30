'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {loadPRD,validatePRD} = require('./prd-state');
const {StateStore,hash} = require('./state-store');
const {transition,createState,nextStory,statusSummary,startAttempt} = require('./state-machine');
const {loadManifest,snapshotProtected,runChecks} = require('./test-runner');
const {evaluate} = require('./evaluator');
const {executeCLI,DEFAULTS} = require('./runner');

class VerifiedRalphLoop {
  constructor(config={}, deps={}) {
    this.config={...DEFAULTS,maxAttemptsPerStory:3,verificationFile:'ralph.verify.json',...config};
    this.cwd=path.resolve(deps.cwd??process.cwd());
    this.execute=deps.execute??executeCLI;
    this.check=deps.check;
    this.print=deps.print??console.log;
    this.store=deps.store??new StateStore(this.cwd);
  }
  filename(relative){return path.resolve(this.cwd,relative);}
  readSpecs(){
    const prdFile=this.filename(this.config.prdFile);
    const verifyFile=this.filename(this.config.verificationFile);
    const prd=loadPRD(prdFile);
    const manifest=loadManifest(verifyFile,new Set(validatePRD(prd).map(s=>s.id)));
    return {prd,manifest,prdHash:hash(fs.readFileSync(prdFile)),manifestHash:hash(fs.readFileSync(verifyFile))};
  }
  async run() {
    const spec=this.readSpecs();
    if(!fs.existsSync(this.filename(this.config.promptFile)))throw new Error(`Missing prompt: ${this.config.promptFile}`);
    if(this.config.dryRun){const state=createState(spec.prd,spec);this.print(JSON.stringify(statusSummary(spec.prd,state)));return {success:true,reason:'dry-run',iterations:0};}
    execFileSync('git',['rev-parse','--git-dir'],{cwd:this.cwd,stdio:'ignore'});
    this.store.acquire();
    try {return await this.executeRun(spec);} finally {this.store.release();}
  }
  async executeRun(spec) {
    let state=this.store.read();
    if(state){
      if(state.schemaVersion!==2 || state.prdHash!==spec.prdHash || state.manifestHash!==spec.manifestHash) throw new Error('PRD or verification manifest differs from persisted run; refusing unsafe resume');
      if(state.status==='completed')return {success:true,reason:'previously-verified',iterations:0};
      if(state.status==='running')return {success:false,reason:'unclean-shutdown-requires-recovery',iterations:0};
      if(state.status==='failed'||state.status==='cancelled')return {success:false,reason:'previous-run-terminal',iterations:0};
      if(state.status!=='paused')throw new Error(`Unknown run status: ${state.status}`);
      transition(state,'run','running');
    } else {state=createState(spec.prd,spec);transition(state,'run','running');}
    this.store.write(state);
    const protectedBaseline=snapshotProtected(this.cwd,spec.manifest.protectedPaths);
    let noProgress=0;
    for(let i=1;i<=this.config.maxIterations;i++) {
      const selected=nextStory(spec.prd,state);
      if(!selected) {
        const done=statusSummary(spec.prd,state).complete;
        transition(state,'run',done?'completed':'failed');this.store.write(state);
        return {success:done,reason:done?'verified-complete':'blocked-or-unmet-dependencies',iterations:i-1,state:statusSummary(spec.prd,state)};
      }
      const story=state.stories[selected.id];
      const attempt=startAttempt(state,selected.id);
      this.store.write(state);
      this.print(`[verified ${i}/${this.config.maxIterations}] ${selected.id} attempt ${story.attempts}`);
      const prompt=fs.readFileSync(this.filename(this.config.promptFile),'utf8')+`\n\n# Assigned story\n${JSON.stringify(selected)}\nDo not modify prd.json, test files, or verification config. Do not claim that tests passed; the independent runner decides.\n`;
      let result;
      try {result=await this.execute({tool:this.config.tool,prompt,cwd:this.cwd,timeoutSeconds:this.config.timeoutSeconds,onOutput:()=>{}});}
      catch(err){result={exitCode:null,error:String(err)};}
      const currentPrd=hash(fs.readFileSync(this.filename(this.config.prdFile)));
      const currentManifest=hash(fs.readFileSync(this.filename(this.config.verificationFile)));
      const protectedOk=snapshotProtected(this.cwd,spec.manifest.protectedPaths)===protectedBaseline;
      const tampered=currentPrd!==spec.prdHash||currentManifest!==spec.manifestHash||!protectedOk;
      let evidence;
      if(result.cancelled) transition(attempt,'attempt','cancelled');
      else if(result.timedOut)transition(attempt,'attempt','timed_out');
      else if(result.exitCode!==0)transition(attempt,'attempt','failed');
      else if(tampered)transition(attempt,'attempt','failed');
      else {
        transition(attempt,'attempt','implementation_ready');
        transition(story,'story','verifying');
        transition(attempt,'attempt','verifying');
        const checks=await runChecks({manifest:spec.manifest,cwd:this.cwd,storyId:selected.id,runner:this.check});
        const prdOk=hash(fs.readFileSync(this.filename(this.config.prdFile)))===spec.prdHash;
        const manifestOk=hash(fs.readFileSync(this.filename(this.config.verificationFile)))===spec.manifestHash;
        const protectedIntact=snapshotProtected(this.cwd,spec.manifest.protectedPaths)===protectedBaseline;
        evidence=evaluate({storyId:selected.id,manifest:spec.manifest,checks,manifestIntact:manifestOk&&prdOk,protectedIntact});
        const artifact=this.store.writeEvidence(attempt.id,{runId:state.runId,attemptId:attempt.id,storyId:selected.id,checks,evaluation:evidence,manifestHash:spec.manifestHash,prdHash:spec.prdHash,createdAt:new Date().toISOString()});
        attempt.evidencePath=path.relative(this.cwd,artifact);
        transition(attempt,'attempt',evidence.passed?'passed':'failed');
        transition(story,'story',evidence.passed?'passed':story.attempts>=this.config.maxAttemptsPerStory?'blocked':'retryable');
      }
      if(!evidence){
        attempt.failureReason=tampered?'protected-input-modified':result.cancelled?'cancelled':result.timedOut?'timeout':'agent-error';
        transition(story,'story',story.attempts>=this.config.maxAttemptsPerStory?'blocked':'retryable');
      }
      this.store.write(state);
      if(tampered || result.cancelled || result.timedOut){transition(state,'run',result.cancelled?'cancelled':'failed');this.store.write(state);return {success:false,reason:tampered?'untrusted-input-change':result.cancelled?'cancelled':'timeout',iterations:i};}
      noProgress=story.status==='passed'?0:noProgress+1;
      if(statusSummary(spec.prd,state).complete){transition(state,'run','completed');this.store.write(state);return {success:true,reason:'verified-complete',iterations:i};}
      if(noProgress>=this.config.maxNoProgress){transition(state,'run','paused');this.store.write(state);return {success:false,reason:'no-progress',iterations:i};}
      if(this.config.iterationDelaySec&&i<this.config.maxIterations)await new Promise(r=>setTimeout(r,this.config.iterationDelaySec*1000));
    }
    transition(state,'run','paused');this.store.write(state);
    return {success:false,reason:'max-iterations',iterations:this.config.maxIterations};
  }
}
module.exports={VerifiedRalphLoop};
