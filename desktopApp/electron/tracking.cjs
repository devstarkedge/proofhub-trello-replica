const { app, ipcMain, desktopCapturer, screen, powerMonitor, safeStorage, systemPreferences, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { ActivityCounters, DurableQueue, checksum } = require('./tracking-core.cjs');
const {encodeWebP}=require('./screenshot-encoder.cjs');
const {noticeAuthorization}=require('./monitoring-authorization.cjs');
const encodedFields=e=>({width:e.width,height:e.height,originalWidth:e.originalWidth,originalHeight:e.originalHeight,quality:e.quality,pipelineVersion:e.pipelineVersion,compressionStrategy:e.compressionStrategy});

function installDesktopTracking(getWindow,getOrigin,getBackendURL) {
  const root = path.join(app.getPath('userData'),'tracking'); fs.mkdirSync(root,{recursive:true});
  const installationFile = path.join(root,'installation-id');
  const installationId = fs.existsSync(installationFile)?fs.readFileSync(installationFile,'utf8'):randomUUID();
  if (!fs.existsSync(installationFile)) fs.writeFileSync(installationFile,installationId,{mode:0o600});
  let credentials=null,device=null,work=null,policy=null,queue=null,anchorMono=null;
  let generation=0,timer=null,syncTimer=null,uploadTimer=null,sampler=null,busy=false,uploading=false,capturing=false,hook=null,hookStarted=false;
  let locked=false,suspended=false,lastCapture=0,lastState='unavailable',lastError='',lastErrorCode='',lastCaptureAllowed=false;
  let leaseDeadlineMono=0;
  let realtime=null,haltRevision=0,captureEpoch=0;
  const closedSessions=new Map(),closedAttendance=new Map();
  const transitions=new Map();
  function acceptTransition(value){
    const key=String(value?.sessionId||value?._id||'');
    if(!key||!Number.isInteger(value.revision)||!['RUNNING','PAUSED','CLOSED'].includes(value.status))return;
    const previous=transitions.get(key);
    if(previous&&value.revision<previous.revision)return;
    transitions.set(key,{revision:value.revision,status:value.status});
    while(transitions.size>256)transitions.delete(transitions.keys().next().value);
    if(value.status==='CLOSED')rememberClosure({workSessionIds:[key],cutoffAt:value.endedAt});
    else if(String(work?._id)===key&&value.status==='PAUSED'){work={...work,status:'PAUSED',revision:value.revision};haltCapture('Work is not running');}
  }
  let noticeRequired=false,noticeVersion=1;
  let uploadError='',uploadErrorCode='',nextUploadRetryAt=null;
  const protectedEntries=new Set();
  const counters = new ActivityCounters();
  const trusted = event => { const window=getWindow();
    return window && event.sender===window.webContents && event.senderFrame===window.webContents.mainFrame && new URL(event.senderFrame.url).origin===getOrigin(); };
  const publish = (state=lastState,error=lastError,code=error===lastError?lastErrorCode:'') => {
    lastState=state;lastError=error;lastErrorCode=code;
    const value={protocolVersion:2,capabilities:{retryUploads:true,claimMonitoring:true,finalizeSession:true,sessionTransitions:true},state,error,errorCode:code,userId:credentials?.userId||null,workspaceId:credentials?.workspaceId||null,deviceId:device?._id||null,pending:(queue?.files()||[]).filter(name=>!protectedEntries.has(name)).length,protectedCopies:protectedEntries.size,uploadError,uploadErrorCode,nextUploadRetryAt,monitorIds:screen.getAllDisplays().map(d=>String(d.id)),appVersion:app.getVersion(),noticeRequired,noticeVersion,
      policy:policy?{revision:policy.revision,enabled:policy.enabled,monitoringEnabled:policy.monitoringEnabled,intervalSeconds:policy.intervalSeconds,retentionDays:policy.retentionDays,monitors:policy.monitors,blur:policy.blur,format:'webp',personalPauseEnabled:policy.personalPauseEnabled}:null};
    const window=getWindow(); if(window&&!window.isDestroyed())window.webContents.send('desktop-tracking:status',value);
    if(window&&!window.isDestroyed())window.setTitle(state==='monitoring'?'FlowTask · Monitoring active':state==='offline'?'FlowTask · Monitoring offline':'FlowTask');
    return value;
  };
  async function request(endpoint,body,method=body?'POST':'GET') {
    if (!credentials) throw new Error('Sign in to desktop tracking');
    const backend=new URL(getBackendURL());
    if(backend.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(backend.hostname))throw new Error('Desktop tracking requires HTTPS');
    const response=await fetch(new URL(`/api/tracking${endpoint}`,backend),{method,redirect:'error',
      headers:{Authorization:`Bearer ${credentials.token}`,'x-workspace-id':credentials.workspaceId,'Content-Type':'application/json',...(/\/(notice|claim)$/.test(endpoint)?{'x-desktop-notice-authorization':noticeAuthorization(root,safeStorage)}:{})},
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
    capturing=false;lastCaptureAllowed=false;leaseDeadlineMono=0;noticeRequired=false;stopInput();counters.reset();
    publish('unavailable','Time Tracking disabled by workspace Admin');
  }
  function haltCapture(message='Desktop monitoring stopped'){
    captureEpoch++;capturing=false;lastCaptureAllowed=false;leaseDeadlineMono=0;noticeRequired=false;stopInput();counters.reset();publish('unavailable',message);
  }
  function rememberClosure(value) {
    const attendanceId=value.attendanceSessionId;
    const ids=[...(value.workSessionIds||[])];
    if(attendanceId){closedAttendance.set(String(attendanceId),value.cutoffAt||null);if(String(work?.attendanceSession)===String(attendanceId)&&work?._id)ids.push(String(work._id));}
    for(const id of ids)closedSessions.set(String(id),value.cutoffAt||null);
    for(const map of [closedSessions,closedAttendance])while(map.size>256)map.delete(map.keys().next().value);
    if(work&&(closedSessions.has(String(work._id))||closedAttendance.has(String(work.attendanceSession)))){
      // Do not fabricate a final screenshot/counter window at a past boundary.
      // Previously completed encrypted entries continue through flush().
      haltCapture('Checked out');work={...work,status:'CLOSED',...(value.cutoffAt?{endedAt:value.cutoffAt}:{})};
    }
  }
  function connectRealtime(){
    realtime?.disconnect();realtime=null;if(!credentials)return;
    try{
      let client;try{client=require('socket.io-client');}catch(error){if(!app.isPackaged)throw error;client=require(path.join(process.resourcesPath,'node_modules','socket.io-client'));}
      realtime=client.io(getBackendURL(),{auth:{...credentials},transports:['websocket','polling'],reconnection:true,reconnectionDelay:1000,reconnectionDelayMax:5000});
      realtime.on('tracking:policy-updated',value=>{haltPolicy(value);return sync();});
      realtime.on('tracking:changed',value=>{acceptTransition(value);return sync();});
      realtime.on('attendance:checked-out',value=>{if(String(value?.userId)===String(credentials?.userId)&&value?.session?._id)rememberClosure({attendanceSessionId:value.session._id,cutoffAt:value.session.checkOutAt});return sync();});
      realtime.on('tracking:device-updated',value=>{if(String(value?.deviceId)===String(device?._id)){if(value?.revoked)haltCapture('This desktop device was revoked');else if(value?.displaced)haltCapture('Monitoring was moved to another desktop');}return sync();});
      for(const event of ['attendance:checked-in','user-role-changed','department-bulk-assigned','department-bulk-unassigned','access-permissions-updated','workspace-membership-added','workspace-membership-removed','workspace-updated'])realtime.on(event,()=>sync());
      for(const event of ['connect','realtime-recover'])realtime.on(event,async()=>{await sync();await retryQueuedUploads();});
    }catch{/* Existing 15-second heartbeat remains the recovery transport. */}
  }
  function startInput() {
    if(process.platform==='darwin'&&!systemPreferences.isTrustedAccessibilityClient(false))return false;
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
    if(process.platform==='darwin'&&systemPreferences.getMediaAccessStatus('screen')!=='granted'){publish('permission-required','Allow Screen Recording in macOS System Settings, then restart FlowTask');return;}
    capturing=true;counters.reset();lastCapture=performance.now();
    const input=startInput();
    if(!sampler)sampler=setInterval(()=>{if(capturing)counters.sample(isIdle());},1000);
    publish('monitoring',input?'':'System input counters unavailable; active/idle time is measured separately');
  }
  async function boundary(reason=null) {
    if(!capturing||!work||!device||anchorMono===null)return;
    const activeWork=work,activeDevice=device,activeQueue=queue,activeGeneration=generation,activeEpoch=++captureEpoch;
    let coverage=reason||'captured',images=[];
    try {
      if(!reason&&!locked&&!suspended) {
        const preferences=activeDevice.preferences;
        const exclusions=preferences.excludeWindowTitles||[];
        if(exclusions.length){const windows=await desktopCapturer.getSources({types:['window'],thumbnailSize:{width:0,height:0}});
          if(windows.some(w=>exclusions.some(word=>w.name.toLocaleLowerCase().includes(word.toLocaleLowerCase()))))coverage='excluded';}
        if(activeEpoch!==captureEpoch||locked||suspended)return;
        if(coverage==='captured'){
          const all=screen.getAllDisplays(),primary=screen.getPrimaryDisplay();
          const displays=all.filter(d=>(preferences.monitors==='all'||d.id===primary.id)&&!(preferences.excludedDisplayIds||[]).includes(String(d.id)));
          if(!displays.length)coverage='excluded';
          else {
            const sources=await desktopCapturer.getSources({types:['screen'],fetchWindowIcons:false,thumbnailSize:{
              width:Math.max(...displays.map(d=>Math.round(d.size.width*d.scaleFactor))),height:Math.max(...displays.map(d=>Math.round(d.size.height*d.scaleFactor)))}});
            for(const display of displays){const source=sources.find(s=>s.display_id===String(display.id));
              if(activeEpoch!==captureEpoch||locked||suspended)return;
              if(!source||source.thumbnail.isEmpty()){coverage='unavailable';continue;}
              let image=source.thumbnail;const size=image.getSize();
              if(preferences.blur)image=image.resize({width:Math.max(1,Math.round(size.width/40)),height:Math.max(1,Math.round(size.height/40)),quality:'good'}).resize({...size,quality:'good'});
              let encoded;try{encoded=await encodeWebP(image.toPNG());}catch(error){
                const original=image.toPNG();images.push({displayId:String(display.id),format:'png',conversionPending:error.code!=='SIZE_QUALITY_CONFLICT',exceptionCode:error.code==='SIZE_QUALITY_CONFLICT'?error.code:undefined,measurement:error.measurement,protectedUntil:Date.now()+3600000,checksum:checksum(original),contentMd5:checksum(original,'md5'),bytes:original.length,width:size.width,height:size.height,blurred:preferences.blur,data:original.toString('base64')});
                publish('monitoring',error.code==='SIZE_QUALITY_CONFLICT'?'Screenshot exceeds 70 KiB within the readability floor; activity is still recorded':'WebP encoding failed; protected original queued for retry');continue;
              }
              const bytes=encoded.data;
              images.push({displayId:String(display.id),checksum:checksum(bytes),contentMd5:checksum(bytes,'md5'),bytes:bytes.length,
                ...encodedFields(encoded),format:'webp',mimeType:'image/webp',blurred:preferences.blur,data:bytes.toString('base64')});
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
      inputAvailable:hookStarted && coverage!=='excluded',screenshotAvailable:images.some(image=>!image.exceptionCode)};
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
        const held=entry.images?.length&&entry.images.every(image=>image.exceptionReported);if(held)protectedEntries.add(name);else protectedEntries.delete(name);
        if(entry.lastUploadError&&!held){uploadError=entry.lastUploadError;uploadErrorCode=entry.lastUploadErrorCode||'UPLOAD_UNAVAILABLE';nextUploadRetryAt=entry.nextAttempt||null;}
        if(!held&&entry.nextAttempt>Date.now()+60000){entry.nextAttempt=Date.now()+60000;activeQueue.update(name,entry);nextUploadRetryAt=entry.nextAttempt;}
        if(entry.nextAttempt>Date.now())continue;
        try{
          const interval=await request(`/devices/${deviceId}/intervals`,entry.payload);
          if(scope!==generation)return;
          for(const image of entry.images)if(image.format!=='webp'&&!image.exceptionCode){
            const original=Buffer.from(image.data,'base64');if(checksum(original)!==image.checksum)throw new Error('Offline screenshot checksum mismatch');
            let encoded;try{encoded=await encodeWebP(original);}catch(error){if(error.code!=='SIZE_QUALITY_CONFLICT')throw error;Object.assign(image,{exceptionCode:error.code,measurement:error.measurement,conversionPending:false,protectedUntil:Date.now()+3600000});activeQueue.update(name,entry);continue;}Object.assign(image,{data:encoded.data.toString('base64'),bytes:encoded.data.length,...encodedFields(encoded),format:'webp',mimeType:'image/webp',checksum:checksum(encoded.data),contentMd5:checksum(encoded.data,'md5'),conversionPending:false});
            if(scope!==generation)return;
            activeQueue.update(name,entry);
          }
          for(const image of entry.images){if(image.exceptionReported)continue;let bytes=Buffer.from(image.data,'base64');
            if(scope!==generation)return;
            if(checksum(bytes)!==image.checksum||checksum(bytes,'md5')!==image.contentMd5)throw new Error('Offline screenshot checksum mismatch');
            const {data:ignored,...metadata}=image;
            let prepared;
            try{prepared=await request(`/devices/${deviceId}/screenshots/prepare`,{intervalId:interval._id,image:metadata});}
            catch(error){
              // Existing pending legacy captures keep their exact checksum. Only
              // a new oversized legacy-queue capture is converted after rejection.
              if(error.code!=='AGENT_UPDATE_REQUIRED')throw error;
              try{const encoded=await encodeWebP(bytes);bytes=encoded.data;Object.assign(image,encodedFields(encoded),{bytes:bytes.length,data:bytes.toString('base64'),checksum:checksum(bytes),contentMd5:checksum(bytes,'md5')});}
              catch(encodingError){if(encodingError.code!=='SIZE_QUALITY_CONFLICT')throw encodingError;Object.assign(image,{exceptionCode:encodingError.code,measurement:encodingError.measurement,protectedUntil:Date.now()+3600000});}
              activeQueue.update(name,entry);const {data:unused,...updated}=image;prepared=await request(`/devices/${deviceId}/screenshots/prepare`,{intervalId:interval._id,image:updated});
            }
            if(prepared.exceptionRecorded){image.exceptionReported=true;image.protectedUntil||=Date.now()+3600000;activeQueue.update(name,entry);continue;}

            if(scope!==generation)return;
            if(!prepared.ready){const url=new URL(prepared.upload.url);
              if(url.protocol!=='https:'||!/(^|\.)r2\.cloudflarestorage\.com$/.test(url.hostname)||prepared.upload.method!=='PUT')throw new Error('Untrusted screenshot upload destination');
              const response=await fetch(url,{method:'PUT',headers:{...prepared.upload.headers,'Content-Length':String(bytes.length)},redirect:'error',body:bytes,signal:AbortSignal.timeout(60000)});
              if(!response.ok&&![409,412].includes(response.status)){
                await request(`/devices/${deviceId}/screenshots/${prepared.screenshotId}/retry`,{}).catch(()=>{});
                throw new Error('Screenshot upload failed; retrying the same capture');
              }
              if(scope!==generation)return;
              await request(`/devices/${deviceId}/screenshots/${prepared.screenshotId}/complete`,{});
            }
          }
          if(scope===generation){entry.images=entry.images.filter(image=>image.exceptionReported&&image.protectedUntil>Date.now());if(entry.images.length){protectedEntries.add(name);entry.nextAttempt=Date.now()+60000;activeQueue.update(name,entry);}else{protectedEntries.delete(name);activeQueue.remove(name);}}
        }catch(error){
          if(scope!==generation)return;
          if([403,404,410].includes(error.status)){activeQueue.remove(name);publish('unavailable',error.message);}
          else if(error.status===409&&['TRACKING_INVALID','CAPTURE_AFTER_CHECKOUT'].includes(error.code)){activeQueue.remove(name);publish('unavailable','Conflicting interval rejected; coverage gap recorded');}
          else {entry.attempts++;entry.nextAttempt=Date.now()+Math.min(60000,1000*2**Math.min(entry.attempts,6));entry.lastUploadError=error.status>=500?'Screenshot service could not finish the upload. Saved captures will retry.':String(error.message||'Upload unavailable').slice(0,300);entry.lastUploadErrorCode=String(error.code||'UPLOAD_UNAVAILABLE').slice(0,80);uploadError=entry.lastUploadError;uploadErrorCode=entry.lastUploadErrorCode;nextUploadRetryAt=entry.nextAttempt;activeQueue.update(name,entry);publish(lastState,lastError);break;}
        }
      }
    }finally{uploading=false;if(scope===generation){const files=activeQueue.files();for(const name of protectedEntries)if(!files.includes(name))protectedEntries.delete(name);if(!files.some(name=>!protectedEntries.has(name))){uploadError='';uploadErrorCode='';nextUploadRetryAt=null;}}publish(lastState,lastError);}
  }
  async function retryQueuedUploads(){
    if(!credentials||!queue||!device||uploading)return publish();
    resetUploadDelays();await flush();return publish();
  }
  function resetUploadDelays(){
    if(!queue)return;
    nextUploadRetryAt=null;
    for(const name of queue.files()){let entry;try{entry=queue.read(name);}catch{continue;}
      if(entry.images?.length&&entry.images.every(image=>image.exceptionReported))continue;
      if(entry.nextAttempt){entry.nextAttempt=0;queue.update(name,entry);}
    }
  }
  async function sync() {
    if(busy||!credentials||quitting)return;busy=true;
    const scope=generation;
    try{
      queue?.prune();
      if(!device){const before=performance.now();
        const next=await request('/devices/register',{installationId,name:os.hostname(),platform:process.platform,appVersion:app.getVersion(),noticeAuthorization:noticeAuthorization(root,safeStorage)});
        if(scope!==generation)return;device=next;anchorMono=(before+performance.now())/2;
      }
      const current=await request('/me');if(scope!==generation)return;
      const beforeHeartbeat=performance.now();
      const next=await request(`/devices/${device._id}/heartbeat`,{sessionId:current.session?._id||null,state:lastState});if(scope!==generation)return;
      if(next.policy.revision<haltRevision)next.canCapture=false;
      if(next.session&&(closedSessions.has(String(next.session._id))||closedAttendance.has(String(next.session.attendanceSession)))){next.canCapture=false;next.session={...next.session,status:'CLOSED'};}
      if(next.session){const known=transitions.get(String(next.session._id));if(known&&(next.session.revision<known.revision||next.session.revision===known.revision&&known.status!==next.session.status)){next.canCapture=false;next.session={...next.session,...known};}else acceptTransition(next.session);}
      const anchorChanged=next.device.anchor.id!==device.anchor.id;
      const changedSession=work?._id!==next.session?._id;
      if(capturing&&(anchorChanged||changedSession||!next.canCapture||next.device.preferences.intervalSeconds!==device.preferences.intervalSeconds||JSON.stringify(next.device.preferences)!==JSON.stringify(device.preferences))){await stopCapture();}
      if(anchorChanged)anchorMono=(beforeHeartbeat+performance.now())/2;
      work=next.session;policy=next.policy;device=next.device;
      noticeVersion=next.noticeVersion||1;noticeRequired=Boolean(next.needsNotice&&work?.status==='RUNNING');
      leaseDeadlineMono=next.canCapture?beforeHeartbeat+Math.max(0,+new Date(device.leaseUntil)-+new Date(next.serverNow)):0;
      if(device.revokedAt){haltCapture('This desktop device was revoked');return;}
      if(next.canCapture){
        if(process.platform==='darwin'&&systemPreferences.getMediaAccessStatus('screen')!=='granted'){
          haltCapture('Screen Recording permission is required in macOS System Settings');publish('permission-required',lastError);
        }else{lastCaptureAllowed=true;begin();if(capturing)publish('monitoring',hookStarted?'':'System input counters unavailable');}
      }
      else{await stopCapture();const state=!policy.enabled||!policy.monitoringEnabled?'disabled':work?.status==='PAUSED'?'paused':!work||work.status!=='RUNNING'?'ready':'unavailable';publish(noticeRequired?'notice-required':state,next.reason||'Monitoring unavailable');}
      await flush();
    }catch(error){
      if(scope!==generation)return;
      if([401,403,404].includes(error.status)){haltCapture(error.message);}
      else if(error.status===409){if(['DEVICE_CONFLICT','DEVICE_TRANSFERRED'].includes(error.code))haltCapture();else await stopCapture();publish('unavailable',error.message,error.code||'');}
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
    // End capture synchronously before awaiting network or changing identity.
    // Completed encrypted entries remain in their user/workspace directory.
    haltCapture();generation++;closedSessions.clear();closedAttendance.clear();transitions.clear();realtime?.disconnect();realtime=null;
    if(credentials&&device&&!device.revokedAt)await request(`/devices/${device._id}/release`,{}).catch(()=>{});
    credentials=value;device=null;work=null;policy=null;queue=null;anchorMono=null;uploadError='';uploadErrorCode='';nextUploadRetryAt=null;protectedEntries.clear();haltRevision=0;noticeRequired=false;lastState='unavailable';lastError='';lastErrorCode='';publish();
    clearInterval(timer);timer=null;clearInterval(syncTimer);syncTimer=null;clearInterval(uploadTimer);uploadTimer=null;
    if(value){const queueMB=Math.min(4096,Math.max(50,Number(process.env.FLOWTASK_SCREENSHOT_QUEUE_MAX_MB)||500));queue=new DurableQueue(path.join(root,checksum(`${value.workspaceId}:${value.userId}`)),safeStorage,queueMB*1024*1024);
      timer=setInterval(async()=>{
        if(capturing&&performance.now()>=leaseDeadlineMono){capturing=false;stopInput();counters.reset();publish('unavailable','Capture lease expired. Reconnect to renew monitoring authorization.');return;}
        if(capturing&&performance.now()-lastCapture>=policy.intervalSeconds*1000&&!busy){busy=true;try{await boundary();await flush();}finally{busy=false;}}
      },1000);
      // Native session polling is independent of the React route/window focus.
      syncTimer=setInterval(()=>sync(),15000);syncTimer.unref();
      // Delivery has its own loop: saved captures continue uploading during
      // Personal Pause, after Check-Out and while the window is minimized.
      // Capture timing remains exclusively controlled by workspace policy.
      resetUploadDelays();
      const uploadGeneration=generation;
      uploadTimer=setInterval(()=>flush().catch(error=>{if(uploadGeneration!==generation)return;uploadError='Saved captures will retry automatically.';uploadErrorCode=String(error.code||'UPLOAD_UNAVAILABLE').slice(0,80);publish();}),5000);uploadTimer.unref();
      connectRealtime();await sync();
    }
    return publish(value?lastState:'unavailable');
  }
  let configureChain=Promise.resolve();
  ipcMain.handle('desktop-tracking:configure',(event,value)=>{
    if(!trusted(event))throw new Error('Untrusted tracking sender');
    if(credentials?.userId!==value?.userId||credentials?.workspaceId!==value?.workspaceId){haltCapture();generation++;}
    configureChain=configureChain.catch(()=>{}).then(()=>configure(value));return configureChain;
  });
  ipcMain.handle('desktop-tracking:status',event=>{if(!trusted(event))throw new Error('Untrusted tracking sender');return publish();});
  ipcMain.handle('desktop-tracking:stop',event=>{if(!trusted(event))throw new Error('Untrusted tracking sender');haltCapture();return publish();});
  ipcMain.handle('desktop-tracking:transition',async(event,value)=>{
    if(!trusted(event)||!credentials||String(value?.workspaceId)!==String(credentials.workspaceId)||String(value?.userId)!==String(credentials.userId))throw new Error('Untrusted tracking transition');
    acceptTransition(value);await sync();return publish();
  });
  ipcMain.handle('desktop-tracking:notice',async(event,value)=>{
    if(!trusted(event))throw new Error('Untrusted tracking sender');
    if(!noticeRequired||value?.deviceId!==device?._id||value?.workspaceId!==credentials?.workspaceId||value?.userId!==credentials?.userId||value?.policyRevision!==policy?.revision)throw new Error('Desktop identity or policy changed. Review the current notice.');
    const scope=generation;
    await request(`/devices/${device._id}/notice`,{noticeVersion,policyRevision:policy.revision});
    if(scope!==generation)throw new Error('Desktop identity changed');
    noticeRequired=false;await sync();return publish();
  });
  ipcMain.handle('desktop-tracking:permissions',async event=>{
    if(!trusted(event))throw new Error('Untrusted tracking sender');
    if(!credentials||!device||noticeRequired||!work||work.status!=='RUNNING')throw new Error('Start authorized work and review the monitoring notice first');
    if(process.platform==='darwin'){
      systemPreferences.isTrustedAccessibilityClient(true);
      if(systemPreferences.getMediaAccessStatus('screen')!=='granted')await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
    }
    await sync();return publish();
  });
  ipcMain.handle('desktop-tracking:retry-uploads',async event=>{
    if(!trusted(event))throw new Error('Untrusted tracking sender');
    if(!credentials||!queue||!device)throw new Error('Sign in to desktop tracking first');
    return retryQueuedUploads();
  });
  ipcMain.handle('desktop-tracking:claim-monitoring',async event=>{
    if(!trusted(event))throw new Error('Untrusted tracking sender');
    if(!credentials||!device)throw new Error('Sign in to desktop tracking first');
    if(busy)throw new Error('Monitoring is refreshing. Try again in a moment.');
    const scope=generation;busy=true;
    try{
      const current=await request('/me');if(scope!==generation)throw new Error('Desktop identity changed');
      await request(`/devices/${device._id}/claim`,{sessionId:current.session?._id||null});
      if(scope!==generation)throw new Error('Desktop identity changed');
    }finally{busy=false;}
    await sync();await retryQueuedUploads();return publish();
  });
  ipcMain.handle('desktop-tracking:finalize-session',async(event,value)=>{
    if(!trusted(event))throw new Error('Untrusted tracking sender');
    if(!credentials||!value||!/^[a-f\d]{24}$/i.test(value.attendanceSessionId)||!Array.isArray(value.workSessionIds)||value.workSessionIds.some(id=>!/^[a-f\d]{24}$/i.test(id))||!Number.isFinite(Date.parse(value.cutoffAt)))throw new Error('Invalid completed attendance session');
    rememberClosure(value);
    const targetActive=work&&(closedSessions.has(String(work._id))||closedAttendance.has(String(work.attendanceSession)));
    if(targetActive)publish('ready','');
    flush().catch(()=>{});
    return {stopped:!targetActive||!capturing,attendanceSessionId:value.attendanceSessionId,cutoffAt:value.cutoffAt,status:publish()};
  });
  ipcMain.handle('desktop-tracking:refresh',async event=>{if(!trusted(event))throw new Error('Untrusted tracking sender');await sync();return publish();});
  ipcMain.handle('desktop-tracking:policy',async(event,value)=>{
    if(!trusted(event))throw new Error('Untrusted tracking sender');
    // Unfinished counters cannot be split honestly at a past server boundary.
    // Retain completed uploads and discard only the unfinished capture window.
    haltPolicy(value);
    return publish();
  });
  powerMonitor.on('lock-screen',async()=>{locked=true;await stopCapture('locked');publish('locked');});
  powerMonitor.on('unlock-screen',async()=>{locked=false;await sync();await retryQueuedUploads();});
  powerMonitor.on('suspend',async()=>{suspended=true;await stopCapture('sleep');publish('sleep');});
  powerMonitor.on('resume',async()=>{suspended=false;await sync();await retryQueuedUploads();});
  let quitting=false;
  app.on('before-quit',event=>{
    if(quitting)return;
    event.preventDefault();quitting=true;
    stopCapture('partial').finally(async()=>{
      // Preserve completed encrypted entries, then relinquish ownership so a
      // normal restart or another desktop need not wait for lease expiration.
      generation++;clearInterval(timer);clearInterval(syncTimer);clearInterval(uploadTimer);realtime?.disconnect();stopInput();
      if(credentials&&device&&!device.revokedAt)await request(`/devices/${device._id}/release`,{}).catch(()=>{});
      credentials=null;app.quit();
    });
  });
  return { configure,sync,status:()=>publish() };
}
module.exports={installDesktopTracking};
