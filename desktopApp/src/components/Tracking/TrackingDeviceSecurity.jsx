import {useState} from 'react';
import useWorkTracking from '../../hooks/useWorkTracking';
import {getAgentRelease,revokeDevice,errorMessage} from '../../services/trackingApi';
import {Button} from '../ui/button';

export default function TrackingDeviceSecurity(){
  const {state,reload}=useWorkTracking();
  const [release,setRelease]=useState(null),[confirm,setConfirm]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  if(!state)return null;
  const revoke=async deviceId=>{setBusy(true);setError('');try{await revokeDevice(deviceId);await window.flowtaskDesktop?.tracking?.refresh();await reload();setConfirm(null);}catch(e){setError(errorMessage(e));}finally{setBusy(false);}};
  return <section className="rounded-xl border p-6 space-y-3" style={{backgroundColor:'var(--color-card-bg)',color:'var(--color-text-primary)',borderColor:'var(--color-border-default)'}}>
    <h2 className="text-lg font-semibold">Desktop access and updates</h2>
    <p className="text-sm">Your desktops in this workspace. Revoking a device stops its capture authorization. Workspace Admin manages monitoring settings in Workspace Settings.</p>
    {!state.devices.length&&<p className="text-sm">No authorized desktop devices.</p>}
    {state.devices.map(device=><div key={device._id} className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"><div><p className="font-medium">{device.name} · {device.platform}</p><p className="text-xs">{device.connected?'Connected':'Disconnected'} · Last seen {device.lastSeenAt?new Date(device.lastSeenAt).toLocaleString():'unknown'}</p></div>{confirm?.workspaceId===String(state.workspaceId)&&confirm?.deviceId===device._id?<div className="flex items-center gap-2"><span className="text-sm">Revoke this desktop?</span><Button size="sm" variant="outline" disabled={busy} onClick={()=>setConfirm(null)}>Cancel</Button><Button size="sm" disabled={busy} onClick={()=>revoke(device._id)}>Confirm revoke</Button></div>:<Button size="sm" variant="outline" onClick={()=>setConfirm({workspaceId:String(state.workspaceId),deviceId:device._id})}>Revoke access</Button>}</div>)}
    <Button variant="outline" onClick={async()=>{try{setRelease(await getAgentRelease());}catch(e){setError(errorMessage(e));}}}>Check desktop updates</Button>
    {release&&<p className="text-sm">{release.configured?<><a className="underline" href={release.downloadUrl} target="_blank" rel="noreferrer">Download desktop {release.version}</a></>:'No desktop release link is configured.'}</p>}
    {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
  </section>;
}
