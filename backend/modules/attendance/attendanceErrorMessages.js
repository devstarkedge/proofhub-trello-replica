/**
 * Every machine-readable Attendance error code (spec §75) mapped to a
 * single friendly, non-leaking user-facing message — defined once here so
 * every layer (check-in/out engine, future WFH/regularization services,
 * controllers) shows the exact same wording for the exact same code
 * instead of each writing its own slightly-different string.
 */
export const ATTENDANCE_ERROR_MESSAGES = {
  ATTENDANCE_NOT_REQUIRED: 'Attendance tracking does not apply to your account in this workspace.',
  ATTENDANCE_MODULE_DISABLED: 'Attendance tracking is not enabled for this workspace.',
  NON_WORKING_DAY: 'Today is not a working day, so check-in is not required.',
  FULL_DAY_LEAVE_ACTIVE: "You're on approved leave today, so check-in isn't available.",
  ALREADY_CHECKED_IN: 'You already have an active attendance session.',
  NO_ACTIVE_SESSION: 'No active attendance session was found to check out of.',
  ATTENDANCE_COMPLETED: 'Attendance for today has already been completed.',
  LOCATION_PERMISSION_REQUIRED: 'Location access is required to continue. Please allow location access and try again.',
  LOCATION_NOT_ASSIGNED: "You don't have an assigned attendance location yet. Please contact your admin or HR.",
  LOCATION_INACTIVE: 'Your assigned attendance location is currently inactive. Please contact your admin or HR.',
  OUTSIDE_GEOFENCE: "You're too far from your assigned location to check in/out from here.",
  GPS_ACCURACY_TOO_LOW: 'Your location signal is too weak right now. Please move to an open area and try again.',
  GPS_COORDINATES_STALE: 'Your location data is out of date. Please try again.',
  WFH_NOT_APPROVED: 'Your work-from-home request for today has not been approved.',
  WORK_MODE_NOT_AUTHORIZED: 'Your current work mode is not enabled for attendance. Please contact your admin or HR.',
  POLICY_NOT_CONFIGURED: 'Attendance has not been fully configured for this workspace yet. Please contact your admin or HR.',
  SHIFT_NOT_CONFIGURED: 'No shift has been configured for you yet. Please contact your admin or HR.',
  REGULARIZATION_NOT_ALLOWED: 'This attendance record is not eligible for regularization.'
};

export function friendlyAttendanceMessage(code, fallback = 'Something went wrong. Please try again.') {
  return ATTENDANCE_ERROR_MESSAGES[code] || fallback;
}
