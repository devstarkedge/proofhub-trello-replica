import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Database from '../services/database';

// Hook for fetching dashboard data fresh (no caching)
export function useDashboardData() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => Database.getDashboardDataFresh(),
    staleTime: 0, // No caching
    gcTime: 0, // No garbage collection delay
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
    onMutate: async (newProject) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: ['projects'] });

      // Snapshot the previous value
      const previousProjects = queryClient.getQueryData(['projects']);

      // Optimistically update to the new value
      queryClient.setQueryData(['projects'], (old) => old ? [...old, newProject] : [newProject]);

      // Return a context object with the snapshotted value
      return { previousProjects };
    },
    // If the mutation fails, use the context returned from onMutate to roll back
    onError: (err, newProject, context) => {
      queryClient.setQueryData(['projects'], context.previousProjects);
    },
    // Always refetch after error or success:
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
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
