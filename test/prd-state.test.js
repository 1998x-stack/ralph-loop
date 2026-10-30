'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePRD, summarizePRD } = require('../src/core/prd-state');
const s = (id, overrides={}) => ({ id, passes:false, priority:2, dependencies:[], ...overrides });
const prd = stories => ({ userStories: stories });

test('rejects empty PRD instead of falsely completing', () => assert.throws(() => summarizePRD(prd([])), /nonempty/));
test('rejects duplicate ids', () => assert.throws(() => validatePRD(prd([s('a'),s('a')])), /duplicate/));
test('rejects missing dependency', () => assert.throws(() => validatePRD(prd([s('a',{dependencies:['missing']})])), /unknown dependency/));
test('rejects cyclic dependencies', () => assert.throws(() => validatePRD(prd([s('a',{dependencies:['b']}),s('b',{dependencies:['a']})])), /cycle/));
test('rejects contradictory passed/blocked state', () => assert.throws(() => validatePRD(prd([s('a',{passes:true,status:'blocked'})])), /passed and blocked/));
test('blocked is not counted as passed', () => {
  const r = summarizePRD(prd([s('a',{status:'blocked'})]));
  assert.deepEqual([r.done,r.blocked,r.allComplete,r.stalled],[0,1,false,true]);
});
test('chooses dependency-ready story by priority and deterministic ID', () => {
  const r = summarizePRD(prd([s('b',{priority:1,dependencies:['a']}),s('c',{priority:2}),s('a',{priority:2})]));
  assert.equal(r.nextStory.id,'a');
  assert.equal(r.ready,2);
});
test('returns stalled when blocked dependency prevents all work', () => {
  const r = summarizePRD(prd([s('a',{status:'blocked'}),s('b',{dependencies:['a']})]));
  assert.equal(r.stalled,true);
  assert.equal(r.nextStory,null);
});
test('only all passed means complete', () => {
  assert.equal(summarizePRD(prd([s('a',{passes:true,status:'completed'})])).allComplete,true);
  assert.equal(summarizePRD(prd([s('a',{passes:true}),s('b')])).allComplete,false);
});
test('supports legacy features shape', () => {
  assert.equal(summarizePRD({features:[s('legacy')]}).nextStory.id,'legacy');
});
test('rejects malformed priority and passes', () => {
  assert.throws(() => validatePRD(prd([s('a',{passes:'true',priority:Infinity})])), /boolean/);
});
