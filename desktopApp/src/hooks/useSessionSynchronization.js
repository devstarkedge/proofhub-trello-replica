import {useContext,useLayoutEffect} from 'react';
import AuthContext from '../context/AuthContext';
import WorkspaceContext from '../context/WorkspaceContext';
import {retainSessionSynchronization} from '../services/sessionSynchronization';
export default function useSessionSynchronization(){
  const auth=useContext(AuthContext)||{},{currentWorkspace}=useContext(WorkspaceContext)||{};
  const userId=auth.user?._id||auth.user?.id,workspaceId=currentWorkspace?._id,scope=`${workspaceId||''}:${userId||''}`;
  const authorizationKey=JSON.stringify([auth.token,auth.user?.role,auth.user?.roleId,auth.user?.department,auth.user?.permissionsVersion,currentWorkspace?.permissionsRevision]);
  useLayoutEffect(()=>{if(userId&&workspaceId)return retainSessionSynchronization(scope,workspaceId,authorizationKey);},[scope,userId,workspaceId,authorizationKey]);
  return {scope,workspaceId,userId};
}
