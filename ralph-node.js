#!/usr/bin/env node
'use strict';
const { RalphLoop, parseArgs } = require('./src/core/runner');
const { VerifiedRalphLoop } = require('./src/core/verified-runner');
const { StateStore } = require('./src/core/state-store');
async function main(args = process.argv.slice(2)) {
  if(args[0]==='status') { const state=new StateStore(process.cwd()).read();console.log(JSON.stringify(state??{status:'not-started'},null,2));return state?0:1; }
  const config = parseArgs(args);
  if(!config.legacyUnverified && !config.verificationFile) throw new Error('Independent verification is required. Supply --verify ralph.verify.json (or explicit --legacy-unverified for the old unsafe mode).');
  const engine = config.legacyUnverified ? new RalphLoop(config) : new VerifiedRalphLoop(config);
  const result = await engine.run();
  console.log(JSON.stringify(result, null, 2));
  return result.success ? 0 : 1;
}
if (require.main === module) main().then(code => { process.exitCode = code; }).catch(err => { console.error(err.message); process.exitCode = 2; });
module.exports = { ...require('./src/core/runner'), main };
