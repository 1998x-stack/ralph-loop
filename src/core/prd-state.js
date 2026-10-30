'use strict';
const fs = require('node:fs');
const ALLOWED = new Set(['pending', 'ready', 'in_progress', 'retryable', 'blocked', 'passed', 'completed']);

class PRDValidationError extends Error {
  constructor(messages) {
    super(`Invalid PRD:\n- ${messages.join('\n- ')}`);
    this.name = 'PRDValidationError';
    this.issues = messages;
  }
}

function validatePRD(data) {
  const issues = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new PRDValidationError(['root must be an object']);
  const stories = data.userStories ?? data.features;
  if (!Array.isArray(stories) || stories.length === 0) throw new PRDValidationError(['userStories/features must be a nonempty array']);
  const ids = new Set();
  for (const [i, story] of stories.entries()) {
    const at = `stories[${i}]`;
    if (!story || typeof story !== 'object' || Array.isArray(story)) { issues.push(`${at} must be an object`); continue; }
    if (typeof story.id !== 'string' || !story.id.trim()) issues.push(`${at}.id must be a nonempty string`);
    else if (ids.has(story.id)) issues.push(`duplicate story ID: ${story.id}`);
    else ids.add(story.id);
    if (typeof story.passes !== 'boolean') issues.push(`${at}.passes must be a boolean`);
    if (story.status !== undefined && !ALLOWED.has(story.status)) issues.push(`${at}.status is invalid`);
    if (story.passes && story.status === 'blocked') issues.push(`${at} cannot be passed and blocked`);
    if (story.status === 'passed' && story.passes !== true) issues.push(`${at}: status passed requires passes:true`);
    if (story.dependencies !== undefined && (!Array.isArray(story.dependencies) || story.dependencies.some(x => typeof x !== 'string'))) issues.push(`${at}.dependencies must be string[]`);
    if (story.priority !== undefined && (!Number.isFinite(story.priority) || story.priority < 0)) issues.push(`${at}.priority must be a nonnegative finite number`);
  }
  const graph = new Map();
  for (const story of stories) {
    if (!story || typeof story.id !== 'string') continue;
    const deps = Array.isArray(story.dependencies) ? story.dependencies : [];
    graph.set(story.id, deps);
    for (const dep of deps) if (!ids.has(dep)) issues.push(`${story.id} references unknown dependency: ${dep}`);
    if (new Set(deps).size !== deps.length) issues.push(`${story.id} contains duplicate dependencies`);
  }
  const color = new Map();
  function dfs(id, stack) {
    if (color.get(id) === 1) { issues.push(`dependency cycle: ${[...stack, id].join(' -> ')}`); return; }
    if (color.get(id) === 2) return;
    color.set(id, 1);
    for (const dep of graph.get(id) || []) if (graph.has(dep)) dfs(dep, [...stack, id]);
    color.set(id, 2);
  }
  for (const id of graph.keys()) if (!color.has(id)) dfs(id, []);
  if (issues.length) throw new PRDValidationError([...new Set(issues)]);
  return stories;
}

function loadPRD(filename = 'prd.json') {
  let data;
  try { data = JSON.parse(fs.readFileSync(filename, 'utf8')); }
  catch (err) { throw new PRDValidationError([`cannot read or parse ${filename}: ${err.message}`]); }
  validatePRD(data);
  return data;
}

function summarizePRD(data) {
  const stories = validatePRD(data);
  const passed = new Set(stories.filter(s => s.passes).map(s => s.id));
  const candidates = stories.filter(s => !s.passes && s.status !== 'blocked');
  const ready = candidates.filter(s => (s.dependencies || []).every(id => passed.has(id)));
  ready.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99) || a.id.localeCompare(b.id));
  const blocked = stories.filter(s => !s.passes && s.status === 'blocked').length;
  const done = passed.size;
  return {
    total: stories.length, done, pending: stories.length - done - blocked,
    blocked, ready: ready.length, nextStory: ready[0] ?? null,
    allComplete: done === stories.length,
    stalled: done < stories.length && ready.length === 0,
  };
}

module.exports = { PRDValidationError, validatePRD, loadPRD, summarizePRD };
