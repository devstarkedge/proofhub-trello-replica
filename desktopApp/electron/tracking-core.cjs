const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { CaptureSchedule, MAX_ACTIVITY_WINDOW_MS } = require('./capture-schedule.cjs');

class ActivityCounters {
  constructor(now = () => performance.now()) { this.now = now; this.reset(); }
  reset() { this.start = this.last = this.now(); this.mouse = 0; this.keyboard = 0; this.active = 0; this.idle = 0; this.inputBuckets = new Set(); }
  input() { this.inputBuckets.add(Math.floor(this.now()/1000)); }
  mouseDown() { this.mouse++; this.input(); }
  keyDown() { this.keyboard++; this.input(); }
  sample(isIdle) {
    const now = this.now(), seconds = Math.max(0, (now-this.last)/1000); this.last = now;
    if (isIdle) this.idle += seconds; else this.active += seconds;
  }
  boundary(isIdle) {
    this.sample(isIdle); const end = this.last;
    let inputActiveSeconds = 0;
    for (const bucket of this.inputBuckets) inputActiveSeconds += Math.max(0, Math.min(end,(bucket+1)*1000)-Math.max(this.start,bucket*1000))/1000;
    const result = { startMono: this.start, endMono: end, mouseCount:this.mouse, keyboardCount:this.keyboard,
      activeSeconds:this.active, idleSeconds:this.idle, inputActiveSeconds, inputEligibleSeconds: (end-this.start)/1000, activityBasis: 'distinct-input-seconds-v1' };
    for (const bucket of this.inputBuckets) if ((bucket+1)*1000<=end) this.inputBuckets.delete(bucket);
    this.start = this.last = end; this.mouse = this.keyboard = this.active = this.idle = 0;
    return result;
  }
}
class DurableQueue {
  constructor(directory, encryption, maxBytes = 500*1024*1024) {
    this.directory = path.resolve(directory); this.encryption = encryption; this.maxBytes = maxBytes;
    fs.mkdirSync(this.directory,{recursive:true});
    // A process can stop after fsync but before rename. Recover a complete
    // encrypted checkpoint; retain damaged bytes for diagnosis instead of loss.
    if(this.available())for(const name of fs.readdirSync(this.directory))if(/^[a-f\d-]+\.queue\.tmp$/.test(name)){
      const temp=path.join(this.directory,name);
      try{JSON.parse(this.encryption.decryptString(fs.readFileSync(temp)));fs.renameSync(temp,temp.slice(0,-4));}
      catch{fs.renameSync(temp,temp+'.damaged');}
    }
  }
  files() { return fs.readdirSync(this.directory).filter(name=>/^[a-f\d-]+\.queue$/.test(name)).sort(); }
  available() { return this.encryption.isEncryptionAvailable(); }
  damagedFiles(){return fs.readdirSync(this.directory).filter(name=>/\.queue(?:\.tmp)?\.damaged$/.test(name));}
  usedBytes(){return fs.readdirSync(this.directory).filter(name=>/\.queue(?:\.tmp)?(?:\.damaged)?$/.test(name)).reduce((n,name)=>n+fs.statSync(path.join(this.directory,name)).size,0);}
  push(value, { retainOnFull = false } = {}) {
    if (!this.available()) throw new Error('Encrypted offline storage is unavailable');
    const bytes = this.encryption.encryptString(JSON.stringify(value));
    const used = this.usedBytes();
    const full = used+bytes.length>this.maxBytes;
    if (full && (!retainOnFull || used>this.maxBytes)) throw new Error('Offline screenshot queue is full; reconnect to upload');
    // Keep the capture that crosses the configured capacity, then stop taking
    // new evidence until uploads free space. Existing evidence is never evicted.
    const name = randomUUID()+'.queue'; this.write(name,bytes,{allowOverflow:full&&retainOnFull});
    if(full)throw Object.assign(new Error('Offline screenshot queue is full; latest capture saved; reconnect to upload'),{code:'SCREENSHOT_QUEUE_FULL',savedCapture:name});
    return name;
  }
  write(name,bytes,{allowOverflow=false}={}) {
    const target = this.target(name), temp = target+'.tmp';
    const oldSize=fs.existsSync(target)?fs.statSync(target).size:0;
    const used=this.usedBytes();
    // Existing over-capacity entries may shrink or be checkpointed while they
    // drain; refusing those writes would prevent recovery from a full queue.
    const checkpoint = oldSize > 0 && bytes.length <= oldSize + 64 * 1024;
    if(!allowOverflow&&!checkpoint&&used-oldSize+bytes.length>this.maxBytes)throw new Error('Offline screenshot queue is full; saved captures retained');
    const handle = fs.openSync(temp,'w',0o600);
    try { fs.writeFileSync(handle,bytes); fs.fsyncSync(handle); } finally { fs.closeSync(handle); }
    fs.renameSync(temp,target);
  }
  target(name) { if (!/^[a-f\d-]+\.queue$/.test(name)) throw new Error('Invalid queue entry'); return path.join(this.directory,name); }
  read(name) { return JSON.parse(this.encryption.decryptString(fs.readFileSync(this.target(name)))); }
  update(name,value) { this.write(name,this.encryption.encryptString(JSON.stringify(value))); }
  remove(name) { fs.rmSync(this.target(name),{force:true}); }
  quarantine(name){fs.renameSync(this.target(name),this.target(name)+'.damaged');}
  clear() { for (const name of this.files()) this.remove(name); }
  prune(now=Date.now()) { if(!this.available())return;for(const name of this.files()){let value;try{value=this.read(name);}catch{this.quarantine(name);continue;}if(value.expiresAt&&value.expiresAt<=now)this.remove(name);} }
}
const checksum = (data, algorithm='sha256') => createHash(algorithm).update(data).digest('hex');
module.exports = { ActivityCounters, DurableQueue, checksum, CaptureSchedule, MAX_ACTIVITY_WINDOW_MS };
