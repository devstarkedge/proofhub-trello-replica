import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import Workspace from '../../models/Workspace.js';
import User from '../../models/User.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import Department from '../../models/Department.js';
import * as workspaceContext from '../../modules/workspaces/workspaceContext.js';
import LeaveType from '../../modules/leave/leaveType.model.js';
import LeavePolicy from '../../modules/leave/leavePolicy.model.js';
import LeavePolicyVersion from '../../modules/leave/leavePolicyVersion.model.js';
import LeavePolicyAssignment from '../../modules/leave/leavePolicyAssignment.model.js';
import { setIO } from '../../realtime/emitters.js';

let replSet;
let seq = 0;

// LeaveAccrualBucket/Ledger/etc. all go through session.withTransaction(),
// which requires a real replica set — a standalone mongodb-memory-server
// instance cannot run multi-document transactions at all.
export async function startTestDatabase() {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replSet.getUri(), { dbName: 'leave-tests' });
  // These tests exercise business logic, not realtime delivery — stub
  // Socket.IO so emitToUser/emitToUsers (fired from leaveHooks.js on every
  // mutation) no-op instead of throwing "Socket.IO not initialized."
  setIO({ to: () => ({ emit: () => {} }) });
}

export async function stopTestDatabase() {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
}

export async function clearTestDatabase() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
}

/**
 * Run `fn` inside an active workspace context — required for every
 * workspaceScopePlugin'd model access outside a real HTTP request.
 *
 * The internal `await` is load-bearing, not decorative: AsyncLocalStorage
 * only propagates context into async operations actually STARTED while the
 * `run()` callback is executing. A lazy Mongoose Query (e.g. `Model.find(x)`
 * with no `.exec()`/`.then()`/`await` yet) doesn't start its operation at
 * all until something awaits it — if that await happens in the *caller*,
 * outside this function, the query executes after `run()` has already
 * returned and torn down its context, and workspaceScopePlugin throws
 * "no active workspace context" despite this call appearing to wrap it.
 * Awaiting `fn()` right here, inside the tracked callback, guarantees the
 * query actually starts while the context is still active — confirmed
 * empirically: removing this `await` reproduces exactly that failure.
 */
export function withWorkspace(workspaceId, fn) {
  return workspaceContext.run({ workspaceId }, async () => await fn());
}

export async function createWorkspace(overrides = {}) {
  seq += 1;
  const owner = overrides.owner || (await createUser({ name: 'Owner', email: `owner${seq}@test.com` }))._id;
  return Workspace.create({
    name: overrides.name || `Test Workspace ${seq}`,
    slug: overrides.slug || `test-workspace-${seq}`,
    owner,
    timezone: overrides.timezone || 'Asia/Kolkata',
    leaveModuleEnabled: true,
    ...overrides
  });
}

export async function createUser(overrides = {}) {
  seq += 1;
  return User.create({
    name: overrides.name || `User ${seq}`,
    email: overrides.email || `user${seq}@test.com`,
    password: 'hashedpassword-not-used-in-tests',
    isActive: true,
    isVerified: true,
    ...overrides
  });
}

// Defaults joinedAt safely in the past — accrual/eligibility gates on
// (membership.joinedAt / LeaveEmployeeProfile.hireDate) as the employee's
// effective start date, so a "just joined right now" default would make
// every accrual test for a historical period fail the joining-date check
// by construction. Tests exercising joining/probation behavior explicitly
// override joinedAt themselves.
export async function createMembership({ workspace, user, role = 'employee', department = [], status = 'active', joinedAt = new Date('2020-01-01') }) {
  return WorkspaceMembership.create({ workspace, user, role, department, status, joinedAt });
}

export async function createDepartment({ workspaceId, name, managers = [], members = [] }) {
  return withWorkspace(workspaceId, () => Department.create({ workspaceId, name, managers, members, isActive: true }));
}

export async function createLeaveType({ workspaceId, key, name, category = 'STANDARD' }) {
  return withWorkspace(workspaceId, () => LeaveType.create({ workspaceId, key, name, category, isActive: true }));
}

/** One-call helper: policy + a fully published version + a workspace-wide assignment. Covers the common test baseline. */
export async function createPublishedPolicyWithAssignment({ workspaceId, leaveTypeRules, effectiveFrom = new Date('2020-01-01') }) {
  return withWorkspace(workspaceId, async () => {
    const policy = await LeavePolicy.create({ workspaceId, name: `Policy ${++seq}`, status: 'draft' });
    const version = await LeavePolicyVersion.create({
      workspaceId, policy: policy._id, versionNumber: 1, status: 'draft', effectiveFrom, leaveTypeRules
    });
    version.status = 'published';
    version.publishedAt = new Date();
    await version.save();
    policy.currentVersion = version._id;
    policy.status = 'active';
    await policy.save();
    await LeavePolicyAssignment.create({
      workspaceId, policy: policy._id, scope: 'workspace', scopeRef: null, priority: 0, effectiveFrom, isActive: true
    });
    return { policy, version };
  });
}

export function standardLeaveTypeRule(leaveTypeId, overrides = {}) {
  return {
    leaveType: leaveTypeId,
    monthlyCreditAmount: 2,
    creditTiming: 'START_OF_MONTH',
    expiryRule: { mode: 'FIXED_MONTHS_AFTER_CREDIT', months: 3 },
    carryForward: { allowed: true },
    halfDayEnabled: true,
    joiningProbation: { accrualStart: 'IMMEDIATE', joiningMonthCredit: 'FULL' },
    weekendHolidayHandling: 'EXCLUDE_FROM_CONSUMPTION',
    eligibleEmploymentStatuses: ['ACTIVE', 'ON_PROBATION'],
    ...overrides
  };
}
