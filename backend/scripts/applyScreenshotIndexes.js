// Additive and repeatable: never syncIndexes/dropIndexes or migrate objects.
import 'dotenv/config';
import mongoose from 'mongoose';
import {TrackingScreenshot,TrackingStorageLabel,ActivityInterval} from '../modules/tracking/tracking.models.js';
try{
  await mongoose.connect(process.env.MONGO_URI,{autoIndex:false});
  const required=[
    [TrackingScreenshot,{workspaceId:1,user:1,capturedAt:-1,_id:-1},{}],
    [TrackingScreenshot,{workspaceId:1,session:1,capturedAt:-1,_id:-1},{}],
    [ActivityInterval,{workspaceId:1,session:1,endedAt:-1,_id:-1},{}],
    ...TrackingStorageLabel.schema.indexes().map(([keys,options])=>[TrackingStorageLabel,keys,options])
  ];
  for(const [model,keys,options]of required){await model.collection.createIndex(keys,options);console.log(`Verified ${model.modelName} index: ${Object.keys(keys).join(',')}`);}
}finally{await mongoose.disconnect();}
