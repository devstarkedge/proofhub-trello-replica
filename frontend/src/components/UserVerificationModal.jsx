import React, { useState, useEffect } from 'react';
import Database from '../services/database';
import useRoleStore from '../store/roleStore';
import { FaUser, FaEnvelope, FaBriefcase, FaCheckCircle, FaTimesCircle, FaCalendarAlt, FaBuilding, FaExclamationTriangle, FaInfoCircle, FaSpinner } from 'react-icons/fa';

const UserVerificationModal = ({ notification, onClose, onAction }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [approveLoading, setApproveLoading] = useState(false);
  const [declineLoading, setDeclineLoading] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [selectedRole, setSelectedRole] = useState('employee');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});

  // Use reactive selectors for roles
  const roles = useRoleStore((state) => state.roles);
  const loadRoles = useRoleStore((state) => state.loadRoles);
  const initialized = useRoleStore((state) => state.initialized);

  useEffect(() => {
    if (notification && notification.sender) {
      loadUserData();
      loadDepartments();
    }
  }, [notification]);

  // Load roles when component mounts
  useEffect(() => {
    if (!initialized) {
      loadRoles().catch(console.error);
    }
  }, [initialized, loadRoles]);

  // Normalize department name for display (handles array or populated object)
  const departmentName = (() => {
    if (!user || !user.department) return null;
    // department stored as array on User model
    if (Array.isArray(user.department)) {
      if (user.department.length === 0) return null;
      // department may be populated object or id
      const first = user.department[0];
      if (first && typeof first === 'object' && first.name) return first.name;
      // if department is an id (string), try to resolve from loaded departments
      if (typeof first === 'string' && departments && departments.length) {
        const found = departments.find(d => d._id === first || d._id === String(first));
        return found ? found.name : null;
      }
      return null;
    }
    // If populated as object
    if (typeof user.department === 'object' && user.department.name) return user.department.name;
    return null;
  })();

  const loadUserData = async () => {
    try {
      setLoading(true);
      setError(null);
      const senderId = typeof notification.sender === 'object' ? notification.sender._id : notification.sender;
      const userData = await Database.getUser(senderId);
      setUser(userData.data);
    } catch (error) {
      console.error('Error loading user data:', error);
      setError('Failed to load user data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadDepartments = async () => {
    try {
      const deptData = await Database.getDepartments();
      setDepartments(deptData.data);
    } catch (error) {
      console.error('Error loading departments:', error);
      setError('Failed to load departments. Department assignment will be unavailable.');
    }
  };

  const validateForm = () => {
    const errors = {};

    if (!selectedRole) {
      errors.role = 'Role is required';
    }

    return errors;
  };

  const handleApprove = async () => {
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setValidationErrors(validationErrors);
      return;
    }

    if (!user) return;

    setApproveLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const userData = {
        userId: user._id,
        role: selectedRole,
        department: selectedDepartment || null
      };
      await onAction('verify', userData);
      setSuccessMessage('User approved and verified successfully!');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Error approving user:', error);
      setError('Failed to approve user. Please try again.');
    } finally {
      setApproveLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!user) return;

    if (!window.confirm('Are you sure you want to decline this user registration? This will permanently delete their data.')) {
      return;
    }

    setDeclineLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const userData = {
        userId: user._id
      };
      await onAction('decline', userData);
      setSuccessMessage('User declined and deleted successfully!');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Error declining user:', error);
      setError('Failed to decline user. Please try again.');
    } finally {
      setDeclineLoading(false);
    }
  };

  const handleClose = () => {
    if (!approveLoading && !declineLoading) {
      onClose();
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl">
          <div className="text-center">
            <FaSpinner className="animate-spin text-blue-600 text-3xl mx-auto mb-4" />
            <p className="text-gray-700 font-medium">Loading user details...</p>
            <p className="text-sm text-gray-500 mt-2">Please wait while we fetch the user information</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl">
          <div className="text-center">
            <FaExclamationTriangle className="text-red-500 text-4xl mx-auto mb-4" />
            <h3 className="text-xl font-bold text-red-600 mb-2">User Not Found</h3>
            <p className="text-gray-600 mb-6">The requested user could not be loaded.</p>
            <button
              onClick={handleClose}
              className="w-full bg-gray-600 text-white py-3 px-4 rounded-lg hover:bg-gray-700 transition-colors duration-200 font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 max-w-3xl w-full mx-auto max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex justify-between items-start mb-6 border-b pb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center">
              <FaUser className="mr-3 text-blue-600" />
              User Verification
            </h2>
            {user.department && (
              <div className="mt-3 bg-blue-50 p-3 rounded-lg">
                <p className="text-sm text-gray-700 flex items-center">
                  <FaBuilding className="mr-2 text-blue-600" />
                  <span className="font-medium">Department selected during registration:</span>
                  <span className="ml-2 text-blue-600 font-semibold">{departmentName || 'Department name not available'}</span>
                </p>
              </div>
            )}
          </div>
          <button
            onClick={handleClose}
            disabled={approveLoading || declineLoading}
            className={`text-gray-400 hover:text-gray-600 text-2xl transition-colors duration-200 ${approveLoading || declineLoading ? 'cursor-not-allowed' : ''}`}
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        {/* Error and Success Messages */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-500 rounded-md flex items-center">
            <FaExclamationTriangle className="text-red-500 mr-2" />
            <span className="text-red-700 text-sm">{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-3 bg-green-50 border-l-4 border-green-500 rounded-md flex items-center">
            <FaCheckCircle className="text-green-500 mr-2" />
            <span className="text-green-700 text-sm">{successMessage}</span>
          </div>
        )}

        <div className="space-y-6">
          {/* User Details Section */}
          <div className="bg-gray-50 p-6 rounded-lg border">
            <h3 className="text-xl font-semibold mb-5 flex items-center text-gray-800">
              <FaInfoCircle className="mr-2 text-gray-600" />
              User Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              <div className="flex items-start space-x-3">
                <FaUser className="text-gray-400 mt-1 flex-shrink-0" />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <p className="text-gray-900 font-medium">{user.name}</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <FaEnvelope className="text-gray-400 mt-1 flex-shrink-0" />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <p className="text-gray-900 font-medium break-all">{user.email}</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <FaBriefcase className="text-gray-400 mt-1 flex-shrink-0" />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Current Role</label>
                  <p className="text-gray-900 font-medium capitalize">{user.role}</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                {user.isVerified ? (
                  <FaCheckCircle className="text-green-500 mt-1 flex-shrink-0" />
                ) : (
                  <FaTimesCircle className="text-yellow-500 mt-1 flex-shrink-0" />
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Verification Status</label>
                  <p className={`font-medium ${user.isVerified ? 'text-green-600' : 'text-yellow-600'}`}>
                    {user.isVerified ? 'Verified' : 'Pending Verification'}
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <FaCalendarAlt className="text-gray-400 mt-1 flex-shrink-0" />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Registration Date</label>
                  <p className="text-gray-900 font-medium">
                    {new Date(user.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                {user.isActive ? (
                  <FaCheckCircle className="text-green-500 mt-1 flex-shrink-0" />
                ) : (
                  <FaTimesCircle className="text-red-500 mt-1 flex-shrink-0" />
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Account Status</label>
                  <p className={`font-medium ${user.isActive ? 'text-green-600' : 'text-red-600'}`}>
                    {user.isActive ? 'Active' : 'Inactive'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Approval Settings Section */}
          <div className="bg-blue-50 p-6 rounded-lg border border-blue-100">
            <h3 className="text-xl font-semibold mb-5 flex items-center text-gray-800">
              <FaCheckCircle className="mr-2 text-blue-600" />
              Approval Settings
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assign Role <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedRole}
                  onChange={(e) => {
                    setSelectedRole(e.target.value);
                    setValidationErrors({...validationErrors, role: ''});
                  }}
                  className={`w-full px-4 py-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200 ${validationErrors.role ? 'border-red-500' : 'border-gray-300'}`}
                  disabled={approveLoading || declineLoading}
                >
                  {roles.length === 0 ? (
                    <option value="employee" disabled>Loading roles...</option>
                  ) : (
                    <>
                      <option value="" disabled>Select a role</option>
                      {/* Exclude admin role from assignment dropdown */}
                      {roles
                        .filter(role => role.slug !== 'admin' && role.isActive !== false)
                        .map(role => (
                          <option key={role._id} value={role.slug}>
                            {role.name}
                          </option>
                        ))
                      }
                    </>
                  )}
                </select>
                {validationErrors.role && (
                  <p className="mt-1 text-xs text-red-600 flex items-center">
                    <FaExclamationTriangle className="mr-1" />
                    {validationErrors.role}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assign Department (Optional)
                </label>
                <select
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200"
                  disabled={(approveLoading || declineLoading) || departments.length === 0}
                >
                  <option value="">No Department</option>
                  {departments.map((dept) => (
                    <option key={dept._id} value={dept._id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
                {departments.length === 0 && (
                  <p className="mt-1 text-xs text-gray-500">No departments available</p>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons Section */}
          <div className="bg-gray-50 p-6 rounded-lg border-t">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={handleDecline}
                disabled={declineLoading}
                className={`w-full bg-red-600 text-white py-3 px-4 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 font-medium flex items-center justify-center space-x-2 ${declineLoading ? 'cursor-not-allowed' : 'hover:shadow-md'}`}
              >
                {declineLoading ? (
                  <>
                    <FaSpinner className="animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <FaTimesCircle />
                    <span>Decline & Delete</span>
                  </>
                )}
              </button>
              <button
                onClick={handleApprove}
                disabled={approveLoading}
                className={`w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 font-medium flex items-center justify-center space-x-2 ${approveLoading ? 'cursor-not-allowed' : 'hover:shadow-md'}`}
              >
                {approveLoading ? (
                  <>
                    <FaSpinner className="animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <FaCheckCircle />
                    <span>Approve & Verify</span>
                  </>
                )}
              </button>
            </div>

            <div className="mt-4 text-center">
              <p className="text-xs text-gray-500">
                <FaInfoCircle className="inline mr-1" />
                Approving will verify the user and grant access. Declining will permanently delete the user account.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserVerificationModal;
