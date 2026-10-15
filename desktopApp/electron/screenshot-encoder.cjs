const path=require('node:path');
let encoder;
function sharp(){if(!encoder){try{encoder=require('sharp');}catch(error){if(!process.resourcesPath)throw error;encoder=require(path.join(process.resourcesPath,'node_modules','sharp'));}}return encoder;}
async function encodeWebP(buffer){
  const {data,info}=await sharp()(buffer,{limitInputPixels:16000*16000}).webp({quality:85}).toBuffer({resolveWithObject:true});
  if(info.format!=='webp'||!data.length)throw new Error('WebP encoding failed');
  return {data,width:info.width,height:info.height,format:'webp',mimeType:'image/webp',quality:85};
}
module.exports={encodeWebP};
