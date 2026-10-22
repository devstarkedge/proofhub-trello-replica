const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const core=require('../tracking-core.cjs');

async function fixture({interval=600,draws=[0],slowCapture=false}={}){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'flowtask-capture-test-'));
  const handlers=new Map(),inputs=new Map(),events=new Map(),timers=[],records=[],captures=[],queues=[];
  let mono=0,draw=0,pendingCapture,uploadFails=false,revision=1;
  const userId='a'.repeat(24),workspaceId='b'.repeat(24),sessionId='c'.repeat(24),deviceId='d'.repeat(24),base=Date.now();
  const contents={mainFrame:{url:'http://127.0.0.1:8888/'},send:()=>{}};
  const window={webContents:contents,isDestroyed:()=>false,setTitle:()=>{}};
  const sender={sender:contents,senderFrame:contents.mainFrame};
  const policy=()=>({enabled:true,monitoringEnabled:true,intervalSeconds:interval,revision,retentionDays:365});
  const device=()=>({_id:deviceId,anchor:{id:'anchor',serverAt:new Date(base).toISOString()},preferences:{enabled:true,intervalSeconds:interval,monitors:'primary',blur:false},leaseUntil:new Date(base+mono+300000).toISOString()});
  const work=()=>({_id:sessionId,status:'RUNNING',revision:1,attendanceSession:'e'.repeat(24)});
  class Queue{
    constructor(){this.entries=new Map();queues.push(this);this.maxBytes=1000000;}
    available(){return true;} files(){return [...this.entries.keys()];} damagedFiles(){return [];} usedBytes(){return 0;} prune(){}
    push(entry){const key=String(records.length);records.push(structuredClone(entry));this.entries.set(key,entry);}
    read(key){return this.entries.get(key);} update(key,value){this.entries.set(key,value);} remove(key){this.entries.delete(key);}
  }
  const image={isEmpty:()=>false,getSize:()=>({width:10,height:10}),toPNG:()=>Buffer.from('synthetic-image')};
  const sources=()=>[{display_id:'1',thumbnail:image}];
  const electron={
    app:{getPath:()=>directory,getVersion:()=> 'test',isPackaged:false,on:()=>{}},ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},
    screen:{getAllDisplays:()=>[{id:1,size:{width:10,height:10},scaleFactor:1}],getPrimaryDisplay:()=>({id:1})},
    powerMonitor:{getSystemIdleTime:()=>0,on:(name,fn)=>events.set(name,fn)},safeStorage:{isEncryptionAvailable:()=>true},
    desktopCapturer:{getSources:async()=>{captures.push(mono);if(slowCapture)return new Promise(resolve=>{pendingCapture=()=>resolve(sources());});return sources();}}
  };
  const localCore={...core,DurableQueue:Queue,ActivityCounters:class extends core.ActivityCounters{constructor(){super(()=>mono);}},
    CaptureSchedule:class extends core.CaptureSchedule{constructor(options){super({...options,random:(min,max)=>min+Math.floor(draws[draw++%draws.length]*(max-min))});}}};
  const nativeRequire=name=>{
    if(name==='electron')return electron;
    if(name==='./tracking-core.cjs')return localCore;
    if(name==='./monitoring-authorization.cjs')return {noticeAuthorization:()=> 'synthetic-notice'};
    if(name==='./screenshot-upload.cjs')return {uploadEntry:async({entry})=>{if(uploadFails)throw new Error('Synthetic offline upload');entry.acknowledged=true;}};
    if(name==='uiohook-napi')return {uIOhook:{on:(name,fn)=>inputs.set(name,fn),start:()=>{},stop:()=>{}}};
    if(name==='socket.io-client')return {io:()=>({on:()=>{},disconnect:()=>{}})};
    return require(name);
  };
  const context={require:nativeRequire,module:{exports:{}},process,Buffer,URL,AbortSignal,console,performance:{now:()=>mono},
    setInterval:(callback,ms)=>{const timer={callback,ms,unref(){}};timers.push(timer);return timer;},clearInterval:()=>{},setTimeout:()=>({unref(){}}),clearTimeout:()=>{},
    fetch:async url=>({ok:true,json:async()=>({data:url.pathname.endsWith('/register')?device():url.pathname.endsWith('/me')?{session:work()}:{device:device(),policy:policy(),session:work(),canCapture:true,serverNow:new Date(base+mono).toISOString()}})})};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../tracking.cjs'),'utf8'),context);
  const agent=context.module.exports.installDesktopTracking(()=>window,()=> 'http://127.0.0.1:8888',()=> 'http://127.0.0.1:8888');
  await agent.configure({userId,workspaceId,token:'synthetic-test-token-only'});
  const tick=timers.find(timer=>timer.ms===1000);
  const settle=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
  return {agent,records,captures,inputs,events,queues,handlers,sender,
    async at(at,input,{renew=true}={}){mono=at;if(renew)await agent.sync();if(input)inputs.get(input)();await tick.callback();await settle();},
    setTime:at=>{mono=at;},tick:()=>tick.callback(),resolveCapture:()=>pendingCapture?.(),setInterval:seconds=>{interval=seconds;revision++;},failUploads:()=>{uploadFails=true;},restoreUploads:()=>{uploadFails=false;},
    async close(){await agent.configure(null);await settle();assert.equal(path.dirname(directory),os.tmpdir());assert.ok(path.basename(directory).startsWith('flowtask-capture-test-'));fs.rmSync(directory,{recursive:true,force:true});}
  };
}

