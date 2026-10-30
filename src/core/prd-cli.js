#!/usr/bin/env node
'use strict';
const { loadPRD, summarizePRD } = require('./prd-state');
const [command = 'summary', filename = 'prd.json'] = process.argv.slice(2);
try {
  const data = loadPRD(filename);
  const s = summarizePRD(data);
  switch (command) {
    case 'validate': console.log(`PRD valid: ${s.total} stories`); break;
    case 'summary': console.log(JSON.stringify(s)); break;
    case 'next': console.log(JSON.stringify(s.nextStory)); process.exitCode = s.nextStory ? 0 : 1; break;
    case 'is-complete': process.exitCode = s.allComplete ? 0 : 1; break;
    default: console.error(`Unknown command: ${command}`); process.exitCode = 2;
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 2;
}
