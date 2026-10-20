const path=require('node:path');
let encoder;
function sharp(){if(!encoder){try{encoder=require('sharp');}catch(error){if(!process.resourcesPath)throw error;encoder=require(path.join(process.resourcesPath,'node_modules','sharp'));}}return encoder;}
const TARGET_BYTES=100*1024,MAX_BYTES=15*1024*1024,MIN_QUALITY=75,MIN_SCALE=1;
async function encodeWebP(buffer,{maxBytes=MAX_BYTES}={}){
  maxBytes=Math.min(64*1024*1024,Math.max(128*1024,Number(maxBytes)||MAX_BYTES));
  const image=sharp()(buffer,{limitInputPixels:16000*16000}),original=await image.metadata();
  const encode=async quality=>{
    const {data,info}=await image.clone().webp({quality,effort:4,smartSubsample:true}).toBuffer({resolveWithObject:true});
    if(info.format!=='webp'||!data.length)throw new Error('WebP encoding failed');
    return {data,width:info.width,height:info.height,originalWidth:original.width,originalHeight:original.height,format:'webp',mimeType:'image/webp',quality,
      pipelineVersion:4,compressionStrategy:'full-resolution-readable-webp',maxBytes,targetBytes:TARGET_BYTES,targetMet:data.length<=TARGET_BYTES,
      sizeExceptionReason:data.length>TARGET_BYTES?'READABLE_FULL_RESOLUTION_EXCEEDS_TARGET':undefined};
  };
  const preferred=await encode(85);
  if(preferred.targetMet)return preferred;
  const minimum=await encode(MIN_QUALITY);
  // At most two probes plus four binary-search probes. Preserve full resolution
  // and never lower desktop text below the agreed readability floor.
  const limit=minimum.targetMet?TARGET_BYTES:maxBytes;
  if(!minimum.targetMet&&preferred.data.length<=maxBytes)return preferred;
  if(minimum.data.length<=limit){
    let best=minimum,low=MIN_QUALITY+1,high=84;
    for(let attempt=0;attempt<4&&low<=high;attempt++){
      const quality=Math.floor((low+high)/2),candidate=await encode(quality);
      if(candidate.data.length<=limit){best=candidate;low=quality+1;}else high=quality-1;
    }
    return best;
  }
  const error=new Error('Readable screenshot exceeds the operational upload limit. The original is retained for retry.');
  Object.assign(error,{code:'SCREENSHOT_UPLOAD_LIMIT',measurement:{bytes:minimum.data.length,width:minimum.width,height:minimum.height,originalWidth:original.width,originalHeight:original.height,quality:minimum.quality,compressionStrategy:minimum.compressionStrategy}});
  throw error;
}
module.exports={encodeWebP,MAX_BYTES,TARGET_BYTES,MIN_QUALITY,MIN_SCALE};
