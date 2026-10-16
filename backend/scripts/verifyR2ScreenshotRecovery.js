// Generated media only. Lists only this run's random diagnostic prefix.
// Never lists, downloads or removes employee objects; does not use MongoDB.
import 'dotenv/config';
import sharp from 'sharp';
import {createHash,randomBytes} from 'node:crypto';
import {ListObjectsV2Command} from '@aws-sdk/client-s3';
import {screenshotKey,signedUpload,verifyPrivateUpload,privateScreenshotExists,readPrivateScreenshot,removePrivateScreenshot,privateStorage} from '../modules/tracking/tracking.storage.js';
const result={generatedMediaOnly:true},nonce=randomBytes(8).toString('hex'),fakeId=()=>randomBytes(12).toString('hex');
let record,touched=false;
try{
  const data=await sharp(Buffer.from('<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><text x="24" y="60" font-size="24">FlowTask generated single-image recovery test</text></svg>')).webp({quality:85}).toBuffer();
  record={workspaceId:fakeId(),user:fakeId(),interval:fakeId(),displayId:'diagnostic',capturedAt:new Date(),format:'webp',mimeType:'image/webp',pipelineVersion:2,quality:85,storageProvider:'cloudflare-r2',storageWorkspaceLabel:`flowtask-single-image-check-${nonce}`,storageDepartmentLabel:'generated-department',storageUserLabel:'generated-image',storageTimezone:'UTC',storageDateKey:new Date().toISOString().slice(0,10).replaceAll('-','/'),width:1280,height:720,bytes:data.length,checksum:createHash('sha256').update(data).digest('hex'),contentMd5:createHash('md5').update(data).digest('hex')};
  record.storageKey=screenshotKey(record);
  const {client,config}=privateStorage(),prefix=`screenshots/${record.storageWorkspaceLabel}/`;
  const objectCount=async()=>{const page=await client.send(new ListObjectsV2Command({Bucket:config.bucket,Prefix:prefix,MaxKeys:10}),{abortSignal:AbortSignal.timeout(20000)});if(page.IsTruncated)throw new Error('Unexpected diagnostic objects');return page.Contents?.length||0;};
  const upload=async()=>{const capability=await signedUpload(record),response=await fetch(capability.url,{method:'PUT',headers:{...capability.headers,'Content-Length':String(data.length)},body:data,redirect:'error',signal:AbortSignal.timeout(30000)});if(!response.ok)throw Object.assign(new Error('Generated upload rejected'),{name:`UploadHttp${response.status}`});touched=true;};
  await upload();await verifyPrivateUpload(record);
  result.firstUploadVerified=await privateScreenshotExists(record);result.imageBytes=data.length;result.oneObjectAfterUpload=await objectCount()===1;
  await removePrivateScreenshot(record);result.deletedGeneratedPrefixDetected=!await privateScreenshotExists(record);
  await upload();await verifyPrivateUpload(record);
  result.sameKeyRecreated=await privateScreenshotExists(record);result.recoveredPrimaryMatches=(await readPrivateScreenshot(record)).equals(data);result.oneObjectAfterRecovery=await objectCount()===1;
  result.success=Object.entries(result).filter(([key])=>key!=='imageBytes').every(([,value])=>value===true);
  if(!result.success)process.exitCode=1;
}catch(error){result.success=false;result.errorCode=error.name||'VerificationFailed';process.exitCode=1;}
finally{if(touched){try{await removePrivateScreenshot(record);result.generatedObjectsCleanedUp=true;}catch{result.cleanupFailed=true;process.exitCode=1;}}console.log(JSON.stringify(result,null,2));}
