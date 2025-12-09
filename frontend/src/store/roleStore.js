import { create } from 'zustand';
import api from '../services/api';

/**
 * Permission definitions for UI rendering
 * Grouped by category with labels and keys
 */
export const PERMISSION_CATEGORIES = {
  creation: {
    label: '🔧 Creation Permissions',
    permissions: [
      { key: 'canCreateDepartment', label: 'Create departments' },
      { key: 'canCreateTask', label: 'Create tasks' },
      { key: 'canCreateProject', label: 'Create projects' },
      { key: 'canCreateAnnouncement', label: 'Create announcements' },
      { key: 'canCreateReminder', label: 'Create reminders' }
    ]
  },
  member: {
    label: '👥 Member Permissions',
    permissions: [
      { key: 'canAssignMembers', label: 'Assign members to tasks/projects/departments' }
    ]
  },
  delete: {
    label: '🗑️ Delete Permissions',
    permissions: [
      { key: 'canDeleteTasks', label: 'Delete tasks' },
      { key: 'canDeleteProjects', label: 'Delete projects' }
    ]
  }
};

/**
 * Get all permission keys as a flat array
 */
export const ALL_PERMISSION_KEYS = Object.values(PERMISSION_CATEGORIES)
  .flatMap(category => category.permissions.map(p => p.key));

/**
 * Default permissions object (all false)
 */
export const DEFAULT_PERMISSIONS = ALL_PERMISSION_KEYS.reduce((acc, key) => {
  acc[key] = false;
  return acc;
}, {});

/**
 * System roles that cannot be edited or deleted
 */
export const SYSTEM_ROLES = ['admin', 'manager', 'employee', 'hr'];

/**
 * Zustand store for roles and permissions management
 */
const useRoleStore = create((set, get) => ({
  // State
  roles: [],
  myPermissions: null,
  myRole: null,
  loading: false,
  error: null,
  initialized: false,

  /**
   * Load all roles from the server
   */
  loadRoles: async () => {
    try {
      set({ loading: true, error: null });
      const response = await api.get('/api/roles');
      const roles = response.data.data || [];
      set({ roles, loading: false, initialized: true });
      return roles;
    } catch (error) {
      console.error('Error loading roles:', error);
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  /**
   * Load current user's permissions
   */
  loadMyPermissions: async () => {
    try {
      set({ loading: true, error: null });
      const response = await api.get('/api/roles/my-permissions');
      const data = response.data.data;
      
      // Ensure all permission keys exist (fill missing with false)
      const normalizedPermissions = { ...DEFAULT_PERMISSIONS, ...data.permissions };
      
      set({
        myPermissions: normalizedPermissions,
        myRole: data.role,
        loading: false
      });
      return data;
    } catch (error) {
      console.error('Error loading permissions:', error);
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  /**
   * Create a new custom role
   */
  createRole: async (roleData) => {
    try {
      set({ loading: true, error: null });
      const response = await api.post('/api/roles', roleData);
      const newRole = response.data.data;
      
      set((state) => ({
        roles: [...state.roles, newRole],
        loading: false
      }));
      
      return newRole;
    } catch (error) {
      console.error('Error creating role:', error);
      set({ error: error.response?.data?.message || error.message, loading: false });
      throw error;
    }
  },

  /**
   * Update an existing role
   */
  updateRole: async (roleId, updates) => {
    try {
      set({ loading: true, error: null });
      const response = await api.put(`/api/roles/${roleId}`, updates);
      const updatedRole = response.data.data;
      
      set((state) => ({
        roles: state.roles.map(role =>
          role._id === roleId ? updatedRole : role
        ),
        loading: false
      }));
      
      return updatedRole;
    } catch (error) {
      console.error('Error updating role:', error);
      set({ error: error.response?.data?.message || error.message, loading: false });
      throw error;
    }
  },

  /**
   * Delete a role
   */
  deleteRole: async (roleId) => {
    try {
      set({ loading: true, error: null });
      await api.delete(`/api/roles/${roleId}`);
      
      // Remove role from state
      set((state) => ({
        roles: state.roles.filter(role => role._id !== roleId),
        loading: false
      }));
      
      return true;
    } catch (error) {
      console.error('Error deleting role:', error);
      set({ error: error.response?.data?.message || error.message, loading: false });
      throw error;
    }
  },

  /**
   * Initialize default roles (admin only)
   */
  initializeRoles: async () => {
    try {
      set({ loading: true, error: null });
      const response = await api.post('/api/roles/init');
      
      // Reload roles after initialization
      await get().loadRoles();
      
      return response.data;
    } catch (error) {
      console.error('Error initializing roles:', error);
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  /**
   * Check if current user has a specific permission
   */
  hasPermission: (permission) => {
    const { myPermissions, myRole } = get();
    
    // Admin always has all permissions
    if (myRole === 'admin') return true;
    
    if (!myPermissions) return false;
    return myPermissions[permission] === true;
  },

  /**
   * Check if current user has any of the specified permissions
   */
  hasAnyPermission: (...permissions) => {
    const { myPermissions, myRole } = get();
    
    // Admin always has all permissions
    if (myRole === 'admin') return true;
    
    if (!myPermissions) return false;
    return permissions.some(perm => myPermissions[perm] === true);
  },

  /**
   * Check if current user has all of the specified permissions
   */
  hasAllPermissions: (...permissions) => {
    const { myPermissions, myRole } = get();
    
    // Admin always has all permissions
    if (myRole === 'admin') return true;
    
    if (!myPermissions) return false;
    return permissions.every(perm => myPermissions[perm] === true);
  },

  /**
   * Check if current user is admin
   */
  isAdmin: () => {
    const { myRole } = get();
    return myRole === 'admin';
  },

  /**
   * Get roles for dropdown (excludes admin for non-admin users)
   */
  getRolesForDropdown: () => {
    const { roles, myRole } = get();
    
    // Admin can see all roles
    if (myRole === 'admin') {
      return roles.filter(role => role.isActive !== false);
    }
    
    // Non-admin users can't assign admin role
    return roles.filter(role => 
      role.slug !== 'admin' && role.isActive !== false
    );
  },

  /**
   * Check if a role is a system role
   */
  isSystemRole: (roleSlug) => {
    return SYSTEM_ROLES.includes(roleSlug?.toLowerCase());
  },

  /**
   * Reset store state
   */
  reset: () => set({
    roles: [],
    myPermissions: null,
    myRole: null,
    loading: false,
    error: null,
    initialized: false
  })
}));

export default useRoleStore;
