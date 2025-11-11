import { create } from 'zustand';
import api from '../services/api';
import Database from '../services/database';

const useDepartmentStore = create((set, get) => ({
  // State
  departments: [],
  users: [],
  currentDepartment: null,
  loading: false,
  error: null,

  // Actions
  setDepartments: (departments) => set({ departments }),
  
  setUsers: (users) => set({ users }),
  
  setCurrentDepartment: (department) => set({ currentDepartment: department }),
  
  setLoading: (loading) => set({ loading }),
  
  setError: (error) => set({ error }),

  // Load all departments
  loadDepartments: async () => {
    try {
      set({ loading: true, error: null });
      const response = await Database.getDepartments();
      const departments = response.data || [];
      set({ departments, loading: false });
      return departments;
    } catch (error) {
      console.error('Error loading departments:', error);
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  // Load all users
  loadUsers: async () => {
    try {
      set({ loading: true, error: null });
      const response = await api.get('/api/users');
      const users = response.data.data || [];
      set({ users, loading: false });
      return users;
    } catch (error) {
      console.error('Error loading users:', error);
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  // Refresh both departments and users
  refreshAll: async () => {
    try {
      const [departments, users] = await Promise.all([
        get().loadDepartments(),
        get().loadUsers()
      ]);
      return { departments, users };
    } catch (error) {
      console.error('Error refreshing data:', error);
      throw error;
    }
  },

  // Create department
  createDepartment: async (name, description, managers) => {
    try {
      set({ loading: true, error: null });
      const response = await Database.createDepartment(name, description, managers);
      const newDepartment = response.data;
      
      set((state) => ({
        departments: [...state.departments, newDepartment],
        currentDepartment: newDepartment,
        loading: false
      }));
      
      return newDepartment;
    } catch (error) {
      console.error('Error creating department:', error);
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  // Update department
  updateDepartment: async (id, updates) => {
    try {
      set({ loading: true, error: null });
      const response = await Database.updateDepartment(id, updates);
      const updatedDepartment = response.data;
      
      set((state) => ({
        departments: state.departments.map(dept =>
          dept._id === id ? updatedDepartment : dept
        ),
        currentDepartment: state.currentDepartment?._id === id 
          ? updatedDepartment 
          : state.currentDepartment,
        loading: false
      }));
      
      return updatedDepartment;
    } catch (error) {
      console.error('Error updating department:', error);
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  // Delete department
  deleteDepartment: async (id) => {
    try {
      set({ loading: true, error: null });
      await Database.deleteDepartment(id);
      
      set((state) => ({
        departments: state.departments.filter(dept => dept._id !== id),
        currentDepartment: state.currentDepartment?._id === id 
          ? null 
          : state.currentDepartment,
        loading: false
      }));
    } catch (error) {
      console.error('Error deleting department:', error);
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  // Assign user to department (supports single department assignment)
  assignUserToDepartment: async (userId, departmentId) => {
    try {
      set({ loading: true, error: null });
      await Database.assignUserToDepartment(userId, departmentId);
      
      // Optimistically update local state
      set((state) => {
        // Update departments - add user to members if not already there
        const updatedDepartments = state.departments.map(dept => {
          if (dept._id === departmentId) {
            const memberExists = dept.members?.some(m => 
              (typeof m === 'string' ? m : m._id) === userId
            );
            if (!memberExists) {
              return {
                ...dept,
                members: [...(dept.members || []), { _id: userId }]
              };
            }
          }
          return dept;
        });

        // Update users - add department to user's departments array
        const updatedUsers = state.users.map(user => {
          if (user._id === userId) {
            const deptArray = Array.isArray(user.department) ? user.department : [];
            const deptExists = deptArray.some(d => 
              (typeof d === 'string' ? d : d._id) === departmentId
            );
            if (!deptExists) {
              return {
                ...user,
                department: [...deptArray, { _id: departmentId }]
              };
            }
          }
          return user;
        });

        // Update current department if it's the one being modified
        const updatedCurrentDept = state.currentDepartment?._id === departmentId
          ? updatedDepartments.find(d => d._id === departmentId)
          : state.currentDepartment;

        return {
          departments: updatedDepartments,
          users: updatedUsers,
          currentDepartment: updatedCurrentDept,
          loading: false
        };
      });

      // Refresh data to ensure consistency
      await get().refreshAll();
    } catch (error) {
      console.error('Error assigning user to department:', error);
      set({ error: error.message, loading: false });
      // Refresh on error to recover correct state
      await get().refreshAll();
      throw error;
    }
  },

  // Unassign user from department
  unassignUserFromDepartment: async (userId, departmentId) => {
    try {
      set({ loading: true, error: null });
      await Database.unassignUserFromDepartment(userId, departmentId);
      
      // Optimistically update local state
      set((state) => {
        // Update departments - remove user from members
        const updatedDepartments = state.departments.map(dept => {
          if (dept._id === departmentId) {
            return {
              ...dept,
              members: (dept.members || []).filter(m => 
                (typeof m === 'string' ? m : m._id) !== userId
              )
            };
          }
          return dept;
        });

        // Update users - remove department from user's departments array
        const updatedUsers = state.users.map(user => {
          if (user._id === userId) {
            const deptArray = Array.isArray(user.department) ? user.department : [];
            return {
              ...user,
              department: deptArray.filter(d => 
                (typeof d === 'string' ? d : d._id) !== departmentId
              )
            };
          }
          return user;
        });

        // Update current department if it's the one being modified
        const updatedCurrentDept = state.currentDepartment?._id === departmentId
          ? updatedDepartments.find(d => d._id === departmentId)
          : state.currentDepartment;

        return {
          departments: updatedDepartments,
          users: updatedUsers,
          currentDepartment: updatedCurrentDept,
          loading: false
        };
      });

      // Refresh data to ensure consistency
      await get().refreshAll();
    } catch (error) {
      console.error('Error unassigning user from department:', error);
      set({ error: error.message, loading: false });
      // Refresh on error to recover correct state
      await get().refreshAll();
      throw error;
    }
  },

  // Assign multiple users to department
  assignMultipleUsers: async (userIds, departmentId) => {
    try {
      set({ loading: true, error: null });
      
      // Assign users sequentially
      for (const userId of userIds) {
        await Database.assignUserToDepartment(userId, departmentId);
      }

      // Refresh all data after bulk assignment
      await get().refreshAll();
      set({ loading: false });
    } catch (error) {
      console.error('Error assigning multiple users:', error);
      set({ error: error.message, loading: false });
      // Refresh on error to recover correct state
      await get().refreshAll();
      throw error;
    }
  },

  // Unassign multiple users from department
  unassignMultipleUsers: async (userIds, departmentId) => {
    try {
      set({ loading: true, error: null });
      
      // Unassign users sequentially
      for (const userId of userIds) {
        await Database.unassignUserFromDepartment(userId, departmentId);
      }

      // Refresh all data after bulk unassignment
      await get().refreshAll();
      set({ loading: false });
    } catch (error) {
      console.error('Error unassigning multiple users:', error);
      set({ error: error.message, loading: false });
      // Refresh on error to recover correct state
      await get().refreshAll();
      throw error;
    }
  },

  // Assign departments to user (from HR Panel)
  assignDepartmentsToUser: async (userId, departmentIds) => {
    try {
      set({ loading: true, error: null });
      
      // Use the existing assign endpoint which supports multiple departments
      await api.put(`/api/users/${userId}/assign`, {
        departments: departmentIds,
        team: null
      });

      // Refresh all data to get updated state
      await get().refreshAll();
      set({ loading: false });
    } catch (error) {
      console.error('Error assigning departments to user:', error);
      set({ error: error.message, loading: false });
      // Refresh on error to recover correct state
      await get().refreshAll();
      throw error;
    }
  },

  // Socket event handlers for real-time updates
  handleUserAssigned: (data) => {
    const { userId, departmentId } = data;
    
    set((state) => {
      // Update departments
      const updatedDepartments = state.departments.map(dept => {
        if (dept._id === departmentId) {
          const memberExists = dept.members?.some(m => 
            (typeof m === 'string' ? m : m._id) === userId
          );
          if (!memberExists) {
            return {
              ...dept,
              members: [...(dept.members || []), { _id: userId }]
            };
          }
        }
        return dept;
      });

      // Update users
      const updatedUsers = state.users.map(user => {
        if (user._id === userId) {
          const deptArray = Array.isArray(user.department) ? user.department : [];
          const deptExists = deptArray.some(d => 
            (typeof d === 'string' ? d : d._id) === departmentId
          );
          if (!deptExists) {
            return {
              ...user,
              department: [...deptArray, { _id: departmentId }]
            };
          }
        }
        return user;
      });

      // Update current department
      const updatedCurrentDept = state.currentDepartment?._id === departmentId
        ? updatedDepartments.find(d => d._id === departmentId)
        : state.currentDepartment;

      return {
        departments: updatedDepartments,
        users: updatedUsers,
        currentDepartment: updatedCurrentDept
      };
    });
  },

  handleUserUnassigned: (data) => {
    const { userId, departmentId } = data;
    
    set((state) => {
      // Update departments
      const updatedDepartments = state.departments.map(dept => {
        if (dept._id === departmentId) {
          return {
            ...dept,
            members: (dept.members || []).filter(m => 
              (typeof m === 'string' ? m : m._id) !== userId
            )
          };
        }
        return dept;
      });

      // Update users
      const updatedUsers = state.users.map(user => {
        if (user._id === userId) {
          const deptArray = Array.isArray(user.department) ? user.department : [];
          return {
            ...user,
            department: deptArray.filter(d => 
              (typeof d === 'string' ? d : d._id) !== departmentId
            )
          };
        }
        return user;
      });

      // Update current department
      const updatedCurrentDept = state.currentDepartment?._id === departmentId
        ? updatedDepartments.find(d => d._id === departmentId)
        : state.currentDepartment;

      return {
        departments: updatedDepartments,
        users: updatedUsers,
        currentDepartment: updatedCurrentDept
      };
    });
  },

  handleDepartmentUpdated: (data) => {
    const updatedDepartment = data.department;
    
    set((state) => ({
      departments: state.departments.map(dept =>
        dept._id === updatedDepartment._id ? updatedDepartment : dept
      ),
      currentDepartment: state.currentDepartment?._id === updatedDepartment._id
        ? updatedDepartment
        : state.currentDepartment
    }));
  },

  handleUserVerified: (data) => {
    const { userId, isVerified, role, department } = data;

    set((state) => ({
      users: state.users.map(user =>
        user._id === userId
          ? { ...user, isVerified, role, department }
          : user
      )
    }));
  },

  // Initialize socket listeners
  initializeSocketListeners: () => {
    const handleUserAssigned = (event) => {
      const data = event.detail;
      get().handleUserAssigned(data);
    };

    const handleUserUnassigned = (event) => {
      const data = event.detail;
      get().handleUserUnassigned(data);
    };

    const handleUserVerified = (event) => {
      const data = event.detail;
      get().handleUserVerified(data);
    };

    // Add event listeners
    window.addEventListener('socket-user-assigned', handleUserAssigned);
    window.addEventListener('socket-user-unassigned', handleUserUnassigned);
    window.addEventListener('socket-user-verified', handleUserVerified);

    // Return cleanup function
    return () => {
      window.removeEventListener('socket-user-assigned', handleUserAssigned);
      window.removeEventListener('socket-user-unassigned', handleUserUnassigned);
      window.removeEventListener('socket-user-verified', handleUserVerified);
    };
  }
}));

export default useDepartmentStore;
