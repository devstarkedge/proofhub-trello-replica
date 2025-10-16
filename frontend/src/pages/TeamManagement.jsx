import React, { useState, useContext, useEffect } from 'react';
import TeamContext from '../context/TeamContext';
import AuthContext from '../context/AuthContext';
import Database from '../services/database';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';

const TeamManagement = () => {
  const { user } = useContext(AuthContext);
  const {
    departments,
    currentDepartment,
    setCurrentDepartment,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    assignUserToDepartment
  } = useContext(TeamContext);

  const [users, setUsers] = useState([]);
  const [managers, setManagers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptDescription, setNewDeptDescription] = useState('');
  const [selectedManager, setSelectedManager] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [departmentToDelete, setDepartmentToDelete] = useState(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const userList = await Database.getUsers();
      const allUsers = userList.data || [];
      setUsers(allUsers);
      // Filter managers (admin and manager roles)
      setManagers(allUsers.filter(u => u.role === 'manager' || u.role === 'admin'));
      // Filter verified employees
      setEmployees(allUsers.filter(u => u.isVerified && u.role === 'employee'));
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const handleCreateDepartment = async (e) => {
    e.preventDefault();
    if (!newDeptName.trim()) return;
    try {
      await createDepartment(newDeptName, newDeptDescription, selectedManager || user._id);
      setNewDeptName('');
      setNewDeptDescription('');
      setSelectedManager('');
    } catch (error) {
      alert('Failed to create department');
    }
  };

  const handleAssignUsersToDepartment = async () => {
    if (!selectedUsers.length || !currentDepartment) return;
    try {
      for (const userId of selectedUsers) {
        await assignUserToDepartment(userId, currentDepartment._id);
      }
      setSelectedUsers([]);
      alert('Users assigned to department successfully!');
    } catch (error) {
      alert('Failed to assign users to department');
    }
  };

  const handleUserSelection = (userId) => {
    setSelectedUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleDeleteDepartment = async () => {
    if (!departmentToDelete) return;
    try {
      await deleteDepartment(departmentToDelete._id);
      setShowDeleteModal(false);
      setDepartmentToDelete(null);
      alert('Department deleted successfully!');
    } catch (error) {
      alert('Failed to delete department');
    }
  };

  const openDeleteModal = (dept) => {
    setDepartmentToDelete(dept);
    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setDepartmentToDelete(null);
  };

  // Check if user is admin or manager
  const isAdminOrManager = user && (user.role === 'admin' || user.role === 'manager');

  if (!isAdminOrManager) {
    return (
      <div className="flex min-h-screen bg-gray-100">
        <Sidebar />
        <div className="flex-1 ml-64">
          <Header />
          <div className="max-w-4xl mx-auto py-8 px-4">
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              Access denied. Only administrators and managers can manage teams and departments.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-100">
      <Sidebar />
      <div className="flex-1 ml-64">
        <Header />
        <div className="max-w-6xl mx-auto py-8 px-4">
          <h1 className="text-3xl font-bold mb-8">Department Management</h1>

          <div className="space-y-6">
            {/* Current Department Selector */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Current Department</h2>
              <select
                value={currentDepartment?._id || ''}
                onChange={(e) => setCurrentDepartment(departments.find(d => d._id === e.target.value))}
                className="w-full p-2 border rounded"
              >
                <option value="">Select a department</option>
                {departments.map(dept => (
                  <option key={dept._id} value={dept._id}>{dept.name}</option>
                ))}
              </select>
            </div>

            {/* Create Department */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Create New Department</h2>
              <form onSubmit={handleCreateDepartment}>
                <input
                  type="text"
                  placeholder="Department Name"
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  className="w-full p-2 border rounded mb-2"
                  required
                />
                <textarea
                  placeholder="Description (optional)"
                  value={newDeptDescription}
                  onChange={(e) => setNewDeptDescription(e.target.value)}
                  className="w-full p-2 border rounded mb-2"
                  rows="3"
                />
                <select
                  value={selectedManager}
                  onChange={(e) => setSelectedManager(e.target.value)}
                  className="w-full p-2 border rounded mb-2"
                >
                  <option value="">Select Manager</option>
                  {managers.map(u => (
                    <option key={u._id} value={u._id}>{u.name} ({u.email})</option>
                  ))}
                </select>
                <button type="submit" className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600">
                  Create Department
                </button>
              </form>
            </div>

            {/* Assign Employees to Department */}
            {currentDepartment && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">Assign Employees to {currentDepartment.name} Team</h2>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Employees (Multi-select)
                  </label>
                  <div className="max-h-40 overflow-y-auto border rounded p-2">
                    {employees.map(employee => (
                      <div key={employee._id} className="flex items-center mb-2">
                        <input
                          type="checkbox"
                          id={`employee-${employee._id}`}
                          checked={selectedUsers.includes(employee._id)}
                          onChange={() => handleUserSelection(employee._id)}
                          className="mr-2"
                        />
                        <label htmlFor={`employee-${employee._id}`} className="text-sm">
                          {employee.name} ({employee.email})
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  onClick={handleAssignUsersToDepartment}
                  disabled={!selectedUsers.length}
                  className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Assign Selected Employees ({selectedUsers.length})
                </button>
              </div>
            )}

            {/* Departments List */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Departments</h2>
              <div className="space-y-2">
                {departments.filter(Boolean).map(dept => (
                  <div key={dept._id} className="flex justify-between items-center p-3 border rounded">
                    <div>
                      <span className="font-medium">{dept.name}</span>
                      {dept.description && <p className="text-sm text-gray-600">{dept.description}</p>}
                      <p className="text-sm text-gray-500">Manager: {dept.manager?.name || 'N/A'}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-500">{dept.members?.length || 0} members</span>
                      <button
                        onClick={() => openDeleteModal(dept)}
                        className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                  <h3 className="text-lg font-semibold mb-4">Confirm Delete</h3>
                  <p className="text-gray-600 mb-6">
                    Are you sure you want to delete the department "{departmentToDelete?.name}"?
                    This action cannot be undone.
                  </p>
                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={closeDeleteModal}
                      className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteDepartment}
                      className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeamManagement;
