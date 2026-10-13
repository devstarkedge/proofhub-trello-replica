import { useContext, useEffect, useCallback } from 'react';
import useAccessControlStore from '../store/accessControlStore';
import AuthContext from '../context/AuthContext';
import WorkspaceContext from '../context/WorkspaceContext';

/** Server-resolved workspace permissions, shared by permission consumers and editors. */
const useAccessControl = () => {
  const { user } = useContext(AuthContext);
  const { currentWorkspace } = useContext(WorkspaceContext);
  const myPermissions = useAccessControlStore((state) => state.myPermissions);
  const registry = useAccessControlStore((state) => state.registry);
  const loading = useAccessControlStore((state) => state.loading);
  const registryLoading = useAccessControlStore((state) => state.registryLoading);
  const error = useAccessControlStore((state) => state.error);
  const registryError = useAccessControlStore((state) => state.registryError);
  const loadMyPermissions = useAccessControlStore((state) => state.loadMyPermissions);
  const loadRegistry = useAccessControlStore((state) => state.loadRegistry);
  const can = useAccessControlStore((state) => state.can);
  const canAny = useAccessControlStore((state) => state.canAny);
  const refresh = useAccessControlStore((state) => state.refresh);
  const refreshAfterEvent = useAccessControlStore((state) => state.refreshAfterEvent);

  useEffect(() => {
    if (!user || !currentWorkspace?._id) return;
    if (!myPermissions && !loading && !error) loadMyPermissions().catch(() => {});
    if (!registry && !registryLoading && !registryError) loadRegistry().catch(() => {});
  }, [user, currentWorkspace?._id, myPermissions, registry, loading, registryLoading, error, registryError, loadMyPermissions, loadRegistry]);

  useEffect(() => {
    if (!user || !currentWorkspace?._id) return;
    const handleRefresh = (event) => {
      if (event?.detail?.userId && String(event.detail.userId) !== String(user._id || user.id)) return;
      if (event?.detail?.workspaceId && String(event.detail.workspaceId) !== String(currentWorkspace._id)) return;
      refreshAfterEvent(event).catch(() => {});
    };
    const events = ['socket-access-control-updated', 'socket-sales-permissions-updated', 'socket-finance-permissions-updated', 'socket-user-role-changed', 'socket-authz-changed'];
    events.forEach((name) => window.addEventListener(name, handleRefresh));
    return () => events.forEach((name) => window.removeEventListener(name, handleRefresh));
  }, [user, currentWorkspace?._id, refreshAfterEvent]);

  const resourceActions = useCallback((resource) => registry?.resources?.[resource]?.actions || [], [registry]);
  return {
    myPermissions, registry, loading, registryLoading, error, registryError, can, canAny, resourceActions, refresh,
    isAdmin: Boolean(myPermissions?.isAdmin),
    canManageAccessControl: Boolean(myPermissions?.canManageAccessControl),
    accessScope: myPermissions?.accessScope || { type: 'full_department', allowedProjects: [] },
    roleChecklist: myPermissions?.roleChecklist || {}
  };
};
export default useAccessControl;
