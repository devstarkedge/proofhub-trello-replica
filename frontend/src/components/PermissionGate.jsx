import React, { memo, useMemo } from 'react';
import useRoleStore from '../store/roleStore';

/**
 * PermissionGate Component
 * Conditionally renders children based on user permissions
 * 
 * @param {Object} props
 * @param {string|string[]} props.permission - Required permission(s) to render children
 * @param {string} props.mode - 'any' (default) or 'all' - how to check multiple permissions
 * @param {React.ReactNode} props.children - Content to render if permission check passes
 * @param {React.ReactNode} props.fallback - Content to render if permission check fails (optional)
 * 
 * @example
 * // Single permission
 * <PermissionGate permission="canCreateProject">
 *   <CreateProjectButton />
 * </PermissionGate>
 * 
 * @example
 * // Multiple permissions (any)
 * <PermissionGate permission={['canCreateProject', 'canCreateTask']} mode="any">
 *   <CreateButton />
 * </PermissionGate>
 * 
 * @example
 * // Multiple permissions (all)
 * <PermissionGate permission={['canDeleteProject', 'canAssignMembers']} mode="all">
 *   <AdminPanel />
 * </PermissionGate>
 * 
 * @example
 * // With fallback
 * <PermissionGate permission="canDeleteProject" fallback={<DisabledButton />}>
 *   <DeleteButton />
 * </PermissionGate>
 */
const PermissionGate = memo(({
  permission,
  mode = 'any',
  children,
  fallback = null
}) => {
  // Subscribe to reactive state directly (this will cause re-renders when state changes)
  const myPermissions = useRoleStore((state) => state.myPermissions);
  const myRole = useRoleStore((state) => state.myRole);
  
  // Compute access based on current state
  const hasAccess = useMemo(() => {
    // Admin always has access
    if (myRole === 'admin') {
      return true;
    }
    
    // No permissions loaded yet - deny access
    if (!myPermissions) {
      return false;
    }
    
    // Convert single permission to array
    const permissions = Array.isArray(permission) ? permission : [permission];
    
    // Check permissions based on mode
    if (mode === 'all') {
      return permissions.every(perm => myPermissions[perm] === true);
    } else {
      // 'any' mode
      return permissions.some(perm => myPermissions[perm] === true);
    }
  }, [myPermissions, myRole, permission, mode]);
  
  if (hasAccess) {
    return <>{children}</>;
  }
  
  return <>{fallback}</>;
});

PermissionGate.displayName = 'PermissionGate';

/**
 * Higher-Order Component for permission-based rendering
 * Wraps a component to only render if user has required permissions
 * 
 * @param {React.ComponentType} WrappedComponent - Component to wrap
 * @param {string|string[]} permission - Required permission(s)
 * @param {string} mode - 'any' or 'all'
 * @param {React.ReactNode} fallback - Fallback component
 * @returns {React.ComponentType}
 * 
 * @example
 * const ProtectedButton = withPermission(DeleteButton, 'canDeleteProject');
 * <ProtectedButton onClick={handleDelete} />
 */
export const withPermission = (
  WrappedComponent,
  permission,
  mode = 'any',
  fallback = null
) => {
  const WithPermissionComponent = (props) => (
    <PermissionGate permission={permission} mode={mode} fallback={fallback}>
      <WrappedComponent {...props} />
    </PermissionGate>
  );
  
  WithPermissionComponent.displayName = `withPermission(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;
  
  return WithPermissionComponent;
};

export default PermissionGate;
