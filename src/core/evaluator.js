'use strict';
// Pure, deterministic acceptance gate; no model text or PRD passes field is trusted.
function evaluate({storyId, manifest, checks, manifestIntact, protectedIntact}) {
  const required=manifest.checks.filter(c=>!c.storyIds || c.storyIds.includes(storyId));
  const reasons=[];
  if (!manifestIntact) reasons.push('verification-manifest-changed');
  if (!protectedIntact) reasons.push('protected-tests-or-config-changed');
  if (!required.length) reasons.push('no-required-checks');
  const byId=new Map();
  for(const result of checks) {
    if(!result || typeof result.id!=='string' || byId.has(result.id)) reasons.push('invalid-or-duplicate-test-evidence');
    else byId.set(result.id,result);
  }
  for(const check of required) {
    const actual=byId.get(check.id);
    if(!actual) reasons.push(`missing-check:${check.id}`);
    else if(actual.passed!==true || actual.exitCode!==0 || actual.timedOut || actual.error) reasons.push(`failed-check:${check.id}`);
  }
  for(const actual of checks) if(!required.some(c=>c.id===actual.id)) reasons.push(`unexpected-check:${actual.id}`);
  return {storyId,passed:reasons.length===0,reasons,checks:required.map(c=>({id:c.id,passed:byId.get(c.id)?.passed===true && byId.get(c.id)?.exitCode===0}))};
}
module.exports={evaluate};
