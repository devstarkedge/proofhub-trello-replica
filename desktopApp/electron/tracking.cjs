const { app, ipcMain, desktopCapturer, screen, powerMonitor, safeStorage, systemPreferences } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { ActivityCounters, DurableQueue, checksum } = require('./tracking-core.cjs');
const {encodeWebP}=require('./screenshot-encoder.cjs');

function installDesktopTracking(getWindow,getOrigin,getBackendURL) {
  const root = path.join(app.getPath('userData'),'tracking'); fs.mkdirSync(root,{recursive:true});
  const installationFile = path.join(root,'installation-id');
  const installationId = fs.existsSync(installationFile)?fs.readFileSync(installationFile,'utf8'):randomUUID();
  if (!fs.existsSync(installationFile)) fs.writeFileSync(installationFile,installationId,{mode:0o600});
  let credentials=null,device=null,work=null,policy=null,queue=null,anchorMono=null;
  let generation=0,timer=null,syncTimer=null,sampler=null,busy=false,uploading=false,capturing=false,hook=null,hookStarted=false;
  let locked=false,suspended=false,lastCapture=0,lastState='unavailable',lastError='',lastCaptureAllowed=false;
  let leaseDeadlineMono=0;
  let realtime=null,haltRevision=0,captureEpoch=0;
  const counters = new ActivityCounters();
  const trusted = event => { const window=getWindow();
    return window && event.sender===window.webContents && event.senderFrame===window.webContents.mainFrame && new URL(event.senderFrame.url).origin===getOrigin(); };
  const publish = (state=lastState,error=lastError) => {
    lastState=state;lastError=error;
    const value={state,error,deviceId:device?._id||null,pending:queue?.files().length||0,monitorIds:screen.getAllDisplays().map(d=>String(d.id)),appVersion:app.getVersion()};
    const window=getWindow(); if(window&&!window.isDestroyed())window.webContents.send('desktop-tracking:status',value);
    if(window&&!window.isDestroyed())window.setTitle(state==='monitoring'?'FlowTask · Monitoring active':state==='offline'?'FlowTask · Monitoring offline':'FlowTask');
    return value;
  };
  async function request(endpoint,body,method=body?'POST':'GET') {
    if (!credentials) throw new Error('Sign in to desktop tracking');
    const backend=new URL(getBackendURL());
    if(backend.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(backend.hostname))throw new Error('Desktop tracking requires HTTPS');
    const response=await fetch(new URL(`/api/tracking${endpoint}`,backend),{method,redirect:'error',
      headers:{Authorization:`Bearer ${credentials.token}`,'x-workspace-id':credentials.workspaceId,'Content-Type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
    const json=await response.json().catch(()=>({}));
    if(!response.ok){const error=new Error(json.message||`Tracking request failed (${response.status})`);error.status=response.status;error.code=json.code;throw error;}
    return json.data;
  }
  const isIdle = ()=>locked||suspended||powerMonitor.getSystemIdleTime()>=(policy?.idleThresholdSeconds||60);
  function stopInput() {
    if(sampler)clearInterval(sampler);sampler=null;
    if(hookStarted){try{hook.stop();}catch{/* OS hook already stopped */}hookStarted=false;}
  }
  function haltPolicy(value){
    if(value?.enabled!==false)return;
    haltRevision=Math.max(haltRevision,Number(value.revision)||0);captureEpoch++;
    capturing=false;lastCaptureAllowed=false;leaseDeadlineMono=0;stopInput();counters.reset();
    publish('unavailable','Time Tracking disabled by workspace Admin');
  }
  function connectRealtime(){
    realtime?.disconnect();realtime=null;if(!credentials)return;
    try{
      let client;try{client=require('socket.io-client');}catch(error){if(!app.isPackaged)throw error;client=require(path.join(process.resourcesPath,'node_modules','socket.io-client'));}
      realtime=client.io(getBackendURL(),{auth:{...credentials},transports:['websocket','polling'],reconnection:true,reconnectionDelay:1000,reconnectionDelayMax:5000});
      realtime.on('tracking:policy-updated',value=>{haltPolicy(value);return sync();});
      for(const event of ['connect','tracking:changed','attendance:checked-in','attendance:checked-out','realtime-recover'])realtime.on(event,()=>sync());
    }catch{/* Existing 15-second heartbeat remains the recovery transport. */}
  }
  function startInput() {
    if(!hook) {
      try {
        let inputModule;
        try { inputModule = require('uiohook-napi'); }
        catch (error) {
          if (!app.isPackaged) throw error;
          inputModule = require(path.join(process.resourcesPath,'node_modules','uiohook-napi'));
        }
        hook=inputModule.uIOhook;
        // Deliberately ignore the entire event payload, including keycodes,
        // modifiers, button IDs and coordinates. Only counters cross this API.
        hook.on('keydown',()=>{if(capturing&&!locked&&!suspended)counters.keyDown();});
        hook.on('mousedown',()=>{if(capturing&&!locked&&!suspended)counters.mouseDown();});
        hook.on('mousemove',()=>{if(capturing&&!locked&&!suspended)counters.input();});
        hook.on('wheel',()=>{if(capturing&&!locked&&!suspended)counters.input();});
      }catch{return false;}
    }
    if(!hookStarted){try{hook.start();hookStarted=true;}catch{return false;}}
    if(!sampler)sampler=setInterval(()=>{if(capturing)counters.sample(isIdle());},1000);
    return true;
  }
  function begin() {
    if(capturing||locked||suspended||performance.now()>=leaseDeadlineMono)return;
    if(!queue?.available()){publish('unavailable','Encrypted offline storage is unavailable');return;}
    if(process.platform==='darwin'&&systemPreferences.getMediaAccessStatus('screen')!=='granted'){publish('unavailable','Allow Screen Recording in macOS System Settings, then restart FlowTask');return;}
    capturing=true;counters.reset();lastCapture=performance.now();
    const input=startInput();
    if(!sampler)sampler=setInterval(()=>{if(capturing)counters.sample(isIdle());},1000);
    publish('monitoring',input?'':'System input counters unavailable; active/idle time is measured separately');
  }
  async function boundary(reason=null) {
    if(!capturing||!work||!device||anchorMono===null)return;
    const activeWork=work,activeDevice=device,activeQueue=queue,activeGeneration=generation,activeEpoch=captureEpoch;
    let coverage=reason||'captured',images=[];
    try {
      if(!reason&&!locked&&!suspended) {
        const preferences=activeDevice.preferences;
        const exclusions=preferences.excludeWindowTitles||[];
        if(exclusions.length){const windows=await desktopCapturer.getSources({types:['window'],thumbnailSize:{width:0,height:0}});
          if(windows.some(w=>exclusions.some(word=>w.name.toLocaleLowerCase().includes(word.toLocaleLowerCase()))))coverage='excluded';}
        if(coverage==='captured'){
          const all=screen.getAllDisplays(),primary=screen.getPrimaryDisplay();
          const displays=all.filter(d=>(preferences.monitors==='all'||d.id===primary.id)&&!(preferences.excludedDisplayIds||[]).includes(String(d.id)));
          if(!displays.length)coverage='excluded';
          else {
            const sources=await desktopCapturer.getSources({types:['screen'],fetchWindowIcons:false,thumbnailSize:{
              width:Math.max(...displays.map(d=>Math.round(d.size.width*d.scaleFactor))),height:Math.max(...displays.map(d=>Math.round(d.size.height*d.scaleFactor)))}});
            for(const display of displays){const source=sources.find(s=>s.display_id===String(display.id));
              if(!source||source.thumbnail.isEmpty()){coverage='unavailable';continue;}
              let image=source.thumbnail;const size=image.getSize();
              if(preferences.blur)image=image.resize({width:Math.max(1,Math.round(size.width/40)),height:Math.max(1,Math.round(size.height/40)),quality:'good'}).resize({...size,quality:'good'});
              let encoded;try{encoded=await encodeWebP(image.toPNG());}catch{
                const original=image.toPNG();images.push({displayId:String(display.id),format:'png',conversionPending:true,checksum:checksum(original),contentMd5:checksum(original,'md5'),bytes:original.length,width:size.width,height:size.height,blurred:preferences.blur,data:original.toString('base64')});
                publish('unavailable','WebP encoding failed; protected original queued for retry');continue;
              }
              const bytes=encoded.data;
              images.push({displayId:String(display.id),checksum:checksum(bytes),contentMd5:checksum(bytes,'md5'),bytes:bytes.length,
                width:encoded.width,height:encoded.height,format:'webp',mimeType:'image/webp',quality:85,blurred:preferences.blur,data:bytes.toString('base64')});
            }
          }
        }
      }else if(!reason)coverage=locked?'locked':'sleep';
    }catch(error){coverage='unavailable';publish('unavailable',error.message);}
    if(activeGeneration!==generation||activeQueue!==queue||activeEpoch!==captureEpoch)return;
    const count=counters.boundary(isIdle());lastCapture=count.endMono;
    const payload={operationId:randomUUID(),sessionId:activeWork._id,anchorId:activeDevice.anchor.id,
      startOffsetMs:count.startMono-anchorMono,endOffsetMs:count.endMono-anchorMono,
      mouseCount:hookStarted?count.mouseCount:null,keyboardCount:hookStarted?count.keyboardCount:null,
      activeSeconds:count.activeSeconds,idleSeconds:count.idleSeconds,coverage,
      inputActiveSeconds:count.inputActiveSeconds,inputEligibleSeconds:count.inputEligibleSeconds,activityBasis:count.activityBasis,
      inputAvailable:hookStarted && coverage!=='excluded',screenshotAvailable:images.length>0};
    if (coverage==='excluded') { payload.mouseCount=null;payload.keyboardCount=null; }
    if(payload.endOffsetMs-payload.startOffsetMs<1)return;
    try{activeQueue.push({payload,images,createdAt:Date.now(),expiresAt:policy?.retentionDays===null?null:+new Date(activeDevice.anchor.serverAt)+payload.endOffsetMs+(policy?.retentionDays||365)*86400000,attempts:0,nextAttempt:0});}
    catch(error){capturing=false;stopInput();publish('unavailable',error.message);}
    publish(lastState,lastError);
  }
  async function stopCapture(reason='partial') {
    if(capturing)await boundary(reason);
    capturing=false;stopInput();counters.reset();lastCaptureAllowed=false;
  }
  async function flush() {
    if(uploading||!credentials||!queue||!device)return; uploading=true;
    const scope=generation,activeQueue=queue,deviceId=device._id;
    try {
      for(const name of activeQueue.files()){
        if(scope!==generation)return;
        let entry;
        try{entry=activeQueue.read(name);}catch{activeQueue.remove(name);publish('unavailable','A damaged offline interval could not be recovered');continue;}
        if(entry.nextAttempt>Date.now())continue;
        try{
          const interval=await request(`/devices/${deviceId}/intervals`,entry.payload);
          if(scope!==generation)return;
          for(const image of entry.images)if(image.format!=='webp'){
            const original=Buffer.from(image.data,'base64');if(checksum(original)!==image.checksum)throw new Error('Offline screenshot checksum mismatch');
            const encoded=await encodeWebP(original);Object.assign(image,{data:encoded.data.toString('base64'),bytes:encoded.data.length,width:encoded.width,height:encoded.height,format:'webp',mimeType:'image/webp',quality:85,checksum:checksum(encoded.data),contentMd5:checksum(encoded.data,'md5'),conversionPending:false});
            activeQueue.update(name,entry);
          }
          for(const image of entry.images){const bytes=Buffer.from(image.data,'base64');
            if(checksum(bytes)!==image.checksum||checksum(bytes,'md5')!==image.contentMd5)throw new Error('Offline screenshot checksum mismatch');
            const {data:ignored,...metadata}=image;
            const prepared=await request(`/devices/${deviceId}/screenshots/prepare`,{intervalId:interval._id,image:metadata});
            if(scope!==generation)return;
            if(!prepared.ready){const url=new URL(prepared.upload.url);
              if(url.protocol!=='https:'||!/(^|\.)r2\.cloudflarestorage\.com$/.test(url.hostname)||prepared.upload.method!=='PUT')throw new Error('Untrusted screenshot upload destination');
              const response=await fetch(url,{method:'PUT',headers:{...prepared.upload.headers,'Content-Length':String(bytes.length)},redirect:'error',body:bytes,signal:AbortSignal.timeout(60000)});
              if(!response.ok&&![409,412].includes(response.status)){
                await request(`/devices/${deviceId}/screenshots/${prepared.screenshotId}/retry`,{}).catch(()=>{});
                throw new Error('Screenshot upload failed; retrying the same capture');
              }
              await request(`/devices/${deviceId}/screenshots/${prepared.screenshotId}/complete`,{});
            }
          }
          if(scope===generation)activeQueue.remove(name);
        }catch(error){
          if(scope!==generation)return;
          if([403,404,410].includes(error.status)){activeQueue.remove(name);publish('unavailable',error.message);}
          else if(error.status===409&&error.code==='TRACKING_INVALID'){activeQueue.remove(name);publish('unavailable','Conflicting interval rejected; coverage gap recorded');}
          else {entry.attempts++;entry.nextAttempt=Date.now()+Math.min(3600000,1000*2**Math.min(entry.attempts,12));activeQueue.update(name,entry);publish('offline',error.message);break;}
        }
      }
    }finally{uploading=false;publish(lastState,lastError);}
  }
  async function sync() {
    if(busy||!credentials)return;busy=true;
    const scope=generation;
    try{
      queue?.prune();
      if(!device){const before=performance.now();
        const next=await request('/devices/register',{installationId,name:os.hostname(),platform:process.platform,appVersion:app.getVersion()});
        if(scope!==generation)return;device=next;anchorMono=(before+performance.now())/2;
      }
      const current=await request('/me');if(scope!==generation)return;
      const beforeHeartbeat=performance.now();
      const next=await request(`/devices/${device._id}/heartbeat`,{sessionId:current.session?._id||null,state:lastState});if(scope!==generation)return;
      if(next.policy.revision<haltRevision)next.canCapture=false;
      const anchorChanged=next.device.anchor.id!==device.anchor.id;
      const changedSession=work?._id!==next.session?._id;
      if(capturing&&(anchorChanged||changedSession||!next.canCapture||next.device.preferences.intervalSeconds!==device.preferences.intervalSeconds||JSON.stringify(next.device.preferences)!==JSON.stringify(device.preferences))){await stopCapture();}
      if(anchorChanged)anchorMono=(beforeHeartbeat+performance.now())/2;
      work=next.session;policy=next.policy;device=next.device;
      leaseDeadlineMono=next.canCapture?beforeHeartbeat+Math.max(0,+new Date(device.leaseUntil)-+new Date(next.serverNow)):0;
      if(device.revokedAt){await stopCapture();queue?.clear();publish('unavailable','This desktop device was revoked');return;}
      if(next.canCapture){lastCaptureAllowed=true;begin();if(capturing)publish('monitoring',hookStarted?'':'System input counters unavailable');}
      else{await stopCapture();publish('unavailable',next.reason||'Monitoring unavailable');}
      await flush();
    }catch(error){
      if(scope!==generation)return;
      if(error.status===401||error.status===403){await stopCapture();queue?.clear();publish('unavailable',error.message);}
      else if(error.status===409){await stopCapture();publish('unavailable',error.message);}
      else{publish('offline',error.message);
        // Capture may continue offline only under the last authorized session,
        // policy/consent and bounded server anchor; work duration stays server-owned.
        if(lastCaptureAllowed&&performance.now()<leaseDeadlineMono)begin();
      }
    }finally{busy=false;}
  }
  async function configure(value) {
    if(value&&(!/^[a-f\d]{24}$/i.test(value.userId)||!/^[a-f\d]{24}$/i.test(value.workspaceId)||typeof value.token!=='string'||value.token.length<16||value.token.length>8192))throw new Error('Invalid tracking identity');
    if(credentials?.userId===value?.userId&&credentials?.workspaceId===value?.workspaceId){const changed=credentials?.token!==value?.token;credentials=value;if(changed)connectRealtime();return publish();}
    realtime?.disconnect();realtime=null;await stopCapture();generation++;queue?.clear();credentials=value;device=null;work=null;policy=null;queue=null;anchorMono=null;haltRevision=0;captureEpoch++;
    clearInterval(timer);timer=null;clearInterval(syncTimer);syncTimer=null;
    if(value){const queueMB=Math.min(4096,Math.max(50,Number(process.env.FLOWTASK_SCREENSHOT_QUEUE_MAX_MB)||500));queue=new DurableQueue(path.join(root,checksum(`${value.workspaceId}:${value.userId}`)),safeStorage,queueMB*1024*1024);
      timer=setInterval(async()=>{
        if(capturing&&performance.now()>=leaseDeadlineMono){capturing=false;stopInput();counters.reset();publish('unavailable','Capture lease expired. Reconnect to renew monitoring authorization.');return;}
        if(capturing&&performance.now()-lastCapture>=(device.preferences.intervalSeconds||300)*1000&&!busy){busy=true;try{await boundary();await flush();}finally{busy=false;}}
      },1000);
      // Native session polling is independent of the React route/window focus.
      syncTimer=setInterval(()=>sync(),15000);syncTimer.unref();
      connectRealtime();await sync();
    }
    return publish(value?lastState:'unavailable');
  }
  let configureChain=Promise.resolve();
  ipcMain.handle('desktop-tracking:configure',(event,value)=>{
    if(!trusted(event))throw new Error('Untrusted tracking sender');
    if(!value){capturing=false;stopInput();generation++;queue?.clear();}
    configureChain=configureChain.catch(()=>{}).then(()=>configure(value));return configureChain;
  });
  ipcMain.handle('desktop-tracking:status',event=>{if(!trusted(event))throw new Error('Untrusted tracking sender');return publish();});
  ipcMain.handle('desktop-tracking:refresh',async event=>{if(!trusted(event))throw new Error('Untrusted tracking sender');await sync();return publish();});
  ipcMain.handle('desktop-tracking:policy',async(event,value)=>{
    if(!trusted(event))throw new Error('Untrusted tracking sender');
    // Unfinished counters cannot be split honestly at a past server boundary.
    // Retain completed uploads and discard only the unfinished capture window.
    haltPolicy(value);
    return publish();
  });
  powerMonitor.on('lock-screen',async()=>{locked=true;await stopCapture('locked');publish('locked');});
  powerMonitor.on('unlock-screen',()=>{locked=false;sync();});
  powerMonitor.on('suspend',async()=>{suspended=true;await stopCapture('sleep');publish('sleep');});
  powerMonitor.on('resume',()=>{suspended=false;sync();});
  let quitting=false;
  app.on('before-quit',event=>{
    if(quitting)return;
    event.preventDefault();quitting=true;
    stopCapture('partial').finally(()=>{realtime?.disconnect();stopInput();clearInterval(timer);clearInterval(syncTimer);generation++;credentials=null;app.quit();});
  });
  return { configure,sync,status:()=>publish() };
}
module.exports={installDesktopTracking};
