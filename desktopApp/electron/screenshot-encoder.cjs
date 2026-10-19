const path=require('node:path');
let encoder;
function sharp(){if(!encoder){try{encoder=require('sharp');}catch(error){if(!process.resourcesPath)throw error;encoder=require(path.join(process.resourcesPath,'node_modules','sharp'));}}return encoder;}
const TARGET_BYTES=70*1024,MAX_BYTES=15*1024*1024,MIN_QUALITY=75,MIN_SCALE=1;
async function encodeWebP(buffer,{maxBytes=MAX_BYTES}={}){
  maxBytes=Math.min(64*1024*1024,Math.max(128*1024,Number(maxBytes)||MAX_BYTES));
  const image=sharp()(buffer,{limitInputPixels:16000*16000}),original=await image.metadata();
  let preferred,last;
  // Native libvips workers perform the pixel work. Never resize the original
  // to meet a byte target. A conservative quality floor protects desktop text;
  // if the target remains out of reach, keep the readable quality-85 version.
  for(const quality of [85,80,MIN_QUALITY]){
    const {data,info}=await image.clone().webp({quality,effort:4,smartSubsample:true}).toBuffer({resolveWithObject:true});
    if(info.format!=='webp'||!data.length)throw new Error('WebP encoding failed');
    last={data,width:info.width,height:info.height,originalWidth:original.width,originalHeight:original.height,format:'webp',mimeType:'image/webp',quality,
      pipelineVersion:3,compressionStrategy:'full-resolution-readable-webp',maxBytes,targetBytes:TARGET_BYTES,targetMet:data.length<=TARGET_BYTES};
    preferred ||= last;
    if(data.length<=TARGET_BYTES)return last;
    // A complex image far above the target keeps the preferred quality and
    // avoids two futile encodes. Only the operational limit requires retries.
    if(quality===85&&data.length>TARGET_BYTES*2&&data.length<=maxBytes)return last;
    if(preferred.data.length>maxBytes&&data.length<=maxBytes)return last;
  }
  if(preferred.data.length<=maxBytes)return preferred;
  const error=new Error('Readable screenshot exceeds the operational upload limit. The original is retained for retry.');
  Object.assign(error,{code:'SCREENSHOT_UPLOAD_LIMIT',measurement:{bytes:last.data.length,width:last.width,height:last.height,originalWidth:original.width,originalHeight:original.height,quality:last.quality,compressionStrategy:last.compressionStrategy}});
  throw error;
}
module.exports={encodeWebP,MAX_BYTES,TARGET_BYTES,MIN_QUALITY,MIN_SCALE};
