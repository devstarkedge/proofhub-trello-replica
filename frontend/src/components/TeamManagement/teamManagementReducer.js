/**
 * State reducer for TeamManagement page
 * Consolidates multiple useState hooks into a single useReducer for better state management
 */

export const initialState = {
  // Department state
  currentDepartment: null,
  
  // User/Employee state
  users: [],
  managers: [],
  employees: [],
  
  // Selection and filtering state
  selectedUsers: [],
  searchQuery: '',
  filterRole: 'all',
  
  // UI state
  activeTab: 'assigned',
  
  // Modal visibility states
  showCreateModal: false,
  showDeleteModal: false,
  showEditModal: false,
  showAddMemberModal: false,
  showReassignModal: false,
  
  // Form data
  formData: {
    name: '',
    description: '',
    managers: []
  },
  addMemberFormData: {
    name: '',
    email: '',
    password: '',
    department: '',
    role: 'employee'
  },
  addMemberErrors: {},
  
  // Confirmation modals
  reassignData: null,
  departmentToDelete: null,
  
  // Loading and error states
  isLoading: false,
  toast: null,
  
  // UI helpers
  showPassword: false,
  
  // Stats
  stats: {
    totalDepartments: 0,
    totalMembers: 0,
    totalManagers: 0,
    avgMembersPerDept: 0
  },
  
  // Pagination state
  currentPage: 1,
  itemsPerPage: 50
};

export const ACTION_TYPES = {
  // Department actions
  SET_CURRENT_DEPARTMENT: 'SET_CURRENT_DEPARTMENT',
  SET_DEPARTMENTS_LOADING: 'SET_DEPARTMENTS_LOADING',
  
  // User data actions
  SET_USERS: 'SET_USERS',
  SET_MANAGERS: 'SET_MANAGERS',
  SET_EMPLOYEES: 'SET_EMPLOYEES',
  SET_IS_LOADING: 'SET_IS_LOADING',
  
  // Selection actions
  SELECT_USER: 'SELECT_USER',
  DESELECT_USER: 'DESELECT_USER',
  SELECT_ALL_USERS: 'SELECT_ALL_USERS',
  CLEAR_SELECTED_USERS: 'CLEAR_SELECTED_USERS',
  
  // Search and filter actions
  SET_SEARCH_QUERY: 'SET_SEARCH_QUERY',
  SET_FILTER_ROLE: 'SET_FILTER_ROLE',
  
  // Tab and UI actions
  SET_ACTIVE_TAB: 'SET_ACTIVE_TAB',
  TOGGLE_PASSWORD_VISIBILITY: 'TOGGLE_PASSWORD_VISIBILITY',
  
  // Modal actions
  OPEN_CREATE_MODAL: 'OPEN_CREATE_MODAL',
  CLOSE_CREATE_MODAL: 'CLOSE_CREATE_MODAL',
  OPEN_DELETE_MODAL: 'OPEN_DELETE_MODAL',
  CLOSE_DELETE_MODAL: 'CLOSE_DELETE_MODAL',
  OPEN_EDIT_MODAL: 'OPEN_EDIT_MODAL',
  CLOSE_EDIT_MODAL: 'CLOSE_EDIT_MODAL',
  OPEN_ADD_MEMBER_MODAL: 'OPEN_ADD_MEMBER_MODAL',
  CLOSE_ADD_MEMBER_MODAL: 'CLOSE_ADD_MEMBER_MODAL',
  OPEN_REASSIGN_MODAL: 'OPEN_REASSIGN_MODAL',
  CLOSE_REASSIGN_MODAL: 'CLOSE_REASSIGN_MODAL',
  
  // Form actions
  UPDATE_FORM_DATA: 'UPDATE_FORM_DATA',
  RESET_FORM_DATA: 'RESET_FORM_DATA',
  UPDATE_ADD_MEMBER_FORM: 'UPDATE_ADD_MEMBER_FORM',
  RESET_ADD_MEMBER_FORM: 'RESET_ADD_MEMBER_FORM',
  SET_ADD_MEMBER_ERRORS: 'SET_ADD_MEMBER_ERRORS',
  
  // Confirmation data actions
  SET_REASSIGN_DATA: 'SET_REASSIGN_DATA',
  SET_DEPARTMENT_TO_DELETE: 'SET_DEPARTMENT_TO_DELETE',
  
  // Toast actions
  SHOW_TOAST: 'SHOW_TOAST',
  HIDE_TOAST: 'HIDE_TOAST',
  
  // Stats actions
  SET_STATS: 'SET_STATS',
  
  // Pagination actions
  SET_CURRENT_PAGE: 'SET_CURRENT_PAGE',
  SET_ITEMS_PER_PAGE: 'SET_ITEMS_PER_PAGE',
  
  // Bulk update (optimistic)
  UPDATE_EMPLOYEES_DEPARTMENT: 'UPDATE_EMPLOYEES_DEPARTMENT',
  UPDATE_CURRENT_DEPARTMENT_MEMBERS: 'UPDATE_CURRENT_DEPARTMENT_MEMBERS'
};

