import { ErrorResponse } from '../../middleware/errorHandler.js';
import { instantToDateOnlyKey } from './leaveTimezone.util.js';

const ACTIVE_REQUEST_STATUSES = ['PENDING_APPROVAL', 'PARTIALLY_APPROVED', 'APPROVED', 'CANCELLATION_REQUESTED'];
const VALID_DAY_TYPES = ['FULL_DAY', 'HALF_DAY_FIRST_HALF', 'HALF_DAY_SECOND_HALF', 'SHORT_LEAVE'];

/**
 * dayType must always be an explicit, fully-resolved choice from the
 * caller — never silently assumed. In particular there is no "generic
 * half day" value: the caller must have already resolved which half, so
 * an omitted/invalid dayType is rejected outright rather than defaulted to
 * FULL_DAY (the previous behavior, before this check existed).
 */
export function assertValidDayType(dayType) {
  if (!VALID_DAY_TYPES.includes(dayType)) {
    throw new ErrorResponse(
      `A valid leave type is required (${VALID_DAY_TYPES.join(', ')}) — for Half Day Leave, First Half or Second Half must be chosen`,
      400
    );
  }
}

export function assertValidDateRange(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new ErrorResponse('Leave start/end dates must be valid dates', 400);
  }
  if (end.getTime() < start.getTime()) {
    throw new ErrorResponse('Leave end date cannot be before the start date', 400);
  }
}

/** `existingRequests` must already be filtered to this requester and active statuses. */
export function assertNoOverlap({ existingRequests, startDate, endDate, excludeRequestId = null }) {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const overlapping = existingRequests.find((existing) => {
    if (excludeRequestId && String(existing._id) === String(excludeRequestId)) return false;
    if (!ACTIVE_REQUEST_STATUSES.includes(existing.status)) return false;
    const existingStart = new Date(existing.startDate).getTime();
    const existingEnd = new Date(existing.endDate).getTime();
    return start <= existingEnd && end >= existingStart;
  });
  if (overlapping) {
    throw new ErrorResponse(
      `You already have a pending or approved leave request covering ${instantToDateOnlyKey(overlapping.startDate, 'UTC')} to ${instantToDateOnlyKey(overlapping.endDate, 'UTC')}`,
      409
    );
  }
}

export function assertEmploymentEligible({ employmentStatus, eligibleStatuses }) {
  const allowed = Array.isArray(eligibleStatuses) && eligibleStatuses.length > 0
    ? eligibleStatuses
    : ['ACTIVE', 'ON_PROBATION'];
  if (!allowed.includes(employmentStatus)) {
    throw new ErrorResponse(`Your employment status (${employmentStatus}) is not eligible for this leave type`, 403);
  }
}

/**
 * A leave type's category and the request's dayType must agree: a
 * SHORT_LEAVE-category type can only ever be requested as dayType
 * 'SHORT_LEAVE' (it has no "full day" or "half day" shape — the whole
 * point of the type is a bounded time window), and dayType 'SHORT_LEAVE'
 * only makes sense against a SHORT_LEAVE-category type (otherwise a
 * Full-Day-category bucket would be consumed with no duration/time-window
 * validation at all, since assertShortLeaveDuration below only runs when
 * the *leave type's* category is SHORT_LEAVE). Without this check either
 * mismatch silently falls through — this is the one place that closes it.
 */
export function assertDayTypeMatchesLeaveTypeCategory({ leaveType, dayType }) {
  const isShortLeaveType = leaveType.category === 'SHORT_LEAVE';
  const isShortLeaveDayType = dayType === 'SHORT_LEAVE';
  if (isShortLeaveType && !isShortLeaveDayType) {
    throw new ErrorResponse(`"${leaveType.name}" must be requested as Short Leave, not ${dayType.replace(/_/g, ' ').toLowerCase()}`, 400);
  }
  if (!isShortLeaveType && isShortLeaveDayType) {
    throw new ErrorResponse(`Short Leave can only be requested against a short-leave type, not "${leaveType.name}"`, 400);
  }
}

export function assertShortLeaveDuration({ leaveType, policyRule, durationMinutes }) {
  if (leaveType.category !== 'SHORT_LEAVE') return;
  if (!durationMinutes || durationMinutes <= 0) {
    throw new ErrorResponse('A short leave request must include a valid duration', 400);
  }
  const max = policyRule?.maxDurationMinutesPerInstance;
  if (max && durationMinutes > max) {
    throw new ErrorResponse(`This short leave exceeds the maximum duration allowed by your policy (${max} minutes)`, 400);
  }
}

export function assertHalfDayAllowed({ leaveType, policyRule, dayType }) {
  const isHalfDay = dayType === 'HALF_DAY_FIRST_HALF' || dayType === 'HALF_DAY_SECOND_HALF';
  if (!isHalfDay) return;
  if (leaveType.supportsHalfDay === false || policyRule?.halfDayEnabled === false) {
    throw new ErrorResponse('Half-day leave is not enabled for this leave type', 400);
  }
}

/**
 * Returns { blocked, warned, matches } — never throws directly. The caller
 * (leaveRequest.service.js) applies LeaveApprovalWorkflow.blackoutDateBehavior
 * to decide whether `blocked`/`warned` actually stops or flags the request,
 * since that behavior is workspace-configurable, not fixed here.
 */
export function checkBlackout({ blackoutDates, startDate, endDate, requestDepartmentIds = [] }) {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const matches = (blackoutDates || []).filter((entry) => {
    const entryStart = new Date(entry.startDate).getTime();
    const entryEnd = new Date(entry.endDate).getTime();
    const overlaps = start <= entryEnd && end >= entryStart;
    if (!overlaps) return false;
    if (!entry.departmentIds || entry.departmentIds.length === 0) return true;
    return entry.departmentIds.some((id) => requestDepartmentIds.some((deptId) => String(deptId) === String(id)));
  });
  return { hasMatch: matches.length > 0, matches };
}
