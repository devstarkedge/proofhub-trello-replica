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
  if (!projectIdentity(project)) return { canAccessBilledTime: false, hiddenReason: 'A valid parent project is required.' };
  if (project.projectType !== 'Hired Client') return { canAccessBilledTime: false, hiddenReason: 'Billed time is unavailable for inhouse projects.' };
  if (!['hr', 'hourly', 'fixed', 'fixed price'].includes(String(project.billingCycle || '').toLowerCase())) {
    return { canAccessBilledTime: false, hiddenReason: 'Billed time is unavailable for this billing cycle.' };
  }
  return { canAccessBilledTime: true, hiddenReason: null };
}
