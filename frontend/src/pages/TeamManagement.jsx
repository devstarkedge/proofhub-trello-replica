import React, { useContext, useEffect, useReducer, useMemo, useCallback, Suspense, lazy, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, Shield, Users } from 'lucide-react';
import AuthContext from '../context/AuthContext';
import Database from '../services/database';
import useDepartmentStore from '../store/departmentStore';
import useRoleStore from '../store/roleStore';
import useThemeStore from '../store/themeStore';
import DepartmentList from '../components/TeamManagement/DepartmentList';
import EmployeeAssignment from '../components/TeamManagement/EmployeeAssignment';
import TeamStats from '../components/TeamManagement/TeamStats';
import RoleManagementPanel from '../components/TeamManagement/RoleManagementPanel';
import Toast from '../components/TeamManagement/Toast';
import { TeamManagementSkeleton } from '../components/LoadingSkeleton';
import ErrorBoundary from '../components/TeamManagement/ErrorBoundary';
import { teamManagementReducer, initialState, ACTION_TYPES } from '../components/TeamManagement/teamManagementReducer';
import { validateForm } from '../utils/validationUtils';
import EditDepartmentModal from '../components/EditDepartmentModal';

// Lazy load modals
const CreateDepartmentModal = lazy(() => import('../components/TeamManagement/modals/CreateDepartmentModal'));
const AddMemberModal = lazy(() => import('../components/TeamManagement/modals/AddMemberModal'));
const CreateRoleModal = lazy(() => import('../components/TeamManagement/modals/CreateRoleModal'));
const EditRoleModal = lazy(() => import('../components/TeamManagement/modals/EditRoleModal'));
const ReassignModal = lazy(() => import('../components/TeamManagement/modals/ReassignModal'));
const DeleteConfirmationModal = lazy(() => import('../components/TeamManagement/modals/DeleteConfirmationModal'));


/**
 * Main TeamManagement Page Component
 * Optimized container that manages state, data, and layout
 * Features:
 * - useReducer for consolidated state management
 * - useMemo for computed values
 * - useCallback for memoized event handlers
 * - Lazy-loaded modals for code splitting
 * - React.memo on child components
 * - Error boundary for crash handling
 * - Debounced search
 */
