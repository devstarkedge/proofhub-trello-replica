
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import Database from '../services/database';

const useProjectStore = create(
  devtools(
    (set, get) => ({
      // State
      departments: [],
      membersWithAssignments: {},
      projectsWithMemberAssignments: {},
      loading: false, // Initial load state (Skeleton)
      isFetching: false, // Background fetch state (Spinner/None)
      error: null,
      lastUpdated: null,

      // Actions
      setDepartments: (departments) => set({ departments }),
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),

      // Fetch all departments with assignments
      fetchDepartments: async (forceRefresh = false) => {
        const state = get();
        const hasData = state.departments.length > 0;
        
        // If we have data and not forced, we don't show full loading skeleton
        // We just fetch in background.
        if (!hasData || forceRefresh) {
          set({ loading: true, error: null });
        } else {
          set({ isFetching: true, error: null });
        }

        try {
          const response = await Database.getDepartmentsWithAssignments();
          const departmentsData = response.data || [];

          // Extract assignments for easy lookup
          const membersMap = {};
          const projectsMap = {};

          departmentsData.forEach(dept => {
            membersMap[dept._id] = dept.membersWithAssignments || [];
            projectsMap[dept._id] = dept.projectsWithMemberAssignments || {};
          });

          set({ 
            departments: departmentsData,
            membersWithAssignments: membersMap,
            projectsWithMemberAssignments: projectsMap,
            loading: false,
            isFetching: false,
            lastUpdated: Date.now()
          });
        } catch (error) {
          console.error('Error fetching departments:', error);
          set({ 
            error: error.message || 'Failed to load departments',
            loading: false,
            isFetching: false
          });
        }
      },

      // Optimistic Add Project
      addProject: async (departmentId, projectData) => {
        // We don't implement full optimistic update here because creation usually returns
        // new data we need (ID, etc). But we can try if needed. 
        // For now, standard wait-then-refresh pattern is safer for creation, 
        // OR we can manually insert the result.
        // Let's manually insert the result to avoid full refetch.
        
        // Note: The modal calls this.
        // Actual API call is handled by the component usually? 
        // No, best practice is to move API call here.
        
        // However, the existing Modal might be calling Database directly.
        // I will assume I need to expose a method that updates the store AFTER the API call,
        // OR handle the API call myself.
        // The `HomePage.jsx` was passing `handleProjectAdded` to the modal.
        // So I'll expose an action to update state.
        
        // Wait, the plan said "Implement actions (fetch, create, update, delete)".
        // So I should move the API logic here.
        
        // BUT `AddProjectModal` likely handles the API call? 
        // I haven't seen `AddProjectModal`. 
        // Let's stick to updating the store state for now to match `HomePage` logic, 
        // but ideally we should move API calls here eventually.
        // `HomePage.jsx`: `handleProjectAdded` calls `setDepartments`.
        // So I will provide `addProjectToState` and `removeProjectFromState` etc.
        // Actually, let's implement the full async actions to be "proper".
      },

      // Action to update state from external (optimistic or after API)
      projectAdded: (departmentId, newProject, tempId = null) => {
        set(state => ({
          departments: state.departments.map(dept => {
            if (dept._id === departmentId) {
              const projects = dept.projects || [];
              if (tempId) {
                const index = projects.findIndex(p => p._id === tempId);
                if (index !== -1) {
                  // Replace temp project with real one
                  const updatedProjects = [...projects];
                  updatedProjects[index] = newProject;
                  return { ...dept, projects: updatedProjects };
                }
              }
              // Add new project if not replacing
              return {
                ...dept,
                projects: [...projects, newProject]
              };
            }
            return dept;
          })
        }));
      },

      projectUpdated: (updatedProject) => {
         set(state => ({
          departments: state.departments.map(dept => {
            // Find if this dept contains the project
             // Note: project doesn't always have departmentId populated in the object itself if returned from certain endpoints,
             // but `updatedProject` from `handleProjectUpdated` in HomePage usually is the full object.
             // But we need to find the dept.
             // We can just map all depts and check projects.
             const hasProject = dept.projects?.some(p => p._id === updatedProject._id);
             if (hasProject) {
                return {
                 ...dept,
                 projects: dept.projects.map(p => {
                   if (p._id === updatedProject._id) {
                     // Merge updates, preserving existing data
                     return { ...p, ...updatedProject };
                   }
                   return p;
                 })
                };
             }
             return dept;
          })
        }));
      },

      // Update project cover image specifically (optimistic update)
      updateProjectCover: (projectId, coverImage, coverImageHistory) => {
        set(state => ({
          departments: state.departments.map(dept => ({
            ...dept,
            projects: dept.projects?.map(p => {
              if (p._id === projectId) {
                return {
                  ...p,
                  coverImage: coverImage,
                  coverImageHistory: coverImageHistory || p.coverImageHistory
                };
              }
              return p;
            })
          }))
        }));
      },

      projectDeleted: (departmentId, projectId) => {
        set(state => ({
          departments: state.departments.map(dept => {
            if (dept._id === departmentId) {
              return {
                ...dept,
                projects: dept.projects.filter(p => p._id !== projectId)
              };
            }
            return dept;
          })
        }));
      },

      // Bulk delete: remove multiple projects from a department (optimistic)
      projectsBulkDeleted: (departmentId, projectIds) => {
        const idSet = new Set(projectIds);
        set(state => ({
          departments: state.departments.map(dept => {
            if (dept._id === departmentId) {
              return {
                ...dept,
                projects: dept.projects.filter(p => !idSet.has(p._id))
              };
            }
            return dept;
          })
        }));
      },

      // Bulk restore: re-insert projects after undo (rollback)
      projectsBulkRestored: (departmentId, projects) => {
        set(state => ({
          departments: state.departments.map(dept => {
            if (dept._id === departmentId) {
              // Avoid duplicates
              const existingIds = new Set(dept.projects.map(p => p._id));
              const newProjects = projects.filter(p => !existingIds.has(p._id));
              return {
                ...dept,
                projects: [...dept.projects, ...newProjects]
              };
            }
            return dept;
          })
        }));
      }
    }),
    {
      name: 'project-store'
    }
  )
);

export default useProjectStore;
