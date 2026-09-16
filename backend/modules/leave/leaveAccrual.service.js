import mongoose from 'mongoose';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import Workspace from '../../models/Workspace.js';
import * as workspaceContext from '../workspaces/workspaceContext.js';
import { getWorkspaceTimezone, getCurrentPeriodKey, getPeriodBounds, computeExpiryDate } from './leaveTimezone.util.js';
import { resolvePolicyContext } from './leavePolicy.service.js';
import { creditBucket } from './leaveBalance.service.js';
import { getEffectiveEmploymentProfile } from './leaveEmployeeProfile.service.js';
import { onBucketCredited } from './leaveHooks.js';

/**
 * Pure function: does (rule, hire date, period) earn a credit, and how
 * much? Isolated from all I/O so it's directly unit-testable — the
 * idempotency guarantee lives entirely in LeaveAccrualBucket's unique
 * index, not in this function.
 */
export function computeAccrualForPeriod({ rule, effectiveHireDate, period, timezone }) {
  const { start: periodStart, end: periodEnd } = getPeriodBounds(period, timezone);
  const hireInstant = effectiveHireDate ? new Date(effectiveHireDate) : null;

  if (hireInstant && hireInstant.getTime() >= periodEnd.getTime()) {
    return { shouldCredit: false, amount: 0, isJoiningPeriod: false };
  }

  const isJoiningPeriod = Boolean(
    hireInstant && hireInstant.getTime() >= periodStart.getTime() && hireInstant.getTime() < periodEnd.getTime()
  );
  const accrualStart = rule.joiningProbation?.accrualStart || 'IMMEDIATE';

  if (hireInstant) {
    if (accrualStart === 'NEXT_MONTH' && isJoiningPeriod) {
      return { shouldCredit: false, amount: 0, isJoiningPeriod };
    }
    if (accrualStart === 'AFTER_N_DAYS') {
      const afterDays = Number(rule.joiningProbation.afterNDays) || 0;
      const eligibleFrom = new Date(hireInstant.getTime() + afterDays * 24 * 60 * 60 * 1000);
      if (eligibleFrom.getTime() >= periodEnd.getTime()) return { shouldCredit: false, amount: 0, isJoiningPeriod };
    }
  }

  if (isJoiningPeriod && accrualStart !== 'NEXT_MONTH') {
    const joiningMonthCredit = rule.joiningProbation?.joiningMonthCredit || 'PRORATED';
    if (joiningMonthCredit === 'ZERO') return { shouldCredit: false, amount: 0, isJoiningPeriod };
    if (joiningMonthCredit === 'FULL') return { shouldCredit: true, amount: rule.monthlyCreditAmount, isJoiningPeriod };

    const totalMs = periodEnd.getTime() - periodStart.getTime();
    const remainingMs = periodEnd.getTime() - Math.max(hireInstant.getTime(), periodStart.getTime());
    const fraction = Math.max(0, Math.min(1, remainingMs / totalMs));
    return { shouldCredit: true, amount: Math.round(rule.monthlyCreditAmount * fraction * 100) / 100, isJoiningPeriod };
  }

  return { shouldCredit: true, amount: rule.monthlyCreditAmount, isJoiningPeriod };
}

/**
 * Process monthly accrual for every active member of one workspace, for
 * `period` (defaults to the workspace's current calendar month). Safe to
 * call repeatedly for the same period — LeaveAccrualBucket's unique index
 * on {workspaceId,user,leaveType,policyVersion,period} rejects the
 * duplicate with E11000, logged here as a no-op rather than a failure, per
 * spec's "scheduler runs twice, no duplicate credit" requirement. Each
 * employee/leave-type credit is its own transaction, so one failure never
 * blocks the rest of the batch.
 */
export async function runMonthlyAccrualForWorkspace({ workspaceId, period = null }) {
  // Workspace itself is never workspace-scoped (the plugin has nothing to
  // filter it by), so this lookup is safe before any context is set up.
  const workspace = await Workspace.findById(workspaceId).select('timezone').lean();
  if (!workspace) return { processed: 0, created: 0, skipped: 0, ineligible: 0 };

  const timezone = getWorkspaceTimezone(workspace);
  const targetPeriod = period || getCurrentPeriodKey(timezone);
  const { start: periodStart } = getPeriodBounds(targetPeriod, timezone);

  // Everything below touches workspaceScopePlugin'd models (LeavePolicy*,
  // LeaveEmployeeProfile, LeaveAccrualBucket, LeaveLedger) — this scheduler
  // entry point runs outside any Express request, so there is no ambient
  // context unless established explicitly here.
  return workspaceContext.run({ workspaceId }, async () => {
    const members = await WorkspaceMembership.find({ workspace: workspaceId, status: 'active' }).lean();

    let created = 0, skipped = 0, ineligible = 0;

    for (const membership of members) {
      const profile = await getEffectiveEmploymentProfile({ workspaceId, userId: membership.user });
      const policyContext = await resolvePolicyContext({
        workspaceId, userId: membership.user, membership, date: periodStart
      });
      if (!policyContext) { ineligible++; continue; }

      const { policyVersion } = policyContext;
      const effectiveHireDate = profile.accrualStartOverrideDate || profile.hireDate || membership.joinedAt;

      for (const rule of policyVersion.leaveTypeRules) {
        if (!(rule.eligibleEmploymentStatuses || []).includes(profile.employmentStatus)) continue;

        const { shouldCredit, amount, isJoiningPeriod } = computeAccrualForPeriod({
          rule, effectiveHireDate, period: targetPeriod, timezone
        });
        if (!shouldCredit || amount <= 0) continue;

        const expiresAt = computeExpiryDate(periodStart, rule.expiryRule, timezone);
        const session = await mongoose.startSession();
        try {
          await session.withTransaction(async () => {
            await creditBucket({
              workspaceId, user: membership.user, leaveType: rule.leaveType, policyVersion: policyVersion._id,
              period: targetPeriod, sourceType: isJoiningPeriod ? 'JOINING_CREDIT' : 'MONTHLY_ACCRUAL',
              amount, creditedAt: periodStart, expiresAt, createdBy: null, session
            });
          });
          created++;
          onBucketCredited({ userId: membership.user });
        } catch (error) {
          if (error?.code === 11000) {
            skipped++; // already credited this period for this (user, leaveType, policyVersion) — expected on a re-run
          } else {
            console.error('[Leave] accrual error', { workspaceId, user: String(membership.user), leaveType: String(rule.leaveType), error: error.message });
          }
        } finally {
          await session.endSession();
        }
      }
    }

    return { processed: members.length, created, skipped, ineligible, period: targetPeriod };
  });
}

/** Runs accrual across every workspace with the Leave module enabled — the scheduler/boot-catchup entry point. */
export async function runMonthlyAccrualForAllWorkspaces() {
  const workspaces = await Workspace.find({ leaveModuleEnabled: true }).select('_id').lean();
  const results = [];
  for (const workspace of workspaces) {
    const result = await runMonthlyAccrualForWorkspace({ workspaceId: workspace._id });
    results.push({ workspaceId: workspace._id, ...result });
  }
  return results;
}
