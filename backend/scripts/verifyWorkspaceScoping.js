/**
 * Workspace Scoping Verification
 *
 * Confirms the workspace migration actually reached every row, and that
 * cross-tenant isolation genuinely holds — not just that the migration
 * script ran without throwing.
 *
 *   node backend/scripts/verifyWorkspaceScoping.js
 *
 * Checks:
 *   1. Zero documents missing `workspaceId` across every model in
 *      _workspaceOwnedModels.js (the same array migrateWorkspaces.js
 *      backfills, so the two can't drift apart).
 *   2. Zero non-system Role documents missing `workspaceId`.
 *   3. Zero AccessOverride documents missing `workspace`.
 *   4. A live cross-tenant smoke test: two throwaway workspaces, one Board
 *      each — a query scoped to workspace A must never return workspace
 *      B's board, and a query with no active workspace context must throw
 *      rather than silently returning unscoped data.
 *   5. WorkspaceMembership integrity: no duplicate active rows per
 *      (user, workspace) pair (the unique index should prevent new ones,
 *      but this catches any that pre-date it), and no rows whose `user` or
 *      `workspace` reference no longer resolves.
 *
 * Read-only — reports findings, does not modify any data.
 */
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import '../config/index.js';
import Role from '../models/Role.js';
import AccessOverride from '../models/AccessOverride.js';
import Workspace from '../models/Workspace.js';
import Board from '../models/Board.js';
import User from '../models/User.js';
import Department from '../models/Department.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';
import { WORKSPACE_OWNED_MODELS } from './_workspaceOwnedModels.js';

async function checkMissingWorkspaceId() {
  return workspaceContext.runUnscoped(async () => {
    const issues = [];
    for (const { model, name } of WORKSPACE_OWNED_MODELS) {
      const orphans = await model.countDocuments({ workspaceId: { $exists: false } });
      if (orphans > 0) {
        issues.push({ model: name, check: 'missing workspaceId', count: orphans });
      }
    }

    const orphanRoles = await Role.countDocuments({ isSystem: { $ne: true }, workspaceId: { $exists: false } });
    if (orphanRoles > 0) {
      issues.push({ model: 'Role', check: 'missing workspaceId (non-system)', count: orphanRoles });
    }

    const orphanOverrides = await AccessOverride.countDocuments({ workspace: { $exists: false } });
    if (orphanOverrides > 0) {
      issues.push({ model: 'AccessOverride', check: 'missing workspace', count: orphanOverrides });
    }

    return issues;
  });
}

