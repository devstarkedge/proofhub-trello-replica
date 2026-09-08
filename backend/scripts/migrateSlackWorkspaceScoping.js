/**
 * Slack Workspace-Scoping Migration
 *
 * Before this migration, SlackWorkspace/SlackUser had no FlowTask
 * `workspaceId` at all — every Slack connection/preference was effectively
 * global-per-user (or global-per-installer for admin settings), not scoped
 * to a specific FlowTask workspace, despite FlowTask being a multi-tenant
 * SaaS. This backfills `workspaceId` onto every existing SlackWorkspace/
 * SlackUser document and swaps SlackUser's unique index from
 * {user, workspace} (the Slack-team ref) to {user, workspaceId} (the real
 * per-tenant identity).
 *
 * Because a Slack team install has no explicit link to a FlowTask
 * workspace today, the correct workspace is inferred: gather
 * WorkspaceMembership rows for the installer and every linked SlackUser's
 * FlowTask user, and pick the workspace shared by the largest number of
 * them. If there's no clear majority, this does NOT guess — it leaves
 * workspaceId null and logs the ambiguity; the next real admin OAuth
 * reconnect (SlackOAuthHandler#handleCallback) resolves it definitively by
 * adopting the connecting workspace. This is deliberately NOT auto-run at
 * boot (unlike some migrations in this registry) since it can affect the
 * live bot token/connections of already-connected real users — run once,
 * manually, and inspect `ambiguous`/`flaggedForReview` in the result before
 * trusting it.
 *
 * Idempotent — only acts on documents with workspaceId still null, and the
 * index swap is guarded by an existence check.
 *
 * Usage:
 *   node backend/scripts/migrateSlackWorkspaceScoping.js
 */
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import '../config/index.js';
import SlackWorkspace from '../models/SlackWorkspace.js';
import SlackUser from '../models/SlackUser.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import Workspace from '../models/Workspace.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';

/**
 * Given a set of candidate FlowTask user ids (the installer + everyone
 * already linked to this Slack team), resolve which single FlowTask
 * workspace they overwhelmingly belong to.
 */
async function resolveWorkspaceForCandidates(candidateUserIds, teamName) {
  const memberships = await WorkspaceMembership.find({
    user: { $in: candidateUserIds },
    status: 'active',
  }).select('workspace user').lean();

  const tally = new Map(); // workspaceId string -> Set(userId string)
  for (const m of memberships) {
    const key = m.workspace.toString();
    if (!tally.has(key)) tally.set(key, new Set());
    tally.get(key).add(m.user.toString());
  }

  const ranked = [...tally.entries()].sort((a, b) => b[1].size - a[1].size);

  if (ranked.length === 0) {
    return { decision: 'no_memberships_found', tally: {} };
  }

  const tallyPlain = Object.fromEntries([...tally.entries()].map(([k, v]) => [k, v.size]));

  if (ranked.length === 1 || ranked[0][1].size > ranked[1][1].size) {
    return { decision: 'majority_vote', workspaceId: ranked[0][0], tally: tallyPlain };
  }

  // Tied at the top — break the tie using a Workspace whose name matches
  // the connected Slack team's name, if one of the tied candidates has it
  // (a strong real-world signal: teams commonly name their Slack workspace
  // after their FlowTask workspace).
  const tiedIds = ranked.filter(([, voters]) => voters.size === ranked[0][1].size).map(([id]) => id);
  if (teamName) {
    const nameMatch = await Workspace.findOne({ _id: { $in: tiedIds }, name: teamName }).select('_id').lean();
    if (nameMatch) {
      return { decision: 'tie_broken_by_team_name_match', workspaceId: nameMatch._id.toString(), tally: tallyPlain };
    }
  }

  return { decision: 'ambiguous_tie', tally: tallyPlain };
}

