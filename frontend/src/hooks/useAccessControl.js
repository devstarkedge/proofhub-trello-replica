import { useContext, useEffect, useCallback } from 'react';
import useAccessControlStore from '../store/accessControlStore';
import AuthContext from '../context/AuthContext';

/**
 * The one hook every component should use to answer "can this user see/do X".
 * Replaces the four separate ad hoc mechanisms that used to answer this
 * question differently (Sidebar's own fetches, FinanceRouteGuard's own
 * fetch, SalesPage's own fetch, scattered `user.role === 'admin'` checks).
 *
 * Loads once per session and stays live: it re-fetches whenever the admin
 * changes this user's access anywhere (Sales, Finance, role, or a delegated
 * access_control.manage grant) via the 'socket-access-control-updated',
 * 'socket-sales-permissions-updated', 'socket-finance-permissions-updated',
 * and 'socket-user-role-changed' events already pushed by the backend.
 */
const useAccessControl = () => {
  const { user } = useContext(AuthContext);
  const myPermissions = useAccessControlStore((state) => state.myPermissions);
  const registry = useAccessControlStore((state) => state.registry);
  const loading = useAccessControlStore((state) => state.loading);
  const loadMyPermissions = useAccessControlStore((state) => state.loadMyPermissions);
  const loadRegistry = useAccessControlStore((state) => state.loadRegistry);
  const can = useAccessControlStore((state) => state.can);
  const canAny = useAccessControlStore((state) => state.canAny);

  useEffect(() => {
    if (!user) return;
    if (!myPermissions && !loading) {
      loadMyPermissions().catch(() => {});
    }
    if (!registry) {
      loadRegistry().catch(() => {});
    }
  }, [user, myPermissions, registry, loading, loadMyPermissions, loadRegistry]);

  useEffect(() => {
    if (!user) return;

    const handleRefresh = (event) => {
      const detailUserId = event?.detail?.userId;
      // access-control:updated is targeted (userId in payload); the legacy
      // sales/finance events are also always targeted at one user.
      if (detailUserId && String(detailUserId) !== String(user._id)) return;
      loadMyPermissions().catch(() => {});
    };

    window.addEventListener('socket-access-control-updated', handleRefresh);
    window.addEventListener('socket-sales-permissions-updated', handleRefresh);
    window.addEventListener('socket-finance-permissions-updated', handleRefresh);
    window.addEventListener('socket-user-role-changed', handleRefresh);

    return () => {
      window.removeEventListener('socket-access-control-updated', handleRefresh);
      window.removeEventListener('socket-sales-permissions-updated', handleRefresh);
      window.removeEventListener('socket-finance-permissions-updated', handleRefresh);
      window.removeEventListener('socket-user-role-changed', handleRefresh);
    };
  }, [user, loadMyPermissions]);

  const isAdmin = Boolean(myPermissions?.isAdmin);
  const canManageAccessControl = Boolean(myPermissions?.canManageAccessControl);

  const resourceActions = useCallback(
    (resource) => registry?.resources?.[resource]?.actions || [],
    [registry]
  );

  return {
    myPermissions,
    registry,
    loading,
    isAdmin,
    canManageAccessControl,
    can,
    canAny,
    resourceActions,
    accessScope: myPermissions?.accessScope || { type: 'full_department', allowedProjects: [] },
    roleChecklist: myPermissions?.roleChecklist || {},
    refresh: async () => {
      await Promise.all([loadMyPermissions(), loadRegistry()]);
    }
  };
};

export default useAccessControl;
