'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {VerifiedRalphLoop}=require('../src/core/verified-runner');
const {StateStore}=require('../src/core/state-store');
const {evaluate}=require('../src/core/evaluator');
const {loadManifest,snapshotProtected,runCheck}=require('../src/core/test-runner');
const {createState,transition,nextStory,startAttempt}=require('../src/core/state-machine');
const story=(id,more={})=>({id,passes:false,dependencies:[],...more});
function fixture(stories=[story('a')],manifest={version:1,checks:[{id:'unit',command:'node',args:['-e','process.exit(0)']} ]}) {
 const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'ralph-v12-'));
 fs.writeFileSync(path.join(cwd,'prd.json'),JSON.stringify({userStories:stories}));
 fs.writeFileSync(path.join(cwd,'ralph.verify.json'),JSON.stringify(manifest));
 fs.writeFileSync(path.join(cwd,'CLAUDE.md'),'Do a single story.');
 execFileSync('git',['init','-q',cwd]);
 return cwd;
}
const ok=()=>({exitCode:0,durationMs:5,output:'<promise>COMPLETE</promise>'});
const create=(cwd,execute,opt={},deps={})=>new VerifiedRalphLoop({maxIterations:6,maxNoProgress:3,maxAttemptsPerStory:3,iterationDelaySec:0,...opt},{cwd,execute,print:()=>{},...deps});
const getState=cwd=>new StateStore(cwd).read();
test('state transition invariants',()=>{
 const x={status:'pending'};
 assert.throws(()=>transition(x,'story','passed'),/Invalid story transition/);
 transition(x,'story','running');transition(x,'story','verifying');transition(x,'story','passed');
 assert.throws(()=>transition(x,'story','running'),/Invalid story transition/);
});
test('new run distrusts pre-existing passes:true',()=>{
 const prd={userStories:[story('a',{passes:true})]};const st=createState(prd,{prdHash:'x',manifestHash:'y'});
 assert.equal(st.stories.a.status,'pending');assert.equal(nextStory(prd,st).id,'a');
});
test('attempt state records unique ids',()=>{
 const st=createState({userStories:[story('a')]},{prdHash:'x',manifestHash:'y'});
 startAttempt(st,'a');assert.equal(st.stories.a.status,'running');assert.equal(st.attempts.length,1);
 assert.equal(st.attempts[0].status,'running');
});
test('independent gate rejects missing, failed, and extra checks',()=>{
 const manifest={checks:[{id:'x'},{id:'y'}]};
 assert.equal(evaluate({storyId:'a',manifest,checks:[{id:'x',passed:true,exitCode:0}],manifestIntact:true,protectedIntact:true}).passed,false);
 assert.equal(evaluate({storyId:'a',manifest,checks:[{id:'x',passed:true,exitCode:0},{id:'y',passed:false,exitCode:1}],manifestIntact:true,protectedIntact:true}).passed,false);
 assert.equal(evaluate({storyId:'a',manifest,checks:[{id:'x',passed:true,exitCode:0},{id:'y',passed:true,exitCode:0},{id:'z',passed:true,exitCode:0}],manifestIntact:true,protectedIntact:true}).passed,false);
});
test('independent gate validates exact required checks',()=>{
 const verdict=evaluate({storyId:'a',manifest:{checks:[{id:'unit'}]},checks:[{id:'unit',passed:true,exitCode:0,timedOut:false}],manifestIntact:true,protectedIntact:true});
 assert.equal(verdict.passed,true);
});
test('manifest validation rejects unsafe/invalid configuration',()=>{
 const cwd=fixture();const p=path.join(cwd,'ralph.verify.json');
 fs.writeFileSync(p,JSON.stringify({version:1,checks:[]}));
 assert.throws(()=>loadManifest(p,new Set(['a'])),/nonempty/);
 fs.writeFileSync(p,JSON.stringify({version:1,checks:[{id:'x',command:'node',args:[],storyIds:['missing']}]}));
 assert.throws(()=>loadManifest(p,new Set(['a'])),/Invalid storyIds/);
});
test('test runner captures exit code and true process failure',async()=>{
 const cwd=fixture();
 const good=await runCheck({id:'good',command:process.execPath,args:['-e','console.log("ok")']},cwd);
 const bad=await runCheck({id:'bad',command:process.execPath,args:['-e','process.exit(5)']},cwd);
 assert.equal(good.passed,true);assert.match(good.stdout,/ok/);
 assert.equal(bad.passed,false);assert.equal(bad.exitCode,5);
});
test('test runner detects command missing',async()=>{
 const x=await runCheck({id:'missing',command:'ralph-does-not-exist-xyz',args:[]},fixture());
 assert.equal(x.passed,false);assert.ok(x.error);
});
test('protected tests are hash checked',()=>{
 const cwd=fixture();fs.mkdirSync(path.join(cwd,'tests'));
 fs.writeFileSync(path.join(cwd,'tests','golden.js'),'baseline');
 const initial=snapshotProtected(cwd);
 fs.writeFileSync(path.join(cwd,'tests','golden.js'),'tampered');
 assert.notEqual(snapshotProtected(cwd),initial);
});
test('agent completion claim cannot bypass failing independent test',async()=>{
 const cwd=fixture([story('a')],{version:1,checks:[{id:'red',command:'node',args:['-e','process.exit(3)']} ]});
 const r=await create(cwd,async()=>ok(),{maxNoProgress:1}).run();
 assert.equal(r.success,false);assert.equal(r.reason,'no-progress');
 assert.equal(getState(cwd).stories.a.status,'retryable');
 assert.equal(getState(cwd).attempts[0].status,'failed');
 assert.equal(JSON.parse(fs.readFileSync(path.join(cwd,'prd.json'))).userStories[0].passes,false);
});
test('independent test passing sets state but leaves PRD untouched',async()=>{
 const cwd=fixture([story('a'),story('b',{dependencies:['a']})]);let n=0;
 const r=await create(cwd,async()=>{n++;return ok();}).run();
 assert.equal(r.success,true);assert.equal(r.reason,'verified-complete');assert.equal(n,2);
 const st=getState(cwd);assert.equal(st.status,'completed');
 assert.equal(st.stories.a.status,'passed');assert.equal(st.stories.b.status,'passed');
 assert.equal(st.attempts.length,2);assert.ok(st.attempts.every(x=>x.evidencePath));
 assert.ok(fs.existsSync(path.resolve(cwd,st.attempts[0].evidencePath)));
 assert.equal(JSON.parse(fs.readFileSync(path.join(cwd,'prd.json'))).userStories[0].passes,false);
});
test('agent rewriting passes:true is rejected',async()=>{
 const cwd=fixture();const p=path.join(cwd,'prd.json');
 const result=await create(cwd,async()=>{
   fs.writeFileSync(p,JSON.stringify({userStories:[story('a',{passes:true})]}));return ok();
 }).run();
 assert.equal(result.reason,'untrusted-input-change');assert.equal(getState(cwd).status,'failed');
 assert.notEqual(getState(cwd).stories.a.status,'passed');
});
test('agent modifying tests is rejected before running them',async()=>{
 const cwd=fixture();fs.mkdirSync(path.join(cwd,'tests'));fs.writeFileSync(path.join(cwd,'tests','golden.js'),'one');
 let calls=0;
 const result=await create(cwd,async()=>{fs.writeFileSync(path.join(cwd,'tests','golden.js'),'two');return ok();},{},{check:async()=>{calls++;return {id:'unit',exitCode:0,passed:true};}}).run();
 assert.equal(result.reason,'untrusted-input-change');assert.equal(calls,0);
});
test('repeat verification failure eventually blocked, never accepted',async()=>{
 const cwd=fixture();
 const result=await create(cwd,async()=>ok(),{maxAttemptsPerStory:2}, {check:async()=>({id:'unit',exitCode:1,passed:false})}).run();
 assert.equal(result.reason,'blocked-or-unmet-dependencies');
 assert.equal(getState(cwd).stories.a.status,'blocked');assert.equal(getState(cwd).attempts.length,2);
});
test('paused run resumes using stored verification state',async()=>{
 const cwd=fixture([story('a'),story('b',{dependencies:['a']})]);
 const first=await create(cwd,async()=>ok(),{maxIterations:1}).run();
 assert.equal(first.reason,'max-iterations');assert.equal(getState(cwd).status,'paused');
 const second=await create(cwd,async()=>ok()).run();
 assert.equal(second.success,true);assert.equal(getState(cwd).attempts.length,2);
});
test('existing run lock prevents competing runner',async()=>{
 const cwd=fixture();const store=new StateStore(cwd);store.acquire();
 try{await assert.rejects(create(cwd,async()=>ok()).run(),/Run lock exists/);} finally{store.release();}
});
test('tampered manifest prevents unsafe resume',async()=>{
 const cwd=fixture();await create(cwd,async()=>ok(),{maxIterations:1}).run();
 fs.writeFileSync(path.join(cwd,'ralph.verify.json'),JSON.stringify({version:1,checks:[{id:'unit',command:'node',args:['-e','process.exit(1)']}]}));
 await assert.rejects(create(cwd,async()=>ok()).run(),/differs from persisted/);
});
test('runtime failing is not successful even if it says COMPLETE',async()=>{
 const cwd=fixture();const result=await create(cwd,async()=>({exitCode:8,output:'<promise>COMPLETE</promise>'}),{maxNoProgress:1}).run();
 assert.equal(result.reason,'no-progress');assert.equal(getState(cwd).stories.a.status,'retryable');
});
