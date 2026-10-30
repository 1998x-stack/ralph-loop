'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function hash(x) { return crypto.createHash('sha256').update(typeof x === 'string'?x:JSON.stringify(x)).digest('hex'); }
function loadJson(filename) { return JSON.parse(fs.readFileSync(filename,'utf8')); }
class StateStore {
  constructor(cwd, relative='.ralph') {
    this.dir = path.resolve(cwd,relative);
    this.file = path.join(this.dir,'state.json');
    this.lock = path.join(this.dir,'run.lock');
  }
  read() { return fs.existsSync(this.file)?loadJson(this.file):null; }
  write(state) {
    fs.mkdirSync(this.dir,{recursive:true,mode:0o700});
    const tmp=path.join(this.dir,`.state-${process.pid}-${crypto.randomUUID()}.tmp`);
    try {
      fs.writeFileSync(tmp,JSON.stringify(state,null,2)+'\n',{mode:0o600,flag:'wx'});
      fs.renameSync(tmp,this.file);
    } finally { if(fs.existsSync(tmp)) fs.unlinkSync(tmp); }
  }
  acquire() {
    fs.mkdirSync(this.dir,{recursive:true,mode:0o700});
    try { fs.writeFileSync(this.lock,JSON.stringify({pid:process.pid,time:Date.now()}),{flag:'wx',mode:0o600}); }
    catch(err) { if(err.code==='EEXIST') throw new Error(`Run lock exists: ${this.lock}. Inspect before removing.`); throw err; }
  }
  release() { if(fs.existsSync(this.lock)) fs.unlinkSync(this.lock); }
  writeEvidence(attemptId,record) {
    const dir=path.join(this.dir,'artifacts');
    fs.mkdirSync(dir,{recursive:true,mode:0o700});
    const output=path.join(dir,`${attemptId}.json`);
    fs.writeFileSync(output,JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});
    return output;
  }
}
module.exports={StateStore,hash,loadJson};
