import React, { memo, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, 
  Plus, 
  Edit2, 
  Trash2, 
  Users, 
  Lock, 
  Check, 
  X,
  ChevronRight,
  Settings,
  RefreshCw
} from 'lucide-react';
import useRoleStore, { PERMISSION_CATEGORIES, ALL_PERMISSION_KEYS, SYSTEM_ROLES } from '../../store/roleStore';
import useThemeStore from '../../store/themeStore';

/**
 * RoleManagementPanel Component
 * Displays all roles with their permissions
 * Allows Admin to create, edit, and delete custom roles
 */
const RoleManagementPanel = memo(({
  onCreateRole,
  onEditRole,
  onDeleteRole,
  isLoading
}) => {
  const { effectiveMode } = useThemeStore();
  const isDarkMode = effectiveMode === 'dark';

  // Use reactive selectors for proper re-rendering
  const roles = useRoleStore((state) => state.roles);
  const loadRoles = useRoleStore((state) => state.loadRoles);
  const initialized = useRoleStore((state) => state.initialized);
  const rolesLoading = useRoleStore((state) => state.loading);
  const [expandedRole, setExpandedRole] = useState(null);

  // Load roles on mount
  useEffect(() => {
    if (!initialized) {
      loadRoles().catch(console.error);
    }
  }, [initialized, loadRoles]);

  // Refresh roles
  const handleRefresh = useCallback(() => {
    loadRoles().catch(console.error);
  }, [loadRoles]);

  // Get role badge color
  const getRoleBadgeColor = (roleSlug, isSystem) => {
    if (isSystem) {
      const colors = {
        admin: 'from-red-500 to-red-600',
        manager: 'from-blue-500 to-blue-600',
        hr: 'from-purple-500 to-purple-600',
        employee: 'from-gray-500 to-gray-600'
      };
      return colors[roleSlug] || 'from-gray-500 to-gray-600';
    }
    return 'from-indigo-500 to-purple-600';
  };

  // Count permissions accurately against the full definition set
  const countPermissions = (permissions) => {
    const total = ALL_PERMISSION_KEYS.length;
    if (!permissions) return { enabled: 0, total };
    
    // Only count enabled permissions that exist in our current category definitions
    const enabled = ALL_PERMISSION_KEYS.filter(key => permissions[key] === true).length;
    return { enabled, total };
  };

  // System roles first, then custom roles
  const sortedRoles = [...roles].sort((a, b) => {
    if (a.isSystem && !b.isSystem) return -1;
    if (!a.isSystem && b.isSystem) return 1;
    return a.name.localeCompare(b.name);
  });

  const systemRoles = sortedRoles.filter(r => r.isSystem);
  const customRoles = sortedRoles.filter(r => !r.isSystem);

  return (
    <div className={`${isDarkMode ? 'bg-gray-800/80 backdrop-blur-sm border-gray-700' : 'bg-white border-gray-100'} rounded-2xl shadow-md border overflow-hidden`}>
      {/* Header */}
      <div className={`p-6 border-b ${isDarkMode ? 'border-gray-700 bg-gradient-to-r from-purple-900/30 via-indigo-900/30 to-blue-900/30' : 'border-gray-200 bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-xl shadow-lg">
              <Shield className="text-white" size={24} />
            </div>
            <div>
              <h2 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Role Management</h2>
              <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Manage roles and permissions</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={rolesLoading}
              className={`p-2 ${isDarkMode ? 'text-gray-400 hover:bg-gray-700 hover:text-gray-200' : 'text-gray-600 hover:bg-white hover:shadow-md'} rounded-lg transition-all disabled:opacity-50`}
              title="Refresh roles"
            >
              <RefreshCw size={20} className={rolesLoading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onCreateRole}
              disabled={isLoading}
              className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg shadow-purple-500/30 font-semibold flex items-center gap-2 disabled:opacity-50"
            >
              <Plus size={18} />
              Create Role
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* System Roles Section */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Lock size={16} className={isDarkMode ? 'text-gray-500' : 'text-gray-500'} />
            <h3 className={`font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>System Roles</h3>
            <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>(Cannot be modified)</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {systemRoles.map(role => (
              <RoleCard
                key={role._id || role.slug}
                role={role}
                isExpanded={expandedRole === role._id}
                onToggleExpand={() => setExpandedRole(expandedRole === role._id ? null : role._id)}
                onEdit={() => onEditRole(role)}
                onDelete={null}
                getRoleBadgeColor={getRoleBadgeColor}
                countPermissions={countPermissions}
                isDarkMode={isDarkMode}
              />
            ))}
          </div>
        </div>

        {/* Custom Roles Section */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Settings size={16} className="text-indigo-500" />
            <h3 className={`font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Custom Roles</h3>
            <span className={`px-2 py-0.5 ${isDarkMode ? 'bg-indigo-500/20 text-indigo-400' : 'bg-indigo-100 text-indigo-700'} rounded-full text-xs font-medium`}>
              {customRoles.length}
            </span>
          </div>
          {customRoles.length === 0 ? (
            <div className={`text-center py-12 ${isDarkMode ? 'bg-gray-700/50' : 'bg-gray-50'} rounded-xl border-2 border-dashed ${isDarkMode ? 'border-gray-600' : 'border-gray-200'}`}>
              <Shield size={48} className={`mx-auto mb-3 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
              <p className={`${isDarkMode ? 'text-gray-400' : 'text-gray-600'} font-medium`}>No custom roles yet</p>
              <p className={`text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-500'} mt-1`}>Create a new role to define custom permissions</p>
              <button
                onClick={onCreateRole}
                className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium inline-flex items-center gap-2"
              >
                <Plus size={16} />
                Create First Role
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {customRoles.map(role => (
                <RoleCard
                  key={role._id || role.slug}
                  role={role}
                  isExpanded={expandedRole === role._id}
                  onToggleExpand={() => setExpandedRole(expandedRole === role._id ? null : role._id)}
                  onEdit={() => onEditRole(role)}
                  onDelete={() => onDeleteRole(role)}
                  getRoleBadgeColor={getRoleBadgeColor}
                  countPermissions={countPermissions}
                  isDarkMode={isDarkMode}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

/**
 * RoleCard Component
 * Individual role card with expandable permissions
 */
const RoleCard = memo(({
  role,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  getRoleBadgeColor,
  countPermissions,
  isDarkMode = false
}) => {
  const { enabled, total } = countPermissions(role.permissions);
  const permissionPercentage = total > 0 ? Math.round((enabled / total) * 100) : 0;

  return (
    <motion.div
      layout
      className={`border rounded-xl overflow-hidden transition-all ${
        role.isSystem 
          ? isDarkMode ? 'border-gray-700 bg-gray-700/50' : 'border-gray-200 bg-gray-50'
          : isDarkMode ? 'border-indigo-500/30 bg-gray-800' : 'border-indigo-200 bg-white'
      }`}
    >
      {/* Card Header */}
      <div 
        className={`p-4 cursor-pointer transition-colors ${isDarkMode ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'}`}
        onClick={onToggleExpand}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-gradient-to-br ${getRoleBadgeColor(role.slug, role.isSystem)} shadow-md`}>
              <Shield className="text-white" size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{role.name}</h4>
                {role.isSystem && (
                  <span className={`px-2 py-0.5 ${isDarkMode ? 'bg-gray-600 text-gray-300' : 'bg-gray-200 text-gray-600'} rounded text-xs font-medium flex items-center gap-1`}>
                    <Lock size={10} />
                    System
                  </span>
                )}
              </div>
              {role.description && (
                <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'} mt-0.5 line-clamp-1`}>{role.description}</p>
              )}
            </div>
          </div>
          <ChevronRight 
            size={20} 
            className={`${isDarkMode ? 'text-gray-500' : 'text-gray-400'} transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          />
        </div>

        {/* Permission Summary Bar */}
        <div className="mt-3">
          <div className={`flex items-center justify-between text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'} mb-1`}>
            <span>{enabled} of {total} permissions enabled</span>
            <span>{permissionPercentage}%</span>
          </div>
          <div className={`h-2 ${isDarkMode ? 'bg-gray-600' : 'bg-gray-200'} rounded-full overflow-hidden`}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${permissionPercentage}%` }}
              className={`h-full rounded-full ${
                role.isSystem 
                  ? 'bg-gradient-to-r from-gray-400 to-gray-500' 
                  : 'bg-gradient-to-r from-indigo-500 to-purple-500'
              }`}
            />
          </div>
        </div>
      </div>

      {/* Expanded Permissions */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className={`border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}
          >
            <div className={`p-4 ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
              {/* Permission Categories */}
              <div className="space-y-4">
                {Object.entries(PERMISSION_CATEGORIES).map(([categoryKey, category]) => (
                  <div key={categoryKey}>
                    <h5 className={`text-xs font-semibold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wide mb-2`}>
                      {category.label}
                    </h5>
                    <div className="space-y-1">
                      {category.permissions.map(perm => {
                        const hasPermission = role.permissions?.[perm.key];
                        return (
                          <div 
                            key={perm.key}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
                              hasPermission 
                                ? isDarkMode ? 'bg-green-500/20 text-green-400' : 'bg-green-50 text-green-700'
                                : isDarkMode ? 'bg-gray-700/50 text-gray-500' : 'bg-gray-50 text-gray-500'
                            }`}
                          >
                            {hasPermission ? (
                              <Check size={14} className={isDarkMode ? 'text-green-400' : 'text-green-600'} />
                            ) : (
                              <X size={14} className={isDarkMode ? 'text-gray-500' : 'text-gray-400'} />
                            )}
                            <span>{perm.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              {!role.isSystem && (
                <div className={`flex items-center gap-2 mt-4 pt-4 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit();
                    }}
                    className={`flex-1 px-4 py-2 ${isDarkMode ? 'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'} rounded-lg transition-colors font-medium flex items-center justify-center gap-2`}
                  >
                    <Edit2 size={16} />
                    Edit Role
                  </button>
                  {onDelete && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                      }}
                      className={`px-4 py-2 ${isDarkMode ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-red-50 text-red-600 hover:bg-red-100'} rounded-lg transition-colors font-medium flex items-center justify-center gap-2`}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              )}

              {/* View Only for System Roles */}
              {role.isSystem && (
                <div className={`mt-4 pt-4 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit();
                    }}
                    className={`w-full px-4 py-2 ${isDarkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'} rounded-lg transition-colors font-medium flex items-center justify-center gap-2`}
                  >
                    <Shield size={16} />
                    View Permissions
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

RoleManagementPanel.displayName = 'RoleManagementPanel';
RoleCard.displayName = 'RoleCard';

export default RoleManagementPanel;

