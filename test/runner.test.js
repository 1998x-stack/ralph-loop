'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync}=require('node:child_process');
const { RalphLoop, parseArgs } = require('../src/core/runner');
function fixture(stories) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(),'ralph-test-'));
  fs.writeFileSync(path.join(cwd,'prd.json'), JSON.stringify({userStories:stories}));
  fs.writeFileSync(path.join(cwd,'CLAUDE.md'),'Work on exactly one story');
  execFileSync('git',['init','-q',cwd]);
  return cwd;
}
const story = (id, x={}) => ({id,passes:false,dependencies:[],...x});
function runner(cwd, execute, options={}) { return new RalphLoop({ iterationDelaySec:0, maxIterations:8, maxNoProgress:3, ...options },{cwd,execute,print:()=>{}}); }
const ok = () => ({ exitCode:0,durationMs:1,output:'' });
test('dry run never mutates PRD or claims completion', async () => {
  const cwd=fixture([story('a')]);
  const a=fs.readFileSync(path.join(cwd,'prd.json'),'utf8');
  const result=await runner(cwd,async()=>{throw Error('must not execute');},{dryRun:true}).run();
  assert.equal(result.reason,'dry-run');
  assert.equal(fs.readFileSync(path.join(cwd,'prd.json'),'utf8'),a);
});
test('fake agent completes one story per iteration', async () => {
  const cwd=fixture([story('a'),story('b',{dependencies:['a']})]);
  const calls=[];
  const r=runner(cwd,async()=>{
    const p=path.join(cwd,'prd.json');const data=JSON.parse(fs.readFileSync(p));
    const target=data.userStories.find(x=>!x.passes && x.dependencies.every(d=>data.userStories.find(y=>y.id===d).passes));
    calls.push(target.id);target.passes=true;fs.writeFileSync(p,JSON.stringify(data));return ok();
  });
  assert.equal((await r.run()).success,true);assert.deepEqual(calls,['a','b']);
});
test('nonzero exit is error even when agent edits PRD', async () => {
  const cwd=fixture([story('a')]);
  const result=await runner(cwd,async()=>{const p=path.join(cwd,'prd.json');fs.writeFileSync(p,JSON.stringify({userStories:[story('a',{passes:true})]}));return {exitCode:1,error:'failed'};}).run();
  assert.equal(result.reason,'agent-error');
});
test('timeouts fail closed', async () => {
  const result=await runner(fixture([story('a')]),async()=>({exitCode:null,timedOut:true})).run();
  assert.equal(result.reason,'timeout');
});
test('stagnant agent stops without infinite iterations', async () => {
  let calls=0;
  const result=await runner(fixture([story('a')]),async()=>{calls++;return ok();},{maxNoProgress:2}).run();
  assert.equal(result.reason,'no-progress');assert.equal(calls,2);
});
test('blocked-only PRD stops with failure', async () => {
  const result=await runner(fixture([story('a',{status:'blocked'})]),async()=>{throw Error('not called');}).run();
  assert.equal(result.reason,'stalled-or-blocked');
});
test('agent cannot mark two stories passed per turn', async () => {
  const cwd=fixture([story('a'),story('b')]);
  const result=await runner(cwd,async()=>{fs.writeFileSync(path.join(cwd,'prd.json'),JSON.stringify({userStories:[story('a',{passes:true}),story('b',{passes:true})]}));return ok();}).run();
  assert.equal(result.reason,'multiple-stories-modified');
});
test('rejects unsupported budget flag instead of pretending to enforce it',()=>{
  assert.throws(()=>parseArgs(['--cost-limit','20']),/not implemented/);
  assert.throws(()=>parseArgs(['--max-iterations','0']),/positive integer/);
});
