import { useContext, useEffect, useCallback, useMemo } from 'react';
import useRoleStore from '../store/roleStore';
import AuthContext from '../context/AuthContext';
import WorkspaceContext from '../context/WorkspaceContext';

/**
 * Custom hook for checking user permissions
 * Uses reactive Zustand selectors for proper re-rendering
 * 
 * @returns {Object} Permission check utilities
 */
const usePermissions = () => {
  const { user } = useContext(AuthContext);
  const { currentWorkspace } = useContext(WorkspaceContext);
  const userId = user?._id || user?.id;
  const workspaceId = currentWorkspace?._id;
  // Subscribe to reactive state (these will cause re-renders)
  const myPermissions = useRoleStore((state) => state.myPermissions);
  const myRole = useRoleStore((state) => state.myRole);
  const loading = useRoleStore((state) => state.loading);
  const permissionsLoading = useRoleStore((state) => state.permissionsLoading);
  const permissionsError = useRoleStore((state) => state.permissionsError);
  const error = useRoleStore((state) => state.error);
  const loadMyPermissions = useRoleStore((state) => state.loadMyPermissions);

  // Load permissions on mount if not already loaded
  useEffect(() => {
    if (userId && workspaceId && !myPermissions && !permissionsLoading && !permissionsError) {
      loadMyPermissions().catch(console.error);
    }
  }, [userId, workspaceId, myPermissions, permissionsLoading, permissionsError, loadMyPermissions]);

  // An outage waits for an actual recovery signal, rather than retrying on
  // every failed render. Multiple consumers still share the same store flight.
  useEffect(() => {
    if (!userId || !workspaceId || myPermissions || !permissionsError) return;
    const retry = () => { loadMyPermissions().catch(console.error); };
    window.addEventListener('online', retry);
    window.addEventListener('socket-connected', retry);
    return () => {
      window.removeEventListener('online', retry);
      window.removeEventListener('socket-connected', retry);
    };
  }, [userId, workspaceId, myPermissions, permissionsError, loadMyPermissions]);

  // Check if user is admin
  const isAdmin = useMemo(() => myRole === 'admin', [myRole]);

  // Memoized permission check for single permission
  const can = useCallback((permission) => {
    if (myRole === 'admin') return true;
    if (!myPermissions) return false;
    return myPermissions[permission] === true;
  }, [myPermissions, myRole]);

  // Check multiple permissions (any)
  const canAny = useCallback((...permissions) => {
    if (myRole === 'admin') return true;
    if (!myPermissions) return false;
    return permissions.some(perm => myPermissions[perm] === true);
  }, [myPermissions, myRole]);

  // Check multiple permissions (all)
  const canAll = useCallback((...permissions) => {
    if (myRole === 'admin') return true;
    if (!myPermissions) return false;
    return permissions.every(perm => myPermissions[perm] === true);
  }, [myPermissions, myRole]);

  // Memoized individual permission flags
  const permissionFlags = useMemo(() => ({
    canCreateDepartment: isAdmin || myPermissions?.canCreateDepartment === true,
    canCreateTask: isAdmin || myPermissions?.canCreateTask === true,
    canCreateProject: isAdmin || myPermissions?.canCreateProject === true,
    canCreateAnnouncement: isAdmin || myPermissions?.canCreateAnnouncement === true,
    canCreateReminder: isAdmin || myPermissions?.canCreateReminder === true,
    canAssignMembers: isAdmin || myPermissions?.canAssignMembers === true,
    canDeleteTasks: isAdmin || myPermissions?.canDeleteTasks === true,
    canDeleteProjects: isAdmin || myPermissions?.canDeleteProjects === true,
    canEditPriority: isAdmin || myPermissions?.canEditPriority === true,
    canEditDates: isAdmin || myPermissions?.canEditDates === true,
    canManageAttachments: isAdmin || myPermissions?.canManageAttachments === true,
  }), [myPermissions, isAdmin]);

  return {
    // Permissions object
    permissions: myPermissions || {},
    role: myRole,
    loading,
    error,
    
    // Check functions
    can,
    canAny,
    canAll,
    isAdmin,

    // Spread individual permission flags
    ...permissionFlags,

    // Refresh permissions
    refresh: async () => {
      await loadMyPermissions();
    }
  };
};

export default usePermissions;
