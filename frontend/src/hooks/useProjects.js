import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Database from '../services/database';

// Hook for fetching dashboard data with caching
export function useDashboardData() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => Database.getCachedDashboardData(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

// Hook for fetching projects by department
export function useProjectsByDepartment(departmentId) {
  return useQuery({
    queryKey: ['projects', 'department', departmentId],
    queryFn: () => Database.getBoardsByDepartment(departmentId),
    enabled: !!departmentId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

// Hook for fetching single project
export function useProject(projectId) {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: () => Database.getProject(projectId),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  });
}

// Hook for creating project
export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectData) => Database.createProject(projectData),
    onSuccess: () => {
      // Invalidate and refetch dashboard data
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

// Hook for updating project
export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, updates }) => Database.updateProject(projectId, updates),
    onSuccess: (data, variables) => {
      // Update the specific project in cache
      queryClient.setQueryData(['project', variables.projectId], data);
      // Invalidate dashboard data
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

// Hook for deleting project
export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectId) => Database.deleteProject(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
