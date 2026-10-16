const path=require('node:path');
let encoder;
function sharp(){if(!encoder){try{encoder=require('sharp');}catch(error){if(!process.resourcesPath)throw error;encoder=require(path.join(process.resourcesPath,'node_modules','sharp'));}}return encoder;}
const MAX_BYTES=70*1024,MIN_QUALITY=55,MIN_SCALE=0.75;
async function encodeWebP(buffer){
  const image=sharp()(buffer,{limitInputPixels:16000*16000}),original=await image.metadata();
  let last;
  // libvips performs conversion on native worker threads, not in the renderer.
  // At most 12 candidates; no enlargement and no unreported resolution changes.
  for(const scale of [1,0.875,MIN_SCALE])for(const quality of [85,75,65,MIN_QUALITY]){
    const width=Math.max(1,Math.round(original.width*scale)),height=Math.max(1,Math.round(original.height*scale));
    const {data,info}=await image.clone().resize({width,height,fit:'inside',withoutEnlargement:true}).webp({quality,effort:5}).toBuffer({resolveWithObject:true});
    if(info.format!=='webp'||!data.length)throw new Error('WebP encoding failed');
    last={data,width:info.width,height:info.height,originalWidth:original.width,originalHeight:original.height,format:'webp',mimeType:'image/webp',quality,
      pipelineVersion:2,compressionStrategy:scale===1?'adaptive-quality':`adaptive-quality-scale-${scale}`,maxBytes:MAX_BYTES};
    if(data.length<=MAX_BYTES)return last;
  }
  const error=new Error('Screenshot cannot fit 70 KiB at the minimum quality 55 and 75% resolution. Activity is preserved.');
  Object.assign(error,{code:'SIZE_QUALITY_CONFLICT',measurement:{bytes:last.data.length,width:last.width,height:last.height,originalWidth:original.width,originalHeight:original.height,quality:last.quality,compressionStrategy:last.compressionStrategy}});
  throw error;
}
module.exports={encodeWebP,MAX_BYTES,MIN_QUALITY,MIN_SCALE};
