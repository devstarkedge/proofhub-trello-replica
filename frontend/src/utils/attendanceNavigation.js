export const getDefaultAttendanceRoute = (role) =>
  String(role || '').toLowerCase() === 'admin' ? '/attendance/team' : '/attendance/my';

export function getAttendanceReturnRoute(path, role) {
  if (!/^\/attendance(?:\/(?:my|team|approvals))?$/.test(path || '')) return getDefaultAttendanceRoute(role);
  if (path === '/attendance' || (path === '/attendance/my' && String(role || '').toLowerCase() === 'admin')) {
    return getDefaultAttendanceRoute(role);
  }
  return path;
}
