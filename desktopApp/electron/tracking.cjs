const { app, ipcMain, desktopCapturer, screen, powerMonitor, safeStorage, systemPreferences, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { ActivityCounters, DurableQueue, checksum, CaptureSchedule, MAX_ACTIVITY_WINDOW_MS } = require('./tracking-core.cjs');
const {noticeAuthorization}=require('./monitoring-authorization.cjs');
const {uploadEntry}=require('./screenshot-upload.cjs');
const {createScreenshotPreview}=require('./screenshot-preview.cjs');
const {ActivityWork}=require('./activity-work.cjs');

function installDesktopTracking(getWindow,getOrigin,getBackendURL, deferQuit = () => false) {
  const preview = createScreenshotPreview();
  const dismissPreview = () => { try { preview.dismiss(); } catch { /* Optional UI must not interrupt tracking. */ } };
  const root = path.join(app.getPath('userData'),'tracking'); fs.mkdirSync(root,{recursive:true});
  const installationFile = path.join(root,'installation-id');
  const installationId = fs.existsSync(installationFile)?fs.readFileSync(installationFile,'utf8'):randomUUID();
  if (!fs.existsSync(installationFile)) fs.writeFileSync(installationFile,installationId,{mode:0o600});
  let credentials=null,device=null,work=null,policy=null,queue=null,anchorMono=null;
  let generation=0,timer=null,syncTimer=null,uploadTimer=null,sampler=null,busy=false,uploading=false,capturing=false,hook=null,hookStarted=false;
  let uploadTask=null,manualRetryTask=null,uploadContinueTimer=null,uploadCooldownUntil=0;
  let latestAttendanceInput=null, attendanceActivityAllowed=false, lastAttendanceInputMono=-Infinity;
  let locked=false,suspended=false,lastBoundary=0,lastState='unavailable',lastError='',lastErrorCode='',lastCaptureAllowed=false;
  let leaseDeadlineMono=0;
  let realtime=null,haltRevision=0,captureEpoch=0,resyncRequested=false,stateChangeRetried=false;
  let updateHold=false,shutdownTask=null;
  let syncTask=null,captureTask=null,reconnectTimer=null,reconnectFailures=0,nextReconnectAt=null,checkpointError=null;
  let heartbeatResolvesCurrent=null,evidenceCursorLoaded=false,evidenceEnd=null,evidenceSession=null,captureResumeAt=0,resumeScreenshotAt=null;
  const pendingCheckpoints=[];
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
    else if(String(work?._id)===key&&value.status==='PAUSED'){if(work.status!=='PAUSED')activityObservedAt=performance.now();work={...work,status:'PAUSED',revision:value.revision};haltCapture('', 'paused');}
    else if(String(work?._id)===key&&value.status==='RUNNING'&&work.status==='PAUSED')publish('resuming','');
  }
  let noticeRequired=false,noticeVersion=1;
  let uploadError='',uploadErrorCode='',nextUploadRetryAt=null,uploadLimits={};
  const protectedEntries=new Set();
  const counters = new ActivityCounters();
  const captureSchedule = new CaptureSchedule({now:()=>performance.now()});
  let checkpointPending = false;
  let activityWatchUntil=0,lastWorkTransition=null,activityObservedAt=0;
  const activityWork=new ActivityWork({
    now:()=>performance.now(),
    perform:async operation=>{
      const scope=generation,activeDeviceId=device?._id;
      if(operation.action==='pause'){await stopCapture('inactive');startInput();}
      if(scope!==generation||!credentials||activeDeviceId!==device?._id)throw Object.assign(new Error('Desktop identity changed'),{status:409});
      publish(operation.action==='resume'?'resuming':'paused','');
      return request(`/devices/${activeDeviceId}/activity/${operation.action}`,operation);
    },
    onCommitted:async receipt=>{
      lastWorkTransition=receipt;acceptTransition(receipt.session);work=receipt.session;
      publish(receipt.session.status==='PAUSED'?'paused':'resuming','');
      await sync(true);
    },
    onError:error=>{publish(error.status===409?'unavailable':'offline',error.message,error.code||'');sync().catch(()=>{});},
    onSettled:()=>publish()
  });
  function updateActivityState(){
    const now=performance.now(),open=work?.pauses?.find(p=>!p.endedAt);
    const enabled=Boolean(credentials&&policy?.enabled&&policy?.monitoringEnabled&&work&&!work.endedAt&&work.status!=='CLOSED'&&!quitting&&!updateHold&&!device?.revokedAt&&!device?.monitoringDisplacedAt&&!noticeRequired);
    const canResume=enabled&&!locked&&!suspended&&activityWatchUntil>now&&work.status==='PAUSED'&&['PERSONAL_PAUSE','INACTIVITY'].includes(open?.reason)&&String(open?.resumeDevice)===String(device?._id);
    activityWork.update({enabled,workspaceId:credentials?.workspaceId,userId:credentials?.userId,sessionId:work?._id,revision:work?.revision,status:work?.status,canPause:enabled&&work.status==='RUNNING'&&leaseDeadlineMono>now,canResume,observedAt:activityObservedAt});
    return canResume;
  }
  const trusted = event => { const window=getWindow();
    return window && event.sender===window.webContents && event.senderFrame===window.webContents.mainFrame && new URL(event.senderFrame.url).origin===getOrigin(); };
  const publish = (state=lastState,error=lastError,code=error===lastError?lastErrorCode:'') => {
    lastState=state;lastError=error;lastErrorCode=code;
    const value={protocolVersion:2,capabilities:{retryUploads:true,claimMonitoring:true,finalizeSession:true,sessionTransitions:true,screenshotPipeline:3,capturePreviews:true,activityWork:true},workTransition:lastWorkTransition,state,error,errorCode:code,reconnecting:nextReconnectAt!==null,nextReconnectAt,userId:credentials?.userId||null,workspaceId:credentials?.workspaceId||null,deviceId:device?._id||null,syncStatus:queue?.damagedFiles().length||protectedEntries.size?'capture-failed':uploading?'uploading':uploadError?(uploadErrorCode==='SCREENSHOT_STORAGE_UNAVAILABLE'?'storage-unavailable':'retry-pending'):queue?.files().length?'pending-sync':'synced',queueBytes:queue?.usedBytes()||0,queueCapacityBytes:queue?.maxBytes||0,pending:(queue?.files()||[]).filter(name=>!protectedEntries.has(name)).length,protectedCopies:protectedEntries.size+(queue?.damagedFiles().length||0),uploadError,uploadErrorCode,nextUploadRetryAt,screenshotsPausedForInactivity:captureSchedule.inactive(),monitorIds:screen.getAllDisplays().map(d=>String(d.id)),appVersion:app.getVersion(),noticeRequired,noticeVersion,
      policy:policy?{revision:policy.revision,enabled:policy.enabled,monitoringEnabled:policy.monitoringEnabled,intervalSeconds:policy.intervalSeconds,retentionDays:policy.retentionDays,monitors:policy.monitors,blur:policy.blur,format:'webp',personalPauseEnabled:policy.personalPauseEnabled}:null};
    value.protectedCopies+=pendingCheckpoints.length;
    value.automaticWorkPending=activityWork.running?activityWork.pending?.action||null:null;
    value.autoResumeArmed=activityWatchUntil>performance.now()&&work?.status==='PAUSED'&&!locked&&!suspended;
    const window=getWindow(); if(window&&!window.isDestroyed())window.webContents.send('desktop-tracking:status',value);
    if(window&&!window.isDestroyed())window.setTitle(state==='monitoring'?'FlowTask · Monitoring active':state==='offline'?'FlowTask · Monitoring offline':'FlowTask');
    return value;
  };
  async function request(endpoint,body,method=body?'POST':'GET',timeout) {
    if (!credentials) throw new Error('Sign in to desktop tracking');
    const requestToken=credentials.token;
    const backend=new URL(getBackendURL());
    if(backend.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(backend.hostname))throw new Error('Desktop tracking requires HTTPS');
    const response=await fetch(new URL(`/api/tracking${endpoint}`,backend),{method,redirect:'error',
      headers:{Authorization:`Bearer ${credentials.token}`,'x-workspace-id':credentials.workspaceId,'Content-Type':'application/json',...(/\/(notice|claim|activity\/(pause|resume))$/.test(endpoint)||body?.activityAt?{'x-desktop-notice-authorization':noticeAuthorization(root,safeStorage)}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(timeout ?? (endpoint.endsWith('/heartbeat')?30000:20000))});
    const json=await response.json().catch(()=>({}));
    if(!response.ok){const error=new Error(json.message||`Tracking request failed (${response.status})`);error.status=response.status;error.code=json.code||(response.status===429?'UPLOAD_RATE_LIMITED':undefined);
      if(response.status===401&&credentials?.token===requestToken)publish('unavailable','Refreshing your desktop session.','ACCESS_REFRESH_REQUIRED');
      if(error.code==='TRACKING_INVALID')error.code=({'Activity intervals must not overlap':'INTERVAL_OVERLAP','Activity is outside working segments':'INTERVAL_NO_WORK_COVERAGE','Interval ID was reused with different data':'INTERVAL_ID_CONFLICT'})[json.message]||error.code;
      if([429,503].includes(response.status)){const retry=response.headers?.get?.('retry-after');error.retryAfterMs=retry&&Number.isFinite(Number(retry))?Math.max(1000,Number(retry)*1000):retry&&Number.isFinite(Date.parse(retry))?Math.max(1000,Date.parse(retry)-Date.now()):response.status===429?60000:5000;}
      throw error;}
    return json.data;
  }
  const isIdle = ()=>locked||suspended||powerMonitor.getSystemIdleTime()>=(policy?.idleThresholdSeconds||60);
  function stopInput(keepHook = false) {
    captureSchedule.stop();checkpointPending=false;
    if(sampler)clearInterval(sampler);sampler=null;
    if(!keepHook&&hookStarted){try{hook.stop();}catch{/* OS hook already stopped */}hookStarted=false;}
  }
  function haltPolicy(value){
    if(value?.enabled!==false)return;
    resumeScreenshotAt=null;captureResumeAt=0;
    activityWork.clear();activityWatchUntil=0;attendanceActivityAllowed=false;
    dismissPreview();
    haltRevision=Math.max(haltRevision,Number(value.revision)||0);captureEpoch++;
    capturing=false;lastCaptureAllowed=false;leaseDeadlineMono=0;noticeRequired=false;stopInput();counters.reset();
    publish('unavailable','Time Tracking disabled by workspace Admin');
  }
  function haltCapture(message='Desktop monitoring stopped',state='unavailable'){
    if(state!=='paused'){activityWork.clear();activityWatchUntil=0;attendanceActivityAllowed=false;}
    dismissPreview();
    captureEpoch++;capturing=false;lastCaptureAllowed=false;leaseDeadlineMono=0;noticeRequired=false;stopInput();counters.reset();publish(state,message);
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
      realtime=client.io(getBackendURL(),{auth:{...credentials},transports:['polling','websocket'],tryAllTransports:true,reconnection:true,reconnectionDelay:1000,reconnectionDelayMax:5000});
      realtime.on('tracking:policy-updated',value=>{haltPolicy(value);return sync(true);});
      realtime.on('attendance:policy-updated',()=>sync(true));
      realtime.on('tracking:changed',value=>{acceptTransition(value);return sync(true);});
      realtime.on('attendance:checked-out',value=>{if(String(value?.userId)===String(credentials?.userId)&&value?.session?._id)rememberClosure({attendanceSessionId:value.session._id,cutoffAt:value.session.checkOutAt});return sync();});
      realtime.on('tracking:device-updated',value=>{if(String(value?.deviceId)===String(device?._id)){if(value?.revoked){haltCapture('This desktop device was revoked');generation++;}else if(value?.displaced){haltCapture('Monitoring was moved to another desktop');generation++;}}return sync(true);});
      for(const event of ['attendance:checked-in','user-role-changed','department-bulk-assigned','department-bulk-unassigned','access-permissions-updated','workspace-membership-added','workspace-membership-removed','workspace-updated'])realtime.on(event,()=>sync());
      for(const event of ['connect','realtime-recover'])realtime.on(event,async()=>{await sync();await retryQueuedUploads();});
    }catch{/* Existing 15-second heartbeat remains the recovery transport. */}
  }
  async function sendHeartbeat(body, timeout) {
    const sample = latestAttendanceInput;
    const sendSample = sample && sample.generation === generation && sample.sessionId === body.sessionId
      && performance.now() - sample.observedAt < 90_000;
    const response = await request(`/devices/${device._id}/heartbeat`,
      sendSample ? { ...body, activityAt: sample.activityAt } : body, 'POST', timeout);
    if (sendSample && latestAttendanceInput === sample) latestAttendanceInput = null;
    return response;
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
        const activity=kind=>{if(locked||suspended)return;
          if (attendanceActivityAllowed && work?._id && anchorMono !== null) {
            const observedAt = performance.now();
            const activityAt = Math.round(+new Date(device?.anchor?.serverAt) + observedAt - anchorMono);
            if (Number.isSafeInteger(activityAt)) {
              latestAttendanceInput = { generation, sessionId: work._id, observedAt, activityAt };
              const resumedAfterIdle = observedAt - lastAttendanceInputMono > 60_000;
              lastAttendanceInputMono = observedAt;
              if (resumedAfterIdle) void sync(true);
            }
          }
          activityWork.input();if(capturing){captureInput();if(kind==='keyboard')counters.keyDown();else if(kind==='mouse')counters.mouseDown();else counters.input();}else if(activityWatchUntil>performance.now())captureSchedule.input();};
        hook.on('keydown',()=>activity('keyboard'));
        hook.on('mousedown',()=>activity('mouse'));
        hook.on('mousemove',()=>activity('move'));
        hook.on('wheel',()=>activity('wheel'));
      }catch{return false;}
    }
    if(!hookStarted){try{hook.start();hookStarted=true;}catch{return false;}}
    if(capturing&&!sampler)sampler=setInterval(()=>{if(capturing)counters.sample(isIdle());},1000);
    return true;
  }
  function captureInput() {
    if(captureSchedule.input()){
      // Resume on a fresh random interval, without a catch-up image burst.
      captureEpoch++;checkpointPending=true;publish();
    }
  }
  function begin({connected=true}={}) {
    if(updateHold)return;
    if(capturing||locked||suspended||performance.now()>=leaseDeadlineMono)return;
    const serverAt=+new Date(device?.anchor?.serverAt);
    if(evidenceSession===String(work?._id)&&evidenceEnd!==null&&serverAt+performance.now()-anchorMono<evidenceEnd){captureResumeAt=anchorMono+evidenceEnd-serverAt;if(connected)publish('resuming','');return;}
    captureResumeAt=0;
    if(pendingCheckpoints.some(item=>item.queue===queue)){publish('unavailable','Activity is waiting for encrypted storage to recover.');return;}
    if(!queue?.available()){publish('unavailable','Encrypted offline storage is unavailable');return;}
    if(queue.usedBytes()>=queue.maxBytes){publish('unavailable','Offline screenshot queue is full; reconnect to upload saved captures');return;}
    if(process.platform==='darwin'&&systemPreferences.getMediaAccessStatus('screen')!=='granted'){publish('permission-required','Allow Screen Recording in macOS System Settings, then restart FlowTask');return;}
    capturing=true;counters.reset();lastBoundary=performance.now();
    captureSchedule.start(policy?.intervalSeconds||device.preferences.intervalSeconds,`${generation}:${work?._id}`);
    if(resumeScreenshotAt!==null&&!captureSchedule.inactive())captureSchedule.nextAt=Math.max(performance.now(),resumeScreenshotAt);
    resumeScreenshotAt=null;
    const input=startInput();
    if(!sampler)sampler=setInterval(()=>{if(capturing)counters.sample(isIdle());},1000);
    if(connected)publish('monitoring',input?'':'System input counters unavailable; active/idle time is measured separately');
  }
  async function boundary(reason=null) {
    if(!capturing||!work||!device||anchorMono===null)return;
    if(performance.now()>=leaseDeadlineMono){haltCapture('Capture lease expired. Reconnect to renew monitoring authorization.');return;}
    const activeWork=work,activeDevice=device,activeQueue=queue,activeGeneration=generation,activeEpoch=++captureEpoch;
    if(!reason&&captureSchedule.inactive())reason='inactive';
    const allowedImage=()=>activeGeneration===generation&&activeEpoch===captureEpoch&&capturing&&!locked&&!suspended&&performance.now()<leaseDeadlineMono&&!captureSchedule.inactive();
    let coverage=reason||'captured',images=[],previewImage=null;
    try {
      if(!reason&&allowedImage()) {
        const preferences=activeDevice.preferences;
        const exclusions=preferences.excludeWindowTitles||[];
        if(exclusions.length){const windows=await desktopCapturer.getSources({types:['window'],thumbnailSize:{width:0,height:0}});
          if(windows.some(w=>exclusions.some(word=>w.name.toLocaleLowerCase().includes(word.toLocaleLowerCase()))))coverage='excluded';}
        if(!allowedImage())return;
        if(coverage==='captured'){
          const all=screen.getAllDisplays(),primary=screen.getPrimaryDisplay();
          const displays=all.filter(d=>(preferences.monitors==='all'||d.id===primary.id)&&!(preferences.excludedDisplayIds||[]).includes(String(d.id)));
          if(!displays.length)coverage='excluded';
          else {
            let preferredPreviewDisplay;
            try{preferredPreviewDisplay=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id;}catch{/* The first captured monitor remains the fallback. */}
            try { await preview.beforeCapture(); } catch { /* Capture/upload continue if preview cleanup fails. */ }
            if(!allowedImage())return;
            const sources=await desktopCapturer.getSources({types:['screen'],fetchWindowIcons:false,thumbnailSize:{
              width:Math.max(...displays.map(d=>Math.round(d.size.width*d.scaleFactor))),height:Math.max(...displays.map(d=>Math.round(d.size.height*d.scaleFactor)))}});
            for(const display of displays){const source=sources.find(s=>s.display_id===String(display.id));
              if(!allowedImage())return;
              if(!source||source.thumbnail.isEmpty()){coverage='unavailable';continue;}
              let image=source.thumbnail;const size=image.getSize();
              if(preferences.blur)image=image.resize({width:Math.max(1,Math.round(size.width/40)),height:Math.max(1,Math.round(size.height/40)),quality:'good'}).resize({...size,quality:'good'});
              // Checkpoint evidence before encoding; the upload worker replaces
              // the saved source with the single canonical WebP atomically.
              const original=image.toPNG();
              // Reuse the exact privacy-filtered capture. Nothing is recaptured
              // or added to the durable queue for the optional desktop preview.
              // Show on the screen the person is using, even when workspace
              // policy permits capturing only the primary monitor.
              if(!previewImage||String(display.id)===String(preferredPreviewDisplay))previewImage={buffer:original,displayId:preferredPreviewDisplay??display.id};
              images.push({captureId:randomUUID(),displayId:String(display.id),format:'png',conversionPending:true,
                checksum:checksum(original),contentMd5:checksum(original,'md5'),bytes:original.length,
                width:size.width,height:size.height,blurred:preferences.blur,data:original.toString('base64')});
            }
          }
        }
      }else if(!reason){
        if(captureSchedule.inactive())coverage='inactive';
        else return;
      }
    }catch(error){coverage='unavailable';publish('unavailable',error.message);}
    if(activeGeneration!==generation||activeQueue!==queue||activeEpoch!==captureEpoch)return;
    // A slow OS capture cannot outlive its activity authorization or lease.
    if(images.length&&!allowedImage())return;
    const count=counters.boundary(isIdle());lastBoundary=count.endMono;
    if(count.endMono>leaseDeadlineMono){haltCapture('Capture lease expired. Reconnect to renew monitoring authorization.');return;}
    if(!reason)captureSchedule.completed(count.endMono);
    const payload={operationId:randomUUID(),sessionId:activeWork._id,anchorId:activeDevice.anchor.id,
      startOffsetMs:count.startMono-anchorMono,endOffsetMs:count.endMono-anchorMono,
      mouseCount:hookStarted?count.mouseCount:null,keyboardCount:hookStarted?count.keyboardCount:null,
      activeSeconds:count.activeSeconds,idleSeconds:count.idleSeconds,coverage,
      inputActiveSeconds:count.inputActiveSeconds,inputEligibleSeconds:count.inputEligibleSeconds,activityBasis:count.activityBasis,
      inputAvailable:hookStarted && coverage!=='excluded',screenshotAvailable:images.some(image=>!image.exceptionCode)};
    if (coverage==='excluded') { payload.mouseCount=null;payload.keyboardCount=null; }
    if(payload.endOffsetMs-payload.startOffsetMs<1)return;
    const entry={deviceId:activeDevice._id,payload,images,createdAt:Date.now(),expiresAt:policy?.retentionDays===null?null:+new Date(activeDevice.anchor.serverAt)+payload.endOffsetMs+(policy?.retentionDays||365)*86400000,attempts:0,nextAttempt:0};
    evidenceSession=String(activeWork._id);evidenceEnd=+new Date(activeDevice.anchor.serverAt)+payload.endOffsetMs;
    try{activeQueue.push(entry,{retainOnFull:true});
      if(previewImage&&allowedImage())try{Promise.resolve(preview.show(previewImage.buffer,previewImage.displayId,()=>allowedImage()&&Boolean(credentials)&&work?.status==='RUNNING'&&policy?.enabled&&policy?.monitoringEnabled&&!quitting)).catch(()=>{});}catch{/* Preview rendering is independent of screenshot delivery. */}
    }
    catch(error){if(!error.savedCapture){checkpointError=error;pendingCheckpoints.push({queue:activeQueue,entry});}capturing=false;stopInput();publish('unavailable',error.message);}
    publish(lastState,lastError);
  }
  async function stopCapture(reason='partial', keepInput = false) {
    dismissPreview();
    if(capturing)await boundary(reason==='partial'&&captureSchedule.inactive()?'inactive':reason);
    capturing=false;stopInput(keepInput);counters.reset();lastCaptureAllowed=false;
  }
  function flush(){
    if(updateHold||quitting)return Promise.resolve();
    if(uploadTask)return uploadTask;
    const task=flushBatch().finally(()=>{if(uploadTask===task)uploadTask=null;});
    uploadTask=task;return task;
  }
  async function flushBatch() {
    if(uploadCooldownUntil>Date.now()){nextUploadRetryAt=uploadCooldownUntil;return;}
    if(uploading||!credentials||!queue||!device)return;if(!queue.available()){uploadError='Encrypted offline storage is unavailable; saved captures retained';uploadErrorCode='SCREENSHOT_LOCAL_STORAGE';publish();return;}uploading=true;
    const scope=generation,activeQueue=queue,deviceId=device._id;publish();
    try{
      let attempted=0;
      for(const name of activeQueue.files()){
        if(scope!==generation||updateHold)return;
        let entry;try{entry=activeQueue.read(name);}catch{activeQueue.quarantine(name);uploadError='Damaged encrypted capture retained for inspection';uploadErrorCode='SCREENSHOT_LOCAL_INTEGRITY';continue;}
        if(entry.expiresAt&&entry.expiresAt<=Date.now()){activeQueue.remove(name);protectedEntries.delete(name);continue;}
        if(entry.authorizationRejected){protectedEntries.add(name);continue;}
        protectedEntries.delete(name);
        if(entry.nextAttempt>Date.now()+60000){entry.nextAttempt=Date.now()+60000;activeQueue.update(name,entry);}
        if(entry.nextAttempt>Date.now())continue;
        if(attempted++>=4)break;
        try{
          await uploadEntry({entry,save:()=>activeQueue.update(name,entry),request,deviceId,maxBytes:uploadLimits.maxScreenshotBytes,isCurrent:()=>scope===generation});
          if(scope!==generation)return;
          if(entry.acknowledged){activeQueue.remove(name);publish();}
        }catch(error){
          if(scope!==generation)return;
          entry.attempts=(entry.attempts||0)+1;entry.nextAttempt=Date.now()+Math.max(Math.min(60000,1000*2**Math.min(entry.attempts,6)),error.retryAfterMs||0);
          entry.lastUploadError=String(error.message||'Saved capture will retry').slice(0,300);entry.lastUploadErrorCode=String(error.code||'UPLOAD_UNAVAILABLE').slice(0,80);
          if(error.status===403&&error.code==='LEASE_EXPIRED'||['INTERVAL_OVERLAP','INTERVAL_NO_WORK_COVERAGE','INTERVAL_ID_CONFLICT','CAPTURE_AFTER_CHECKOUT','CAPTURE_DURING_SCHEDULED_BREAK'].includes(error.code)){
            // A new lease cannot authorize activity captured outside an older
            // lease. Retain the encrypted copy without retrying it forever.
            entry.authorizationRejected=true;entry.nextAttempt=0;protectedEntries.add(name);
            entry.lastUploadError='This saved capture could not be matched to an authorized work interval and has been retained locally. New valid captures continue syncing.';
          }
          uploadError=entry.lastUploadError;uploadErrorCode=entry.lastUploadErrorCode;nextUploadRetryAt=entry.authorizationRejected?null:entry.nextAttempt;activeQueue.update(name,entry);
          if(error.status===429){uploadCooldownUntil=Math.max(entry.nextAttempt,Date.now()+60000);nextUploadRetryAt=uploadCooldownUntil;break;}
        }
      }
    }finally{
      uploading=false;
      if(scope===generation){
        if(!activeQueue.files().length&&!activeQueue.damagedFiles().length){uploadError='';uploadErrorCode='';nextUploadRetryAt=null;}
        // Drain more than four ready entries without waiting for a heartbeat.
        // Failed entries keep their backoff and cannot block later captures.
        const due=activeQueue.files().some(name=>{try{const entry=activeQueue.read(name);return !entry.authorizationRejected&&!(entry.nextAttempt>Date.now());}catch{return false;}});
        if(due&&uploadCooldownUntil<=Date.now()&&!uploadContinueTimer){uploadContinueTimer=setTimeout(()=>{uploadContinueTimer=null;if(scope===generation)flush().catch(()=>{});},500);uploadContinueTimer.unref?.();}
      }
      publish();
    }
  }
  function retryQueuedUploads(){
    if(updateHold||quitting)return Promise.resolve(publish());
    if(manualRetryTask)return manualRetryTask;
    if(!credentials||!queue||!device)return Promise.resolve(publish());
    const scope=generation,running=uploadTask;
    const task=(async()=>{
      resetUploadDelays({retryProtected:true});
      if(running){await running;if(scope!==generation)return publish();resetUploadDelays({retryProtected:true});}
      await flush();return publish();
    })().finally(()=>{if(manualRetryTask===task)manualRetryTask=null;});
    manualRetryTask=task;return task;
  }
  function resetUploadDelays({retryProtected=false}={}){
    if(!queue)return;
    nextUploadRetryAt=uploadCooldownUntil>Date.now()?uploadCooldownUntil:null;
    for(const name of queue.files()){let entry;try{entry=queue.read(name);}catch{continue;}
      if(entry.authorizationRejected){
        if(!retryProtected){protectedEntries.add(name);continue;}
        delete entry.authorizationRejected;protectedEntries.delete(name);entry.nextAttempt=0;queue.update(name,entry);
      }
      if(entry.nextAttempt){entry.nextAttempt=0;queue.update(name,entry);}
    }
  }
  function clearReconnect(){clearTimeout(reconnectTimer);reconnectTimer=null;nextReconnectAt=null;}
  function scheduleReconnect(error){
    if(!credentials||quitting||updateHold||reconnectTimer)return;
    const delay=Math.max(Math.min(15000,1000*2**Math.min(reconnectFailures++,4)),error?.retryAfterMs||0);
    const scope=generation;nextReconnectAt=Date.now()+delay;
    reconnectTimer=setTimeout(()=>{reconnectTimer=null;if(scope===generation)void sync();},delay);reconnectTimer.unref?.();
  }
  function sync(refresh=false) {
    if(!credentials||quitting||updateHold)return Promise.resolve();
    if(syncTask){if(refresh)resyncRequested=true;return syncTask;}
    clearReconnect();
    const task=syncOnce().finally(()=>{
      if(syncTask===task)syncTask=null;
      if(resyncRequested&&!reconnectTimer){resyncRequested=false;void sync();}
    });
    syncTask=task;return task;
  }
  async function syncOnce() {
    if(!credentials||quitting||updateHold)return;
    resyncRequested=false;
    const scope=generation;
    try{
      recoverCheckpoints();
      queue?.prune();
      if(!device){const before=performance.now();
        const next=await request('/devices/register',{installationId,name:os.hostname(),platform:process.platform,appVersion:app.getVersion(),noticeAuthorization:noticeAuthorization(root,safeStorage)});
        if(scope!==generation)return;device=next;anchorMono=(before+performance.now())/2;
      }
      let next,beforeHeartbeat;
      if(heartbeatResolvesCurrent!==false){
        beforeHeartbeat=performance.now();
        next=await sendHeartbeat({sessionId:work?._id||null,resolveCurrentSession:true,includeEvidenceCursor:!evidenceCursorLoaded,state:lastState});
        if(scope!==generation)return;
        heartbeatResolvesCurrent=next.currentSessionResolved===true;
        if(!heartbeatResolvesCurrent)next=null;
      }
      if(!next){
        const current=await request('/me');if(scope!==generation)return;
        beforeHeartbeat=performance.now();
        next=await sendHeartbeat({sessionId:current.session?._id||null,state:lastState});
      }
      if(scope!==generation)return;uploadLimits=next.uploadLimits||{};
      if(Object.hasOwn(next,'evidenceCursor'))evidenceCursorLoaded=true;
      if(next.evidenceCursor&&String(next.evidenceCursor.sessionId)===String(next.session?._id)&&Number.isFinite(+new Date(next.evidenceCursor.endedAt))){
        if(evidenceSession!==String(next.session._id)){evidenceSession=String(next.session._id);evidenceEnd=null;}
        evidenceEnd=Math.max(evidenceEnd||0,+new Date(next.evidenceCursor.endedAt));
      }
      stateChangeRetried=false;
      if(next.policy.revision<haltRevision)next.canCapture=false;
      if(next.session&&(closedSessions.has(String(next.session._id))||closedAttendance.has(String(next.session.attendanceSession)))){next.canCapture=false;next.session={...next.session,status:'CLOSED'};}
      // A heartbeat started before Pause/Resume can finish after its committed
      // transition. Discard it without authorizing capture or publishing a
      // false monitoring failure. A queued refresh reads the current revision.
      if(next.session){
        const known=transitions.get(String(next.session._id));
        if(known&&(next.session.revision<known.revision||next.session.revision===known.revision&&known.status!==next.session.status)){
          const normalTransition=next.policy.enabled&&next.policy.monitoringEnabled&&!next.device.revokedAt&&!next.needsNotice&&(next.canCapture||next.reason==='Work is not running');
          if(normalTransition){if(capturing&&!next.canCapture)await stopCapture();return;}
          // Policy, consent and permission failures remain authoritative even
          // when the response contains an older work-session revision.
          next.canCapture=false;next.session={...next.session,...known};
        }else acceptTransition(next.session);
      }
      const anchorChanged=next.device.anchor.id!==device.anchor.id;
      const changedSession=work?._id!==next.session?._id;
      const changedPreferences=JSON.stringify(next.device.preferences)!==JSON.stringify(device.preferences);
      if(!next.canCapture||changedSession||changedPreferences){resumeScreenshotAt=null;captureResumeAt=0;}
      const stop=capturing&&(anchorChanged||changedSession||!next.canCapture||changedPreferences);
      if(stop){
        if(anchorChanged&&!changedSession&&next.canCapture&&!changedPreferences)resumeScreenshotAt=captureSchedule.nextAt;
        captureEpoch++;if(captureTask)await captureTask;
        await stopCapture();
      }
      // serverSentAt is sampled after server-side queries/transactions. A
      // request midpoint is not a clock anchor when processing takes 20s.
      if(anchorChanged||!work)anchorMono=performance.now()-(+new Date(next.serverSentAt||next.serverNow)-+new Date(next.device.anchor.serverAt));
      if(next.session?.status==='PAUSED'&&work?.status!=='PAUSED')activityObservedAt=performance.now();
      work=next.session;policy=next.policy;device=next.device;
      attendanceActivityAllowed=next.activityAllowed===true;
      clearReconnect();reconnectFailures=0;
      activityWatchUntil=next.canAutoResume?beforeHeartbeat+Math.max(0,+new Date(next.activityWatchUntil)-+new Date(next.serverNow)):0;
      noticeVersion=next.noticeVersion||1;noticeRequired=Boolean(next.needsNotice&&work?.status==='RUNNING');
      leaseDeadlineMono=next.canCapture?beforeHeartbeat+Math.max(0,+new Date(device.leaseUntil)-+new Date(next.serverNow)):0;
      if(device.revokedAt){haltCapture('This desktop device was revoked');return;}
      if(next.canCapture){
        if(process.platform==='darwin'&&systemPreferences.getMediaAccessStatus('screen')!=='granted'){
          haltCapture('Screen Recording permission is required in macOS System Settings');publish('permission-required',lastError);
        }else{lastCaptureAllowed=true;begin();if(capturing)publish('monitoring',hookStarted?'':'System input counters unavailable');}
      }
      else{await stopCapture('partial', attendanceActivityAllowed);const state=!policy.enabled||!policy.monitoringEnabled?'disabled':work?.status==='PAUSED'?'paused':!work||work.status!=='RUNNING'?'ready':'unavailable';publish(noticeRequired?'notice-required':state,['paused','ready','disabled'].includes(state)?'':next.reason||'Monitoring unavailable');}
      if((updateActivityState()||attendanceActivityAllowed)&&!locked&&!suspended)startInput();
      flush().catch(()=>{});
    }catch(error){
      if(scope!==generation)return;
      if([401,403,404].includes(error.status)){haltCapture(error.message);if(error.status===401)publish('unavailable','Refreshing your desktop session.','ACCESS_REFRESH_REQUIRED');}
      else if(error.status===409&&['WRITE_CONFLICT','TRACKING_CONFLICT'].includes(error.code)){
        // A known-aborted server write is transient. Keep collecting under
        // the existing bounded authorization while a fresh heartbeat retries;
        // it must not reset the screenshot deadline on every conflict.
        publish('offline',error.message,error.code);
        if(lastCaptureAllowed&&performance.now()<leaseDeadlineMono)begin({connected:false});
        else await stopCapture();
        scheduleReconnect(error);publish();
      }
      else if(error.status===409){
        if(error.code==='DEVICE_STATE_CHANGED'){
          // Discard the unconfirmed tail; it must not cross a release fence.
          haltCapture(error.message);
          if(!stateChangeRetried){stateChangeRetried=true;resyncRequested=true;}
        }else if(['DEVICE_CONFLICT','DEVICE_TRANSFERRED'].includes(error.code))haltCapture();
        else await stopCapture();
        publish('unavailable',error.message,error.code||'');
      }
      else{publish('offline',error.message);
        // Capture may continue offline only under the last authorized session,
        // policy/consent and bounded server anchor; work duration stays server-owned.
        if(lastCaptureAllowed&&performance.now()<leaseDeadlineMono)begin({connected:false});
        scheduleReconnect(error);publish();
      }
    }
  }
  async function configure(value) {
    if(updateHold)throw new Error('FlowTask is preparing a safe update restart. Please retry shortly.');
    if(value&&(!/^[a-f\d]{24}$/i.test(value.userId)||!/^[a-f\d]{24}$/i.test(value.workspaceId)||typeof value.token!=='string'||value.token.length<16||value.token.length>8192))throw new Error('Invalid tracking identity');
    if(credentials?.userId===value?.userId&&credentials?.workspaceId===value?.workspaceId){const changed=credentials?.token!==value?.token;credentials=value;if(changed){connectRealtime();await sync();}return publish();}
    // End capture synchronously before awaiting network or changing identity.
    // Completed encrypted entries remain in their user/workspace directory.
    latestAttendanceInput=null;attendanceActivityAllowed=false;lastAttendanceInputMono=-Infinity;
    haltCapture();clearReconnect();reconnectFailures=0;heartbeatResolvesCurrent=null;evidenceCursorLoaded=false;evidenceEnd=null;evidenceSession=null;captureResumeAt=0;resumeScreenshotAt=null;activityWork.clear();lastWorkTransition=null;activityObservedAt=0;activityWatchUntil=0;stateChangeRetried=false;generation++;closedSessions.clear();closedAttendance.clear();transitions.clear();realtime?.disconnect();realtime=null;
    if(credentials&&device&&!device.revokedAt)await request(`/devices/${device._id}/release`,{}).catch(()=>{});
    credentials=value;device=null;work=null;policy=null;queue=null;anchorMono=null;manualRetryTask=null;uploadCooldownUntil=0;uploadError='';uploadErrorCode='';nextUploadRetryAt=null;protectedEntries.clear();haltRevision=0;noticeRequired=false;lastState='unavailable';lastError='';lastErrorCode='';publish();
    clearInterval(timer);timer=null;clearInterval(syncTimer);syncTimer=null;clearInterval(uploadTimer);uploadTimer=null;if(uploadContinueTimer)clearTimeout(uploadContinueTimer);uploadContinueTimer=null;
    if(value){const queueMB=Math.min(4096,Math.max(50,Number(process.env.FLOWTASK_SCREENSHOT_QUEUE_MAX_MB)||500));queue=new DurableQueue(path.join(root,checksum(`${value.workspaceId}:${value.userId}`)),safeStorage,queueMB*1024*1024);
      timer=setInterval(async()=>{
        if(updateHold||quitting)return;
        const presence=updateActivityState();
        if(!hookStarted&&(!locked&&!suspended)&&(capturing||presence))activityWork.pollIdle(powerMonitor.getSystemIdleTime());
        if(!busy)activityWork.tick();
        if(activityWork.pending?.action==='pause')return;
        if(!capturing&&!presence&&!attendanceActivityAllowed&&hookStarted)stopInput();
        if(capturing&&performance.now()>=leaseDeadlineMono){resumeScreenshotAt=captureSchedule.nextAt;haltCapture('Capture lease expired. Reconnect to renew monitoring authorization.');void sync(true);return;}
        if(!capturing&&captureResumeAt&&performance.now()>=captureResumeAt)begin({connected:lastState!=='offline'});
        if(!capturing)return;
        const now=performance.now();
        if(captureSchedule.updateInactivity(now)){captureEpoch++;checkpointPending=true;publish();}
        if(busy)return;
        const inactive=captureSchedule.inactive(now),elapsed=now-lastBoundary;
        const checkpoint=checkpointPending||elapsed>=MAX_ACTIVITY_WINDOW_MS||inactive&&elapsed>=Math.min((policy?.intervalSeconds||600)*1000,MAX_ACTIVITY_WINDOW_MS);
        const captureDue=captureSchedule.due(now);
        if(checkpoint||captureDue){
          busy=true;
          try{checkpointPending=false;captureTask=boundary(checkpoint&&!captureDue?(inactive?'inactive':'activity-only'):null);await captureTask;}
          finally{captureTask=null;busy=false;}
          // Upload retries must not hold up the next capture or heartbeat.
          flush().catch(()=>{});
        }
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
    if(updateHold)throw new Error('FlowTask is preparing a safe update restart. Please retry shortly.');
    if(credentials?.userId!==value?.userId||credentials?.workspaceId!==value?.workspaceId){haltCapture();generation++;}
    configureChain=configureChain.catch(()=>{}).then(()=>configure(value));return configureChain;
  });
  ipcMain.handle('desktop-tracking:status',event=>{if(!trusted(event))throw new Error('Untrusted tracking sender');return publish();});
  ipcMain.handle('desktop-tracking:stop',event=>{if(!trusted(event))throw new Error('Untrusted tracking sender');haltCapture();return publish();});
  ipcMain.handle('desktop-tracking:transition',async(event,value)=>{
    if(!trusted(event)||!credentials||String(value?.workspaceId)!==String(credentials.workspaceId)||String(value?.userId)!==String(credentials.userId))throw new Error('Untrusted tracking transition');
    const wasBusy=busy||Boolean(syncTask);acceptTransition(value);const refresh=sync(true);if(!wasBusy)await refresh;return publish();
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
    const scope=generation;
    retryQueuedUploads().catch(error=>{if(scope!==generation)return;uploadError=String(error.message||'Saved captures will retry');uploadErrorCode=String(error.code||'UPLOAD_UNAVAILABLE');publish();});
    return {...publish(),retryRequested:true};
  });
  ipcMain.handle('desktop-tracking:claim-monitoring',async event=>{
    if(!trusted(event))throw new Error('Untrusted tracking sender');
    if(!credentials||!device)throw new Error('Sign in to desktop tracking first');
    if(busy||updateHold)throw new Error('Monitoring is refreshing. Try again in a moment.');
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
  ipcMain.handle('desktop-tracking:refresh',async event=>{if(!trusted(event))throw new Error('Untrusted tracking sender');await sync(true);return publish();});
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
  function pendingCaptureFiles(directory=root,temporaryOnly=false){
    let count=0;
    for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
      if(entry.isSymbolicLink())return 1;
      if(entry.isDirectory())count+=pendingCaptureFiles(path.join(directory,entry.name),temporaryOnly);
      else if((temporaryOnly?/\.queue\.tmp$/:/\.queue(?:\.tmp)?(?:\.damaged)?$/).test(entry.name))count++;
    }
    return count;
  }
  function recoverCheckpoints(){
    for(const item of [...pendingCheckpoints])try{item.queue.push(item.entry,{retainOnFull:true});pendingCheckpoints.splice(pendingCheckpoints.indexOf(item),1);}catch(error){if(error.savedCapture)pendingCheckpoints.splice(pendingCheckpoints.indexOf(item),1);else checkpointError=error;}
    if(!pendingCheckpoints.length)checkpointError=null;
  }
  function localUpdateSafety({allowActive=false,ignoreBusy=false}={}){
    recoverCheckpoints();
    if(pendingCheckpoints.length)return {safe:false,reason:'Activity has not reached encrypted storage yet. Keeping FlowTask open until it is safely saved.'};
    if(!allowActive&&(capturing||work&&!work.endedAt&&work.status!=='CLOSED'))return {safe:false,reason:'Update will start after your active attendance and work session finish.'};
    if(!ignoreBusy&&(syncTask||busy||uploading||uploadTask||manualRetryTask||activityWork.running))return {safe:false,reason:'Finishing tracking and screenshot synchronization before restarting.'};
    if(allowActive){
      if(capturing&&!queue?.available())return {safe:false,reason:'Activity cannot be saved safely. Reconnect desktop tracking before restarting.'};
      if(pendingCaptureFiles(root,true))return {safe:false,reason:'An activity checkpoint is still being written. Waiting for it to finish.'};
    }else if(queue?.files().length||queue?.damagedFiles().length||pendingCaptureFiles())return {safe:false,reason:'Saved screenshot uploads are pending. The update will wait for them to finish.'};
    return {safe:true,configured:Boolean(credentials)};
  }
  async function updateSafety(options={}){
    const local=localUpdateSafety(options);if(!local.safe)return local;
    const scope=generation;
    if(credentials){
      try{
        const current=await request('/me');
        if(scope!==generation)return {safe:false,reason:'Your session changed. Please retry the update.'};
        if(!Object.hasOwn(current,'attendance')||!Object.hasOwn(current,'session')||String(current.workspaceId)!==String(credentials.workspaceId)||String(current.userId)!==String(credentials.userId))return {safe:false,reason:'The current attendance and work state could not be verified. Please reconnect and retry.'};
        if(!options.allowActive&&(current.attendance||current.session&&!current.session.endedAt&&current.session.status!=='CLOSED'))return {safe:false,reason:'Update scheduled. Your attendance and work session can continue until you finish them.'};
        if(options.allowActive&&capturing&&(String(current.session?._id)!==String(work?._id)||current.session?.status!=='RUNNING'||current.session?.endedAt))return {safe:false,reason:'Refreshing the current work session before saving activity for restart.'};
      }catch{return {safe:false,reason:'Waiting for a connection to verify your attendance and work before restarting.'};}
    }
    return localUpdateSafety(options);
  }
  function holdForUpdate(){const result=localUpdateSafety();if(result.safe)updateHold=true;return result;}
  function releaseUpdateHold(){const held=updateHold;updateHold=false;if(held&&!quitting){resyncRequested=false;void sync();}}
  async function acquireUpdateHold(options={}){
    if(updateHold)return {safe:false,reason:'A safe restart is already being prepared.'};
    updateHold=true;
    let accepted=false;
    try{
      // Stop starting background work, then let already-started operations settle.
      // Sampling a busy heartbeat every 15 seconds can otherwise postpone forever.
      const deadline=performance.now()+25000;
      while(syncTask||busy||uploading||uploadTask||manualRetryTask||activityWork.running){
        if(performance.now()>=deadline)return {safe:false,reason:'Synchronization is taking longer than expected. Your session continues; restart will retry.'};
        const pending=[syncTask,captureTask,uploadTask,manualRetryTask].filter(Boolean);
        if(pending.length)await Promise.race([Promise.allSettled(pending),new Promise(resolve=>setTimeout(resolve,250))]);
        else await new Promise(resolve=>setTimeout(resolve,50));
      }
      const result=await updateSafety(options);
      accepted=result.safe;
      return result;
    }finally{if(!accepted)releaseUpdateHold();}
  }
  function prepareShutdown(forUpdate=false){
    if(shutdownTask)return shutdownTask;
    quitting=true;clearReconnect();dismissPreview();checkpointError=null;
    shutdownTask=stopCapture('partial').then(async()=>{
      recoverCheckpoints();
      if(forUpdate&&pendingCheckpoints.length)throw checkpointError||new Error('Activity checkpoint could not be saved');
      // Same durable checkpoint and device-release path as normal application exit.
      if (credentials && device && latestAttendanceInput && work?._id) {
        await sendHeartbeat({ sessionId: work._id, state: 'closing' }, 2500).catch(() => {});
      }
      generation++;clearInterval(timer);clearInterval(syncTimer);clearInterval(uploadTimer);if(uploadContinueTimer)clearTimeout(uploadContinueTimer);realtime?.disconnect();stopInput();
      if(credentials&&device&&!device.revokedAt)await request(`/devices/${device._id}/release`,{}).catch(()=>{});
      credentials=null;
    });
    return shutdownTask;
  }
  app.on('before-quit',event=>{
    if(quitting||deferQuit())return;
    event.preventDefault();prepareShutdown().finally(()=>app.quit());
  });
  let updateCredentials=null;
  const prepareUpdateShutdown=async()=>{updateCredentials=credentials;await prepareShutdown(true);};
  const resumeAfterUpdateFailure=async()=>{const saved=updateCredentials;updateCredentials=null;quitting=false;shutdownTask=null;updateHold=false;if(credentials===saved)await sync();else await configure(saved);};
  return { configure,sync,status:()=>publish(),updateSafety,holdForUpdate,acquireUpdateHold,releaseUpdateHold,prepareShutdown,prepareUpdateShutdown,resumeAfterUpdateFailure };
}
module.exports={installDesktopTracking};
