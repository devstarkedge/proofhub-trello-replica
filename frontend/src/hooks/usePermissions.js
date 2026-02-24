import { useEffect, useCallback, useMemo } from 'react';
import useRoleStore from '../store/roleStore';

/**
 * Custom hook for checking user permissions
 * Uses reactive Zustand selectors for proper re-rendering
 * 
 * @returns {Object} Permission check utilities
 */
const usePermissions = () => {
  // Subscribe to reactive state (these will cause re-renders)
  const myPermissions = useRoleStore((state) => state.myPermissions);
  const myRole = useRoleStore((state) => state.myRole);
  const loading = useRoleStore((state) => state.loading);
  const error = useRoleStore((state) => state.error);
  const loadMyPermissions = useRoleStore((state) => state.loadMyPermissions);

  // Enterprise ABAC Capabilities
  const capabilities = useRoleStore((state) => state.capabilities);
  const loadCapabilities = useRoleStore((state) => state.loadCapabilities);
  const hasCapability = useRoleStore((state) => state.hasCapability);

  // Load permissions on mount if not already loaded
  useEffect(() => {
    if (!myPermissions && !loading) {
      loadMyPermissions().catch(console.error);
    }
    if (!capabilities && !loading) {
      loadCapabilities().catch(console.error);
    }
  }, [myPermissions, capabilities, loading, loadMyPermissions, loadCapabilities]);

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
    // Enterprise ABAC Checks
    capabilities: capabilities || {},
    hasCapability,
    
    // Spread individual permission flags
    ...permissionFlags,
    
    // Refresh permissions
    refresh: async () => {
      await loadMyPermissions();
      await loadCapabilities();
    }
  };
};

export default usePermissions;