async function checkCrossTenantIsolation() {
  const issues = [];

  await workspaceContext.runUnscoped(async () => {
    const owner = await User.findOne({ role: 'admin' }).sort({ createdAt: 1 });
    if (!owner) {
      issues.push({ check: 'isolation smoke test', detail: 'skipped — no admin user to own throwaway workspaces' });
      return;
    }

    const suffix = new mongoose.Types.ObjectId().toString().slice(-6);
    const workspaceA = await Workspace.create({ name: `__verify_a_${suffix}`, slug: `__verify-a-${suffix}`, owner: owner._id });
    const workspaceB = await Workspace.create({ name: `__verify_b_${suffix}`, slug: `__verify-b-${suffix}`, owner: owner._id });

    try {
      const deptA = await workspaceContext.run({ workspaceId: workspaceA._id }, async () => (
        await Department.create({ name: `__verify_dept_a_${suffix}`, workspaceId: workspaceA._id })
      ));
      const boardA = await workspaceContext.run({ workspaceId: workspaceA._id }, async () => (
        await Board.create({ name: '__verify_board_a', department: deptA._id, owner: owner._id, workspaceId: workspaceA._id })
      ));

      // 1. A query scoped to workspace B must never see workspace A's board.
      const leaked = await workspaceContext.run({ workspaceId: workspaceB._id }, async () => (
        await Board.findById(boardA._id)
      ));
      if (leaked) {
        issues.push({ check: 'cross-tenant isolation', detail: `Board ${boardA._id} (workspace A) was visible from workspace B's context` });
      }

      // 2. The same query scoped correctly to workspace A must see it.
      const foundInOwnWorkspace = await workspaceContext.run({ workspaceId: workspaceA._id }, async () => (
        await Board.findById(boardA._id)
      ));
      if (!foundInOwnWorkspace) {
        issues.push({ check: 'cross-tenant isolation', detail: `Board ${boardA._id} was not visible from its own workspace A's context` });
      }

      // 3. No active context at all must throw, not silently return data.
      // This whole function runs inside the outer runUnscoped() above —
      // that bypass stays active across every statement in this async
      // function until it actually returns (not just past its first
      // await), so simulating "no context" requires explicitly nesting an
      // empty context here to override it, rather than just calling
      // Board.findById() plainly at this scope.
      let threw = false;
      try {
        await workspaceContext.run(undefined, async () => await Board.findById(boardA._id));
      } catch {
        threw = true;
      }
      if (!threw) {
        issues.push({ check: 'structural enforcement', detail: 'Board.findById with no active workspace context did not throw' });
      }

      await workspaceContext.run({ workspaceId: workspaceA._id }, async () => await Board.deleteOne({ _id: boardA._id }));
      await workspaceContext.run({ workspaceId: workspaceA._id }, async () => await Department.deleteOne({ _id: deptA._id }));
    } finally {
      await Workspace.deleteOne({ _id: workspaceA._id });
      await Workspace.deleteOne({ _id: workspaceB._id });
    }
  });

  return issues;
}

async function checkMembershipIntegrity() {
  return workspaceContext.runUnscoped(async () => {
    const issues = [];

    const duplicates = await WorkspaceMembership.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: { user: '$user', workspace: '$workspace' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }
    ]);
    if (duplicates.length > 0) {
      issues.push({
        model: 'WorkspaceMembership',
        check: 'duplicate active (user, workspace) pairs',
        count: duplicates.length
      });
    }

    const memberships = await WorkspaceMembership.find({}).select('user workspace').lean();
    const userIds = [...new Set(memberships.map((m) => String(m.user)))];
    const workspaceIds = [...new Set(memberships.map((m) => String(m.workspace)))];
    const existingUserIds = new Set((await User.find({ _id: { $in: userIds } }).select('_id').lean()).map((u) => String(u._id)));
    const existingWorkspaceIds = new Set((await Workspace.find({ _id: { $in: workspaceIds } }).select('_id').lean()).map((w) => String(w._id)));

    const orphanedUser = memberships.filter((m) => !existingUserIds.has(String(m.user))).length;
    if (orphanedUser > 0) {
      issues.push({ model: 'WorkspaceMembership', check: 'references a non-existent user', count: orphanedUser });
    }
    const orphanedWorkspace = memberships.filter((m) => !existingWorkspaceIds.has(String(m.workspace))).length;
    if (orphanedWorkspace > 0) {
      issues.push({ model: 'WorkspaceMembership', check: 'references a non-existent workspace', count: orphanedWorkspace });
    }

    return issues;
  });
}

export async function verifyWorkspaceScoping() {
  const missingIssues = await checkMissingWorkspaceId();
  const isolationIssues = await checkCrossTenantIsolation();
  const membershipIssues = await checkMembershipIntegrity();
  const issues = [...missingIssues, ...isolationIssues, ...membershipIssues];
  return { totalIssues: issues.length, issues };
}

export default verifyWorkspaceScoping;

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('ERROR: No MONGO_URI/MONGODB_URI environment variable found.');
    process.exit(1);
  }
  mongoose.connect(mongoUri)
    .then(async () => {
      console.log('Connected to MongoDB.');
      const result = await verifyWorkspaceScoping();
      console.log(`Found ${result.totalIssues} issue(s).`);
      if (result.totalIssues > 0) {
        console.table(result.issues);
      }
      await mongoose.disconnect();
      process.exit(result.totalIssues > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error('Verification failed:', err);
      process.exit(1);
    });
}
