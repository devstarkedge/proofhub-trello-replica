// Legacy idle-threshold measurements remain readable but never masquerade as
// the distinct-input-second activity rate introduced in enterprise tracking.
export function summarizeEvidence(intervals, screenshots = []) {
  let activeInputSeconds=0, eligibleInputSeconds=0, mouseCount=0, keyboardCount=0;
  let knownMouse=false,knownKeyboard=false;
  let knownSeconds=0, excludedSeconds=0, eligibleWindows=0, capturedWindows=0;
  const outcomes={},ready=new Set(screenshots.filter(s=>s.status==='READY').map(s=>String(s.interval))); 
  for (const interval of intervals) {
    const seconds=Math.max(0,(+new Date(interval.endedAt)-+new Date(interval.startedAt))/1000);
    const excluded=['excluded','locked','sleep'].includes(interval.coverage);
    knownSeconds+=seconds;
    if(excluded)excludedSeconds+=seconds;
    outcomes[interval.coverage]=(outcomes[interval.coverage]||0)+1;
    if(!excluded){
      eligibleWindows++;
      if(ready.has(String(interval._id)))capturedWindows++;
      if(interval.activityBasis==='distinct-input-seconds-v1'&&Number.isFinite(interval.inputActiveSeconds)&&Number.isFinite(interval.inputEligibleSeconds)){
        activeInputSeconds+=interval.inputActiveSeconds;eligibleInputSeconds+=interval.inputEligibleSeconds;
      }
      if(Number.isFinite(interval.mouseCount)){knownMouse=true;mouseCount+=interval.mouseCount;}
      if(Number.isFinite(interval.keyboardCount)){knownKeyboard=true;keyboardCount+=interval.keyboardCount;}
    }
  }
  const pendingScreenshots=screenshots.filter(s=>s.status==='PENDING').length;
  return {activeInputSeconds,eligibleInputSeconds,activityPercent:eligibleInputSeconds>0?activeInputSeconds/eligibleInputSeconds*100:null,
    mouseCount:knownMouse?mouseCount:null,keyboardCount:knownKeyboard?keyboardCount:null,knownSeconds,excludedSeconds,eligibleWindows,capturedWindows,
    captureSuccessPercent:eligibleWindows>0?capturedWindows/eligibleWindows*100:null,pendingScreenshots,
    provisional:pendingScreenshots>0,outcomes};
}
