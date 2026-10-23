export const projectIdentity = (project) => typeof project === 'object' && project
  ? String(project._id || project.id || '') : String(project || '');

export function mergeModalProject(current, incoming) {
  if (!incoming) return null;
  const next = typeof incoming === 'object' ? incoming : { _id: incoming };
  if (!current || projectIdentity(current) !== projectIdentity(next)) return next;
  // Lightweight task-board populations must not erase already loaded settings.
  return { ...current, ...Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined)) };
}

export function resolveBilledTimeAccess(project, role, { loading = false, error = null } = {}) {
  if (loading) return { canAccessBilledTime: false, hiddenReason: null };
  if (error) return { canAccessBilledTime: false, hiddenReason: 'Unable to load this project’s billing settings.' };
  if (!['admin', 'manager'].includes(String(role || '').toLowerCase())) {
    return { canAccessBilledTime: false, hiddenReason: 'You do not have permission to view billed time.' };
  }
  const client = project?.clientDetails;
  return client?.clientName || client?.clientEmail || client?.clientWhatsappNumber
    ? { canAccessBilledTime: true, hiddenReason: null }
    : { canAccessBilledTime: false, hiddenReason: 'Billed time is unavailable because no client information is associated with this project.' };
}