const TeamManagement = () => {
  const { user } = useContext(AuthContext);
  const { effectiveMode } = useThemeStore();
  const isDarkMode = effectiveMode === 'dark';
  const {
    departments,
    currentDepartment,
    setCurrentDepartment,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    assignUserToDepartment,
    unassignUserFromDepartment,
    loading: departmentsLoading
  } = useDepartmentStore();

  // Role store for custom roles management
  const { roles, createRole, updateRole, deleteRole, loadRoles, initialized: rolesInitialized } = useRoleStore();
  
  // Create Role Modal state
  const [showCreateRoleModal, setShowCreateRoleModal] = useState(false);
  const [createRoleLoading, setCreateRoleLoading] = useState(false);

  // Edit Role Modal state
  const [showEditRoleModal, setShowEditRoleModal] = useState(false);
  const [editRoleLoading, setEditRoleLoading] = useState(false);
  const [roleToEdit, setRoleToEdit] = useState(null);

  // Tab state for switching between Departments and Roles management
  const [activeManagementTab, setActiveManagementTab] = useState('departments');

  // Consolidated state management with useReducer
  const [state, dispatch] = useReducer(teamManagementReducer, initialState);

  // Load roles on mount
  useEffect(() => {
    if (!rolesInitialized) {
      loadRoles().catch(console.error);
    }
  }, [rolesInitialized, loadRoles]);

  // Track departments loading
  useEffect(() => {
    if (departmentsLoading) {
      dispatch({ type: ACTION_TYPES.SET_IS_LOADING, payload: true });
    } else {
      dispatch({ type: ACTION_TYPES.SET_IS_LOADING, payload: false });
    }
  }, [departmentsLoading]);

  // Compute assigned and available employees with useMemo
  const { assignedEmployees, availableEmployees } = useMemo(() => {
    if (!state.currentDepartment) return { assignedEmployees: [], availableEmployees: [] };

    const assigned = state.employees.filter(emp =>
      state.currentDepartment?.members?.some(member => member._id === emp._id)
    );

    const available = state.employees.filter(emp =>
      !state.currentDepartment?.members?.some(member => member._id === emp._id)
    );

    return { assignedEmployees: assigned, availableEmployees: available };
  }, [state.employees, state.currentDepartment]);

  // Filter employees based on search
  const filteredAssignedEmployees = useMemo(() => {
    return assignedEmployees.filter(emp => {
      const matchesSearch = emp.name.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
        emp.email.toLowerCase().includes(state.searchQuery.toLowerCase());
      return matchesSearch;
    });
  }, [assignedEmployees, state.searchQuery]);

  const filteredAvailableEmployees = useMemo(() => {
    return availableEmployees.filter(emp => {
      const matchesSearch = emp.name.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
        emp.email.toLowerCase().includes(state.searchQuery.toLowerCase());
      return matchesSearch;
    });
  }, [availableEmployees, state.searchQuery]);

  // Toast notification handler
  const showToast = useCallback((message, type = 'info') => {
    dispatch({ type: ACTION_TYPES.SHOW_TOAST, payload: { message, type } });
  }, []);

  // Load users from API
  const loadUsers = useCallback(async () => {
    dispatch({ type: ACTION_TYPES.SET_IS_LOADING, payload: true });
    try {
      const userList = await Database.getUsers();
      const allUsers = userList.data || [];
      dispatch({ type: ACTION_TYPES.SET_USERS, payload: allUsers });
      dispatch({ type: ACTION_TYPES.SET_MANAGERS, payload: allUsers.filter(u => u.role === 'manager' || u.role === 'admin') });
      dispatch({ type: ACTION_TYPES.SET_EMPLOYEES, payload: allUsers.filter(u => u.isVerified && u.role === 'employee') });
    } catch (error) {
      console.error('Error loading users:', error);
      showToast('Failed to load users', 'error');
    } finally {
      dispatch({ type: ACTION_TYPES.SET_IS_LOADING, payload: false });
    }
  }, [showToast]);

  // Load initial data
  useEffect(() => {
    loadUsers();
    useDepartmentStore.getState().loadDepartments();
  }, [loadUsers]);

  // Initialize socket listeners
  useEffect(() => {
    const cleanup = useDepartmentStore.getState().initializeSocketListeners();
    return cleanup;
  }, []);

  // Auto-select and persist department
  useEffect(() => {
    if (departments.length > 0 && !state.currentDepartment) {
      const savedDepartmentId = localStorage.getItem('selectedDepartmentId');
      const savedDepartment = savedDepartmentId ?
        departments.find(dept => dept._id === savedDepartmentId) : null;

      const dept = savedDepartment || departments[0];
      dispatch({ type: ACTION_TYPES.SET_CURRENT_DEPARTMENT, payload: dept });
      setCurrentDepartment(dept);
    }
  }, [departments, state.currentDepartment, setCurrentDepartment]);

  useEffect(() => {
    if (state.currentDepartment) {
      localStorage.setItem('selectedDepartmentId', state.currentDepartment._id);
    }
  }, [state.currentDepartment]);

  // Calculate stats with useMemo
  const stats = useMemo(() => {
    const totalMembers = departments.reduce((acc, dept) => acc + (dept.members?.length || 0), 0);
    const totalManagers = state.managers.filter(m => m.role === 'manager').length;
    return {
      totalDepartments: departments.length,
      totalMembers: state.employees.length,
      totalManagers: totalManagers,
      avgMembersPerDept: departments.length > 0 ? Math.round(totalMembers / departments.length) : 0
    };
  }, [departments, state.employees, state.managers]);

  // Memoized event handlers
  const handleSelectDepartment = useCallback((dept) => {
    dispatch({ type: ACTION_TYPES.SET_CURRENT_DEPARTMENT, payload: dept });
    setCurrentDepartment(dept);
  }, [setCurrentDepartment]);

  const handleSelectUser = useCallback((userId) => {
    if (state.selectedUsers.includes(userId)) {
      dispatch({ type: ACTION_TYPES.DESELECT_USER, payload: userId });
    } else {
      dispatch({ type: ACTION_TYPES.SELECT_USER, payload: userId });
    }
  }, [state.selectedUsers]);

  const handleSelectAll = useCallback(() => {
    const currentEmployees = state.activeTab === 'assigned' ? filteredAssignedEmployees : filteredAvailableEmployees;
    if (state.selectedUsers.length === currentEmployees.length && currentEmployees.length > 0) {
      dispatch({ type: ACTION_TYPES.CLEAR_SELECTED_USERS });
    } else {
      dispatch({ type: ACTION_TYPES.SELECT_ALL_USERS, payload: currentEmployees.map(emp => emp._id) });
    }
  }, [state.activeTab, state.selectedUsers, filteredAssignedEmployees, filteredAvailableEmployees]);

  const handleSearchChange = useCallback((query) => {
    dispatch({ type: ACTION_TYPES.SET_SEARCH_QUERY, payload: query });
  }, []);

  const handleTabChange = useCallback((tab) => {
    dispatch({ type: ACTION_TYPES.SET_ACTIVE_TAB, payload: tab });
  }, []);

  const handleCreateDepartment = useCallback(async (e) => {
    e.preventDefault();
    if (!state.formData.name.trim()) {
      showToast('Department name is required', 'warning');
      return;
    }
    dispatch({ type: ACTION_TYPES.SET_IS_LOADING, payload: true });
    try {
      await createDepartment(state.formData.name, state.formData.description, state.formData.managers.length > 0 ? state.formData.managers : [user._id]);
      dispatch({ type: ACTION_TYPES.CLOSE_CREATE_MODAL });
      dispatch({ type: ACTION_TYPES.RESET_FORM_DATA });
      showToast('Department created successfully!', 'success');
    } catch (error) {
      showToast('Failed to create department', 'error');
    } finally {
      dispatch({ type: ACTION_TYPES.SET_IS_LOADING, payload: false });
    }
  }, [state.formData, user, createDepartment, showToast]);

  const handleEditDepartment = useCallback(async (e) => {
    e.preventDefault();
    if (!state.formData.name.trim()) {
      showToast('Department name is required', 'warning');
      return;
    }
    dispatch({ type: ACTION_TYPES.SET_IS_LOADING, payload: true });
    try {
      await updateDepartment(state.currentDepartment._id, state.formData);
      dispatch({ type: ACTION_TYPES.CLOSE_EDIT_MODAL });
      dispatch({ type: ACTION_TYPES.RESET_FORM_DATA });
      showToast('Department updated successfully!', 'success');
    } catch (error) {
      showToast('Failed to update department', 'error');
    } finally {
      dispatch({ type: ACTION_TYPES.SET_IS_LOADING, payload: false });
    }
  }, [state.formData, state.currentDepartment, updateDepartment, showToast]);

  const handleAssignUsers = useCallback(async () => {
    if (!state.selectedUsers.length || !state.currentDepartment) {
      showToast('Please select at least one employee', 'warning');
      return;
    }

    const employeesToCheck = state.employees.filter(emp => state.selectedUsers.includes(emp._id));
    const employeesWithOtherAssignments = employeesToCheck.filter(emp =>
      emp.department && emp.department.length > 0 &&
      !emp.department.some(dept => (typeof dept === 'string' ? dept : dept._id || dept) === state.currentDepartment._id)
    );

    if (employeesWithOtherAssignments.length > 0) {
      const employee = employeesWithOtherAssignments[0];
      const otherDepartments = employee.department.filter(dept =>
        (typeof dept === 'string' ? dept : dept._id || dept) !== state.currentDepartment._id
      );
      const otherDeptNames = departments
        .filter(dept => otherDepartments.some(otherDept =>
          (typeof otherDept === 'string' ? otherDept : otherDept._id || otherDept) === dept._id
        ))
        .map(dept => dept.name)
        .join(', ');

      dispatch({
        type: ACTION_TYPES.SET_REASSIGN_DATA,
        payload: {
          employee,
          otherDeptNames,
          selectedDepartment: state.currentDepartment.name,
          selectedUsers: state.selectedUsers,
          currentDepartment: state.currentDepartment
        }
      });
      dispatch({ type: ACTION_TYPES.OPEN_REASSIGN_MODAL });
      return;
    }

    await performAssignment(state.selectedUsers, state.currentDepartment);
  }, [state.selectedUsers, state.currentDepartment, state.employees, departments, showToast]);

  const performAssignment = useCallback(async (userIds, department) => {
    dispatch({ type: ACTION_TYPES.SET_IS_LOADING, payload: true });
    try {
      // Optimistic update
      dispatch({
        type: ACTION_TYPES.UPDATE_EMPLOYEES_DEPARTMENT,
        payload: { userIds, departmentId: department._id, assign: true }
      });
      dispatch({
        type: ACTION_TYPES.UPDATE_CURRENT_DEPARTMENT_MEMBERS,
        payload: { userIds, assign: true }
      });

      // API calls
      for (const userId of userIds) {
        await assignUserToDepartment(userId, department._id);
      }

      dispatch({ type: ACTION_TYPES.CLEAR_SELECTED_USERS });
      const employeeNames = state.employees.filter(emp => userIds.includes(emp._id)).map(emp => emp.name).join(', ');
      showToast(`Employees ${employeeNames} successfully assigned to ${department.name}.`, 'success');
      
      await loadUsers();
      dispatch({ type: ACTION_TYPES.SET_CURRENT_DEPARTMENT, payload: department });
      dispatch({ type: ACTION_TYPES.SET_ACTIVE_TAB, payload: 'assigned' });
    } catch (error) {
      showToast('Failed to assign users', 'error');
      // Revert optimistic updates
      dispatch({
        type: ACTION_TYPES.UPDATE_EMPLOYEES_DEPARTMENT,
        payload: { userIds, departmentId: department._id, assign: false }
      });
      dispatch({
        type: ACTION_TYPES.UPDATE_CURRENT_DEPARTMENT_MEMBERS,
        payload: { userIds, departmentId: department._id, assign: false }
      });
    } finally {
      dispatch({ type: ACTION_TYPES.SET_IS_LOADING, payload: false });
    }
  }, [state.employees, assignUserToDepartment, loadUsers, showToast]);

  const handleReassignConfirm = useCallback(async () => {
    if (!state.reassignData) return;
    dispatch({ type: ACTION_TYPES.CLOSE_REASSIGN_MODAL });
    await performAssignment(state.reassignData.selectedUsers, state.reassignData.currentDepartment);
    dispatch({ type: ACTION_TYPES.SET_REASSIGN_DATA, payload: null });
  }, [state.reassignData, performAssignment]);

  const handleReassignCancel = useCallback(() => {
    dispatch({ type: ACTION_TYPES.CLOSE_REASSIGN_MODAL });
    dispatch({ type: ACTION_TYPES.SET_REASSIGN_DATA, payload: null });
    dispatch({ type: ACTION_TYPES.CLEAR_SELECTED_USERS });
  }, []);

  const handleUnassignUsers = useCallback(async () => {
    if (!state.selectedUsers.length || !state.currentDepartment) {
      showToast('Please select at least one employee', 'warning');
      return;
    }
    dispatch({ type: ACTION_TYPES.SET_IS_LOADING, payload: true });
    try {
      // Optimistic update
      dispatch({
        type: ACTION_TYPES.UPDATE_EMPLOYEES_DEPARTMENT,
        payload: { userIds: state.selectedUsers, departmentId: state.currentDepartment._id, assign: false }
      });
      dispatch({
        type: ACTION_TYPES.UPDATE_CURRENT_DEPARTMENT_MEMBERS,
        payload: { userIds: state.selectedUsers, assign: false }
      });

      for (const userId of state.selectedUsers) {
        await unassignUserFromDepartment(userId, state.currentDepartment._id);
      }
      dispatch({ type: ACTION_TYPES.CLEAR_SELECTED_USERS });
      showToast(`${state.selectedUsers.length} employee(s) unassigned successfully!`, 'success');
      await loadUsers();
    } catch (error) {
      showToast('Failed to unassign users', 'error');
      // Revert optimistic updates
      dispatch({
        type: ACTION_TYPES.UPDATE_EMPLOYEES_DEPARTMENT,
        payload: { userIds: state.selectedUsers, departmentId: state.currentDepartment._id, assign: true }
      });
      dispatch({
        type: ACTION_TYPES.UPDATE_CURRENT_DEPARTMENT_MEMBERS,
        payload: { userIds: state.selectedUsers, assign: true }
      });
    } finally {
      dispatch({ type: ACTION_TYPES.SET_IS_LOADING, payload: false });
    }
  }, [state.selectedUsers, state.currentDepartment, unassignUserFromDepartment, loadUsers, showToast]);

  const handleAddMember = useCallback(async (e) => {
    e.preventDefault();
    const fieldsToValidate = ['name', 'email', 'password'];
    const { isValid, errors: validationErrors } = validateForm(state.addMemberFormData, fieldsToValidate);

    if (!isValid) {
      dispatch({ type: ACTION_TYPES.SET_ADD_MEMBER_ERRORS, payload: validationErrors });
      return;
    }

    dispatch({ type: ACTION_TYPES.SET_IS_LOADING, payload: true });
    try {
      const userData = {
        name: state.addMemberFormData.name,
        email: state.addMemberFormData.email,
        password: state.addMemberFormData.password,
        role: state.addMemberFormData.role,
        department: state.currentDepartment._id
      };

      const token = localStorage.getItem('token');
      const createUserResponse = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/auth/admin-create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify(userData)
      });

      if (!createUserResponse.ok) {
        const errorData = await createUserResponse.json();
        dispatch({ type: ACTION_TYPES.SET_IS_LOADING, payload: false }); // Stop loading immediately on error
        throw new Error(errorData.message || 'Failed to create user');
      }

      const newUser = await createUserResponse.json();
      dispatch({ type: ACTION_TYPES.SET_IS_LOADING, payload: false }); // Stop loading immediately after successful response
      
      // Close modal and reset form immediately
      dispatch({ type: ACTION_TYPES.CLOSE_ADD_MEMBER_MODAL });
      dispatch({ type: ACTION_TYPES.RESET_ADD_MEMBER_FORM });
      dispatch({ type: ACTION_TYPES.SET_ADD_MEMBER_ERRORS, payload: {} });
      
      // Show success toast immediately
      showToast('Member added successfully!', 'success');
      
      // Assign user and load users in background without blocking UI
      try {
        await assignUserToDepartment(newUser.user.id, state.currentDepartment._id);
        await loadUsers();
      } catch (backgroundError) {
        console.error('Error during background operations:', backgroundError);
      }
    } catch (error) {
      console.error('Error adding member:', error);
      dispatch({ type: ACTION_TYPES.SET_IS_LOADING, payload: false }); // Ensure loading is stopped
      
      // Provide user-friendly error messages
      let errorMessage = 'Failed to add member. Please try again.';
      
      if (error.message?.includes('already exists')) {
        errorMessage = 'Email already registered. Please use a different email.';
      } else if (error.message?.includes('password')) {
        errorMessage = 'Password must be at least 6 characters with uppercase, lowercase, and number.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      showToast(errorMessage, 'error');
    }
  }, [state.addMemberFormData, state.currentDepartment, assignUserToDepartment, loadUsers, showToast]);

  const handleOpenEditModal = useCallback((dept) => {
    dispatch({ type: ACTION_TYPES.SET_CURRENT_DEPARTMENT, payload: dept });
    setCurrentDepartment(dept);
    dispatch({
      type: ACTION_TYPES.UPDATE_FORM_DATA,
      payload: {
        name: dept.name,
        description: dept.description || '',
        managers: dept.managers || []
      }
    });
    dispatch({ type: ACTION_TYPES.OPEN_EDIT_MODAL });
  }, [setCurrentDepartment]);

  // Handle creating a new custom role
  const handleCreateRole = useCallback(async (roleData) => {
    setCreateRoleLoading(true);
    try {
      await createRole(roleData);
      setShowCreateRoleModal(false);
      showToast(`Role "${roleData.name}" created successfully!`, 'success');
    } catch (error) {
      console.error('Error creating role:', error);
      showToast(error.response?.data?.message || 'Failed to create role', 'error');
    } finally {
      setCreateRoleLoading(false);
    }
  }, [createRole, showToast]);

  // Handle updating an existing role
  const handleUpdateRole = useCallback(async (roleId, roleData) => {
    setEditRoleLoading(true);
    try {
      await updateRole(roleId, roleData);
      setShowEditRoleModal(false);
      setRoleToEdit(null);
      showToast(`Role "${roleData.name}" updated successfully!`, 'success');
    } catch (error) {
      console.error('Error updating role:', error);
      showToast(error.response?.data?.message || 'Failed to update role', 'error');
    } finally {
      setEditRoleLoading(false);
    }
  }, [updateRole, showToast]);

  // Handle deleting a role
  const handleDeleteRole = useCallback(async (role) => {
    if (!role) return;
    try {
      await deleteRole(role._id);
      setShowEditRoleModal(false);
      setRoleToEdit(null);
      showToast(`Role "${role.name}" deleted successfully!`, 'success');
    } catch (error) {
      console.error('Error deleting role:', error);
      showToast(error.response?.data?.message || 'Failed to delete role', 'error');
    }
  }, [deleteRole, showToast]);

  // Open Create Role modal from Add Member modal
  const handleOpenCreateRoleModal = useCallback(() => {
    setShowCreateRoleModal(true);
  }, []);

  // Open Edit Role Modal
  const handleOpenEditRoleModal = useCallback((role) => {
    setRoleToEdit(role);
    setShowEditRoleModal(true);
  }, []);

  const handleDeleteDepartment = useCallback(async () => {
    if (!state.departmentToDelete) return;
    dispatch({ type: ACTION_TYPES.SET_IS_LOADING, payload: true });
    try {
      await deleteDepartment(state.departmentToDelete._id);
      dispatch({ type: ACTION_TYPES.CLOSE_DELETE_MODAL });
      dispatch({ type: ACTION_TYPES.SET_DEPARTMENT_TO_DELETE, payload: null });
      showToast('Department deleted successfully', 'success');
    } catch (error) {
      showToast('Failed to delete department', 'error');
    } finally {
      dispatch({ type: ACTION_TYPES.SET_IS_LOADING, payload: false });
    }
  }, [state.departmentToDelete, deleteDepartment, showToast]);

  const isAdminOrManager = user && (user.role === 'admin' || user.role === 'manager');
  const isAdmin = user && user.role === 'admin';

  if (departmentsLoading || state.isLoading) {
    return <TeamManagementSkeleton />;
  }

  if (!isAdminOrManager) {
    return (
      <div className={`min-h-full ${isDarkMode ? 'bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-[#0a0a0a] to-black' : 'bg-gradient-to-br from-gray-50 via-blue-50/30 to-gray-100'}`}>
          <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
            {/* ... */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`${isDarkMode ? 'bg-gray-800/80 backdrop-blur-sm border-gray-700' : 'bg-white'} border-l-4 border-red-500 shadow-xl rounded-2xl p-8`}
            >
              <div className="flex items-start gap-4">
                <div className="p-3 bg-red-100 rounded-full">
                  <Shield className="text-red-600" size={28} />
                </div>
                <div>
                  <p className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'} mb-2`}>Access Denied</p>
                  <p className={`${isDarkMode ? 'text-gray-300' : 'text-gray-600'} leading-relaxed`}>
                    Only administrators and managers can manage teams and departments. 
                    Please contact your administrator for access.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
      </div>
    );
  }

  return (
    <div className={`min-h-full ${isDarkMode ? 'bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-[#0a0a0a] to-black' : 'bg-gradient-to-br from-gray-50 via-blue-50/30 to-gray-100'}`}>
        <main className="p-3 sm:p-4 md:p-6 lg:p-8 min-h-[calc(100vh-80px)]">
          <ErrorBoundary>
            {/* Header Section */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 md:mb-8"
            >
              <div className="flex flex-col gap-4">
                <div>
                  <h1 className={`text-2xl sm:text-3xl md:text-4xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'} flex items-center gap-2 sm:gap-3 mb-2`}>
                    <div className="p-1.5 sm:p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg sm:rounded-xl shadow-lg">
                      <Building2 className="text-white" size={24} />
                    </div>
                    <span>Team Management</span>
                  </h1>
                  <p className={`text-sm sm:text-base ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} ml-10 sm:ml-11`}>Manage teams, departments, and roles</p>
                </div>
                
                {/* Tab Navigation for Admin */}
                {isAdmin && (
                  <div className={`flex items-center gap-2 ${isDarkMode ? 'bg-gray-800/80 border-gray-700' : 'bg-white border-gray-100'} rounded-xl p-1 shadow-md border w-fit`}>
                    <button
                      onClick={() => setActiveManagementTab('departments')}
                      className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                        activeManagementTab === 'departments'
                          ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md'
                          : isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <Building2 size={18} />
                      Departments
                    </button>
                    <button
                      onClick={() => setActiveManagementTab('roles')}
                      className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                        activeManagementTab === 'roles'
                          ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-md'
                          : isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <Shield size={18} />
                      Roles & Permissions
                    </button>
                  </div>
                )}
                
                {/* Quick Stats - Hidden on mobile, visible on tablet+ */}
                <div className="hidden md:block">
                  <TeamStats stats={stats} isLoading={state.isLoading} />
                </div>
              </div>
            </motion.div>

            {/* Show Stats on mobile in simplified form */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="md:hidden mb-6"
            >
              <TeamStats stats={stats} isLoading={state.isLoading} />
            </motion.div>

            {/* Content based on active tab */}
            <AnimatePresence mode="wait">
              {activeManagementTab === 'departments' ? (
                <motion.div
                  key="departments"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6"
                >
                  {/* Left Column - Department List */}
                  <div className="md:col-span-1">
                    <DepartmentList
                      departments={departments}
                      currentDepartment={state.currentDepartment}
                      isLoading={state.isLoading}
                      onSelectDepartment={handleSelectDepartment}
                      onCreateClick={() => dispatch({ type: ACTION_TYPES.OPEN_CREATE_MODAL })}
                      onEditClick={handleOpenEditModal}
                      onDeleteClick={(dept) => {
                        dispatch({ type: ACTION_TYPES.SET_DEPARTMENT_TO_DELETE, payload: dept });
                        dispatch({ type: ACTION_TYPES.OPEN_DELETE_MODAL });
                      }}
                      isAdmin={isAdmin}
                      isManager={user?.role === 'manager'}
                    />
                  </div>

                  {/* Right Column - Assign Members */}
                  <div className="md:col-span-1 lg:col-span-2">
                    <EmployeeAssignment
                    currentDepartment={state.currentDepartment}
                    assignedEmployees={filteredAssignedEmployees}
                    availableEmployees={filteredAvailableEmployees}
                    selectedUsers={state.selectedUsers}
                    searchQuery={state.searchQuery}
                    activeTab={state.activeTab}
                    isLoading={state.isLoading}
                    isAdmin={isAdmin}
                    departments={departments}
                    currentPage={state.currentPage}
                    itemsPerPage={state.itemsPerPage}
                    onSelectUser={handleSelectUser}
                    onSelectAll={handleSelectAll}
                    onSearchChange={handleSearchChange}
                    onTabChange={handleTabChange}
                    onAddMemberClick={() => dispatch({ type: ACTION_TYPES.OPEN_ADD_MEMBER_MODAL })}
                    onAssignClick={handleAssignUsers}
                    onUnassignClick={handleUnassignUsers}
                    onClearSelection={() => dispatch({ type: ACTION_TYPES.CLEAR_SELECTED_USERS })}
                    onPageChange={(page) => dispatch({ type: ACTION_TYPES.SET_CURRENT_PAGE, payload: page })}
                    onItemsPerPageChange={(count) => dispatch({ type: ACTION_TYPES.SET_ITEMS_PER_PAGE, payload: count })}
                    />
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="roles"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  <RoleManagementPanel
                    onCreateRole={handleOpenCreateRoleModal}
                    onEditRole={handleOpenEditRoleModal}
                    onDeleteRole={handleDeleteRole}
                    isLoading={state.isLoading}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </ErrorBoundary>
      </main>

      {/* Lazy-loaded Modals */}
      <Suspense fallback={null}>
        <CreateDepartmentModal
          isOpen={state.showCreateModal}
          isLoading={state.isLoading}
          formData={state.formData}
            managers={state.managers}
            departments={departments}
          onFormDataChange={(data) => dispatch({ type: ACTION_TYPES.UPDATE_FORM_DATA, payload: data })}
          onSubmit={handleCreateDepartment}
          onClose={() => dispatch({ type: ACTION_TYPES.CLOSE_CREATE_MODAL })}
        />

        <EditDepartmentModal
          isOpen={state.showEditModal}
          onClose={() => dispatch({ type: ACTION_TYPES.CLOSE_EDIT_MODAL })}
          department={state.currentDepartment}
          onDepartmentUpdated={async (updatedData) => {
            dispatch({ type: ACTION_TYPES.SET_IS_LOADING, payload: true });
            try {
              await updateDepartment(state.currentDepartment._id, updatedData);
              dispatch({ type: ACTION_TYPES.CLOSE_EDIT_MODAL });
              dispatch({ type: ACTION_TYPES.RESET_FORM_DATA });
              showToast('Department updated successfully!', 'success');
            } catch (error) {
              showToast('Failed to update department', 'error');
            } finally {
              dispatch({ type: ACTION_TYPES.SET_IS_LOADING, payload: false });
            }
          }}
          managers={state.managers}
          isLoading={state.isLoading}
        />

        <AddMemberModal
          isOpen={state.showAddMemberModal}
          isLoading={state.isLoading}
          formData={state.addMemberFormData}
          errors={state.addMemberErrors}
          showPassword={state.showPassword}
          onFormDataChange={(data) => dispatch({ type: ACTION_TYPES.UPDATE_ADD_MEMBER_FORM, payload: data })}
          onShowPasswordToggle={() => dispatch({ type: ACTION_TYPES.TOGGLE_PASSWORD_VISIBILITY })}
          onSubmit={handleAddMember}
          onClose={() => dispatch({ type: ACTION_TYPES.CLOSE_ADD_MEMBER_MODAL })}
          onAddNewRole={handleOpenCreateRoleModal}
          currentUserRole={user?.role}
        />

        <CreateRoleModal
          isOpen={showCreateRoleModal}
          isLoading={createRoleLoading}
          onSubmit={handleCreateRole}
          onClose={() => setShowCreateRoleModal(false)}
          existingRoleNames={roles.map(r => r.name)}
        />

        <EditRoleModal
          isOpen={showEditRoleModal}
          isLoading={editRoleLoading}
          role={roleToEdit}
          onSubmit={handleUpdateRole}
          onDelete={handleDeleteRole}
          onClose={() => {
            setShowEditRoleModal(false);
            setRoleToEdit(null);
          }}
        />

        <ReassignModal
          isOpen={state.showReassignModal}
          isLoading={state.isLoading}
          reassignData={state.reassignData}
          onConfirm={handleReassignConfirm}
          onCancel={handleReassignCancel}
        />

        <DeleteConfirmationModal
          isOpen={state.showDeleteModal}
          isLoading={state.isLoading}
          department={state.departmentToDelete}
          onConfirm={handleDeleteDepartment}
          onCancel={() => dispatch({ type: ACTION_TYPES.CLOSE_DELETE_MODAL })}
        />
      </Suspense>

      {/* Toast Notifications */}
      <div className="fixed top-4 right-4 z-[100] space-y-2">
        <AnimatePresence>
          {state.toast && (
            <Toast
              message={state.toast.message}
              type={state.toast.type}
              onClose={() => dispatch({ type: ACTION_TYPES.HIDE_TOAST })}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default TeamManagement;
