'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {execFileSync}=require('node:child_process');
const {IsolatedRalphLoop}=require('../src/core/isolated-runner');
const {StateStore}=require('../src/core/state-store');
const {validateChanges}=require('../src/core/worktree');
function git(cwd,...args){return execFileSync('git',args,{cwd,encoding:'utf8'}).trim();}
const story=(id,deps=[])=>({id,passes:false,dependencies:deps});
function fixture(stories=[story('a')],extra={}){
 const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'ralph-v13-test-'));
 fs.mkdirSync(path.join(cwd,'src'));
 fs.writeFileSync(path.join(cwd,'src','main.js'),'module.exports=1;\n');
 fs.writeFileSync(path.join(cwd,'prd.json'),JSON.stringify({userStories:stories}));
 fs.writeFileSync(path.join(cwd,'ralph.verify.json'),JSON.stringify({version:1,allowedPaths:['src/**'],checks:[{id:'test',command:process.execPath,args:['-e','const x=require("./src/main.js");process.exit(x>=2?0:1)']}],...extra}));
 fs.writeFileSync(path.join(cwd,'CLAUDE.md'),'Implement story.');
 fs.writeFileSync(path.join(cwd,'.gitignore'),'.ralph/\n');
 git(cwd,'init','-q');git(cwd,'add','.');git(cwd,'-c','user.name=Test','-c','user.email=test@example.com','commit','-qm','base');
 return cwd;
}
const successAgent=async({cwd})=>{fs.writeFileSync(path.join(cwd,'src/main.js'),'module.exports=2;\n');return {exitCode:0};};
function create(cwd,execute=successAgent,config={}){return new IsolatedRalphLoop({maxIterations:4,maxAttemptsPerStory:2,maxNoProgress:3,iterationDelaySec:0,...config},{cwd,execute,print:()=>{}});}
function state(cwd){return new StateStore(cwd).read();}
test('worktree isolation: verified patch committed to private run ref, not main',async()=>{
 const cwd=fixture();const original=git(cwd,'rev-parse','HEAD');
 const result=await create(cwd).run();assert.equal(result.success,true);
 assert.equal(git(cwd,'rev-parse','HEAD'),original);assert.equal(fs.readFileSync(path.join(cwd,'src/main.js'),'utf8'),'module.exports=1;\n');
 const st=state(cwd);assert.equal(st.schemaVersion,3);assert.equal(st.stories.a.status,'passed');assert.equal(st.status,'completed');
 assert.notEqual(st.integrationHead,original);assert.equal(git(cwd,'rev-parse',st.runRef),st.integrationHead);
 assert.ok(fs.existsSync(path.resolve(cwd,st.attempts[0].evidencePath)));
 assert.equal(st.attempts[0].changedFiles[0],'src/main.js');
});
test('accepted patch supplies dependencies to next story',async()=>{
 const cwd=fixture([story('a'),story('b',['a'])]);let i=0;
 const result=await create(cwd,async({cwd})=>{const n=Number(fs.readFileSync(path.join(cwd,'src/main.js'),'utf8').match(/\d+/)[0]);i++;fs.writeFileSync(path.join(cwd,'src/main.js'),'module.exports='+(n+1)+';\n');return {exitCode:0};}).run();
 assert.equal(result.success,true);assert.equal(i,2);assert.equal(git(cwd,'show',state(cwd).integrationHead+':src/main.js'),'module.exports=3;');
});
test('agent modifications to golden tests are rejected',async()=>{
 const cwd=fixture();fs.mkdirSync(path.join(cwd,'tests'));fs.writeFileSync(path.join(cwd,'tests','golden.js'),'throw Error("do not touch");\n');git(cwd,'add','.');git(cwd,'-c','user.name=Test','-c','user.email=test@example.com','commit','-qm','test baseline');
 const r=await create(cwd,async({cwd})=>{fs.writeFileSync(path.join(cwd,'tests/golden.js'),'// deleted test');return {exitCode:0};},{maxIterations:1}).run();
 assert.equal(r.success,false);assert.equal(state(cwd).attempts[0].status,'failed');assert.match(state(cwd).attempts[0].failureReason,/Forbidden candidate change/);
});
test('forged PRD completion in candidate rejected',async()=>{
 const cwd=fixture();await create(cwd,async({cwd})=>{const file=path.join(cwd,'prd.json');const prd=JSON.parse(fs.readFileSync(file));prd.userStories[0].passes=true;fs.writeFileSync(file,JSON.stringify(prd));return {exitCode:0};},{maxIterations:1}).run();
 assert.match(state(cwd).attempts[0].failureReason,/Forbidden candidate change/);
 assert.equal(state(cwd).stories.a.status,'retryable');
});
test('agent editing manifest is rejected',async()=>{
 const cwd=fixture();await create(cwd,async({cwd})=>{fs.writeFileSync(path.join(cwd,'ralph.verify.json'),'{}');return {exitCode:0};},{maxIterations:1}).run();
 assert.match(state(cwd).attempts[0].failureReason,/Forbidden candidate change/);
});
test('empty patch cannot pass even if baseline tests pass',async()=>{
 const cwd=fixture();await create(cwd,async()=>({exitCode:0}),{maxIterations:1}).run();
 assert.match(state(cwd).attempts[0].failureReason,/Candidate has no code changes/);
});
test('denies symlinks and off-allowlist changes',async()=>{
 const cwd=fixture();fs.symlinkSync('/etc/passwd',path.join(cwd,'src','passwd'));
 assert.throws(()=>validateChanges(cwd,{allowedPaths:['src/**']}),/Non-regular/);
 fs.unlinkSync(path.join(cwd,'src','passwd'));fs.writeFileSync(path.join(cwd,'bad.js'),'x');
 assert.throws(()=>validateChanges(cwd,{allowedPaths:['src/**']}),/Forbidden/);
});
test('failed independent check leaves main and run ref unchanged',async()=>{
 const cwd=fixture([story('a')],{checks:[{id:'fail',command:process.execPath,args:['-e','process.exit(42)']}]});
 const original=git(cwd,'rev-parse','HEAD');
 await create(cwd,successAgent,{maxIterations:1}).run();
 const st=state(cwd);assert.equal(st.stories.a.status,'retryable');assert.equal(st.integrationHead,original);assert.equal(st.attempts[0].status,'failed');
});
test('pause then resume carries private integration commit',async()=>{
 const cwd=fixture([story('a'),story('b',['a'])]);let n=0;
 const agent=async({cwd})=>{n++;fs.writeFileSync(path.join(cwd,'src/main.js'),'module.exports='+(n+1)+';\n');return {exitCode:0};};
 const first=await create(cwd,agent,{maxIterations:1}).run();assert.equal(first.reason,'max-iterations');
 const second=await create(cwd,agent).run();assert.equal(second.success,true);assert.equal(state(cwd).attempts.length,2);
});
test('dirty source tree rejected before worktree creation',async()=>{
 const cwd=fixture();fs.writeFileSync(path.join(cwd,'src/main.js'),'uncommitted');
 await assert.rejects(create(cwd).run(),/clean Git working tree/);
});
test('existing run state written in older schema cannot silently resume',async()=>{
 const cwd=fixture();const store=new StateStore(cwd);store.write({schemaVersion:2,runId:'old',status:'paused',prdHash:'x',manifestHash:'x'});
 await assert.rejects(create(cwd).run(),/Run schema or trusted inputs/);
});
