import { create } from 'zustand';
import Database from '../services/database';

/**
 * Zustand store for My Shortcuts module
 * Manages user-scoped dashboard data with real-time updates
 */
const useMyShortcutsStore = create((set, get) => ({
  // Dashboard summary data
  taskCount: 0,
  loggedTime: { hours: 0, minutes: 0, formatted: '0h 0m', totalMinutes: 0 },
  activityCount: 0,
  projectCount: 0,
  announcementCount: 0,
  
  // Detailed data
  activities: [],
  activityPagination: { page: 1, limit: 20, total: 0, pages: 0 },
  activityFilters: { type: 'all', startDate: null, endDate: null },
  
  projects: [],
  projectPagination: { page: 1, limit: 20, total: 0, pages: 0 },
  
  tasksGrouped: [],
  totalTasks: 0,
  
  announcements: [],
  announcementPagination: { page: 1, limit: 10, total: 0, pages: 0 },
  
  // Loading states per section (for progressive loading)
  loading: {
    summary: false,
    activities: false,
    projects: false,
    tasks: false,
    announcements: false
  },
  
  // Error states per section
  errors: {
    summary: null,
    activities: null,
    projects: null,
    tasks: null,
    announcements: null
  },

  // ============ Actions ============

  /**
   * Fetch dashboard summary (batched data)
   */
  fetchDashboardSummary: async () => {
    set(state => ({ loading: { ...state.loading, summary: true }, errors: { ...state.errors, summary: null } }));
    
    try {
      const response = await Database.getMyDashboardSummary();
      if (response.success) {
        set({
          taskCount: response.data.taskCount,
          loggedTime: response.data.loggedTime,
          activityCount: response.data.activityCount,
          projectCount: response.data.projectCount,
          announcementCount: response.data.announcementCount,
          loading: { ...get().loading, summary: false }
        });
      }
    } catch (error) {
      console.error('Error fetching dashboard summary:', error);
      set(state => ({
        loading: { ...state.loading, summary: false },
        errors: { ...state.errors, summary: error.message || 'Failed to load dashboard' }
      }));
    }
  },

  /**
   * Fetch user activities with pagination and filtering
   */
  fetchActivities: async (filters = {}, append = false) => {
    set(state => ({ loading: { ...state.loading, activities: true }, errors: { ...state.errors, activities: null } }));
    
    const currentFilters = { ...get().activityFilters, ...filters };
    set({ activityFilters: currentFilters });
    
    try {
      const response = await Database.getMyActivities(currentFilters);
      if (response.success) {
        set(state => ({
          activities: append 
            ? [...state.activities, ...response.data.activities]
            : response.data.activities,
          activityPagination: response.data.pagination,
          loading: { ...state.loading, activities: false }
        }));
      }
    } catch (error) {
      console.error('Error fetching activities:', error);
      set(state => ({
        loading: { ...state.loading, activities: false },
        errors: { ...state.errors, activities: error.message || 'Failed to load activities' }
      }));
    }
  },

  /**
   * Fetch user tasks grouped by project
   */
  fetchTasksGrouped: async () => {
    set(state => ({ loading: { ...state.loading, tasks: true }, errors: { ...state.errors, tasks: null } }));
    
    try {
      const response = await Database.getMyTasksGrouped();
      if (response.success) {
        set({
          tasksGrouped: response.data.projectsWithTasks,
          totalTasks: response.data.totalTasks,
          loading: { ...get().loading, tasks: false }
        });
      }
    } catch (error) {
      console.error('Error fetching tasks:', error);
      set(state => ({
        loading: { ...state.loading, tasks: false },
        errors: { ...state.errors, tasks: error.message || 'Failed to load tasks' }
      }));
    }
  },

  /**
   * Fetch user projects
   */
  fetchProjects: async (page = 1) => {
    set(state => ({ loading: { ...state.loading, projects: true }, errors: { ...state.errors, projects: null } }));
    
    try {
      const response = await Database.getMyProjects({ page });
      if (response.success) {
        set(state => ({
          projects: page === 1 
            ? response.data.projects 
            : [...state.projects, ...response.data.projects],
          projectPagination: response.data.pagination,
          loading: { ...state.loading, projects: false }
        }));
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
      set(state => ({
        loading: { ...state.loading, projects: false },
        errors: { ...state.errors, projects: error.message || 'Failed to load projects' }
      }));
    }
  },

  /**
   * Fetch user announcements
   */
  fetchAnnouncements: async (page = 1) => {
    set(state => ({ loading: { ...state.loading, announcements: true }, errors: { ...state.errors, announcements: null } }));
    
    try {
      const response = await Database.getMyAnnouncements({ page });
      if (response.success) {
        set(state => ({
          announcements: page === 1 
            ? response.data.announcements 
            : [...state.announcements, ...response.data.announcements],
          announcementPagination: response.data.pagination,
          loading: { ...state.loading, announcements: false }
        }));
      }
    } catch (error) {
      console.error('Error fetching announcements:', error);
      set(state => ({
        loading: { ...state.loading, announcements: false },
        errors: { ...state.errors, announcements: error.message || 'Failed to load announcements' }
      }));
    }
  },

  // ============ Real-time Update Handlers ============

  /**
   * Update task count (increment/decrement)
   */
  updateTaskCount: (delta) => {
    set(state => ({ taskCount: Math.max(0, state.taskCount + delta) }));
  },

  /**
   * Update logged time
   */
  updateLoggedTime: (newLoggedTime) => {
    set({ loggedTime: newLoggedTime });
  },

  /**
   * Add new activity to the top of the list
   */
  addNewActivity: (activity) => {
    set(state => ({
      activities: [activity, ...state.activities],
      activityCount: state.activityCount + 1
    }));
  },

  /**
   * Add new announcement
   */
  addNewAnnouncement: (announcement) => {
    set(state => ({
      announcements: [announcement, ...state.announcements],
      announcementCount: state.announcementCount + 1
    }));
  },

  /**
   * Update project count
   */
  updateProjectCount: (delta) => {
    set(state => ({ projectCount: Math.max(0, state.projectCount + delta) }));
  },

  /**
   * Reset all data (on logout)
   */
  reset: () => {
    set({
      taskCount: 0,
      loggedTime: { hours: 0, minutes: 0, formatted: '0h 0m', totalMinutes: 0 },
      activityCount: 0,
      projectCount: 0,
      announcementCount: 0,
      activities: [],
      projects: [],
      tasksGrouped: [],
      totalTasks: 0,
      announcements: [],
      loading: { summary: false, activities: false, projects: false, tasks: false, announcements: false },
      errors: { summary: null, activities: null, projects: null, tasks: null, announcements: null }
    });
  }
}));

export default useMyShortcutsStore;
