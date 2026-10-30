'use strict';
const crypto = require('node:crypto');
const { validatePRD } = require('./prd-state');

const TRANSITIONS = Object.freeze({
  run: { created:['running'], running:['completed','failed','paused','cancelled'], paused:['running','cancelled'], completed:[], failed:[], cancelled:[] },
  story: { pending:['running','blocked'], running:['verifying','retryable','blocked'], verifying:['passed','retryable','blocked'], retryable:['running','blocked'], passed:[], blocked:[] },
  attempt: { created:['running'], running:['implementation_ready','failed','timed_out','cancelled'], implementation_ready:['verifying','failed'], verifying:['passed','failed'], passed:[], failed:[], timed_out:[], cancelled:[] },
});
function transition(entity, kind, to) {
  if (!TRANSITIONS[kind]?.[entity.status]?.includes(to)) throw new Error(`Invalid ${kind} transition: ${entity.status} -> ${to}`);
  entity.status = to;
  entity.updatedAt = new Date().toISOString();
  return entity;
}
function createState(prd, {prdHash, manifestHash}) {
  const stories = validatePRD(prd);
  const now = new Date().toISOString();
  return {
    schemaVersion:2, runId:crypto.randomUUID(), status:'created', prdHash, manifestHash,
    createdAt:now, updatedAt:now, attempts:[],
    stories:Object.fromEntries(stories.map(s => [s.id, {status:s.status === 'blocked' ? 'blocked' : 'pending', attempts:0, updatedAt:now}]))
  };
}
function nextStory(prd, state) {
  const stories = validatePRD(prd);
  const ready = stories.filter(s => ['pending','retryable'].includes(state.stories[s.id]?.status)
    && (s.dependencies || []).every(id => state.stories[id]?.status === 'passed'));
  ready.sort((a,b)=>(a.priority ?? 99)-(b.priority ?? 99) || a.id.localeCompare(b.id));
  return ready[0] ?? null;
}
function statusSummary(prd, state) {
  const stories = validatePRD(prd);
  const counts = Object.fromEntries(['pending','running','verifying','retryable','passed','blocked'].map(x=>[x,0]));
  for (const s of stories) {
    const v = state.stories[s.id]?.status;
    if (!(v in counts)) throw new Error(`Missing or invalid persisted state for ${s.id}`);
    counts[v]++;
  }
  return { total:stories.length, ...counts, complete:counts.passed===stories.length, nextStory:nextStory(prd,state)?.id??null };
}
function startAttempt(state, storyId) {
  const story=state.stories[storyId];
  transition(story,'story','running');
  story.attempts++;
  const attempt={id:crypto.randomUUID(),storyId,status:'created',startedAt:new Date().toISOString()};
  transition(attempt,'attempt','running');
  state.attempts.push(attempt);
  return attempt;
}
module.exports={ TRANSITIONS, transition, createState, nextStory, statusSummary, startAttempt };
