'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { hash } = require('./state-store');

const ALWAYS_DENIED = ['.git', '.ralph', '.github', '.env', '.env.local', 'prd.json', 'ralph.verify.json', 'CLAUDE.md', 'AGENTS.md', 'test', 'tests', '__tests__', 'spec', 'specs'];
const ZERO = '0'.repeat(40);
function git(cwd, args, opts={}) {
  return execFileSync('git', args, {cwd, encoding:opts.encoding ?? 'utf8', maxBuffer:8*1024*1024, ...opts});
}
function repoRoot(cwd) { return git(cwd,['rev-parse','--show-toplevel']).trim(); }
function headSha(cwd) { return git(cwd,['rev-parse','--verify','HEAD']).trim(); }
function assertClean(cwd) {
  const status = git(cwd,['status','--porcelain=v1','-z','--untracked-files=all']);
  if (status.length) throw new Error('Source repository must have a clean Git working tree before V1.3 isolation');
}
function createTempGroup() { return fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-isolate-')); }
function createWorktree(repo, dest, sha) {
  git(repo,['worktree','add','--detach',dest,sha]);
  if(headSha(dest)!==sha) throw new Error('Worktree base SHA mismatch');
  return dest;
}
function removeWorktree(repo, dest) {
  if(fs.existsSync(dest)) git(repo,['worktree','remove','--force',dest]);
}
function safeRelative(file) {
  if (!file || path.posix.isAbsolute(file) || file==='..' || file.startsWith('../') || file.includes('/../') || file.includes('\\') || file.includes('\0')) return false;
  return !file.split('/').some(x=>!x||x==='.'||x==='..');
}
function protectedPath(file,extra=[]) {
  return [...ALWAYS_DENIED,...extra].some(p=>file===p || file.startsWith(p+'/')) || file.split('/').some(p=>p.startsWith('.env'));
}
function globMatches(p, pattern) {
  if (pattern.endsWith('/**')) return p.startsWith(pattern.slice(0,-3)+'/');
  if (pattern.endsWith('/*')) return p.startsWith(pattern.slice(0,-2)+'/') && !p.slice(pattern.length-1).includes('/');
  return p===pattern;
}
function changedPaths(cwd) {
  const raw = git(cwd,['status','--porcelain=v1','-z','--untracked-files=all']);
  const parts = raw.split('\0').filter(Boolean), changes=[];
  for (let i=0;i<parts.length;i++) {
    const entry=parts[i];
    if(entry.length<4 || entry[2]!==' ') throw new Error('Unexpected git status entry');
    const code=entry.slice(0,2);
    const file=entry.slice(3).replaceAll('\\','/');
    changes.push({file,code});
    if (code.includes('R')||code.includes('C')) {
      if(i+1>=parts.length) throw new Error('Missing rename origin');
      changes.push({file:parts[++i].replaceAll('\\','/'),code:'R-origin'});
    }
  }
  return changes;
}
function validateChanges(cwd,manifest, {maxChangedFiles=80}={}) {
  const changes=changedPaths(cwd);
  const allowed=manifest.allowedPaths;
  if (!Array.isArray(allowed)||!allowed.length||allowed.some(x=>typeof x!=='string'||!safeRelative(x.replaceAll('*','x')))) throw new Error('V1.3 requires trusted allowedPaths (e.g. src/**) in verification manifest');
  if(!changes.length) throw new Error('Candidate has no code changes');
  if(changes.length>maxChangedFiles) throw new Error('Candidate exceeds changed-file limit');
  const checked=[];
  for(const change of changes) {
    const file=change.file;
    if(!safeRelative(file)||protectedPath(file,manifest.protectedPaths||[])||!allowed.some(p=>globMatches(file,p))) throw new Error('Forbidden candidate change: '+file);
    if(change.code.includes('D') || change.code==='R-origin') throw new Error('Deletes/renames require separate review: '+file);
    const full=path.join(cwd,file);
    if(fs.existsSync(full) && (!fs.lstatSync(full).isFile() || fs.lstatSync(full).isSymbolicLink())) throw new Error('Non-regular candidate file denied: '+file);
    checked.push(file);
  }
  return [...new Set(checked)];
}
function preparePatch(candidate,manifest,maxPatchBytes=2*1024*1024) {
  const changed=validateChanges(candidate,manifest);
  git(candidate,['add','--all','--',...changed]);
  const patch=git(candidate,['diff','--cached','--binary','--no-ext-diff','HEAD'],{encoding:'buffer'});
  if(!patch.length || patch.length>maxPatchBytes) throw new Error('Patch is empty or exceeds configured size limit');
  const stage=git(candidate,['ls-files','--stage','--',...changed]);
  for(const line of stage.split('\n').filter(Boolean)) if(!line.startsWith('100644 ')) throw new Error('Only regular non-executable files allowed in V1.3 candidate');
  return {patch,patchHash:hash(patch),changed};
}
function applyPatch(review,patch,base) {
  if(headSha(review)!==base) throw new Error('Review worktree base SHA mismatch');
  const patchFile=path.join(os.tmpdir(),'ralph-patch-'+process.pid+'-'+require('node:crypto').randomUUID()+'.patch');
  try {
    fs.writeFileSync(patchFile,patch,{flag:'wx',mode:0o600});
    git(review,['apply','--check','--index',patchFile]);
    git(review,['apply','--index',patchFile]);
    const recreated=git(review,['diff','--cached','--binary','--no-ext-diff','HEAD'],{encoding:'buffer'});
    if(hash(recreated)!==hash(patch)) throw new Error('Review candidate patch differs from reviewed bytes');
  } finally { if(fs.existsSync(patchFile)) fs.unlinkSync(patchFile); }
}
function commitAccepted(review,storyId) {
  const env={...process.env,GIT_AUTHOR_NAME:'Ralph Verified',GIT_AUTHOR_EMAIL:'ralph-verified@localhost',GIT_COMMITTER_NAME:'Ralph Verified',GIT_COMMITTER_EMAIL:'ralph-verified@localhost'};
  git(review,['-c','core.hooksPath=/dev/null','commit','-m','feat(ralph): verified '+storyId, '--no-gpg-sign'],{env});
  return headSha(review);
}
function moveRunRef(repo,ref,next,previous=null) {
  if(!/^refs\/heads\/ralph\/run-[a-f0-9-]{36}$/.test(ref)) throw new Error('Invalid controlled run ref');
  git(repo,['update-ref',ref,next,previous??ZERO]);
}
module.exports={git,repoRoot,headSha,assertClean,createTempGroup,createWorktree,removeWorktree,validateChanges,preparePatch,applyPatch,commitAccepted,moveRunRef,changedPaths};
