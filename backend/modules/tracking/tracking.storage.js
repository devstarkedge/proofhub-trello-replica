import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import Workspace from '../../models/Workspace.js';
import User from '../../models/User.js';
import Department from '../../models/Department.js';
import {DateTime} from 'luxon';
import {TrackingStorageLabel} from './tracking.models.js';
export const SCREENSHOT_TARGET_BYTES=70*1024;
export const SCREENSHOT_MAX_BYTES=Math.min(64*1024*1024,Math.max(128*1024,Number(process.env.FLOWTASK_SCREENSHOT_MAX_BYTES)||15*1024*1024));
export const screenshotUploadLimits=()=>({maxScreenshotBytes:SCREENSHOT_MAX_BYTES,targetScreenshotBytes:SCREENSHOT_TARGET_BYTES,maxThumbnailBytes:SCREENSHOT_TARGET_BYTES});
const failure = (message,statusCode=503) => Object.assign(new Error(message),{statusCode,code:'SCREENSHOT_STORAGE_UNAVAILABLE'});
let cached;
let inflight=0;const waiting=[];
export async function storageIO(operation){if(inflight>=4){if(waiting.length>=64)throw failure('Screenshot storage is busy; retry shortly');await new Promise(resolve=>waiting.push(resolve));}else inflight++;try{return await operation();}finally{const next=waiting.shift();if(next)next();else inflight--;}}
const send=(client,command)=>storageIO(()=>client.send(command,{abortSignal:AbortSignal.timeout(20000)}));
export function storageSlug(name){return Array.from(String(name||'').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu,'-').replace(/^-+|-+$/g,'')).slice(0,48).join('').replace(/-+$/,'')||'unnamed';}
export async function storageLabels(workspaceId,userId,departmentIds=[],capturedAt=null){
  if(!Array.isArray(departmentIds)||departmentIds.some(value=>!/^[a-f\d]{24}$/i.test(String(value))))throw failure('Invalid capture department identity',400);
  const ids=[...new Set(departmentIds.map(String))].sort();
  // A capture has one object even when its user belongs to multiple departments.
  // Use the authoritative capture snapshot, never the user's later assignment.
  const kind=ids.length===1?'department':'department-group',ownerId=ids.length===1?ids[0]:createHash('sha256').update(`${workspaceId}:department-group:${ids.join(',')}`).digest('hex').slice(0,24);
  const existing=await TrackingStorageLabel.find({workspaceId,$or:[{kind:'workspace',ownerId:workspaceId},{kind:'user',ownerId:userId},{kind,ownerId}]}).lean();
  const [workspace,user,departments]=await Promise.all([
    Workspace.findById(workspaceId).select('name timezone').lean(),
    existing.some(v=>v.kind==='user')?null:User.findById(userId).select('name').lean(),
    existing.some(v=>v.kind===kind&&String(v.ownerId)===String(ownerId))?[]:Department.find({workspaceId,_id:{$in:ids}}).select('name').lean()
  ]);
  const resolve=async(kind,ownerId,name)=>{
    const found=existing.find(v=>v.kind===kind&&String(v.ownerId)===String(ownerId));if(found)return found.label;
    const hash=createHash('sha256').update(`${workspaceId}:${kind}:${ownerId}`).digest('hex');
    for(const length of [8,12,20,64]){const label=`${storageSlug(name||kind)}-${hash.slice(0,length)}`;
      // The workspace plugin injects the tenant equality. Repeating it in
      // this upsert makes MongoDB reject first-time prefix allocation.
      try{return (await TrackingStorageLabel.findOneAndUpdate({kind,ownerId},{$setOnInsert:{workspaceId,kind,ownerId,label}},{upsert:true,new:true,runValidators:true}).lean()).label;}
      catch(error){if(error.code!==11000)throw error;const raced=await TrackingStorageLabel.findOne({workspaceId,kind,ownerId}).lean();if(raced)return raced.label;}
    }throw failure('Cannot allocate screenshot storage label');
  };
  const departmentName=ids.length?ids.map(key=>departments.find(d=>String(d._id)===key)?.name||'Archived department').join(' and '):'No department';
  const labels={storageWorkspaceLabel:await resolve('workspace',workspaceId,workspace?.name),storageDepartmentLabel:await resolve(kind,ownerId,departmentName),storageUserLabel:await resolve('user',userId,user?.name)};
  if(capturedAt){const date=DateTime.fromJSDate(new Date(capturedAt),{zone:workspace?.timezone||'UTC'});if(!date.isValid)throw failure('Invalid screenshot date or workspace timezone',400);labels.storageDateKey=date.toFormat('yyyy/MM/dd');labels.storageTimezone=date.zoneName;}
  return labels;
}
export function storageConfig(env=process.env) {
  if(['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET_NAME','R2_ENDPOINT'].some(k=>!env[k]||/^your_|placeholder/i.test(env[k])))throw failure('R2 screenshot storage configuration is missing or invalid');
  let endpoint;try{endpoint=new URL(env.R2_ENDPOINT);}catch{throw failure('R2 endpoint is invalid');}
  if(!/^[a-f\d]{32}$/i.test(env.R2_ACCOUNT_ID)||endpoint.protocol!=='https:'||endpoint.hostname!==`${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`||endpoint.username||endpoint.password||endpoint.search||endpoint.pathname!=='/'||!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(env.R2_BUCKET_NAME))throw failure('R2 screenshot endpoint or bucket configuration is invalid');
  return {endpoint:endpoint.origin,bucket:env.R2_BUCKET_NAME,region:env.R2_REGION||'auto',expiresIn:Math.min(120,Math.max(60,Number(env.R2_UPLOAD_TTL_SECONDS)||90)),credentials:{accessKeyId:env.R2_ACCESS_KEY_ID,secretAccessKey:env.R2_SECRET_ACCESS_KEY}};
}
export function privateStorage() {
  if(!cached){const config=storageConfig();cached={config,client:new S3Client({...config,forcePathStyle:true,requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',maxAttempts:3})};}
  return cached;
}
export function screenshotKey(s) {
  const date=s.storageDateKey||new Date(s.capturedAt).toISOString().slice(0,10).replaceAll('-','/');
  if(typeof date!=='string'||!/^\d{4}\/\d{2}\/\d{2}$/.test(date)||!DateTime.fromFormat(date,'yyyy/MM/dd',{zone:'UTC'}).isValid)throw failure('Invalid screenshot storage date',400);
  for(const value of [s.workspaceId,s.user,s.interval,s.displayId])if(!/^[\w-]+$/.test(String(value)))throw failure('Invalid screenshot storage identity',400);
  const thumbnail=s.variant==='thumbnail'?'-thumb':'';
  if(s.storageWorkspaceLabel&&s.storageUserLabel){
    for(const label of [s.storageWorkspaceLabel,s.storageDepartmentLabel,s.storageUserLabel].filter(Boolean))if(!/^[\p{L}\p{M}\p{N}]+(?:-[\p{L}\p{M}\p{N}]+)*$/u.test(label)||Array.from(label).length>120)throw failure('Invalid screenshot storage label',400);
    const timestamp=new Date(s.capturedAt).toISOString().replace(/[-:.]/g,'');
    return `screenshots/${s.storageWorkspaceLabel}/${s.storageDepartmentLabel?`${s.storageDepartmentLabel}/`:''}${s.storageUserLabel}/${date}/${timestamp}-${s.interval}-${s.displayId}${thumbnail}.webp`;
  }
  return `screenshots/${s.workspaceId}/${s.user}/${date}/${s.interval}-${s.displayId}${thumbnail}.webp`;
}
const identity=s=>({workspace:String(s.workspaceId),user:String(s.user),capture:String(s.interval),monitor:String(s.displayId),sha256:s.checksum});
const assertR2=s=>{if(s.storageProvider!=='cloudflare-r2'||s.format!=='webp'||s.storageKey!==screenshotKey(s))throw failure('Legacy screenshot requires authorized migration to R2',409);};
export function missingStorageObject(error){return !['NoSuchBucket','AccessDenied'].includes(error?.name)&&(['NoSuchKey','NotFound'].includes(error?.name)||error?.$metadata?.httpStatusCode===404);}
export async function privateScreenshotExists(s){
  assertR2(s);const {client,config}=privateStorage();let object;
  try{object=await send(client,new HeadObjectCommand({Bucket:config.bucket,Key:s.storageKey}));}
  catch(error){if(missingStorageObject(error))return false;throw error;}
  if(object.ContentLength!==s.bytes||object.ContentType!=='image/webp'||Object.entries(identity(s)).some(([k,v])=>object.Metadata?.[k]!==v))throw failure('Stored screenshot metadata does not match this capture',409);
  return true;
}
export async function signedUpload(s) {
  assertR2(s);const {client,config}=privateStorage();
  if(s.bytes>SCREENSHOT_MAX_BYTES)throw Object.assign(failure('Screenshot exceeds the operational upload limit; retain it for retry.',413),{code:'SCREENSHOT_UPLOAD_LIMIT'});
  const headers={'Content-Type':'image/webp','Content-MD5':Buffer.from(s.contentMd5,'hex').toString('base64'),'If-None-Match':'*',...Object.fromEntries(Object.entries(identity(s)).map(([k,v])=>[`x-amz-meta-${k}`,v]))};
  const command=new PutObjectCommand({Bucket:config.bucket,Key:s.storageKey,ContentType:'image/webp',ContentLength:s.bytes,ContentMD5:headers['Content-MD5'],IfNoneMatch:'*',Metadata:identity(s)});
  const url=await getSignedUrl(client,command,{expiresIn:config.expiresIn,unhoistableHeaders:new Set(Object.keys(headers).map(h=>h.toLowerCase())),signableHeaders:new Set(['content-type','content-length','content-md5','if-none-match'])});
  return {url,method:'PUT',headers,expiresIn:config.expiresIn,maxBytes:s.bytes};
}
export async function readPrivateScreenshot(s) {
  assertR2(s);const {client,config}=privateStorage();
  return storageIO(async()=>{
  const object=await client.send(new GetObjectCommand({Bucket:config.bucket,Key:s.storageKey}),{abortSignal:AbortSignal.timeout(20000)});
  const chunks=[];let length=0;
  for await(const chunk of object.Body){length+=chunk.length;if(length>s.bytes||length>Math.max(SCREENSHOT_MAX_BYTES,15*1024*1024)){object.Body.destroy?.();throw failure('Screenshot object exceeds authorized size',409);}chunks.push(chunk);}
  const bytes=Buffer.concat(chunks);
  if(bytes.length!==s.bytes||object.ContentType!=='image/webp'||createHash('sha256').update(bytes).digest('hex')!==s.checksum)throw failure('Screenshot content failed integrity verification',409);
  return bytes;
  });
}
export async function verifyPrivateUpload(s,{withBytes=false}={}) {
  assertR2(s);const {client,config}=privateStorage();
  if(s.bytes>Math.max(SCREENSHOT_MAX_BYTES,15*1024*1024))throw failure('Screenshot exceeds the operational verification limit',413);
  const object=await send(client,new HeadObjectCommand({Bucket:config.bucket,Key:s.storageKey}));
  if(object.ContentLength!==s.bytes||object.ContentType!=='image/webp'||Object.entries(identity(s)).some(([k,v])=>object.Metadata?.[k]!==v))throw failure('Uploaded R2 screenshot metadata does not match',409);
  const bytes=await readPrivateScreenshot(s);
  const image=await sharp(bytes,{limitInputPixels:16000*16000}).metadata();
  if(image.format!=='webp'||image.width!==s.width||image.height!==s.height)throw failure('Uploaded image is not the expected WebP',409);
  // Metadata parsing alone accepts some truncated/corrupt pixel streams.
  await sharp(bytes,{limitInputPixels:16000*16000,failOn:'warning'}).stats();
  return withBytes?{verified:true,data:bytes}:{verified:true};
}
export async function removePrivateScreenshot(s) {
  assertR2(s);const {client,config}=privateStorage();await send(client,new DeleteObjectCommand({Bucket:config.bucket,Key:s.storageKey}));
  await removePrivateThumbnail(s);
}
export function thumbnailDescriptor(s){
  const value=s.toObject?s.toObject():s;
  return {...value,...value.thumbnail,storageProvider:'cloudflare-r2',format:'webp',variant:'thumbnail'};
}
export async function writePrivateThumbnail(s,bytes){
  const descriptor=thumbnailDescriptor(s);assertR2(descriptor);
  if(bytes.length>SCREENSHOT_TARGET_BYTES||bytes.length!==descriptor.bytes)throw failure('Invalid thumbnail size',413);
  const {client,config}=privateStorage();
  try{await send(client,new PutObjectCommand({Bucket:config.bucket,Key:descriptor.storageKey,Body:bytes,ContentLength:bytes.length,ContentType:'image/webp',ContentMD5:Buffer.from(descriptor.contentMd5,'hex').toString('base64'),IfNoneMatch:'*',Metadata:identity(descriptor)}));}
  catch(error){if(![409,412].includes(error?.$metadata?.httpStatusCode))throw error;}
  await verifyPrivateUpload(descriptor);
}
export async function removePrivateThumbnail(s){
  // Both private representations share the original capture's retention.
  if(!s.thumbnail?.storageKey)return;
  const descriptor={...s,storageProvider:'cloudflare-r2',format:'webp',variant:'thumbnail',storageKey:s.thumbnail.storageKey};
  assertR2(descriptor);const {client,config}=privateStorage();
  await send(client,new DeleteObjectCommand({Bucket:config.bucket,Key:descriptor.storageKey}));
}
export async function storageHealth() {
  let configured=false;
  try{const {client,config}=privateStorage();configured=true;await client.send(new HeadBucketCommand({Bucket:config.bucket}));return {configured:true,available:true,provider:'cloudflare-r2'};}
  catch{return {configured,available:false,provider:'cloudflare-r2',message:'R2 configuration, bucket access, or connectivity check failed. Review backend environment and bucket-scoped token permissions.'};}
}
