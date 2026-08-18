import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as superAdminApi from '../services/superAdminApi';

/**
 * React Query hooks for the Super Admin Dashboard. Chosen over the
 * manual useState/useEffect pattern most pages in this app use because two
 * requirements here map directly onto what React Query is for: refetch
 * after the admin's own mutating actions (invalidateQueries below), and a
 * manual refresh control — the two things the "core events only" real-time
 * scope decision leans on instead of wiring sockets into every counter.
 */

export function useSuperAdminOverview() {
  return useQuery({
    queryKey: ['super-admin', 'overview'],
    queryFn: superAdminApi.getOverview,
    staleTime: 60 * 1000
  });
}

export function useSuperAdminWorkspaces({ search, status, plan, type, sort, limit = 50 } = {}) {
  return useInfiniteQuery({
    queryKey: ['super-admin', 'workspaces', { search, status, plan, type, sort, limit }],
    queryFn: ({ pageParam }) => superAdminApi.fetchWorkspacesPage({ cursor: pageParam, search, status, plan, type, sort, limit }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    staleTime: 30 * 1000
  });
}

export function useSuperAdminWorkspace(workspaceId) {
  return useQuery({
    queryKey: ['super-admin', 'workspace', workspaceId],
    queryFn: () => superAdminApi.getWorkspaceOverview(workspaceId),
    enabled: !!workspaceId,
    staleTime: 30 * 1000
  });
}

export function useSuperAdminWorkspaceMembers(workspaceId, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['super-admin', 'workspace', workspaceId, 'members'],
    queryFn: () => superAdminApi.getWorkspaceMembers(workspaceId),
    enabled: !!workspaceId && enabled,
    staleTime: 30 * 1000
  });
}

export function useSuperAdminWorkspaceProjects(workspaceId, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['super-admin', 'workspace', workspaceId, 'projects'],
    queryFn: () => superAdminApi.getWorkspaceProjects(workspaceId),
    enabled: !!workspaceId && enabled,
    staleTime: 30 * 1000
  });
}

export function useSuperAdminWorkspaceUsage(workspaceId, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['super-admin', 'workspace', workspaceId, 'usage'],
    queryFn: () => superAdminApi.getWorkspaceUsage(workspaceId),
    enabled: !!workspaceId && enabled,
    staleTime: 60 * 1000
  });
}

export function useSuperAdminWorkspaceBilling(workspaceId, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['super-admin', 'workspace', workspaceId, 'billing'],
    queryFn: () => superAdminApi.getWorkspaceBilling(workspaceId),
    enabled: !!workspaceId && enabled,
    staleTime: 30 * 1000
  });
}

export function useSuperAdminWorkspaceActivity(workspaceId, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['super-admin', 'workspace', workspaceId, 'activity'],
    queryFn: () => superAdminApi.getWorkspaceActivity(workspaceId),
    enabled: !!workspaceId && enabled,
    staleTime: 30 * 1000
  });
}

export function useSuperAdminPlans() {
  return useQuery({
    queryKey: ['super-admin', 'plans'],
    queryFn: superAdminApi.getPlans,
    staleTime: 5 * 60 * 1000
  });
}

export function useUpdateWorkspaceStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workspaceId, status, reason }) => superAdminApi.updateWorkspaceStatus(workspaceId, { status, reason }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'overview'] });
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'workspace', variables.workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'audit-log'] });
    }
  });
}

export function useUpdateWorkspaceBilling() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workspaceId, ...payload }) => superAdminApi.updateWorkspaceBilling(workspaceId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'workspace', variables.workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'overview'] });
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'audit-log'] });
    }
  });
}

export function useSuperAdminAuditLog({ workspaceId, actorId, action, search, startDate, endDate, sort, limit = 50 } = {}) {
  return useInfiniteQuery({
    queryKey: ['super-admin', 'audit-log', { workspaceId, actorId, action, search, startDate, endDate, sort, limit }],
    queryFn: ({ pageParam }) =>
      superAdminApi.fetchSuperAdminAuditLogPage({ cursor: pageParam, workspaceId, actorId, action, search, startDate, endDate, sort, limit }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    staleTime: 30 * 1000
  });
}
