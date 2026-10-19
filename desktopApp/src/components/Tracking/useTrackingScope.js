import { useContext, useEffect, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import WorkspaceContext from '../../context/WorkspaceContext';
import AuthContext from '../../context/AuthContext';
import { screenshotCache } from '../../services/screenshotCache';

export default function useTrackingScope() {
  const { currentWorkspace } = useContext(WorkspaceContext) || {}, { user } = useContext(AuthContext) || {};
  const manager = screenshotCache(useQueryClient());
  const epoch = useSyncExternalStore(manager.subscribe, manager.snapshot);
  const identity = [currentWorkspace?._id || '', user?._id || user?.id || '', JSON.stringify([
    user?.role, user?.roleId, user?.department, user?.permissionsVersion, currentWorkspace?.permissionsRevision
  ])].join(':');
  useEffect(() => { manager.identity(identity); }, [manager, identity]);
  return `${identity}:${epoch}`;
}
