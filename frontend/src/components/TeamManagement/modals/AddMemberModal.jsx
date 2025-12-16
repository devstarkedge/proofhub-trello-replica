import React, { memo, useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, X, User, Mail, Eye, EyeOff, XCircle, Shield, Plus, ChevronDown } from 'lucide-react';
import useRoleStore, { SYSTEM_ROLES } from '../../../store/roleStore';

/**
 * AddMemberModal Component
 * Updated modal for adding a new member to the department
 * Includes support for custom roles and Add New Role option (Admin only)
 */
const AddMemberModal = memo(({
  isOpen,
  isLoading,
  formData,
  errors,
  showPassword,
  onFormDataChange,
  onShowPasswordToggle,
  onSubmit,
  onClose,
  onAddNewRole,
  currentUserRole
}) => {
  // Use reactive selectors for proper re-rendering
  const roles = useRoleStore((state) => state.roles);
  const loadRoles = useRoleStore((state) => state.loadRoles);
  const initialized = useRoleStore((state) => state.initialized);
  const myRole = useRoleStore((state) => state.myRole);
  
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [rolesLoading, setRolesLoading] = useState(false);

  const isAdmin = currentUserRole?.toLowerCase() === 'admin' || myRole === 'admin';

  // Load roles when modal opens
  useEffect(() => {
    if (isOpen && !initialized) {
      setRolesLoading(true);
      loadRoles()
        .catch(console.error)
        .finally(() => setRolesLoading(false));
    }
  }, [isOpen, initialized, loadRoles]);

  // Get available roles for dropdown - memoized
  const availableRoles = useMemo(() => {
    // Admin can see all roles
    if (isAdmin) {
      return roles.filter(role => role.isActive !== false);
    }
    // Non-admin users can't assign admin role
    return roles.filter(role => 
      role.slug !== 'admin' && role.isActive !== false
    );
  }, [roles, isAdmin]);

  // Get display name for selected role
  const getSelectedRoleDisplay = useCallback(() => {
    if (!formData.role) return 'Select Role';
    const role = roles.find(r => r.slug === formData.role.toLowerCase());
    return role ? role.name : formData.role.charAt(0).toUpperCase() + formData.role.slice(1);
  }, [formData.role, roles]);

  // Handle role selection
  const handleRoleSelect = useCallback((roleSlug) => {
    onFormDataChange({ role: roleSlug });
    setIsRoleDropdownOpen(false);
  }, [onFormDataChange]);

  // Handle Add New Role click
  const handleAddNewRoleClick = useCallback(() => {
    setIsRoleDropdownOpen(false);
    if (onAddNewRole) {
      onAddNewRole();
    }
  }, [onAddNewRole]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (isRoleDropdownOpen && !e.target.closest('.role-dropdown-container')) {
        setIsRoleDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isRoleDropdownOpen]);

  // Get role badge color
  const getRoleBadgeColor = (roleSlug) => {
    const colors = {
      admin: 'bg-red-100 text-red-700',
      manager: 'bg-blue-100 text-blue-700',
      hr: 'bg-purple-100 text-purple-700',
      employee: 'bg-gray-100 text-gray-700'
    };
    return colors[roleSlug?.toLowerCase()] || 'bg-indigo-100 text-indigo-700';
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => !isLoading && onClose()}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="relative bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-white/20"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.8) 100%)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.05)'
            }}
          >
            <div className="sticky top-0 bg-gradient-to-r from-green-600 to-blue-600 p-4 sm:p-6 rounded-t-3xl z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 backdrop-blur-sm rounded-xl">
                    <UserPlus className="text-white" size={24} />
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-white">Add New Member</h3>
                </div>
                <button
                  onClick={() => !isLoading && onClose()}
                  disabled={isLoading}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50"
                >
                  <X size={24} className="text-white" />
                </button>
              </div>
            </div>

            <form onSubmit={onSubmit} className="p-4 sm:p-6 space-y-6">
              {/* Full Name Field */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Full Name *
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => onFormDataChange({ name: e.target.value })}
                    placeholder="Enter full name"
                    className={`w-full pl-10 pr-4 py-4 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all ${
                      errors.name ? 'border-red-300 bg-red-50' : 'border-gray-300'
                    }`}
                    required
                    disabled={isLoading}
                  />
                </div>
                {errors.name && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-sm text-red-600 flex items-center gap-1 mt-1"
                  >
                    <XCircle size={14} />
                    {errors.name}
                  </motion.p>
                )}
              </div>

              {/* Email Field */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Email Address *
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => onFormDataChange({ email: e.target.value })}
                    placeholder="Enter email address"
                    className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all ${
                      errors.email ? 'border-red-300 bg-red-50' : 'border-gray-300'
                    }`}
                    required
                    disabled={isLoading}
                  />
                </div>
                {errors.email && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-sm text-red-600 flex items-center gap-1 mt-1"
                  >
                    <XCircle size={14} />
                    {errors.email}
                  </motion.p>
                )}
              </div>

              {/* Password Field */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Password *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => onFormDataChange({ password: e.target.value })}
                    placeholder="Enter password (min 6 characters)"
                    className={`w-full pl-4 pr-12 py-4 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all ${
                      errors.password ? 'border-red-300 bg-red-50' : 'border-gray-300'
                    }`}
                    required
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={onShowPasswordToggle}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    disabled={isLoading}
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                {errors.password && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-sm text-red-600 flex items-center gap-1 mt-1"
                  >
                    <XCircle size={14} />
                    {errors.password}
                  </motion.p>
                )}
              </div>

              {/* Role Selection - Custom Dropdown */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  <div className="flex items-center gap-2">
                    <Shield size={16} />
                    Role
                  </div>
                </label>
                
                <div className="relative role-dropdown-container">
                  <button
                    type="button"
                    onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
                    disabled={isLoading || rolesLoading}
                    className={`w-full px-4 py-4 border rounded-lg text-left flex items-center justify-between transition-all ${
                      isRoleDropdownOpen
                        ? 'ring-2 ring-green-500 border-transparent'
                        : 'border-gray-300 hover:border-gray-400'
                    } ${(isLoading || rolesLoading) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div className="flex items-center gap-2">
                      {formData.role && (
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getRoleBadgeColor(formData.role)}`}>
                          {getSelectedRoleDisplay()}
                        </span>
                      )}
                      {!formData.role && (
                        <span className="text-gray-500">Select Role</span>
                      )}
                    </div>
                    <ChevronDown 
                      size={20} 
                      className={`text-gray-400 transition-transform ${isRoleDropdownOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {/* Dropdown Menu */}
                  <AnimatePresence>
                    {isRoleDropdownOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden"
                      >
                        <div className="max-h-64 overflow-y-auto">
                          {/* System Roles Section */}
                          <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              System Roles
                            </span>
                          </div>
                          {availableRoles
                            .filter(role => role.isSystem)
                            .map(role => (
                              <button
                                key={role._id || role.slug}
                                type="button"
                                onClick={() => handleRoleSelect(role.slug)}
                                className={`w-full px-4 py-4 text-left hover:bg-gray-50 flex items-center justify-between transition-colors ${
                                  formData.role?.toLowerCase() === role.slug ? 'bg-green-50' : ''
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getRoleBadgeColor(role.slug)}`}>
                                    {role.name}
                                  </span>
                                  {role.description && (
                                    <span className="text-xs text-gray-500 hidden sm:inline">
                                      {role.description}
                                    </span>
                                  )}
                                </div>
                                {formData.role?.toLowerCase() === role.slug && (
                                  <span className="text-green-600">✓</span>
                                )}
                              </button>
                            ))}

                          {/* Custom Roles Section */}
                          {availableRoles.some(role => !role.isSystem) && (
                            <>
                              <div className="px-3 py-2 bg-gray-50 border-b border-t border-gray-100">
                                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                  Custom Roles
                                </span>
                              </div>
                              {availableRoles
                                .filter(role => !role.isSystem)
                                .map(role => (
                                  <button
                                    key={role._id || role.slug}
                                    type="button"
                                    onClick={() => handleRoleSelect(role.slug)}
                                    className={`w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center justify-between transition-colors ${
                                      formData.role?.toLowerCase() === role.slug ? 'bg-green-50' : ''
                                    }`}
                                  >
                                    <div className="flex items-center gap-3">
                                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getRoleBadgeColor(role.slug)}`}>
                                        {role.name}
                                      </span>
                                      {role.description && (
                                        <span className="text-xs text-gray-500 hidden sm:inline truncate max-w-[150px]">
                                          {role.description}
                                        </span>
                                      )}
                                    </div>
                                    {formData.role?.toLowerCase() === role.slug && (
                                      <span className="text-green-600">✓</span>
                                    )}
                                  </button>
                                ))}
                            </>
                          )}

                          {/* Add New Role Option - Admin Only */}
                          {isAdmin && (
                            <>
                              <div className="border-t border-gray-200"></div>
                              <button
                                type="button"
                                onClick={handleAddNewRoleClick}
                                className="w-full px-4 py-4 text-left hover:bg-purple-50 flex items-center gap-3 text-purple-600 font-medium transition-colors"
                              >
                                <div className="p-1 bg-purple-100 rounded-lg">
                                  <Plus size={16} />
                                </div>
                                Add New Role
                              </button>
                            </>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Role Info */}
                {formData.role && !SYSTEM_ROLES.includes(formData.role.toLowerCase()) && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-xs text-indigo-600 flex items-center gap-1 mt-2"
                  >
                    <Shield size={12} />
                    Custom role with specific permissions
                  </motion.p>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isLoading}
                  className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-semibold disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 px-6 py-4 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-lg hover:from-green-700 hover:to-blue-700 transition-all shadow-lg shadow-green-500/30 font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                      />
                      Adding...
                    </>
                  ) : (
                    <>
                      <UserPlus size={20} />
                      Add Member
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

AddMemberModal.displayName = 'AddMemberModal';

export default AddMemberModal;