export const teamManagementReducer = (state, action) => {
  switch (action.type) {
    // Department actions
    case ACTION_TYPES.SET_CURRENT_DEPARTMENT:
      return { ...state, currentDepartment: action.payload };

    // User data actions
    case ACTION_TYPES.SET_USERS:
      return { ...state, users: action.payload };
    case ACTION_TYPES.SET_MANAGERS:
      return { ...state, managers: action.payload };
    case ACTION_TYPES.SET_EMPLOYEES:
      return { ...state, employees: action.payload };
    case ACTION_TYPES.SET_IS_LOADING:
      return { ...state, isLoading: action.payload };

    // Selection actions
    case ACTION_TYPES.SELECT_USER: {
      const newSelected = Array.isArray(state.selectedUsers) 
        ? [...state.selectedUsers, action.payload]
        : [action.payload];
      return { ...state, selectedUsers: newSelected };
    }
    case ACTION_TYPES.DESELECT_USER: {
      return {
        ...state,
        selectedUsers: state.selectedUsers.filter(id => id !== action.payload)
      };
    }
    case ACTION_TYPES.SELECT_ALL_USERS:
      return { ...state, selectedUsers: action.payload };
    case ACTION_TYPES.CLEAR_SELECTED_USERS:
      return { ...state, selectedUsers: [] };

    // Search and filter actions
    case ACTION_TYPES.SET_SEARCH_QUERY:
      return { ...state, searchQuery: action.payload, currentPage: 1 };
    case ACTION_TYPES.SET_FILTER_ROLE:
      return { ...state, filterRole: action.payload, currentPage: 1 };

    // Tab and UI actions
    case ACTION_TYPES.SET_ACTIVE_TAB:
      return { ...state, activeTab: action.payload, selectedUsers: [] };
    case ACTION_TYPES.TOGGLE_PASSWORD_VISIBILITY:
      return { ...state, showPassword: !state.showPassword };

    // Modal actions
    case ACTION_TYPES.OPEN_CREATE_MODAL:
      return { ...state, showCreateModal: true };
    case ACTION_TYPES.CLOSE_CREATE_MODAL:
      return { ...state, showCreateModal: false };
    case ACTION_TYPES.OPEN_DELETE_MODAL:
      return { ...state, showDeleteModal: true };
    case ACTION_TYPES.CLOSE_DELETE_MODAL:
      return { ...state, showDeleteModal: false };
    case ACTION_TYPES.OPEN_EDIT_MODAL:
      return { ...state, showEditModal: true };
    case ACTION_TYPES.CLOSE_EDIT_MODAL:
      return { ...state, showEditModal: false };
    case ACTION_TYPES.OPEN_ADD_MEMBER_MODAL:
      return { ...state, showAddMemberModal: true };
    case ACTION_TYPES.CLOSE_ADD_MEMBER_MODAL:
      return { ...state, showAddMemberModal: false };
    case ACTION_TYPES.OPEN_REASSIGN_MODAL:
      return { ...state, showReassignModal: true };
    case ACTION_TYPES.CLOSE_REASSIGN_MODAL:
      return { ...state, showReassignModal: false };

    // Form actions
    case ACTION_TYPES.UPDATE_FORM_DATA:
      return {
        ...state,
        formData: { ...state.formData, ...action.payload }
      };
    case ACTION_TYPES.RESET_FORM_DATA:
      return {
        ...state,
        formData: {
          name: '',
          description: '',
          managers: []
        }
      };
    case ACTION_TYPES.UPDATE_ADD_MEMBER_FORM:
      return {
        ...state,
        addMemberFormData: { ...state.addMemberFormData, ...action.payload }
      };
    case ACTION_TYPES.RESET_ADD_MEMBER_FORM:
      return {
        ...state,
        addMemberFormData: {
          name: '',
          email: '',
          password: '',
          department: '',
          role: 'employee'
        }
      };
    case ACTION_TYPES.SET_ADD_MEMBER_ERRORS:
      return { ...state, addMemberErrors: action.payload };

    // Confirmation data actions
    case ACTION_TYPES.SET_REASSIGN_DATA:
      return { ...state, reassignData: action.payload };
    case ACTION_TYPES.SET_DEPARTMENT_TO_DELETE:
      return { ...state, departmentToDelete: action.payload };

    // Toast actions
    case ACTION_TYPES.SHOW_TOAST:
      return { ...state, toast: action.payload };
    case ACTION_TYPES.HIDE_TOAST:
      return { ...state, toast: null };

    // Stats actions
    case ACTION_TYPES.SET_STATS:
      return { ...state, stats: action.payload };

    // Pagination actions
    case ACTION_TYPES.SET_CURRENT_PAGE:
      return { ...state, currentPage: action.payload };
    case ACTION_TYPES.SET_ITEMS_PER_PAGE:
      return { ...state, itemsPerPage: action.payload };

    // Optimistic update actions
    case ACTION_TYPES.UPDATE_EMPLOYEES_DEPARTMENT:
      return {
        ...state,
        employees: state.employees.map(emp =>
          action.payload.userIds.includes(emp._id)
            ? action.payload.assign
              ? { ...emp, department: [...(emp.department || []), action.payload.departmentId] }
              : { ...emp, department: (emp.department || []).filter(deptId => deptId !== action.payload.departmentId) }
            : emp
        )
      };

    case ACTION_TYPES.UPDATE_CURRENT_DEPARTMENT_MEMBERS:
      return {
        ...state,
        currentDepartment: state.currentDepartment
          ? {
              ...state.currentDepartment,
              members: action.payload.assign
                ? [...(state.currentDepartment.members || []), ...action.payload.userIds.map(id => ({ _id: id }))]
                : (state.currentDepartment.members || []).filter(member => !action.payload.userIds.includes(member._id))
            }
          : state.currentDepartment
      };

    default:
      return state;
  }
};
