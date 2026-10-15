// Compatibility for existing private monitoring images only. Other Cloudinary
// integrations and assets are untouched. New captures never use this adapter.
import { v2 as cloudinary } from 'cloudinary';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {signedUpload,screenshotKey,verifyPrivateUpload,privateStorage} from './tracking.storage.js';
import {TrackingScreenshot} from './tracking.models.js';
function legacyClient(){
  const {CLOUDINARY_CLOUD_NAME,CLOUDINARY_API_KEY,CLOUDINARY_API_SECRET}=process.env;
  if(!CLOUDINARY_CLOUD_NAME||!CLOUDINARY_API_KEY||!CLOUDINARY_API_SECRET)throw Object.assign(new Error('Legacy screenshot migration requires the existing Cloudinary backend configuration'),{statusCode:503});
  cloudinary.config({cloud_name:CLOUDINARY_CLOUD_NAME,api_key:CLOUDINARY_API_KEY,api_secret:CLOUDINARY_API_SECRET,secure:true});return cloudinary;
}
export async function migrateLegacyScreenshot(screenshot){
  if(screenshot.storageProvider==='cloudflare-r2')return screenshot;
  if(screenshot.status!=='READY'||!screenshot.publicId)throw Object.assign(new Error('Legacy screenshot is not ready for migration'),{statusCode:409});
  const url=legacyClient().utils.private_download_url(screenshot.publicId,screenshot.format||'jpg',{resource_type:'image',type:'authenticated',expires_at:Math.floor(Date.now()/1000)+60,attachment:false});
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Object.assign(new Error('Legacy private screenshot download failed'),{statusCode:503});
  const chunks=[];let length=0;for await(const chunk of response.body){length+=chunk.length;if(length>15*1024*1024)throw new Error('Legacy screenshot exceeds supported size');chunks.push(chunk);}
  const original=Buffer.concat(chunks);
  if(createHash('sha256').update(original).digest('hex')!==screenshot.checksum)throw new Error('Legacy screenshot failed integrity validation');
  const {data,info}=await sharp(original).webp({quality:85}).toBuffer({resolveWithObject:true});
  const next={...screenshot,storageProvider:'cloudflare-r2',format:'webp',mimeType:'image/webp',quality:85,width:info.width,height:info.height,bytes:data.length,checksum:createHash('sha256').update(data).digest('hex'),contentMd5:createHash('md5').update(data).digest('hex'),uploadStatus:'UPLOADED',uploadedAt:new Date()};
  next.storageBucket=privateStorage().config.bucket;next.storageKey=screenshotKey(next);const upload=await signedUpload(next);
  const stored=await fetch(upload.url,{method:'PUT',headers:{...upload.headers,'Content-Length':String(data.length)},body:data,signal:AbortSignal.timeout(30000)});
  if(!stored.ok&&![409,412].includes(stored.status))throw new Error('Legacy screenshot R2 migration upload failed');
  await verifyPrivateUpload(next);
  const _id=next._id;
  const fields=Object.fromEntries(['storageProvider','storageBucket','storageKey','format','mimeType','quality','width','height','bytes','checksum','contentMd5','uploadStatus','uploadedAt'].map(key=>[key,next[key]]));
  const saved=await TrackingScreenshot.findOneAndUpdate({_id,status:'READY',checksum:screenshot.checksum,$or:[{expiresAt:null},{expiresAt:{$gt:new Date()}}],storageProvider:{$ne:'cloudflare-r2'}},{$set:fields},{new:true}).lean()||await TrackingScreenshot.findById(_id).lean();
  if(!saved||saved.status!=='READY'||saved.expiresAt&&saved.expiresAt<=new Date())throw Object.assign(new Error('Legacy screenshot expired during migration'),{statusCode:410});
  return saved;
}
export async function removeLegacyScreenshot(s){
  if(!s.publicId)return;
  const result=await legacyClient().uploader.destroy(s.publicId,{resource_type:'image',type:'authenticated',invalidate:true});
  if(!['ok','not found'].includes(result.result))throw new Error('Legacy private screenshot deletion will retry');
}
