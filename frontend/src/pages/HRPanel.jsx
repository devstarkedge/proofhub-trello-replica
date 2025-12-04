import React, { useState, useEffect, useContext, useMemo, useCallback, memo } from 'react';
import {
  Users,
  Filter,
  Search,
  UserCheck,
  UserX,
  UserCog,
  X,
  CheckCircle,
  XCircle,
  Building2,
  Shield,
  Briefcase,
  User,
  ChevronDown,
  Loader2,
  Trash2
} from 'lucide-react';
import api from '../services/api';
import { useDebounce } from '../hooks/useDebounce';
import AuthContext from '../context/AuthContext';
import useDepartmentStore from '../store/departmentStore';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';

// Memoized User Row Component for better performance
const UserRow = memo(({ 
  user, 
  loadingStates, 
  onVerify, 
  onDecline, 
  onAssign, 
  onDelete,
  getRoleBadge,
  getStatusBadge
}) => {
  return (
    <tr className="hover:bg-gray-50 transition-colors duration-150">
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center">
          <div className="flex-shrink-0 h-10 w-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="ml-4">
            <div className="text-sm font-semibold text-gray-900">{user.name}</div>
            <div className="text-sm text-gray-500">{user.email}</div>
          </div>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        {getRoleBadge(user.role)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        {user.department && user.department.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {user.department.map((dept, index) => (
              <span key={`${dept._id}-${index}`} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-xs font-medium">
                <Building2 className="w-3 h-3" />
                {dept.name}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-sm text-gray-400 italic">Not Assigned</span>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        {getStatusBadge(user)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
        <div className="flex items-center gap-2">
          {!user.isVerified && user.role !== 'admin' && (
            <>
              <button
                onClick={() => onVerify(user._id)}
                disabled={loadingStates[user._id]}
                className="inline-flex items-center gap-1 px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors duration-200 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingStates[user._id] ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                {loadingStates[user._id] ? 'Verifying...' : 'Verify'}
              </button>
              <button
                onClick={() => onDecline(user._id)}
                disabled={loadingStates[user._id]}
                className="inline-flex items-center gap-1 px-3 py-2 bg-red-300 text-red-800 rounded-lg hover:bg-red-200 transition-colors duration-200 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingStates[user._id] ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                {loadingStates[user._id] ? 'Declining...' : 'Decline'}
              </button>
            </>
          )}
          {user.isVerified && (
            <>
              <button
                onClick={() => onAssign(user)}
                className="inline-flex items-center gap-1 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors duration-200 font-semibold"
              >
                <UserCog className="w-4 h-4" />
                Assign
              </button>
              {(user.role === 'manager' || user.role === 'employee') && (
                <button
                  onClick={() => onDelete(user)}
                  className="inline-flex items-center gap-1 px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors duration-200 font-semibold"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  );
});
UserRow.displayName = 'UserRow';

const HRPanel = () => {
  const { user } = useContext(AuthContext);
  const departmentStore = useDepartmentStore();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedDepartments, setSelectedDepartments] = useState([]);
  const [showDepartmentDropdown, setShowDepartmentDropdown] = useState(false);
  const [filters, setFilters] = useState({
    role: '',
    department: '',
    search: ''
  });
  const [debouncedFilters] = useDebounce(filters, 200);
  const [userToDelete, setUserToDelete] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [toast, setToast] = useState(null);
  const [loadingStates, setLoadingStates] = useState({});

  useEffect(() => {
    loadData();

    // Initialize socket listeners for department assignments
    const cleanup = departmentStore.initializeSocketListeners();

    // Listen for real-time user verification updates
    const handleUserVerified = (event) => {
      const { userId, isVerified, role, department } = event.detail;
      setUsers(prevUsers =>
        prevUsers.map(user =>
          user._id === userId
            ? { ...user, isVerified, role, department }
            : user
        )
      );
    };

    window.addEventListener('socket-user-verified', handleUserVerified);

    return () => {
      cleanup();
      window.removeEventListener('socket-user-verified', handleUserVerified);
    };
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        departmentStore.loadDepartments(),
        departmentStore.loadUsers()
      ]);
      // Load users for local state management
      const res = await api.get('/api/users');
      setUsers(res.data.data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };



  const handleVerifyUser = async (userId) => {
    setLoadingStates(prev => ({ ...prev, [userId]: true }));

    try {
      await api.put(`/api/users/${userId}/verify`, {
        role: 'employee',
        department: null
      });

      // Update local state immediately for instant UI feedback
      setUsers(prevUsers =>
        prevUsers.map(user =>
          user._id === userId
            ? { ...user, isVerified: true, role: 'employee', department: [] }
            : user
        )
      );
    } catch (error) {
      console.error('Error verifying user:', error);
      setToast({ type: 'error', message: error.response?.data?.message || 'Failed to verify user' });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setLoadingStates(prev => ({ ...prev, [userId]: false }));
    }
  };

  const handleDeclineUser = async (userId) => {
    setLoadingStates(prev => ({ ...prev, [userId]: true }));

    try {
      await api.delete(`/api/users/${userId}/decline`);

      // Remove user from local state immediately
      setUsers(prevUsers => prevUsers.filter(user => user._id !== userId));
    } catch (error) {
      console.error('Error declining user:', error);
      setToast({ type: 'error', message: error.response?.data?.message || 'Failed to decline user' });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setLoadingStates(prev => ({ ...prev, [userId]: false }));
    }
  };

  const handleAssignUser = async (userId, departmentIds) => {
    try {
      await api.put(`/api/users/${userId}/assign`, {
        departments: departmentIds,
        team: null
      });
      loadData();
      setShowModal(false);
      setSelectedDepartments([]);
    } catch (error) {
      console.error('Error assigning user:', error);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    const uid = userToDelete._id;

    // set loading state for this user to disable button and show spinner
    setLoadingStates(prev => ({ ...prev, [uid]: true }));

    try {
      await api.delete(`/api/users/${userToDelete._id}`);
      setUsers(prevUsers => prevUsers.filter(u => u._id !== uid));
      setToast({ type: 'success', message: 'User deleted successfully' });
      setTimeout(() => setToast(null), 3000);

      // Close the modal on success and reset userToDelete
      setShowDeleteModal(false);
      setUserToDelete(null);
    } catch (error) {
      console.error('Error deleting user:', error);
      setToast({ type: 'error', message: error.response?.data?.message || 'Failed to delete user' });
      setTimeout(() => setToast(null), 3000);
      // Keep the modal open in case user wants to retry or cancel
    } finally {
      // reset loading state for this user
      setLoadingStates(prev => ({ ...prev, [uid]: false }));
    }
  };

  const openDeleteModal = (user) => {
    setUserToDelete(user);
    setShowDeleteModal(true);
  };

  const openAssignModal = (user) => {
    setSelectedUser(user);
    const userDeptIds = user.department?.map(d => d._id) || [];
    setSelectedDepartments(userDeptIds);
    setShowModal(true);
  };

  const toggleDepartment = (deptId) => {
    setSelectedDepartments(prev => {
      if (prev.includes(deptId)) {
        return prev.filter(id => id !== deptId);
      } else {
        return [...prev, deptId];
      }
    });
  };

  const removeDepartment = (deptId) => {
    setSelectedDepartments(prev => prev.filter(id => id !== deptId));
  };

  const getAvailableDepartments = useCallback(() => {
    return departmentStore.departments.filter(dept => !selectedDepartments.includes(dept._id));
  }, [departmentStore.departments, selectedDepartments]);

  const getSelectedDepartmentObjects = useCallback(() => {
    return departmentStore.departments.filter(dept => selectedDepartments.includes(dept._id));
  }, [departmentStore.departments, selectedDepartments]);

  // OPTIMIZED: Memoize filtered users to prevent recalculation on every render
  // Uses debouncedFilters to prevent filtering on every keystroke
  const filteredUsers = useMemo(() => {
    if (!users.length) return [];
    
    const searchLower = debouncedFilters.search?.toLowerCase() || '';
    
    return users.filter(user => {
      // Early returns for better performance
      if (debouncedFilters.role && user.role !== debouncedFilters.role) return false;
      
      if (debouncedFilters.department) {
        const hasDept = user.department?.some(d => d._id === debouncedFilters.department);
        if (!hasDept) return false;
      }
      
      if (searchLower) {
        const nameMatch = user.name.toLowerCase().includes(searchLower);
        const emailMatch = user.email.toLowerCase().includes(searchLower);
        if (!nameMatch && !emailMatch) return false;
      }
      
      return true;
    });
  }, [users, debouncedFilters.role, debouncedFilters.department, debouncedFilters.search]);

  // Memoize badge generators to prevent recreating functions
  const getStatusBadge = useCallback((user) => {
    if (!user.isVerified) {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold bg-yellow-100 text-yellow-800 rounded-full">
          <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>
          Pending
        </span>
      );
    }
    if (!user.isActive) {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold bg-red-100 text-red-800 rounded-full">
          <span className="w-2 h-2 bg-red-500 rounded-full"></span>
          Inactive
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold bg-green-100 text-green-800 rounded-full">
        <span className="w-2 h-2 bg-green-500 rounded-full"></span>
        Active
      </span>
    );
  }, []);

  // Memoize role badge generator
  const getRoleBadge = useCallback((role) => {
    const roleConfig = {
      admin: { color: 'bg-red-100 text-red-800', icon: Shield },
      manager: { color: 'bg-blue-100 text-blue-800', icon: Briefcase },
      hr: { color: 'bg-purple-100 text-purple-800', icon: UserCog },
      employee: { color: 'bg-gray-100 text-gray-800', icon: User }
    };
    const config = roleConfig[role] || roleConfig.employee;
    const Icon = config.icon;
    
    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-full ${config.color}`}>
        <Icon className="w-3 h-3" />
        {role.charAt(0).toUpperCase() + role.slice(1)}
      </span>
    );
  }, []);

  // Memoize stats to prevent recalculation
  const stats = useMemo(() => ({
    total: users.length,
    pending: users.filter(u => !u.isVerified).length,
    active: users.filter(u => u.isVerified && u.isActive).length,
    departments: departmentStore.departments.length
  }), [users, departmentStore.departments.length]);

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <Sidebar />
        <div className="flex-1 ml-64">
          <Header />
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
              <div className="text-xl font-semibold text-gray-700">Loading HR Panel...</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Sidebar />
      <div className="flex-1 ml-64">
        <Header />
        <main className="p-6">
          {/* Header */}
          <div className="mb-8 animate-fade-in">
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-blue-100 p-3 rounded-xl">
                <Users className="w-8 h-8 text-blue-600" />
              </div>
              <div>
                <h1 className="text-4xl font-bold text-gray-900">HR Management Panel</h1>
                <p className="text-gray-600 mt-1">Manage users, departments, and assignments</p>
              </div>
            </div>
          </div>

          {/* Stats Cards - Using memoized stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm font-medium">Total Users</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{stats.total}</p>
                </div>
                <div className="bg-blue-100 p-3 rounded-lg">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm font-medium">Pending</p>
                  <p className="text-3xl font-bold text-yellow-600 mt-1">
                    {stats.pending}
                  </p>
                </div>
                <div className="bg-yellow-100 p-3 rounded-lg">
                  <UserCheck className="w-6 h-6 text-yellow-600" />
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm font-medium">Active</p>
                  <p className="text-3xl font-bold text-green-600 mt-1">
                    {stats.active}
                  </p>
                </div>
                <div className="bg-green-100 p-3 rounded-lg">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm font-medium">Departments</p>
                  <p className="text-3xl font-bold text-purple-600 mt-1">{stats.departments}</p>
                </div>
                <div className="bg-purple-100 p-3 rounded-lg">
                  <Building2 className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl shadow-md p-6 mb-6 hover:shadow-lg transition-shadow duration-300">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="w-5 h-5 text-gray-600" />
              <h2 className="text-xl font-semibold text-gray-900">Filters</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Role</label>
                <div className="relative">
                  <select
                    value={filters.role}
                    onChange={(e) => setFilters({...filters, role: e.target.value})}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white transition-all duration-200"
                  >
                    <option value="">All Roles</option>
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="hr">HR</option>
                    <option value="employee">Employee</option>
                  </select>
                  <Shield className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Department</label>
                <div className="relative">
                  <select
                    value={filters.department}
                    onChange={(e) => setFilters({...filters, department: e.target.value})}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white transition-all duration-200"
                  >
                    <option value="">All Departments</option>
                    {departmentStore.departments.map((dept, index) => (
                      <option key={`${dept._id}-${index}`} value={dept._id}>{dept.name}</option>
                    ))}
                  </select>
                  <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Search</label>
                <div className="relative">
                  <input
                    type="text"
                    value={filters.search}
                    onChange={(e) => setFilters({...filters, search: e.target.value})}
                    placeholder="Name or email..."
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  />
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                </div>
              </div>
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300">
            <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Users Directory</h2>
                <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold">
                  {filteredUsers.length} {filteredUsers.length === 1 ? 'User' : 'Users'}
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">User</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Department</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredUsers.map((user, index) => (
                    <UserRow
                      key={user._id}
                      user={user}
                      index={index}
                      loadingStates={loadingStates}
                      getRoleBadge={getRoleBadge}
                      getStatusBadge={getStatusBadge}
                      handleVerifyUser={handleVerifyUser}
                      handleDeclineUser={handleDeclineUser}
                      openAssignModal={openAssignModal}
                      openDeleteModal={openDeleteModal}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Assignment Modal */}
          {showModal && selectedUser && (
            <div className="fixed inset-0 backdrop-blur-sm bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center animate-fade-in">
              <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-slide-up">
                {/* Modal Header */}
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-t-2xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="bg-white/20 p-2 rounded-lg">
                        <UserCog className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold">Assign Departments</h3>
                        <p className="text-blue-100 text-sm">{selectedUser.name}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setShowModal(false);
                        setSelectedDepartments([]);
                      }}
                      className="bg-white/20 hover:bg-white/30 p-2 rounded-lg transition-colors duration-200"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Modal Body */}
                <div className="p-6">
                  <div className="space-y-4">
                    {/* Department Selector */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Select Departments
                      </label>
                      <div className="relative">
                        <button
                          onClick={() => setShowDepartmentDropdown(!showDepartmentDropdown)}
                          className="w-full px-4 py-3 text-left border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white hover:bg-gray-50 transition-colors duration-200 flex items-center justify-between"
                        >
                          <span className="text-gray-700">
                            {getAvailableDepartments().length > 0 
                              ? "Choose departments..." 
                              : "All departments selected"}
                          </span>
                          <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${showDepartmentDropdown ? 'transform rotate-180' : ''}`} />
                        </button>
                        
                        {showDepartmentDropdown && getAvailableDepartments().length > 0 && (
                          <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {getAvailableDepartments().map((dept, index) => (
                              <button
                                key={`${dept._id}-${index}`}
                                onClick={() => {
                                  toggleDepartment(dept._id);
                                  setShowDepartmentDropdown(false);
                                }}
                                className="w-full px-4 py-3 text-left hover:bg-blue-50 transition-colors duration-150 flex items-center gap-2 border-b border-gray-100 last:border-b-0"
                              >
                                <Building2 className="w-4 h-4 text-blue-600" />
                                <span className="text-gray-700 font-medium">{dept.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Selected Departments - Chips */}
                    {selectedDepartments.length > 0 && (
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Selected Departments ({selectedDepartments.length})
                        </label>
                        <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200 min-h-[60px]">
                          {getSelectedDepartmentObjects().map((dept, index) => (
                            <span
                              key={`${dept._id}-${index}`}
                              className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium shadow-sm hover:bg-blue-700 transition-colors duration-200 animate-scale-in"
                            >
                              <Building2 className="w-4 h-4" />
                              {dept.name}
                              <button
                                onClick={() => removeDepartment(dept._id)}
                                className="hover:bg-blue-800 rounded-full p-0.5 transition-colors duration-200"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="flex justify-end gap-3 p-6 bg-gray-50 rounded-b-2xl border-t border-gray-200">
                  <button
                    onClick={() => {
                      setShowModal(false);
                      setSelectedDepartments([]);
                    }}
                    className="px-6 py-3 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors duration-200 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleAssignUser(selectedUser._id, selectedDepartments)}
                    className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-200 font-semibold shadow-md hover:shadow-lg transform hover:scale-105"
                  >
                    Assign Departments
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Delete Confirmation Modal */}
          {showDeleteModal && userToDelete && (
            <div className="fixed inset-0 backdrop-blur-sm bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center animate-fade-in">
              <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-slide-up">
                {/* Modal Header */}
                <div className="bg-gradient-to-r from-red-600 to-red-700 text-white p-6 rounded-t-2xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="bg-white/20 p-2 rounded-lg">
                        <Trash2 className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold">Delete User</h3>
                        <p className="text-red-100 text-sm">{userToDelete.name}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setShowDeleteModal(false);
                        setUserToDelete(null);
                      }}
                      className="bg-white/20 hover:bg-white/30 p-2 rounded-lg transition-colors duration-200"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Modal Body */}
                <div className="p-6">
                  <div className="text-center">
                    <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                      <Trash2 className="h-6 w-6 text-red-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Are you sure you want to delete this user?</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Are you sure you want to permanently delete <strong>{userToDelete.name}</strong>? This action cannot be undone.
                    </p>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                      <p className="text-sm text-red-800">
                        <strong>Warning:</strong> This will remove the user from all departments, teams, projects, and delete all associated data including comments, notifications, and activity logs.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="flex justify-end gap-3 p-6 bg-gray-50 rounded-b-2xl border-t border-gray-200">
                  <button
                    onClick={() => {
                      setShowDeleteModal(false);
                      setUserToDelete(null);
                    }}
                    className="px-6 py-3 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors duration-200 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteUser}
                    disabled={loadingStates[userToDelete._id]}
                    aria-disabled={loadingStates[userToDelete._id] ? 'true' : 'false'}
                    aria-busy={loadingStates[userToDelete._id] ? 'true' : 'false'}
                    className={`px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg hover:from-red-700 hover:to-red-800 transition-all duration-200 font-semibold shadow-md hover:shadow-lg transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
                    title={loadingStates[userToDelete._id] ? 'Deleting...' : 'Delete Anyway'}
                  >
                    {loadingStates[userToDelete._id] ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Deleting...</span>
                      </>
                    ) : (
                      'Delete Anyway'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Toast Notification */}
          {toast && (
            <div className={`fixed top-4 right-4 z-50 animate-fade-in`}>
              <div className={`px-6 py-4 rounded-lg shadow-lg flex items-center gap-3 ${
                toast.type === 'success'
                  ? 'bg-green-100 border border-green-200 text-green-800'
                  : 'bg-red-100 border border-red-200 text-red-800'
              }`}>
                {toast.type === 'success' ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <XCircle className="w-5 h-5" />
                )}
                <span className="font-semibold">{toast.message}</span>
              </div>
            </div>
          )}
        </main>
      </div>

      <style jsx="true">{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0.8);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.5s ease-out;
        }

        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }

        .animate-scale-in {
          animation: scale-in 0.2s ease-out;
        }
      `}</style>
    </div>
  );
};

export default HRPanel;