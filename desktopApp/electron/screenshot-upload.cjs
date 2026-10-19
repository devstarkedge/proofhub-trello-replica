const {randomUUID}=require('node:crypto');
const {checksum}=require('./tracking-core.cjs');
const {encodeWebP}=require('./screenshot-encoder.cjs');
const encodedFields=e=>({width:e.width,height:e.height,originalWidth:e.originalWidth,originalHeight:e.originalHeight,quality:e.quality,pipelineVersion:e.pipelineVersion,compressionStrategy:e.compressionStrategy,targetBytes:e.targetBytes,targetMet:e.targetMet});

// A serial background worker bounds network and encoding work. Persist each
// checkpoint before continuing; a restart can safely repeat every remote step.
async function uploadEntry({entry,save,request,fetchUpload=fetch,deviceId,maxBytes,isCurrent=()=>true}){
  const current=()=>{if(!isCurrent())throw Object.assign(new Error('Upload identity changed'),{code:'UPLOAD_IDENTITY_CHANGED'});};
  current();
  const interval=await request(`/devices/${entry.deviceId||deviceId}/intervals`,entry.payload);
  current();entry.intervalId=interval._id;save();
  for(const image of entry.images||[]){
    current();if(image.acknowledged)continue;
    image.captureId||=randomUUID();save();
    let bytes=Buffer.from(image.data||'','base64');
    if(!bytes.length||checksum(bytes)!==image.checksum||checksum(bytes,'md5')!==image.contentMd5)throw Object.assign(new Error('Saved screenshot failed integrity verification; retained for inspection'),{code:'SCREENSHOT_LOCAL_INTEGRITY'});
    if(image.exceptionCode==='SIZE_QUALITY_CONFLICT'||image.exceptionReported){image.recoveredFrom='SIZE_QUALITY_CONFLICT';delete image.exceptionCode;delete image.exceptionReported;delete image.protectedUntil;save();}
    if(image.format!=='webp'){
      const encoded=await encodeWebP(bytes,{maxBytes});current();bytes=encoded.data;
      Object.assign(image,encodedFields(encoded),{format:'webp',mimeType:'image/webp',data:bytes.toString('base64'),bytes:bytes.length,checksum:checksum(bytes),contentMd5:checksum(bytes,'md5'),conversionPending:false});save();
    }
    const metadata={...image};for(const field of ['data','acknowledged','protectedUntil','measurement','exceptionReported','conversionPending'])delete metadata[field];
    const base=`/devices/${entry.deviceId||deviceId}/screenshots`;
    const prepared=await request(`${base}/prepare`,{intervalId:interval._id,image:metadata});current();
    image.screenshotId=prepared.screenshotId;save();
    if(prepared.exceptionRecorded)throw Object.assign(new Error('Backend update required to recover this saved capture'),{code:'AGENT_UPDATE_REQUIRED'});
    if(prepared.upload){
      const url=new URL(prepared.upload.url);
      if(url.protocol!=='https:'||!/(^|\.)r2\.cloudflarestorage\.com$/.test(url.hostname)||prepared.upload.method!=='PUT')throw new Error('Untrusted screenshot upload destination');
      const response=await fetchUpload(url,{method:'PUT',headers:{...prepared.upload.headers,'Content-Length':String(bytes.length)},redirect:'error',body:bytes,signal:AbortSignal.timeout(60000)});current();
      if(!response.ok&&![409,412].includes(response.status))throw Object.assign(new Error('R2 upload unavailable; saved capture will retry'),{code:'SCREENSHOT_STORAGE_UNAVAILABLE'});
    }
    const confirmed=await request(`${base}/${prepared.screenshotId}/complete`,{});current();
    if(confirmed.status!=='READY'||confirmed.uploadStatus!=='UPLOADED')throw new Error('Screenshot finalization was not acknowledged; saved capture will retry');
    image.acknowledged=true;save();
  }
  entry.acknowledged=true;save();
}
module.exports={uploadEntry,encodedFields};