export async function runSlackWorkspaceScopingMigration() {
  return workspaceContext.runUnscoped(async () => {
    const results = {
      workspacesProcessed: 0,
      usersProcessed: 0,
      ambiguous: [],
      flaggedForReview: [],
    };

    const unscopedWorkspaces = await SlackWorkspace.find({ workspaceId: null });

    for (const sw of unscopedWorkspaces) {
      const linkedUsers = await SlackUser.find({ workspace: sw._id }).select('_id user').lean();
      const candidateUserIds = [sw.installedBy, ...linkedUsers.map(su => su.user)].filter(Boolean);

      const resolution = await resolveWorkspaceForCandidates(candidateUserIds, sw.teamName);

      if (!resolution.workspaceId) {
        console.warn(`[Migration:SlackWorkspaceScoping] SlackWorkspace "${sw.teamName}" (${sw.teamId}) needs admin reconnect: ${resolution.decision}`, resolution.tally);
        results.ambiguous.push({ teamId: sw.teamId, teamName: sw.teamName, decision: resolution.decision, tally: resolution.tally });
        continue;
      }

      const chosenWorkspaceId = resolution.workspaceId;

      sw.workspaceId = chosenWorkspaceId;
      await sw.save();
      results.workspacesProcessed++;

      const updateResult = await SlackUser.updateMany(
        { workspace: sw._id, workspaceId: null },
        { $set: { workspaceId: chosenWorkspaceId } }
      );
      results.usersProcessed += updateResult.modifiedCount || 0;

      // Flag (don't drop) any linked user whose FlowTask user isn't
      // actually a member of the chosen workspace, for manual follow-up —
      // their Slack preferences will still resolve, but they may be
      // viewing a workspace they don't belong to via a stale link.
      const chosenMemberIds = new Set(
        (await WorkspaceMembership.find({ workspace: chosenWorkspaceId, status: 'active' }).select('user').lean())
          .map(m => m.user.toString())
      );
      for (const su of linkedUsers) {
        if (!chosenMemberIds.has(su.user.toString())) {
          results.flaggedForReview.push({
            slackUserId: su._id.toString(),
            userId: su.user.toString(),
            reason: 'user_not_member_of_chosen_workspace',
            chosenWorkspaceId,
          });
        }
      }
    }

    // Index swap — guarded so re-running is a no-op.
    const existingIndexes = await SlackUser.collection.indexes();
    if (existingIndexes.some(idx => idx.name === 'user_1_workspace_1' && idx.unique)) {
      await SlackUser.collection.dropIndex('user_1_workspace_1');
      results.droppedOldUniqueIndex = true;
    }
    if (!existingIndexes.some(idx => idx.name === 'user_1_workspaceId_1')) {
      await SlackUser.collection.createIndex({ user: 1, workspaceId: 1 }, { unique: true, name: 'user_1_workspaceId_1' });
    }
    // Keep a plain (non-unique) index on {user, workspace} for Slack-side lookups.
    if (!existingIndexes.some(idx => idx.name === 'user_1_workspace_1')) {
      await SlackUser.collection.createIndex({ user: 1, workspace: 1 }, { name: 'user_1_workspace_1' });
    }

    const swIndexes = await SlackWorkspace.collection.indexes();
    if (!swIndexes.some(idx => idx.name === 'workspaceId_1')) {
      await SlackWorkspace.collection.createIndex({ workspaceId: 1 }, { unique: true, sparse: true, name: 'workspaceId_1' });
    }

    return results;
  });
}

/**
 * Companion backfill: pre-seed Card.notificationState.overdueNotifiedAt for
 * every card that is ALREADY overdue at migration time, so the new overdue
 * scheduler's boot-time recovery scan (schedulers/cardDueDateScheduler.js)
 * doesn't fire a one-time notification blast for every pre-existing overdue
 * card across every workspace the moment it ships.
 */
export async function runCardOverdueBackfill() {
  return workspaceContext.runUnscoped(async () => {
    const Card = (await import('../models/Card.js')).default;

    const result = await Card.updateMany(
      {
        dueDate: { $ne: null, $lt: new Date() },
        isArchived: { $ne: true },
        status: { $nin: ['done', 'completed', 'closed'] },
        'notificationState.overdueNotifiedAt': null,
      },
      [{ $set: { notificationState: { $mergeObjects: ['$notificationState', { overdueNotifiedAt: '$updatedAt' }] } } }]
    );

    return { backfilled: result.modifiedCount || 0 };
  });
}

export default runSlackWorkspaceScopingMigration;

// Allow standalone execution: node backend/scripts/migrateSlackWorkspaceScoping.js
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
      const scopingResult = await runSlackWorkspaceScopingMigration();
      console.log('Slack workspace scoping migration result:', JSON.stringify(scopingResult, null, 2));
      const overdueResult = await runCardOverdueBackfill();
      console.log('Card overdue-notification backfill result:', JSON.stringify(overdueResult, null, 2));
      await mongoose.disconnect();
    })
    .catch((err) => {
      console.error('Migration failed:', err.message);
      process.exit(1);
    });
}