test('the real runtime captures at fresh 7 then 13 minute delays; heartbeat/input do not reroll deadlines',async()=>{
  const f=await fixture({draws:[0,0.999999]});try{
    await f.at(240000,'keydown');await f.at(419000,'mousedown');assert.equal(f.captures.length,0);
    await f.at(420000);assert.deepEqual(f.captures,[420000]);
    for(const time of [660000,900000,1140000])await f.at(time,'keydown');
    await f.at(1199000);assert.equal(f.captures.length,1);await f.at(1200000);assert.deepEqual(f.captures,[420000,1200000]);
    assert.equal(f.records.filter(record=>record.images.length).length,2);
  }finally{await f.close();}
});
test('five minutes without key/mouse clicks suppresses images even with movement/scroll; resume uses a new interval',async()=>{
  const f=await fixture();try{
    for(const time of [60000,120000,180000,240000,300000])await f.at(time,time%120000?'mousemove':'wheel');
    assert.equal(f.agent.status().screenshotsPausedForInactivity,true);assert.equal(f.captures.length,0);
    await f.at(1200000);assert.equal(f.captures.length,0);assert.ok(f.records.some(record=>record.payload.coverage==='inactive'));
    await f.at(1201000,'mousedown');assert.equal(f.agent.status().screenshotsPausedForInactivity,false);assert.equal(f.captures.length,0);
    await f.at(1441000,'keydown');await f.at(1620000);assert.equal(f.captures.length,0);
    await f.at(1621000);assert.deepEqual(f.captures,[1621000]);
    assert.ok(f.records.filter(record=>record.payload.coverage==='inactive').every(record=>record.images.length===0));
    assert.equal(f.queues[0].files().length,0,'intentional inactivity must not prevent queued deliveries');
  }finally{await f.close();}
});
test('a policy interval update does not reset inactivity for the same user/session',async()=>{
  const f=await fixture();try{await f.at(300000);f.setInterval(300);await f.at(310000);assert.equal(f.agent.status().screenshotsPausedForInactivity,true);await f.at(500000);assert.equal(f.captures.length,0);}finally{await f.close();}
});
test('saved screenshots keep uploading while fresh captures are paused for inactivity',async()=>{
  const f=await fixture({interval:300});try{
    f.failUploads();await f.at(120000,'keydown');assert.equal(f.queues[0].files().length,1);
    await f.at(420000);assert.equal(f.agent.status().screenshotsPausedForInactivity,true);assert.equal(f.captures.length,1);
    f.restoreUploads();await f.handlers.get('desktop-tracking:retry-uploads')(f.sender);
    for(let i=0;i<25;i++)await Promise.resolve();
    assert.equal(f.queues[0].files().length,0);assert.equal(f.captures.length,1);assert.equal(f.agent.status().screenshotsPausedForInactivity,true);
  }finally{await f.close();}
});
test('a 63 minute randomized delay checkpoints activity without taking early screenshots or exceeding server windows',async()=>{
  const f=await fixture({interval:3600,draws:[0.999999]});try{
    for(let minute=1;minute<=63;minute++)await f.at(minute*60000,minute%4===0?'keydown':undefined);
    assert.deepEqual(f.captures,[3780000]);assert.ok(f.records.some(record=>record.payload.coverage==='activity-only'));
    assert.ok(f.records.every(record=>record.payload.endOffsetMs-record.payload.startOffsetMs<=3600000));
    assert.equal(f.records.reduce((sum,record)=>sum+record.payload.keyboardCount,0),15);
    assert.equal(f.records.reduce((sum,record)=>sum+record.payload.endOffsetMs-record.payload.startOffsetMs,0),3780000);
  }finally{await f.close();}
});
test('an in-flight OS capture cannot save an image after the five minute inactivity cutoff',async()=>{
  const f=await fixture({interval:300,slowCapture:true});try{
    await f.at(119000);f.setTime(120000);const capturing=f.tick();await Promise.resolve();
    f.setTime(300000);await f.tick();f.resolveCapture();await capturing;await f.tick();
    assert.equal(f.records.filter(record=>record.images.length).length,0);assert.equal(f.agent.status().screenshotsPausedForInactivity,true);
  }finally{await f.close();}
});
test('lease expiry and checkout cancel scheduling and keep already saved uploads',async()=>{
  const f=await fixture({interval:300});try{
    f.failUploads();await f.at(120000,'keydown');assert.equal(f.captures.length,1);assert.equal(f.queues[0].files().length,1);
    await f.at(500000,undefined,{renew:false});assert.equal(f.agent.status().state,'unavailable');
    await f.at(510000,'keydown',{renew:false});assert.equal(f.captures.length,1);assert.equal(f.queues[0].files().length,1);
    await f.handlers.get('desktop-tracking:finalize-session')(f.sender,{attendanceSessionId:'e'.repeat(24),workSessionIds:['c'.repeat(24)],cutoffAt:new Date().toISOString()});
    await f.at(700000,'mousedown');assert.equal(f.captures.length,1);assert.equal(f.queues[0].files().length,1);
  }finally{await f.close();}
});
