import { useContext, useEffect, useState, useRef } from 'react';
import AuthContext from '../../context/AuthContext';
import WorkspaceContext from '../../context/WorkspaceContext';
import DesktopMonitoringNotice from './DesktopMonitoringNotice';
import {trackingStore} from '../../services/trackingState';
import api from '../../services/api';
import {sessionIdentity,isCurrentSession} from '../../../../shared/sessionTransport.mjs';

export default function DesktopTrackingBridge() {
  const { user, token, isAuthenticated } = useContext(AuthContext);
  const { currentWorkspace } = useContext(WorkspaceContext) || {};
  const userId = user?._id || user?.id, workspaceId = currentWorkspace?._id;
  const isDesktop=window.flowtaskDesktop?.isDesktop===true;
  const [status,setStatus]=useState(null);
  const lastAutomaticReceipt=useRef('');
  const lastAuthRecovery=useRef({});
  const lastMonitoringConnection=useRef({});
  useEffect(()=>{
    const scope=`${workspaceId}:${userId}`;
    const scoped=isAuthenticated&&String(status?.userId)===String(userId)&&String(status?.workspaceId)===String(workspaceId);
    const healthy=scoped&&['monitoring','paused','ready','disabled'].includes(status?.state)&&!status?.error&&!status?.errorCode;
    const previous=lastMonitoringConnection.current;
    lastMonitoringConnection.current={scope,healthy};
    // Refresh server diagnostics as soon as native monitoring recovers, so a
    // stale session-read error does not keep Needs attention visible.
    if(healthy&&(!previous.healthy||previous.scope!==scope))void trackingStore(scope,workspaceId).reload();
  },[isAuthenticated,userId,workspaceId,status?.state,status?.error,status?.errorCode,status?.userId,status?.workspaceId]);
  useEffect(()=>{
    if(!isDesktop||!isAuthenticated||!userId||!workspaceId||status?.errorCode!=='ACCESS_REFRESH_REQUIRED')return;
    if(String(status.userId)!==String(userId)||String(status.workspaceId)!==String(workspaceId))return;
    if(lastAuthRecovery.current.inFlight)return;
    if(lastAuthRecovery.current.token===token&&Date.now()-lastAuthRecovery.current.at<20000)return;
    lastAuthRecovery.current={token,at:Date.now(),inFlight:true};
    const identity=sessionIdentity(localStorage);
    api.refreshAccessToken().then(async nextToken=>{
      if(!isCurrentSession(identity,localStorage))return;
      lastAuthRecovery.current.token=nextToken;
      const tracking=window.flowtaskDesktop?.tracking;
      await tracking?.configure({userId,workspaceId,token:nextToken});
      if(isCurrentSession(identity,localStorage))await tracking?.refresh();
    }).catch(()=>{/* Keep encrypted pending evidence; bounded native sync retries recovery. */})
      .finally(()=>{lastAuthRecovery.current.inFlight=false;});
  },[isDesktop,isAuthenticated,userId,workspaceId,token,status]);
  useEffect(()=>{
    const receipt=status?.workTransition;
    if(!isAuthenticated||!receipt||String(receipt.workspaceId)!==String(workspaceId)||String(receipt.userId)!==String(userId))return;
    const key=`${workspaceId}:${userId}:${receipt.operationId}`;
    if(lastAutomaticReceipt.current===key)return;
    lastAutomaticReceipt.current=key;
    trackingStore(`${workspaceId}:${userId}`,workspaceId).apply(receipt);
  },[status?.workTransition,isAuthenticated,userId,workspaceId]);
  useEffect(()=>{
    const tracking=window.flowtaskDesktop?.tracking;if(!isDesktop||!tracking)return;
    let live=true,received=false;
    const stop=tracking.onStatus(value=>{received=true;if(live)setStatus(value);});
    tracking.getStatus().then(value=>{if(live&&!received)setStatus(value);}).catch(()=>{});
    return()=>{live=false;stop?.();};
  },[isDesktop]);
  useEffect(() => {
    const tracking = window.flowtaskDesktop?.tracking;
    if (!isDesktop||!tracking) return;
    tracking.configure(isAuthenticated && userId && workspaceId && token ? { userId,workspaceId,token } : null).catch(()=>{});
    const refresh = event => {
      if(event.type==='online'){tracking.refresh().then(()=>tracking.retryUploads?.()).catch(()=>{});return;}
      if(event.detail?.type==='tracking:policy-updated'&&event.detail?.payload?.enabled===false)tracking.policyChanged?.(event.detail.payload).catch(()=>{});
      if (event.type !== 'flowtask:realtime' || /^(tracking:|attendance:)/.test(event.detail?.type || '')) tracking.refresh().catch(()=>{});
    };
    window.addEventListener('flowtask:realtime',refresh);window.addEventListener('flowtask:tracking-refresh',refresh);
    window.addEventListener('online',refresh);
    return () => { window.removeEventListener('flowtask:realtime',refresh);window.removeEventListener('flowtask:tracking-refresh',refresh);window.removeEventListener('online',refresh); };
  },[isDesktop,isAuthenticated,userId,workspaceId,token]);
  const scoped=status?.userId===String(userId)&&status?.workspaceId===String(workspaceId)&&isAuthenticated?status:null;
  return isDesktop?<DesktopMonitoringNotice status={scoped}/>:null;
}
