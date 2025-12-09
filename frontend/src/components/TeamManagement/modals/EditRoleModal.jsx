import React, { memo, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, X, Check, AlertCircle, Loader2, Trash2 } from 'lucide-react';
import { PERMISSION_CATEGORIES } from '../../../store/roleStore';

/**
 * EditRoleModal Component
 * Modal for editing custom roles with permission selection
 * Only accessible by Admin users
 * System roles (admin, manager, employee, hr) cannot be edited
 */
const EditRoleModal = memo(({
  isOpen,
  isLoading,
  role,
  onSubmit,
  onDelete,
  onClose,
  existingRoleNames = []
}) => {
  // Form state
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [permissions, setPermissions] = useState({});
  const [errors, setErrors] = useState({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Initialize form when role changes
  useEffect(() => {
    if (role) {
      setRoleName(role.name || '');
      setRoleDescription(role.description || '');
      setPermissions(role.permissions || {});
      setErrors({});
      setShowDeleteConfirm(false);
    }
  }, [role]);

  // Handle permission toggle
  const handlePermissionToggle = useCallback((permissionKey) => {
    setPermissions(prev => ({
      ...prev,
      [permissionKey]: !prev[permissionKey]
    }));
  }, []);

  // Select all permissions in a category
  const handleSelectCategory = useCallback((categoryKey, selected) => {
    const category = PERMISSION_CATEGORIES[categoryKey];
    if (!category) return;
    
    setPermissions(prev => {
      const updated = { ...prev };
      category.permissions.forEach(perm => {
        updated[perm.key] = selected;
      });
      return updated;
    });
  }, []);

  // Check if all permissions in a category are selected
  const isCategorySelected = useCallback((categoryKey) => {
    const category = PERMISSION_CATEGORIES[categoryKey];
    if (!category) return false;
    return category.permissions.every(perm => permissions[perm.key]);
  }, [permissions]);

  // Validate form
  const validateForm = useCallback(() => {
    const newErrors = {};
    
    if (!roleName.trim()) {
      newErrors.roleName = 'Role name is required';
    } else if (roleName.trim().length < 2) {
      newErrors.roleName = 'Role name must be at least 2 characters';
    } else if (roleName.trim().length > 50) {
      newErrors.roleName = 'Role name cannot exceed 50 characters';
    } else {
      // Check for duplicate names (case-insensitive), excluding current role
      const normalizedName = roleName.trim().toLowerCase();
      const otherRoleNames = existingRoleNames.filter(name => 
        name.toLowerCase() !== role?.name?.toLowerCase()
      );
      
      if (otherRoleNames.some(name => name.toLowerCase() === normalizedName)) {
        newErrors.roleName = 'A role with this name already exists';
      }
    }
    
    if (roleDescription && roleDescription.length > 200) {
      newErrors.roleDescription = 'Description cannot exceed 200 characters';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [roleName, roleDescription, existingRoleNames, role]);

  // Handle form submission
  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    onSubmit(role._id, {
      name: roleName.trim(),
      description: roleDescription.trim(),
      permissions
    });
  }, [role, roleName, roleDescription, permissions, validateForm, onSubmit]);

  // Handle delete
  const handleDelete = useCallback(() => {
    if (onDelete && role) {
      onDelete(role._id);
    }
  }, [role, onDelete]);

  // Reset form on close
  const handleClose = useCallback(() => {
    setErrors({});
    setShowDeleteConfirm(false);
    onClose();
  }, [onClose]);

  // Count selected permissions
  const selectedPermissionsCount = Object.values(permissions).filter(Boolean).length;
  const totalPermissionsCount = Object.keys(PERMISSION_CATEGORIES).reduce(
    (acc, key) => acc + PERMISSION_CATEGORIES[key].permissions.length, 0
  );

  // Check if this is a system role
  const isSystemRole = role?.isSystem;

  if (!role) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
          onClick={() => !isLoading && handleClose()}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="relative bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden border border-white/20"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.9) 100%)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.05)'
            }}
          >
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-amber-600 to-orange-600 p-6 z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 backdrop-blur-sm rounded-xl">
                    <Shield className="text-white" size={24} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">Edit Role</h3>
                    <p className="text-white/80 text-sm">
                      {isSystemRole ? 'System roles cannot be modified' : 'Update role permissions'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => !isLoading && handleClose()}
                  disabled={isLoading}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50"
                >
                  <X size={24} className="text-white" />
                </button>
              </div>
            </div>

            {/* System Role Warning */}
            {isSystemRole && (
              <div className="mx-6 mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-center gap-2 text-amber-800">
                  <AlertCircle size={20} />
                  <span className="font-medium">System Role</span>
                </div>
                <p className="text-amber-700 text-sm mt-1">
                  This is a predefined system role. Its permissions cannot be modified to ensure system stability.
                </p>
              </div>
            )}

            {/* Form Content */}
            <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-180px)]">
              <div className="p-6 space-y-6">
                {/* Role Name */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Role Name *
                  </label>
                  <input
                    type="text"
                    value={roleName}
                    onChange={(e) => setRoleName(e.target.value)}
                    placeholder="e.g., Team Lead, Supervisor, Intern"
                    className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all ${
                      errors.roleName ? 'border-red-300 bg-red-50' : 'border-gray-300'
                    } ${isSystemRole ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    disabled={isLoading || isSystemRole}
                    maxLength={50}
                  />
                  {errors.roleName && (
                    <motion.p
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-sm text-red-600 flex items-center gap-1 mt-1"
                    >
                      <AlertCircle size={14} />
                      {errors.roleName}
                    </motion.p>
                  )}
                </div>

                {/* Role Description */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Description
                    <span className="text-gray-400 font-normal ml-1">(optional)</span>
                  </label>
                  <textarea
                    value={roleDescription}
                    onChange={(e) => setRoleDescription(e.target.value)}
                    placeholder="Brief description of this role's responsibilities..."
                    rows={2}
                    className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all resize-none ${
                      errors.roleDescription ? 'border-red-300 bg-red-50' : 'border-gray-300'
                    } ${isSystemRole ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    disabled={isLoading || isSystemRole}
                    maxLength={200}
                  />
                  <div className="flex justify-between mt-1">
                    {errors.roleDescription && (
                      <motion.p
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-sm text-red-600 flex items-center gap-1"
                      >
                        <AlertCircle size={14} />
                        {errors.roleDescription}
                      </motion.p>
                    )}
                    <span className="text-xs text-gray-400 ml-auto">
                      {roleDescription.length}/200
                    </span>
                  </div>
                </div>

                {/* Permissions Section */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <label className="block text-sm font-semibold text-gray-700">
                      Permissions
                    </label>
                    <span className="text-sm text-amber-600 font-medium">
                      {selectedPermissionsCount}/{totalPermissionsCount} selected
                    </span>
                  </div>

                  {/* Permission Categories */}
                  <div className="space-y-4">
                    {Object.entries(PERMISSION_CATEGORIES).map(([categoryKey, category]) => (
                      <div
                        key={categoryKey}
                        className={`bg-gray-50 rounded-xl p-4 border border-gray-200 ${isSystemRole ? 'opacity-75' : ''}`}
                      >
                        {/* Category Header */}
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-semibold text-gray-800">{category.label}</h4>
                          {!isSystemRole && (
                            <button
                              type="button"
                              onClick={() => handleSelectCategory(categoryKey, !isCategorySelected(categoryKey))}
                              className="text-sm text-amber-600 hover:text-amber-800 font-medium transition-colors"
                              disabled={isLoading}
                            >
                              {isCategorySelected(categoryKey) ? 'Deselect All' : 'Select All'}
                            </button>
                          )}
                        </div>

                        {/* Permission Checkboxes */}
                        <div className="space-y-2">
                          {category.permissions.map((permission) => (
                            <label
                              key={permission.key}
                              className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                                permissions[permission.key]
                                  ? 'bg-amber-100 border-2 border-amber-300'
                                  : 'bg-white border-2 border-transparent hover:bg-gray-100'
                              } ${(isLoading || isSystemRole) ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                              <div className="relative">
                                <input
                                  type="checkbox"
                                  checked={permissions[permission.key] || false}
                                  onChange={() => handlePermissionToggle(permission.key)}
                                  disabled={isLoading || isSystemRole}
                                  className="sr-only"
                                />
                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                                  permissions[permission.key]
                                    ? 'bg-amber-600 border-amber-600'
                                    : 'border-gray-300 bg-white'
                                }`}>
                                  {permissions[permission.key] && (
                                    <Check size={14} className="text-white" strokeWidth={3} />
                                  )}
                                </div>
                              </div>
                              <span className={`text-sm ${
                                permissions[permission.key] ? 'text-amber-800 font-medium' : 'text-gray-700'
                              }`}>
                                {permission.label}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Delete Section (only for custom roles) */}
                {!isSystemRole && onDelete && (
                  <div className="border-t border-gray-200 pt-6">
                    {!showDeleteConfirm ? (
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(true)}
                        className="flex items-center gap-2 text-red-600 hover:text-red-700 font-medium transition-colors"
                        disabled={isLoading}
                      >
                        <Trash2 size={18} />
                        Delete this role
                      </button>
                    ) : (
                      <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                        <p className="text-red-800 font-medium mb-3">
                          Are you sure you want to delete this role?
                        </p>
                        <p className="text-red-600 text-sm mb-4">
                          This action cannot be undone. Users with this role will need to be reassigned.
                        </p>
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => setShowDeleteConfirm(false)}
                            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                            disabled={isLoading}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleDelete}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center gap-2"
                            disabled={isLoading}
                          >
                            {isLoading ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <Trash2 size={16} />
                            )}
                            Delete Role
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isLoading}
                    className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-100 transition-colors font-semibold disabled:opacity-50"
                  >
                    {isSystemRole ? 'Close' : 'Cancel'}
                  </button>
                  {!isSystemRole && (
                    <button
                      type="submit"
                      disabled={isLoading || !roleName.trim()}
                      className="flex-1 px-6 py-3 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-xl hover:from-amber-700 hover:to-orange-700 transition-all shadow-lg shadow-amber-500/30 font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 size={20} className="animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Check size={20} />
                          Save Changes
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

EditRoleModal.displayName = 'EditRoleModal';

export default EditRoleModal;
