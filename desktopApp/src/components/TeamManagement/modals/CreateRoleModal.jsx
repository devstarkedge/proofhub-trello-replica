import { memo, useState, useCallback, useRef, useId } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import RolePermissionChecklist from '../../AccessControl/RolePermissionChecklist';
import useModalFocus from '../../../hooks/useModalFocus';
import { Shield, X, AlertCircle, Loader2, Zap } from 'lucide-react';
import { PERMISSION_CATEGORIES, DEFAULT_PERMISSIONS, SYSTEM_ROLE_PERMISSIONS } from '../../../store/roleStore';

/**
 * CreateRoleModal Component
 * Modal for creating new custom roles with permission selection
 * Only accessible by Admin users
 */
const CreateRoleModal = memo(({
  isOpen,
  isLoading,
  onSubmit,
  onClose,
  existingRoleNames = []
}) => {
  const dialogRef = useRef(null);
  const titleId = useId();
  // Form state
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [permissions, setPermissions] = useState({ ...DEFAULT_PERMISSIONS });
  const [selectedPreset, setSelectedPreset] = useState('custom');
  const [errors, setErrors] = useState({});

  // Handle permission toggle
  const handlePermissionToggle = useCallback((permissionKey) => {
    setPermissions(prev => ({
      ...prev,
      [permissionKey]: !prev[permissionKey]
    }));
    setSelectedPreset('custom'); // Switch to custom if manually toggling
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
    setSelectedPreset('custom'); // Switch to custom if manually using category select
  }, []);

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
      // Check for duplicate names (case-insensitive)
      const normalizedName = roleName.trim().toLowerCase();
      const systemRoles = ['admin', 'manager', 'employee', 'hr'];
      
      if (systemRoles.includes(normalizedName)) {
        newErrors.roleName = 'Cannot use a system role name';
      } else if (existingRoleNames.some(name => name.toLowerCase() === normalizedName)) {
        newErrors.roleName = 'A role with this name already exists';
      }
    }
    
    if (roleDescription && roleDescription.length > 200) {
      newErrors.roleDescription = 'Description cannot exceed 200 characters';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [roleName, roleDescription, existingRoleNames]);

  // Handle form submission
  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    onSubmit({
      name: roleName.trim(),
      description: roleDescription.trim(),
      permissions
    });
  }, [roleName, roleDescription, permissions, validateForm, onSubmit]);

    // Reset form on close
    const handleClose = useCallback(() => {
    setRoleName('');
    setRoleDescription('');
    setPermissions({ ...DEFAULT_PERMISSIONS });
    setSelectedPreset('custom');
    setErrors({});
    onClose();
  }, [onClose]);

  useModalFocus({ open: isOpen, dialogRef, onClose: handleClose, blocked: isLoading });

  // Handle Preset Selection
  const handlePresetChange = useCallback((preset) => {
    setSelectedPreset(preset);
    if (preset === 'custom') {
      // Keep current permissions
      return;
    }
    
    // Apply preset permissions
    if (SYSTEM_ROLE_PERMISSIONS[preset]) {
      setPermissions({ ...SYSTEM_ROLE_PERMISSIONS[preset] });
    }
  }, []);

  // Count selected permissions
  const selectedPermissionsCount = Object.values(permissions).filter(Boolean).length;
  const totalPermissionsCount = Object.keys(permissions).length;

  return (
    <AnimatePresence>
      {isOpen && (
        <Motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
          onClick={() => !isLoading && handleClose()}
        >
          <Motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onClick={(e) => e.stopPropagation()}
            className="relative bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden border border-white/20"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.9) 100%)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.05)'
            }}
          >
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-indigo-600 p-6 z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 backdrop-blur-sm rounded-xl">
                    <Shield className="text-white" size={24} />
                  </div>
                  <div>
                    <h3 id={titleId} className="text-2xl font-bold text-white">Create New Role</h3>
                    <p className="text-white/80 text-sm">Define custom permissions for this role</p>
                  </div>
                </div>
                <button
                  aria-label="Close role editor" onClick={() => !isLoading && handleClose()}
                  disabled={isLoading}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50"
                >
                  <X size={24} className="text-white" />
                </button>
              </div>
            </div>

            {/* Form Content */}
            <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-180px)]">
              <div className="p-6 space-y-6">
                {/* Role Name */}
                <div>
                  <label htmlFor={`${titleId}-name`} className="block text-sm font-semibold text-gray-700 mb-2">
                    Role Name *
                  </label>
                  <input
                    type="text"
                    id={`${titleId}-name`} aria-label="Role name" value={roleName}
                    onChange={(e) => setRoleName(e.target.value)}
                    placeholder="e.g., Team Lead, Supervisor, Intern"
                    className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all ${
                      errors.roleName ? 'border-red-300 bg-red-50' : 'border-gray-300'
                    }`}
                    disabled={isLoading}
                    maxLength={50}
                  />
                  {errors.roleName && (
                    <Motion.p
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-sm text-red-600 flex items-center gap-1 mt-1"
                    >
                      <AlertCircle size={14} />
                      {errors.roleName}
                    </Motion.p>
                  )}
                </div>

                {/* Role Description */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Description
                    <span className="text-gray-400 font-normal ml-1">(optional)</span>
                  </label>
                  <textarea
                    id={`${titleId}-description`} aria-label="Role description" value={roleDescription}
                    onChange={(e) => setRoleDescription(e.target.value)}
                    placeholder="Brief description of this role's responsibilities..."
                    rows={2}
                    className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all resize-none ${
                      errors.roleDescription ? 'border-red-300 bg-red-50' : 'border-gray-300'
                    }`}
                    disabled={isLoading}
                    maxLength={200}
                  />
                  <div className="flex justify-between mt-1">
                    {errors.roleDescription && (
                      <Motion.p
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-sm text-red-600 flex items-center gap-1"
                      >
                        <AlertCircle size={14} />
                        {errors.roleDescription}
                      </Motion.p>
                    )}
                    <span className="text-xs text-gray-400 ml-auto">
                      {roleDescription.length}/200
                    </span>
                  </div>
                </div>

                {/* Role Power Presets */}
                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <Zap size={16} className="text-amber-500 fill-amber-500" />
                    Role Power Presets
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {['admin', 'manager', 'employee', 'custom'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handlePresetChange(preset)} disabled={isLoading}
                        className={`px-4 py-3 rounded-xl border transition-all flex flex-col items-center gap-2 ${
                          selectedPreset === preset
                            ? 'bg-purple-50 border-purple-500 text-purple-700 shadow-sm ring-1 ring-purple-500'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-purple-200 hover:bg-purple-50/50'
                        }`}
                      >
                        <span className="font-semibold capitalize">{preset}</span>
                        <span className="text-xs text-center opacity-70">
                          {preset === 'admin' && 'Full access'}
                          {preset === 'manager' && 'Manage team'}
                          {preset === 'employee' && 'Standard access'}
                          {preset === 'custom' && 'Manual setup'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Permissions Section */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <label className="block text-sm font-semibold text-gray-700">
                      Select Permissions
                    </label>
                    <span className="text-sm text-purple-600 font-medium">
                      {selectedPermissionsCount}/{totalPermissionsCount} selected
                    </span>
                  </div>

                  <RolePermissionChecklist categories={PERMISSION_CATEGORIES} permissions={permissions}
                    onToggle={handlePermissionToggle} onSelectCategory={handleSelectCategory} disabled={isLoading} />
                </div>
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
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading || !roleName.trim()}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg shadow-purple-500/30 font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 size={20} className="animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Shield size={20} />
                        Create Role
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </Motion.div>
        </Motion.div>
      )}
    </AnimatePresence>
  );
});

CreateRoleModal.displayName = 'CreateRoleModal';

export default CreateRoleModal;
