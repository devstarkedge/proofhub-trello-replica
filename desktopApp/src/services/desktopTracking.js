export const DESKTOP_RESTART_MESSAGE='Restart FlowTask desktop completely to load the updated monitoring engine. Refreshing this page is not enough. Your work and attendance are saved on the server.';

export function normalizeDesktopTrackingStatus(status){
  // A refreshed preload/React page can be newer than its long-lived Electron
  // main process. Missing IPC handlers require a restart, not fake capture.
  if(status?.protocolVersion!==2||!status.capabilities?.retryUploads||!status.capabilities?.claimMonitoring)return {state:'update-required',error:DESKTOP_RESTART_MESSAGE,updateRequired:true};
  return status;
}

export function summarizeDesktopDevices(devices=[],sessionId){
  const connected=devices.filter(device=>device.connected);
  const monitoring=Boolean(sessionId&&connected.some(device=>device.state==='monitoring'&&String(device.activeSession)===String(sessionId)));
  const latest=devices.filter(device=>Number.isFinite(Date.parse(device.lastSeenAt))).sort((a,b)=>Date.parse(b.lastSeenAt)-Date.parse(a.lastSeenAt))[0];
  return {connected:connected.length>0,monitoring,
    needsAttention:!monitoring&&connected.some(device=>['unavailable','notice-required','permission-required'].includes(device.state)),
    lastSeenAt:latest?.lastSeenAt};
}

export async function stopDesktopCapture(){
  const tracking=window.flowtaskDesktop?.tracking;
  if(!tracking)return true;
  try{
    const status=normalizeDesktopTrackingStatus(await tracking.getStatus());
    if(status.updateRequired)throw new Error(DESKTOP_RESTART_MESSAGE);
    await tracking.stop();return true;
  }catch{
    window.dispatchEvent(new Event('flowtask:desktop-update-required'));
    // An outdated local bridge must not prevent authoritative Attendance
    // Check-Out or server-side Personal Pause from closing work authorization.
    return false;
  }
}
