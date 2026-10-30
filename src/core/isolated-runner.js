'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {VerifiedRalphLoop}=require('./verified-runner');
const {createState,transition,startAttempt,nextStory,statusSummary}=require('./state-machine');
const {hash}=require('./state-store');
const {runChecks,snapshotProtected}=require('./test-runner');
const {evaluate}=require('./evaluator');
const {git,repoRoot,headSha,assertClean,createTempGroup,createWorktree,removeWorktree,preparePatch,applyPatch,commitAccepted,moveRunRef}=require('./worktree');

class IsolatedRalphLoop extends VerifiedRalphLoop {
  constructor(config={},deps={}){super(config,deps);}
  async run(){
    const spec=this.readSpecs();
    if(!fs.existsSync(this.filename(this.config.promptFile)))throw new Error('Missing trusted prompt');
    const root=repoRoot(this.cwd);
    if(root!==this.cwd)throw new Error('V1.3 must run from Git repository root');
    if(this.config.dryRun){this.print(JSON.stringify({mode:'isolated',nextStory:nextStory(spec.prd,createState(spec.prd,spec))?.id??null}));return {success:true,reason:'dry-run',iterations:0};}
    assertClean(this.cwd);
    this.store.acquire();
    try{return await this.executeIsolated(spec);}finally{this.store.release();}
  }
  async executeIsolated(spec){
    let state=this.store.read();
    if(state){
      if(state.schemaVersion!==3||state.prdHash!==spec.prdHash||state.manifestHash!==spec.manifestHash)throw Error('Run schema or trusted inputs changed; refusing resume');
      if(state.status==='completed')return {success:true,reason:'previously-verified',iterations:0};
      if(state.status!=='paused')return {success:false,reason:'run-not-safely-resumable',iterations:0};
      if(headSha(this.cwd)!==state.sourceHead)throw Error('Source repo HEAD changed during paused run');
      if(git(this.cwd,['rev-parse','--verify',state.runRef]).trim()!==state.integrationHead)throw Error('Run integration ref changed unexpectedly');
      transition(state,'run','running');
    } else {
      state=createState(spec.prd,spec);state.schemaVersion=3;
      state.sourceHead=headSha(this.cwd);state.integrationHead=state.sourceHead;
      state.runRef='refs/heads/ralph/run-'+state.runId;
      moveRunRef(this.cwd,state.runRef,state.sourceHead);
      transition(state,'run','running');
    }
    this.store.write(state);
    let noProgress=0;
    for(let i=1;i<=this.config.maxIterations;i++){
      const selected=nextStory(spec.prd,state);
      if(!selected){const done=statusSummary(spec.prd,state).complete;transition(state,'run',done?'completed':'failed');this.store.write(state);return {success:done,reason:done?'verified-complete':'blocked-or-unmet-dependencies',iterations:i-1};}
      const story=state.stories[selected.id];const attempt=startAttempt(state,selected.id);attempt.baseSha=state.integrationHead;this.store.write(state);
      const temp=createTempGroup();const candidate=path.join(temp,'candidate');const review=path.join(temp,'review');
      let verdict=null, result=null, reason=null,patchInfo=null,commitSha=null;
      try {
        createWorktree(this.cwd,candidate,state.integrationHead);
        const prompt=fs.readFileSync(this.filename(this.config.promptFile),'utf8')+'\n# Assigned story (immutable spec)\n'+JSON.stringify(selected)+'\nOnly edit implementation files in the assigned worktree. Do not touch tests, PRD, manifest, or Git metadata.\n';
        try {result=await this.execute({tool:this.config.tool,prompt,cwd:candidate,timeoutSeconds:this.config.timeoutSeconds,onOutput:()=>{}});}
        catch(e){result={exitCode:null,error:String(e)};}
        if(result.cancelled){reason='cancelled';transition(attempt,'attempt','cancelled');}
        else if(result.timedOut){reason='timeout';transition(attempt,'attempt','timed_out');}
        else if(result.exitCode!==0){reason='agent-error';transition(attempt,'attempt','failed');}
        else {
          transition(attempt,'attempt','implementation_ready');
          if(headSha(candidate)!==attempt.baseSha)throw Error('Candidate changed its Git HEAD');
          patchInfo=preparePatch(candidate,spec.manifest);
          attempt.patchHash=patchInfo.patchHash;attempt.changedFiles=patchInfo.changed;
          createWorktree(this.cwd,review,attempt.baseSha);
          applyPatch(review,patchInfo.patch,attempt.baseSha);
          transition(story,'story','verifying');transition(attempt,'attempt','verifying');
          const before=snapshotProtected(review,spec.manifest.protectedPaths);
          const statusBefore=git(review,['status','--porcelain=v1','-z','--untracked-files=all']);
          const checks=await runChecks({manifest:spec.manifest,cwd:review,storyId:selected.id,runner:this.check});
          const statusAfter=git(review,['status','--porcelain=v1','-z','--untracked-files=all']);
          const protectedIntact=before===snapshotProtected(review,spec.manifest.protectedPaths)
            && statusBefore===statusAfter && headSha(review)===attempt.baseSha;
          const manifestIntact=hash(fs.readFileSync(this.filename(this.config.verificationFile)))===spec.manifestHash
            && hash(fs.readFileSync(this.filename(this.config.prdFile)))===spec.prdHash;
          verdict=evaluate({storyId:selected.id,manifest:spec.manifest,checks,protectedIntact,manifestIntact});
          const evidencePath=this.store.writeEvidence(attempt.id,{schemaVersion:3,runId:state.runId,storyId:selected.id,attemptId:attempt.id,baseSha:attempt.baseSha,patchHash:patchInfo.patchHash,changedFiles:patchInfo.changed,manifestHash:spec.manifestHash,prdHash:spec.prdHash,checks,verdict,createdAt:new Date().toISOString()});
          attempt.evidencePath=path.relative(this.cwd,evidencePath);
          if(verdict.passed){
            commitSha=commitAccepted(review,selected.id);
            moveRunRef(this.cwd,state.runRef,commitSha,state.integrationHead);
            state.integrationHead=commitSha;attempt.acceptedCommit=commitSha;
            transition(attempt,'attempt','passed');transition(story,'story','passed');
          }else{reason='verification-failed';transition(attempt,'attempt','failed');}
        }
      }catch(err){reason='isolation-error: '+err.message;
        if(['created','running','implementation_ready','verifying'].includes(attempt.status))transition(attempt,'attempt','failed');
      }finally{
        for(const dest of [review,candidate]){try{removeWorktree(this.cwd,dest);}catch(err){reason='cleanup-failed: '+err.message;}}
        try{fs.rmSync(temp,{recursive:true,force:true});}catch(err){reason='cleanup-failed: '+err.message;}
      }
      if(story.status==='verifying'||story.status==='running')transition(story,'story',story.attempts>=this.config.maxAttemptsPerStory?'blocked':'retryable');
      attempt.failureReason=reason;
      this.store.write(state);
      if(reason && (reason.startsWith('isolation-error')||reason.startsWith('cleanup-failed'))){transition(state,'run','failed');this.store.write(state);return {success:false,reason,iterations:i};}
      if(reason==='cancelled'||reason==='timeout'){transition(state,'run',reason==='cancelled'?'cancelled':'failed');this.store.write(state);return {success:false,reason,iterations:i};}
      noProgress=verdict?.passed?0:noProgress+1;
      if(statusSummary(spec.prd,state).complete){transition(state,'run','completed');this.store.write(state);return {success:true,reason:'verified-complete',iterations:i,integrationHead:state.integrationHead,runRef:state.runRef};}
      if(noProgress>=this.config.maxNoProgress){transition(state,'run','paused');this.store.write(state);return {success:false,reason:'no-progress',iterations:i};}
      if(this.config.iterationDelaySec && i<this.config.maxIterations)await new Promise(r=>setTimeout(r,this.config.iterationDelaySec*1000));
    }
    transition(state,'run','paused');this.store.write(state);return {success:false,reason:'max-iterations',iterations:this.config.maxIterations};
  }
}
module.exports={IsolatedRalphLoop};
