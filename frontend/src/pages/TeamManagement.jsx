import React, { useState, useContext, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, Plus, Edit2, Trash2, UserPlus, 
  Building2, Shield, Search, X, CheckCircle,
  AlertCircle, Info, Filter, Download, Upload,
  TrendingUp, Award, Clock, Mail
} from 'lucide-react';
import TeamContext from '../context/TeamContext';
import AuthContext from '../context/AuthContext';
import Database from '../services/database';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';

// Toast Notification Component
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const icons = {
    success: <CheckCircle className="text-green-500" size={20} />,
    error: <AlertCircle className="text-red-500" size={20} />,
    info: <Info className="text-blue-500" size={20} />,
    warning: <AlertCircle className="text-yellow-500" size={20} />
  };

  const colors = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800'
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.9 }}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg ${colors[type]} backdrop-blur-sm`}
    >
      {icons[type]}
      <p className="font-medium flex-1">{message}</p>
      <button onClick={onClose} className="hover:opacity-70 transition-opacity">
        <X size={16} />
      </button>
    </motion.div>
  );
};

const TeamManagement = () => {
  const { user } = useContext(AuthContext);
  const {
    departments,
    currentDepartment,
    setCurrentDepartment,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    assignUserToDepartment,
    unassignUserFromDepartment
  } = useContext(TeamContext);

  const [users, setUsers] = useState([]);
  const [managers, setManagers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [departmentToDelete, setDepartmentToDelete] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    managers: []
  });
  const [addMemberFormData, setAddMemberFormData] = useState({
    name: '',
    email: '',
    password: '',
    department: '',
    role: 'employee'
  });
  const [addMemberErrors, setAddMemberErrors] = useState({});
  const [stats, setStats] = useState({
    totalDepartments: 0,
    totalMembers: 0,
    avgMembersPerDept: 0
  });

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    calculateStats();
  }, [departments]);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
  };

  const calculateStats = () => {
    const totalMembers = departments.reduce((acc, dept) => acc + (dept.members?.length || 0), 0);
    setStats({
      totalDepartments: departments.length,
      totalMembers,
      avgMembersPerDept: departments.length > 0 ? Math.round(totalMembers / departments.length) : 0
    });
  };

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const userList = await Database.getUsers();
      const allUsers = userList.data || [];
      setUsers(allUsers);
      setManagers(allUsers.filter(u => u.role === 'manager' || u.role === 'admin'));
      setEmployees(allUsers.filter(u => u.isVerified && u.role === 'employee'));
    } catch (error) {
      console.error('Error loading users:', error);
      showToast('Failed to load users', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateDepartment = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showToast('Department name is required', 'warning');
      return;
    }
    setIsLoading(true);
    try {
      await createDepartment(formData.name, formData.description, formData.managers.length > 0 ? formData.managers : [user._id]);
      setShowCreateModal(false);
      setFormData({ name: '', description: '', managers: [] });
      showToast('Department created successfully!', 'success');
    } catch (error) {
      showToast('Failed to create department', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditDepartment = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showToast('Department name is required', 'warning');
      return;
    }
    setIsLoading(true);
    try {
      await updateDepartment(currentDepartment._id, formData);
      setShowEditModal(false);
      setFormData({ name: '', description: '', managers: [] });
      showToast('Department updated successfully!', 'success');
    } catch (error) {
      showToast('Failed to update department', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssignUsers = async () => {
    if (!selectedUsers.length || !currentDepartment) {
      showToast('Please select at least one employee', 'warning');
      return;
    }
    setIsLoading(true);
    try {
      for (const userId of selectedUsers) {
        await assignUserToDepartment(userId, currentDepartment._id);
      }
      setSelectedUsers([]);
      showToast(`${selectedUsers.length} employee(s) assigned successfully!`, 'success');
      loadUsers();
    } catch (error) {
      showToast('Failed to assign users', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUserSelection = (userId) => {
    setSelectedUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSelectAll = () => {
    if (selectedUsers.length === filteredEmployees.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(filteredEmployees.map(emp => emp._id));
    }
  };

  const handleDeleteDepartment = async () => {
    if (!departmentToDelete) return;
    setIsLoading(true);
    try {
      await deleteDepartment(departmentToDelete._id);
      setShowDeleteModal(false);
      setDepartmentToDelete(null);
      showToast('Department deleted successfully', 'success');
    } catch (error) {
      showToast('Failed to delete department', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnassignUser = async (userId) => {
    setIsLoading(true);
    try {
      await unassignUserFromDepartment(userId);
      showToast('User unassigned successfully', 'success');
      loadUsers();
    } catch (error) {
      showToast('Failed to unassign user', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    const errors = {};

    if (!addMemberFormData.name.trim()) {
      errors.name = 'Name is required';
    }
    if (!addMemberFormData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(addMemberFormData.email)) {
      errors.email = 'Email is invalid';
    }
    if (!addMemberFormData.password.trim()) {
      errors.password = 'Password is required';
    } else if (addMemberFormData.password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }

    if (Object.keys(errors).length > 0) {
      setAddMemberErrors(errors);
      return;
    }

    setIsLoading(true);
    try {
      // First, create the user
      const userData = {
        name: addMemberFormData.name,
        email: addMemberFormData.email,
        password: addMemberFormData.password,
        role: addMemberFormData.role,
        department: currentDepartment._id
      };

      // Assuming there's a register endpoint or createUser method
      // For now, using a placeholder - you may need to adjust based on your backend
      const createUserResponse = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      });

      if (!createUserResponse.ok) {
        const errorData = await createUserResponse.json();
        throw new Error(errorData.message || 'Failed to create user');
      }

      const newUser = await createUserResponse.json();

      // Then assign to department
      await assignUserToDepartment(newUser.user.id, currentDepartment._id);

      setShowAddMemberModal(false);
      setAddMemberFormData({
        name: '',
        email: '',
        password: '',
        department: '',
        role: 'employee'
      });
      setAddMemberErrors({});
      showToast('Member added successfully!', 'success');
      loadUsers();
    } catch (error) {
      console.error('Error adding member:', error);
      showToast(error.message || 'Failed to add member', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const openEditModal = (dept) => {
    setCurrentDepartment(dept);
    setFormData({
      name: dept.name,
      description: dept.description || '',
      managers: dept.managers || []
    });
    setShowEditModal(true);
  };

  const isAdminOrManager = user && (user.role === 'admin' || user.role === 'manager');
  const isAdmin = user && user.role === 'admin';

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = filterRole === 'all' || emp.role === filterRole;
    return matchesSearch && matchesRole;
  });

  if (!isAdminOrManager) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-gray-100">
        <Sidebar />
        <div className="flex-1 lg:ml-64">
          <Header />
          <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white border-l-4 border-red-500 shadow-xl rounded-2xl p-8"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 bg-red-100 rounded-full">
                  <Shield className="text-red-600" size={28} />
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900 mb-2">Access Denied</p>
                  <p className="text-gray-600 leading-relaxed">
                    Only administrators and managers can manage teams and departments. 
                    Please contact your administrator for access.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-gray-100">
      <Sidebar />
      <div className="flex-1 lg:ml-64">
        <Header />
        <main className="p-4 sm:p-6 lg:p-8">
          {/* Header Section */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 flex items-center gap-3 mb-2">
                  <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg">
                    <Building2 className="text-white" size={32} />
                  </div>
                  Department Management
                </h1>
                <p className="text-gray-600">Create, manage, and organize your teams efficiently</p>
              </div>
              
              {/* Quick Stats */}
              <div className="flex gap-3">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="bg-white rounded-xl shadow-sm p-4 border border-gray-100"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Building2 className="text-blue-600" size={20} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{stats.totalDepartments}</p>
                      <p className="text-xs text-gray-600">Departments</p>
                    </div>
                  </div>
                </motion.div>
                
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="bg-white rounded-xl shadow-sm p-4 border border-gray-100"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <Users className="text-green-600" size={20} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{stats.totalMembers}</p>
                      <p className="text-xs text-gray-600">Total Employees</p>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Left Column - Department List */}
            <div className="xl:col-span-1 space-y-6">
              {/* Create Department Card */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl shadow-xl p-6 text-white"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-white/20 backdrop-blur-sm rounded-xl">
                    <Plus size={24} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">New Department</h2>
                    <p className="text-sm text-blue-100">Create a new team</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="w-full py-3 bg-white text-blue-600 rounded-xl font-semibold hover:bg-blue-50 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  Create Department
                </button>
              </motion.div>

              {/* Departments List */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
              >
                <div className="p-5 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <Building2 size={20} className="text-blue-600" />
                      Departments
                    </h2>
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">
                      {departments.length}
                    </span>
                  </div>
                </div>
                <div className="max-h-[600px] overflow-y-auto">
                  <AnimatePresence>
                    {departments.length === 0 ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="p-12 text-center text-gray-500"
                      >
                        <Building2 size={48} className="mx-auto mb-3 text-gray-300" />
                        <p className="font-medium">No departments yet</p>
                        <p className="text-sm mt-1">Create your first department to get started</p>
                      </motion.div>
                    ) : (
                      departments.map((dept, index) => (
                        <motion.div
                          key={dept._id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          transition={{ delay: index * 0.05 }}
                          onClick={() => setCurrentDepartment(dept)}
                          className={`p-5 border-b border-gray-100 cursor-pointer transition-all hover:bg-gray-50 ${
                            currentDepartment?._id === dept._id
                              ? 'bg-blue-50 border-l-4 border-l-blue-600 shadow-sm'
                              : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg">
                                  <Building2 size={16} className="text-white" />
                                </div>
                                <h3 className="font-semibold text-gray-900 truncate">
                                  {dept.name}
                                </h3>
                              </div>
                              {dept.description && (
                                <p className="text-sm text-gray-600 mb-3 line-clamp-2">{dept.description}</p>
                              )}
                              <div className="flex flex-wrap items-center gap-3 text-xs">
                                <span className="flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded-lg font-medium">
                                  <Shield size={12} />
                                  {dept.managers?.length ? `${dept.managers.length} manager${dept.managers.length > 1 ? 's' : ''}` : 'No manager'}
                                </span>
                                <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-lg font-medium">
                                  <Users size={12} />
                                  {dept.members?.length || 0} employees
                                </span>
                                <span className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-lg font-medium">
                                  <Building2 size={12} />
                                  {dept.projectsCount || 0} projects
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-col gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditModal(dept);
                                }}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Edit"
                              >
                                <Edit2 size={16} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDepartmentToDelete(dept);
                                  setShowDeleteModal(true);
                                }}
                                className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            </div>

            {/* Right Column - Assign Members */}
            <div className="xl:col-span-2">
              {currentDepartment ? (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
                >
                  <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div>
                        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3 mb-2">
                          <div className="p-2 bg-blue-600 rounded-xl shadow-lg">
                            <UserPlus className="text-white" size={24} />
                          </div>
                          {currentDepartment.name}
                        </h2>
                        <p className="text-sm text-gray-600">Select employees to add to this department</p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-sm">
                          <Award className="text-purple-600" size={20} />
                          <span className="font-semibold text-gray-900">
                            {currentDepartment.members?.length || 0} Members
                          </span>
                        </div>
                        {isAdmin && (
                          <button
                            onClick={() => setShowAddMemberModal(true)}
                            className="px-4 py-2 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-xl hover:from-green-700 hover:to-blue-700 transition-all shadow-lg shadow-green-500/30 font-semibold flex items-center gap-2"
                          >
                            <UserPlus size={16} />
                            Add Member
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-6">
                    {/* Search and Filter */}
                    <div className="flex flex-col sm:flex-row gap-3 mb-6">
                      <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                        <input
                          type="text"
                          placeholder="Search by name or email..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        />
                      </div>
                      <button
                        onClick={handleSelectAll}
                        className="px-4 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium whitespace-nowrap"
                      >
                        {selectedUsers.length === filteredEmployees.length && filteredEmployees.length > 0
                          ? 'Deselect All'
                          : 'Select All'}
                      </button>
                    </div>

                    {/* Employee List */}
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <div className="max-h-96 overflow-y-auto">
                        {isLoading ? (
                          <div className="p-12 text-center">
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                              className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"
                            />
                            <p className="text-gray-600">Loading employees...</p>
                          </div>
                        ) : filteredEmployees.length === 0 ? (
                          <div className="p-12 text-center text-gray-500">
                            <Users size={48} className="mx-auto mb-4 text-gray-300" />
                            <p className="font-semibold mb-2">No employees found</p>
                            <p className="text-sm">Try adjusting your search criteria</p>
                          </div>
                        ) : (
                          <AnimatePresence>
                            {filteredEmployees.map((employee, index) => (
                              <motion.label
                                key={employee._id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ delay: index * 0.03 }}
                                className={`flex items-center p-4 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-all ${
                                  selectedUsers.includes(employee._id) ? 'bg-blue-50' : ''
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedUsers.includes(employee._id)}
                                  onChange={() => handleUserSelection(employee._id)}
                                  className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                                />
                                <div className="ml-4 flex-1">
                                  <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg">
                                      <span className="text-white font-bold text-lg">
                                        {employee.name?.[0]?.toUpperCase()}
                                      </span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-semibold text-gray-900 truncate">{employee.name}</p>
                                      <div className="flex items-center gap-2 mt-1">
                                        <Mail size={12} className="text-gray-400" />
                                        <p className="text-sm text-gray-600 truncate">{employee.email}</p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                {employee.department?.name === currentDepartment.name && (
                                  <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="flex items-center gap-2"
                                  >
                                    <span className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded-full font-semibold shadow-sm">
                                      <CheckCircle size={14} />
                                      Assigned
                                    </span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleUnassignUser(employee._id);
                                      }}
                                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                      title="Unassign from department"
                                    >
                                      <UserPlus size={14} className="rotate-45" />
                                    </button>
                                  </motion.div>
                                )}
                              </motion.label>
                            ))}
                          </AnimatePresence>
                        )}
                      </div>
                    </div>

                    {/* Assign Button */}
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleAssignUsers}
                      disabled={selectedUsers.length === 0 || isLoading}
                      className="w-full mt-6 py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all shadow-xl shadow-blue-500/30 flex items-center justify-center gap-2"
                    >
                      {isLoading ? (
                        <>
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                          />
                          Processing...
                        </>
                      ) : (
                        <>
                          <UserPlus size={20} />
                          Assign {selectedUsers.length > 0 && `(${selectedUsers.length})`} Employee{selectedUsers.length !== 1 ? 's' : ''}
                        </>
                      )}
                    </motion.button>

                    {/* Selected Count */}
                    <AnimatePresence>
                      {selectedUsers.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-600 rounded-lg">
                              <CheckCircle className="text-white" size={20} />
                            </div>
                            <span className="font-semibold text-blue-900">
                              {selectedUsers.length} employee{selectedUsers.length !== 1 ? 's' : ''} selected
                            </span>
                          </div>
                          <button
                            onClick={() => setSelectedUsers([])}
                            className="text-sm text-blue-600 hover:text-blue-800 font-semibold hover:underline"
                          >
                            Clear Selection
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white rounded-2xl shadow-sm p-16 text-center border border-gray-100"
                >
                  <motion.div
                    animate={{ 
                      y: [0, -10, 0],
                      rotate: [0, 5, -5, 0]
                    }}
                    transition={{ 
                      duration: 3,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  >
                    <Building2 size={80} className="mx-auto mb-6 text-gray-300" />
                  </motion.div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">Select a Department</h3>
                  <p className="text-gray-600 max-w-md mx-auto">
                    Choose a department from the list to view and manage its members
                  </p>
                </motion.div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Create Department Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => !isLoading && setShowCreateModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-indigo-600 p-6 rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/20 backdrop-blur-sm rounded-xl">
                      <Plus className="text-white" size={24} />
                    </div>
                    <h3 className="text-2xl font-bold text-white">Create New Department</h3>
                  </div>
                  <button
                    onClick={() => !isLoading && setShowCreateModal(false)}
                    disabled={isLoading}
                    className="p-2 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <X size={24} className="text-white" />
                  </button>
                </div>
              </div>

              <form onSubmit={handleCreateDepartment} className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Department Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Engineering, Marketing, Sales"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    required
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of the department's role and responsibilities"
                    rows={4}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-all"
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Department Managers
                  </label>
                  <select
                    multiple
                    value={formData.managers}
                    onChange={(e) => {
                      const selected = Array.from(e.target.selectedOptions, option => option.value);
                      setFormData({ ...formData, managers: selected });
                    }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    disabled={isLoading}
                  >
                    {managers.map(manager => (
                      <option key={manager._id} value={manager._id}>
                        {manager.name} - {manager.email}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    disabled={isLoading}
                    className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-semibold disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg shadow-blue-500/30 font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                        />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus size={20} />
                        Create Department
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Department Modal */}
      <AnimatePresence>
        {showEditModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => !isLoading && setShowEditModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-purple-600 p-6 rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/20 backdrop-blur-sm rounded-xl">
                      <Edit2 className="text-white" size={24} />
                    </div>
                    <h3 className="text-2xl font-bold text-white">Edit Department</h3>
                  </div>
                  <button
                    onClick={() => !isLoading && setShowEditModal(false)}
                    disabled={isLoading}
                    className="p-2 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <X size={24} className="text-white" />
                  </button>
                </div>
              </div>

              <form onSubmit={handleEditDepartment} className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Department Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Engineering, Marketing, Sales"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    required
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of the department's role and responsibilities"
                    rows={4}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition-all"
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Department Managers
                  </label>
                  <select
                    multiple
                    value={formData.managers}
                    onChange={(e) => {
                      const selected = Array.from(e.target.selectedOptions, option => option.value);
                      setFormData({ ...formData, managers: selected });
                    }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    disabled={isLoading}
                  >
                    {managers.map(manager => (
                      <option key={manager._id} value={manager._id}>
                        {manager.name} - {manager.email}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    disabled={isLoading}
                    className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-semibold disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg shadow-indigo-500/30 font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                        />
                        Updating...
                      </>
                    ) : (
                      <>
                        <CheckCircle size={20} />
                        Update Department
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteModal && departmentToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => !isLoading && setShowDeleteModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full"
            >
              <div className="p-6">
                <div className="flex items-center gap-4 mb-6">
                  <motion.div
                    animate={{
                      scale: [1, 1.1, 1],
                      rotate: [0, -10, 10, -10, 0]
                    }}
                    transition={{
                      duration: 0.5,
                      repeat: Infinity,
                      repeatDelay: 2
                    }}
                    className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center flex-shrink-0"
                  >
                    <Trash2 size={32} className="text-red-600" />
                  </motion.div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-1">Delete Department?</h3>
                    <p className="text-sm text-gray-600">This action cannot be undone</p>
                  </div>
                </div>

                <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
                  <p className="text-gray-700 text-sm leading-relaxed">
                    Are you sure you want to delete <span className="font-bold text-red-700">{departmentToDelete.name}</span>?
                    All members will be unassigned and associated data will be permanently removed.
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDeleteModal(false)}
                    disabled={isLoading}
                    className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-semibold disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteDepartment}
                    disabled={isLoading}
                    className="flex-1 px-6 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                        />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 size={20} />
                        Delete Department
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Member Modal */}
      <AnimatePresence>
        {showAddMemberModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => !isLoading && setShowAddMemberModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="sticky top-0 bg-gradient-to-r from-green-600 to-blue-600 p-6 rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/20 backdrop-blur-sm rounded-xl">
                      <UserPlus className="text-white" size={24} />
                    </div>
                    <h3 className="text-2xl font-bold text-white">Add New Member</h3>
                  </div>
                  <button
                    onClick={() => !isLoading && setShowAddMemberModal(false)}
                    disabled={isLoading}
                    className="p-2 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <X size={24} className="text-white" />
                  </button>
                </div>
              </div>

              <form onSubmit={handleAddMember} className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={addMemberFormData.name}
                    onChange={(e) => setAddMemberFormData({ ...addMemberFormData, name: e.target.value })}
                    placeholder="Enter full name"
                    className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all ${
                      addMemberErrors.name ? 'border-red-300' : 'border-gray-300'
                    }`}
                    required
                    disabled={isLoading}
                  />
                  {addMemberErrors.name && (
                    <p className="text-red-500 text-sm mt-1">{addMemberErrors.name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    value={addMemberFormData.email}
                    onChange={(e) => setAddMemberFormData({ ...addMemberFormData, email: e.target.value })}
                    placeholder="Enter email address"
                    className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all ${
                      addMemberErrors.email ? 'border-red-300' : 'border-gray-300'
                    }`}
                    required
                    disabled={isLoading}
                  />
                  {addMemberErrors.email && (
                    <p className="text-red-500 text-sm mt-1">{addMemberErrors.email}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Password *
                  </label>
                  <input
                    type="password"
                    value={addMemberFormData.password}
                    onChange={(e) => setAddMemberFormData({ ...addMemberFormData, password: e.target.value })}
                    placeholder="Enter password (min 6 characters)"
                    className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all ${
                      addMemberErrors.password ? 'border-red-300' : 'border-gray-300'
                    }`}
                    required
                    disabled={isLoading}
                  />
                  {addMemberErrors.password && (
                    <p className="text-red-500 text-sm mt-1">{addMemberErrors.password}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Role
                  </label>
                  <select
                    value={addMemberFormData.role}
                    onChange={(e) => setAddMemberFormData({ ...addMemberFormData, role: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                    disabled={isLoading}
                  >
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAddMemberModal(false)}
                    disabled={isLoading}
                    className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-semibold disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-xl hover:from-green-700 hover:to-blue-700 transition-all shadow-lg shadow-green-500/30 font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
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

      {/* Toast Notifications */}
      <div className="fixed top-4 right-4 z-[100] space-y-2">
        <AnimatePresence>
          {toast && (
            <Toast
              message={toast.message}
              type={toast.type}
              onClose={() => setToast(null)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default TeamManagement;