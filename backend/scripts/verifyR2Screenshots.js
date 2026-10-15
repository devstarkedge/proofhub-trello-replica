// Generated media only; never reads desktop screens or writes application DB.
import 'dotenv/config';
import sharp from 'sharp';
import {createHash,randomBytes} from 'node:crypto';
import {storageConfig,screenshotKey,signedUpload,verifyPrivateUpload,readPrivateScreenshot,removePrivateScreenshot} from '../modules/tracking/tracking.storage.js';
let screenshot,uploaded=false;
const result={generatedImageOnly:true};
try{
  storageConfig();result.configurationValid=true;
  const svg=Buffer.from('<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><text x="24" y="60" font-size="24">FlowTask R2 diagnostic: generated text, no employee data.</text></svg>');
  const image=await sharp(svg).webp({quality:85}).toBuffer();
  const fakeId=()=>randomBytes(12).toString('hex');
  screenshot={workspaceId:fakeId(),user:fakeId(),interval:fakeId(),displayId:'diagnostic',capturedAt:new Date(),format:'webp',storageProvider:'cloudflare-r2',width:1280,height:720,bytes:image.length,checksum:createHash('sha256').update(image).digest('hex'),contentMd5:createHash('md5').update(image).digest('hex')};
  screenshot.storageKey=screenshotKey(screenshot);
  const authorization=await signedUpload(screenshot);
  const response=await fetch(authorization.url,{method:'PUT',headers:{...authorization.headers,'Content-Length':String(image.length)},body:image,signal:AbortSignal.timeout(30000)});
  result.uploadHttpStatus=response.status;if(!response.ok)throw new Error('UploadRejected');uploaded=true;
  await verifyPrivateUpload(screenshot);result.backendObjectVerified=true;
  result.downloadHashVerified=(await readPrivateScreenshot(screenshot)).equals(image);
  const unsigned=new URL(authorization.url);unsigned.search='';
  const anonymous=await fetch(unsigned,{signal:AbortSignal.timeout(30000)});result.unsignedAccessDenied=!anonymous.ok;
  const duplicate=await fetch(authorization.url,{method:'PUT',headers:{...authorization.headers,'Content-Length':String(image.length)},body:image,signal:AbortSignal.timeout(30000)});result.overwriteRejected=[409,412].includes(duplicate.status);
  if(!result.unsignedAccessDenied||!result.overwriteRejected)throw new Error('BucketAccessSafetyCheckFailed');
}catch(error){result.errorCode=error.name;result.success=false;process.exitCode=1;}
finally{if(uploaded){try{await removePrivateScreenshot(screenshot);result.generatedObjectDeleted=true;}catch{result.cleanupFailed=true;process.exitCode=1;}}if(result.success!==false)result.success=true;console.log(JSON.stringify(result,null,2));}
