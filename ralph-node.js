#!/usr/bin/env node
'use strict';
const { RalphLoop, parseArgs } = require('./src/core/runner');
async function main(args = process.argv.slice(2)) {
  const config = parseArgs(args);
  const result = await new RalphLoop(config).run();
  console.log(JSON.stringify(result, null, 2));
  return result.success ? 0 : 1;
}
if (require.main === module) main().then(code => { process.exitCode = code; }).catch(err => { console.error(err.message); process.exitCode = 2; });
module.exports = { ...require('./src/core/runner'), main };
