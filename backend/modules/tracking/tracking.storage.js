import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const failure = (message,statusCode=503) => Object.assign(new Error(message),{statusCode,code:'SCREENSHOT_STORAGE_UNAVAILABLE'});
let cached;
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
  const date=new Date(s.capturedAt).toISOString().slice(0,10).replaceAll('-','/');
  for(const value of [s.workspaceId,s.user,s.interval,s.displayId])if(!/^[\w-]+$/.test(String(value)))throw failure('Invalid screenshot storage identity',400);
  return `screenshots/${s.workspaceId}/${s.user}/${date}/${s.interval}-${s.displayId}.webp`;
}
const identity=s=>({workspace:String(s.workspaceId),user:String(s.user),capture:String(s.interval),monitor:String(s.displayId),sha256:s.checksum});
const assertR2=s=>{if(s.storageProvider!=='cloudflare-r2'||s.format!=='webp'||s.storageKey!==screenshotKey(s))throw failure('Legacy screenshot requires authorized migration to R2',409);};
export async function signedUpload(s) {
  assertR2(s);const {client,config}=privateStorage();
  const headers={'Content-Type':'image/webp','Content-MD5':Buffer.from(s.contentMd5,'hex').toString('base64'),'If-None-Match':'*',...Object.fromEntries(Object.entries(identity(s)).map(([k,v])=>[`x-amz-meta-${k}`,v]))};
  const command=new PutObjectCommand({Bucket:config.bucket,Key:s.storageKey,ContentType:'image/webp',ContentLength:s.bytes,ContentMD5:headers['Content-MD5'],IfNoneMatch:'*',Metadata:identity(s)});
  const url=await getSignedUrl(client,command,{expiresIn:config.expiresIn,unhoistableHeaders:new Set(Object.keys(headers).map(h=>h.toLowerCase())),signableHeaders:new Set(['content-type','content-length','content-md5','if-none-match'])});
  return {url,method:'PUT',headers,expiresIn:config.expiresIn,maxBytes:s.bytes};
}
export async function readPrivateScreenshot(s) {
  assertR2(s);const {client,config}=privateStorage();
  const object=await client.send(new GetObjectCommand({Bucket:config.bucket,Key:s.storageKey}));
  const chunks=[];let length=0;
  for await(const chunk of object.Body){length+=chunk.length;if(length>s.bytes||length>15*1024*1024){object.Body.destroy?.();throw failure('Screenshot object exceeds authorized size',409);}chunks.push(chunk);}
  const bytes=Buffer.concat(chunks);
  if(bytes.length!==s.bytes||object.ContentType!=='image/webp'||createHash('sha256').update(bytes).digest('hex')!==s.checksum)throw failure('Screenshot content failed integrity verification',409);
  return bytes;
}
export async function verifyPrivateUpload(s) {
  assertR2(s);const {client,config}=privateStorage();
  const object=await client.send(new HeadObjectCommand({Bucket:config.bucket,Key:s.storageKey}));
  if(object.ContentLength!==s.bytes||object.ContentType!=='image/webp'||Object.entries(identity(s)).some(([k,v])=>object.Metadata?.[k]!==v))throw failure('Uploaded R2 screenshot metadata does not match',409);
  const bytes=await readPrivateScreenshot(s);
  const image=await sharp(bytes,{limitInputPixels:16000*16000}).metadata();
  if(image.format!=='webp'||image.width!==s.width||image.height!==s.height)throw failure('Uploaded image is not the expected WebP',409);
  // Metadata parsing alone accepts some truncated/corrupt pixel streams.
  await sharp(bytes,{limitInputPixels:16000*16000,failOn:'warning'}).stats();
  return {verified:true};
}
export async function removePrivateScreenshot(s) {
  assertR2(s);const {client,config}=privateStorage();await client.send(new DeleteObjectCommand({Bucket:config.bucket,Key:s.storageKey}));
}
export async function storageHealth() {
  let configured=false;
  try{const {client,config}=privateStorage();configured=true;await client.send(new HeadBucketCommand({Bucket:config.bucket}));return {configured:true,available:true,provider:'cloudflare-r2'};}
  catch{return {configured,available:false,provider:'cloudflare-r2',message:'R2 configuration, bucket access, or connectivity check failed. Review backend environment and bucket-scoped token permissions.'};}
}
