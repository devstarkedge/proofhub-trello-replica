import { z } from 'zod';

/**
 * Client-side shape validation only — the real business rules (balance
 * sufficiency, overlap, blackout, eligibility) are enforced server-side
 * and surfaced back through the submit error, matching this codebase's
 * "critical validations must run on backend even if frontend validation
 * also exists" rule. This schema exists to catch obvious mistakes before
 * a round trip, not to duplicate the engine.
 */
export const leaveRequestSchema = z.object({
  leaveTypeId: z.string().min(1, 'Leave type is required'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  dayType: z.enum(['FULL_DAY', 'HALF_DAY_FIRST_HALF', 'HALF_DAY_SECOND_HALF', 'SHORT_LEAVE']),
  reason: z.string().max(1000).optional().default(''),
  shortLeaveStartTime: z.string().optional().nullable(),
  shortLeaveEndTime: z.string().optional().nullable(),
  shortLeaveDurationMinutes: z.coerce.number().optional().nullable()
}).superRefine((data, ctx) => {
  if (new Date(data.endDate) < new Date(data.startDate)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'End date cannot be before start date', path: ['endDate'] });
  }
  if (data.dayType === 'SHORT_LEAVE') {
    if (!data.shortLeaveStartTime || !data.shortLeaveEndTime) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Start and end time are required for a short leave', path: ['shortLeaveStartTime'] });
    } else if (!data.shortLeaveDurationMinutes || data.shortLeaveDurationMinutes <= 0) {
      // Duration is derived from start/end time (see LeaveRequestForm's
      // effect) — reaching here means end time isn't after start time.
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'End time must be after start time', path: ['shortLeaveEndTime'] });
    }
  }
});
