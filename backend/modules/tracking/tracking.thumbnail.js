import sharp from 'sharp';
let active=0;
const waiting=[];
// Derived reads are disposable and never create R2 objects or MongoDB rows.
// Bound libvips work independently from attendance/action requests.
export async function makeTrackingThumbnail(bytes){
  if(active>=4){if(waiting.length>=64){const error=new Error('Screenshot previews are busy. Retry shortly.');error.statusCode=503;throw error;}await new Promise(resolve=>waiting.push(resolve));}else active++;
  try{
    const {data,info}=await sharp(bytes).rotate().resize({width:480,height:270,fit:'inside',withoutEnlargement:true}).webp({quality:65,effort:2}).toBuffer({resolveWithObject:true});
    return {bytes:data,mimeType:'image/webp',width:info.width,height:info.height};
  }finally{const next=waiting.shift();if(next)next();else active--;}
}
