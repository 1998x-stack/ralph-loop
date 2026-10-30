'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {hash,loadJson} = require('./state-store');
const DEFAULT_PROTECTED = ['test','tests','.github','package.json','package-lock.json','pnpm-lock.yaml','yarn.lock','pyproject.toml','pytest.ini','tox.ini'];
function loadManifest(filename, ids) {
  const manifest=loadJson(filename);
  if (!manifest || manifest.version!==1 || !Array.isArray(manifest.checks) || !manifest.checks.length) throw new Error('Verification manifest needs version:1 and nonempty checks');
  const names = new Set();
  for (const check of manifest.checks) {
    if (!check || typeof check.id!=='string' || !check.id.trim() || names.has(check.id)) throw new Error('Check ids must be unique nonempty strings');
    names.add(check.id);
    if (typeof check.command!=='string' || !check.command.trim() || !Array.isArray(check.args) || check.args.some(a=>typeof a!=='string')) throw new Error(`Invalid argv for check ${check.id}`);
    if (check.timeoutSeconds!==undefined && (!Number.isInteger(check.timeoutSeconds) || check.timeoutSeconds<1 || check.timeoutSeconds>3600)) throw new Error(`Invalid timeout for ${check.id}`);
    if (check.storyIds!==undefined && (!Array.isArray(check.storyIds) || check.storyIds.some(id=>!ids.has(id)))) throw new Error(`Invalid storyIds for ${check.id}`);
  }
  for (const id of ids) if (!manifest.checks.some(c=>!c.storyIds || c.storyIds.includes(id))) throw new Error(`No independent verification check configured for story ${id}`);
  if (manifest.protectedPaths!==undefined && (!Array.isArray(manifest.protectedPaths) || manifest.protectedPaths.some(x=>typeof x!=='string' || !x.trim()))) throw new Error('protectedPaths must be string[]');
  return manifest;
}
function snapshotProtected(cwd, paths=[]) {
  const fingerprints=[];
  const roots = [...new Set([...DEFAULT_PROTECTED,...paths])].sort();
  function visit(relative) {
    const filename=path.resolve(cwd,relative);
    if (!filename.startsWith(cwd+path.sep)) throw new Error(`Protected path outside workspace: ${relative}`);
    if (!fs.existsSync(filename)) {fingerprints.push([relative,'absent']);return;}
    const stat=fs.lstatSync(filename);
    if(stat.isSymbolicLink()) {fingerprints.push([relative,'symlink',fs.readlinkSync(filename)]);return;}
    if(stat.isDirectory()) {
      fingerprints.push([relative,'directory']);
      for(const entry of fs.readdirSync(filename).sort()) visit(path.join(relative,entry));
    } else if(stat.isFile()) fingerprints.push([relative,hash(fs.readFileSync(filename))]);
    else fingerprints.push([relative,'special']);
  }
  for(const root of roots) visit(root);
  return hash(fingerprints);
}
function killTree(proc,signal='SIGTERM') {
  if(!proc?.pid)return;
  try { if(process.platform!=='win32')process.kill(-proc.pid,signal); else proc.kill(signal); } catch {try{proc.kill(signal);}catch{}}
}
function runCheck(check,cwd) {
  return new Promise(resolve=>{
    const start=Date.now();
    let stdout='',stderr='',timedOut=false,done=false,proc,timer;
    function finish(code,error) {
      if(done)return; done=true;clearTimeout(timer);
      resolve({id:check.id,exitCode:code,timedOut,durationMs:Date.now()-start,stdout,stderr,error:error??null,passed:code===0&&!timedOut&&!error});
    }
    try {
      const env={ PATH:process.env.PATH??'',HOME:process.env.HOME??'',CI:'true',NODE_ENV:'test',TMPDIR:process.env.TMPDIR??'/tmp' };
      proc=spawn(check.command,check.args,{cwd,shell:false,detached:process.platform!=='win32',env,stdio:['ignore','pipe','pipe']});
      proc.stdout.on('data',b=>stdout=(stdout+b.toString()).slice(-65536));
      proc.stderr.on('data',b=>stderr=(stderr+b.toString()).slice(-65536));
      proc.on('error',err=>finish(null,err.message));
      proc.on('close',code=>finish(code,null));
      timer=setTimeout(()=>{timedOut=true;killTree(proc);const force=setTimeout(()=>{if(!done)killTree(proc,'SIGKILL');},2000);force.unref();},(check.timeoutSeconds??120)*1000);
    } catch(err){finish(null,err.message);}
  });
}
async function runChecks({manifest,cwd,storyId,runner=runCheck}) {
  const selected=manifest.checks.filter(c=>!c.storyIds || c.storyIds.includes(storyId));
  if(!selected.length)throw new Error(`No verification checks for ${storyId}`);
  const checks=[];
  for(const check of selected) checks.push(await runner(check,cwd));
  return checks;
}
module.exports={ loadManifest, snapshotProtected, runCheck, runChecks, DEFAULT_PROTECTED };
