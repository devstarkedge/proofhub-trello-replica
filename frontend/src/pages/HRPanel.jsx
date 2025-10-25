import React, { useState, useEffect, useContext } from 'react';
import api from '../services/api';
import AuthContext from '../context/AuthContext';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';

const HRPanel = () => {
  const { user } = useContext(AuthContext);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [teams, setTeams] = useState([]);
  const [filters, setFilters] = useState({
    role: '',
    department: '',
    team: '',
    search: ''
  });

  useEffect(() => {
    loadUsers();
    loadDepartments();
    loadTeams();
  }, []);

  const loadUsers = async () => {
    try {
      const res = await api.get('/api/users');
      setUsers(res.data.data);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDepartments = async () => {
    try {
      const res = await api.get('/api/departments');
      setDepartments(res.data.data);
    } catch (error) {
      console.error('Error loading departments:', error);
    }
  };

  const loadTeams = async () => {
    try {
      const res = await api.get('/api/teams');
      setTeams(res.data.data);
    } catch (error) {
      console.error('Error loading teams:', error);
    }
  };

  const handleVerifyUser = async (userId) => {
    try {
      await api.put(`/api/users/${userId}/verify`, {
        role: 'employee', // Default role for verified users
        department: null // HR/Admin will assign department
      });
      loadUsers();
    } catch (error) {
      console.error('Error verifying user:', error);
    }
  };

  const handleDeclineUser = async (userId) => {
    try {
      await api.delete(`/api/users/${userId}/decline`);
      loadUsers();
    } catch (error) {
      console.error('Error declining user:', error);
    }
  };

  const handleAssignUser = async (userId, departmentId, teamId) => {
    try {
      await api.put(`/api/users/${userId}/assign`, {
        department: departmentId,
        team: teamId
      });
      loadUsers();
      setShowModal(false);
    } catch (error) {
      console.error('Error assigning user:', error);
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesRole = !filters.role || user.role === filters.role;
    const matchesDepartment = !filters.department || user.department?._id === filters.department;
    const matchesTeam = !filters.team || user.team?._id === filters.team;
    const matchesSearch = !filters.search ||
      user.name.toLowerCase().includes(filters.search.toLowerCase()) ||
      user.email.toLowerCase().includes(filters.search.toLowerCase());

    return matchesRole && matchesDepartment && matchesTeam && matchesSearch;
  });

  const getStatusBadge = (user) => {
    if (!user.isVerified) return <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">Pending</span>;
    if (!user.isActive) return <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full">Inactive</span>;
    return <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Active</span>;
  };

  const getRoleBadge = (role) => {
    const colors = {
      admin: 'bg-red-100 text-red-800',
      manager: 'bg-blue-100 text-blue-800',
      hr: 'bg-purple-100 text-purple-800',
      employee: 'bg-gray-100 text-gray-800'
    };
    return <span className={`px-2 py-1 text-xs rounded-full ${colors[role] || colors.employee}`}>{role}</span>;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gray-100">
        <Sidebar />
        <div className="flex-1 ml-64">
          <Header />
          <div className="flex items-center justify-center h-64">
            <div className="text-xl">Loading HR Panel...</div>
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
        <main className="p-6">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">HR Management Panel</h1>
            <p className="text-gray-600 mt-1">Manage users, departments, and team assignments</p>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Filters</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={filters.role}
                  onChange={(e) => setFilters({...filters, role: e.target.value})}
                  className="w-full p-2 border rounded"
                >
                  <option value="">All Roles</option>
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                  <option value="hr">HR</option>
                  <option value="employee">Employee</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <select
                  value={filters.department}
                  onChange={(e) => setFilters({...filters, department: e.target.value})}
                  className="w-full p-2 border rounded"
                >
                  <option value="">All Departments</option>
                  {departments.map(dept => (
                    <option key={dept._id} value={dept._id}>{dept.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
                <select
                  value={filters.team}
                  onChange={(e) => setFilters({...filters, team: e.target.value})}
                  className="w-full p-2 border rounded"
                >
                  <option value="">All Teams</option>
                  {teams.map(team => (
                    <option key={team._id} value={team._id}>{team.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) => setFilters({...filters, search: e.target.value})}
                  placeholder="Name or email"
                  className="w-full p-2 border rounded"
                />
              </div>
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold">Users ({filteredUsers.length})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Team</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredUsers.map(user => (
                    <tr key={user._id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{user.name}</div>
                          <div className="text-sm text-gray-500">{user.email}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getRoleBadge(user.role)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {user.department?.name || 'Not Assigned'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {user.team?.name || 'Not Assigned'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(user)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          {!user.isVerified && user.role !== 'admin' && (
                            <>
                              <button
                                onClick={() => handleVerifyUser(user._id)}
                                className="text-green-600 hover:text-green-900"
                              >
                                Verify
                              </button>
                              <button
                                onClick={() => handleDeclineUser(user._id)}
                                className="text-red-600 hover:text-red-900"
                              >
                                Decline
                              </button>
                            </>
                          )}
                          {user.isVerified && (
                            <button
                              onClick={() => {
                                setSelectedUser(user);
                                setShowModal(true);
                              }}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              Assign
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Assignment Modal */}
          {showModal && selectedUser && (
            <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
              <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                <div className="mt-3">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    Assign {selectedUser.name} to Department/Team
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                      <select
                        id="department-select"
                        className="w-full p-2 border rounded"
                        defaultValue={selectedUser.department?._id || ''}
                      >
                        <option value="">Select Department</option>
                        {departments.map(dept => (
                          <option key={dept._id} value={dept._id}>{dept.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end space-x-2 mt-6">
                    <button
                      onClick={() => setShowModal(false)}
                      className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        const deptId = document.getElementById('department-select').value;
                        const teamId = document.getElementById('team-select').value;
                        handleAssignUser(selectedUser._id, deptId || null, teamId || null);
                      }}
                      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                      Assign
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default HRPanel;
