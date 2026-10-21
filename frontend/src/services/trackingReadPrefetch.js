import {getReports,getScreenshotDetails} from './trackingApi';
import {getWorkspaceDateRange,trackingReportOptions} from '../../../shared/trackingReportQuery.mjs';
// Pointer intent is coalesced and serialized: sweeping across a table must
// not launch one request per row. Actual clicks still use Query's normal path.
const pending=new WeakMap();
function schedule(client,scope,job){
  let state=pending.get(client);if(!state){state={};pending.set(client,state);}
  clearTimeout(state.timer);state.job={scope,run:job};
  const flush=async()=>{
    if(state.running)return;
    const next=state.job;state.job=null;if(!next)return;
    if(!client.getQueryCache().getAll().some(query=>query.queryKey[1]===next.scope&&query.getObserversCount()>0))return;
    state.running=true;
    try{await next.run();}catch{/* Interactive queries own errors and retry controls. */}finally{state.running=false;if(state.job)state.timer=setTimeout(flush,150);}
  };
  state.timer=setTimeout(flush,150);
}
export function prefetchTrackingReport(client,scope,userId,timezone){
  const {fromDate,toDate}=getWorkspaceDateRange('last7days',timezone||'UTC');
  schedule(client,scope,()=>client.prefetchInfiniteQuery(trackingReportOptions(scope,JSON.stringify({userId}),false,fromDate,toDate,userId,getReports)));
}
export function prefetchScreenshotDetails(client,scope,screenshotId){
  schedule(client,scope,()=>client.prefetchQuery({queryKey:['tracking-private',scope,'details',screenshotId],queryFn:({signal})=>getScreenshotDetails(screenshotId,signal),staleTime:5*60*1000,gcTime:5*60*1000,retry:false}));
}
