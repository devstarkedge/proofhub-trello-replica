import React, { useState, useEffect } from 'react';
import Database from '../services/database';
import { FaUser, FaEnvelope, FaBriefcase, FaCheckCircle, FaTimesCircle, FaCalendarAlt, FaBuilding } from 'react-icons/fa';

const UserVerificationModal = ({ notification, onClose, onAction }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [selectedRole, setSelectedRole] = useState('employee');
  const [selectedDepartment, setSelectedDepartment] = useState('');

  useEffect(() => {
    if (notification && notification.sender) {
      loadUserData();
      loadDepartments();
    }
  }, [notification]);

  const loadUserData = async () => {
    try {
      setLoading(true);
      const senderId = typeof notification.sender === 'object' ? notification.sender._id : notification.sender;
      const userData = await Database.getUser(senderId);
      setUser(userData.data);
    } catch (error) {
      console.error('Error loading user data:', error);
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
    }
  };

  const handleApprove = async () => {
    if (!user) return;

    setActionLoading(true);
    try {
      const userData = {
        userId: user._id,
        role: selectedRole,
        department: selectedDepartment || null
      };
      await onAction('verify', userData);
      onClose();
    } catch (error) {
      console.error('Error approving user:', error);
      alert('Failed to approve user. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!user) return;

    if (!window.confirm('Are you sure you want to decline this user registration? This will permanently delete their data.')) {
      return;
    }

    setActionLoading(true);
    try {
      const userData = {
        userId: user._id
      };
      await onAction('decline', userData);
      onClose();
    } catch (error) {
      console.error('Error declining user:', error);
      alert('Failed to decline user. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <div className="text-center">Loading user details...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="fixed inset-0  bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <div className="text-center text-red-600">User not found</div>
          <button
            onClick={onClose}
            className="mt-4 w-full bg-gray-500 text-white py-2 px-4 rounded hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0  bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">User Verification</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="space-y-6">
          {/* Department Info - Show at top if user has department */}
          {user.department && (
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-lg">
              <div className="flex items-center">
                <FaBuilding className="text-blue-500 mr-3" />
                <div>
                  <h4 className="text-sm font-medium text-blue-800">Department Selected During Registration</h4>
                  <p className="text-sm text-blue-700">{user.department.name || 'Department name not available'}</p>
                </div>
              </div>
            </div>
          )}

          {/* User Details */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-3 flex items-center">
              <FaUser className="mr-2 text-gray-600" />
              User Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center">
                <FaUser className="text-gray-400 mr-2" />
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <p className="mt-1 text-sm text-gray-900">{user.name}</p>
                </div>
              </div>
              <div className="flex items-center">
                <FaEnvelope className="text-gray-400 mr-2" />
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <p className="mt-1 text-sm text-gray-900">{user.email}</p>
                </div>
              </div>
              <div className="flex items-center">
                <FaBriefcase className="text-gray-400 mr-2" />
                <div>
                  <label className="block text-sm font-medium text-gray-700">Role</label>
                  <p className="mt-1 text-sm text-gray-900">{user.role}</p>
                </div>
              </div>
              <div className="flex items-center">
                {user.isVerified ? (
                  <FaCheckCircle className="text-green-500 mr-2" />
                ) : (
                  <FaTimesCircle className="text-yellow-500 mr-2" />
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700">Status</label>
                  <p className={`mt-1 text-sm ${user.isVerified ? 'text-green-600' : 'text-yellow-600'}`}>
                    {user.isVerified ? 'Verified' : 'Pending Verification'}
                  </p>
                </div>
              </div>
              <div className="flex items-center">
                <FaCalendarAlt className="text-gray-400 mr-2" />
                <div>
                  <label className="block text-sm font-medium text-gray-700">Registered</label>
                  <p className="mt-1 text-sm text-gray-900">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center">
                {user.isActive ? (
                  <FaCheckCircle className="text-green-500 mr-2" />
                ) : (
                  <FaTimesCircle className="text-red-500 mr-2" />
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700">Active</label>
                  <p className={`mt-1 text-sm ${user.isActive ? 'text-green-600' : 'text-red-600'}`}>
                    {user.isActive ? 'Yes' : 'No'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Approval Settings */}
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-3">Approval Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assign Role
                </label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assign Department (Optional)
                </label>
                <select
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">No Department</option>
                  {departments.map((dept) => (
                    <option key={dept._id} value={dept._id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-4">
            <button
              onClick={handleDecline}
              disabled={actionLoading}
              className="flex-1 bg-red-600 text-white py-3 px-4 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionLoading ? 'Processing...' : 'Decline & Delete'}
            </button>
            <button
              onClick={handleApprove}
              disabled={actionLoading}
              className="flex-1 bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionLoading ? 'Processing...' : 'Approve & Verify'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserVerificationModal;
