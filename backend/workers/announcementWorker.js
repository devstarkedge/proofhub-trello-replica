import { announcementAudience } from '../services/workspaceAudience.js';
import { emitToUser } from '../realtime/emitters.js';
import { emitAnnouncementEvent } from '../services/announcementEvents.js';
/**
 * Announcement Worker (Event-Driven)
 *
 * Processes exact delayed jobs from the 'flowtask.announcement' queue.
 * Each job targets a single announcement by ID — no DB scanning.
 *
 * Job types:
 *   broadcast-announcement  — broadcast a single scheduled announcement
 *   archive-announcement    — archive a single expired announcement
 */
import mongoose from 'mongoose';
import { Worker } from '../queues/runtime.js';
import { getWorkerConnection } from '../queues/connection.js';
import Announcement from '../models/Announcement.js';
import Workspace from '../models/Workspace.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import '../models/User.js';
import '../models/Notification.js';
import { getIO } from '../realtime/index.js';
import notificationService from '../utils/notificationService.js';
import '../schedulers/announcementScheduler.js';
import '../config/index.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';
import { persistAnnouncementBroadcastState } from '../services/announcementBroadcastState.js';
import { getDefaultWorkspaceId } from '../modules/permissions/workspaceService.js';

async function resolveEffectiveWorkspaceId(announcement, fallbackWorkspaceId) {
  if (announcement.workspaceId) {
    return announcement.workspaceId.toString?.() || announcement.workspaceId;
  }
  if (fallbackWorkspaceId) {
    return fallbackWorkspaceId.toString?.() || fallbackWorkspaceId;
  }

  // Attempt resolution from creator's active membership
  if (announcement.createdBy) {
    try {
      const creatorId = announcement.createdBy._id || announcement.createdBy;
      const membership = await WorkspaceMembership.findOne({ user: creatorId })
        .sort({ createdAt: 1 })
        .select('workspace')
        .lean();
      if (membership?.workspace) {
        return membership.workspace.toString();
      }
    } catch {
      // ignore and continue
    }
  }

  // Attempt resolution from default workspace
  try {
    const defaultWorkspaceId = await getDefaultWorkspaceId();
    if (defaultWorkspaceId) {
      return defaultWorkspaceId.toString();
    }
  } catch {
    // ignore and continue
  }

  // Fallback to any workspace in database
  try {
    const anyWorkspace = await Workspace.findOne().select('_id').lean();
    if (anyWorkspace?._id) {
      return anyWorkspace._id.toString();
    }
  } catch {
    // ignore
  }

  return null;
}

const JOB_HANDLERS = {
  /**
   * Broadcast a single scheduled announcement by ID.
   * Idempotent: skips if already broadcasted.
   */
  async 'broadcast-announcement'(job) {
    const { announcementId, workspaceId: jobWorkspaceId } = job.data;

    // No workspaceId travels on this job (enqueued by announcementScheduler.js,
    // which only knows the announcementId) — look it up unscoped first.
    const announcement = await workspaceContext.runUnscoped(async () => await Announcement.findById(announcementId)
      .populate('createdBy')
      .populate('subscribers.users')
      .populate('subscribers.departments'));

    if (!announcement) {
      return { skipped: true, reason: 'not found' };
    }

    // Idempotency: already broadcasted
    if (announcement.scheduleBroadcasted) {
      return { skipped: true, reason: 'already broadcasted' };
    }

    const effectiveWorkspaceId = await resolveEffectiveWorkspaceId(announcement, jobWorkspaceId);
    if (!effectiveWorkspaceId) {
      console.warn(`[Worker:Announcement] broadcast:${announcementId} skipped: no workspace found`);
      return { skipped: true, reason: 'no workspace found' };
    }

    if (!announcement.workspaceId) {
      const wsObjectId = effectiveWorkspaceId instanceof mongoose.Types.ObjectId
        ? effectiveWorkspaceId
        : new mongoose.Types.ObjectId(effectiveWorkspaceId);
      await Announcement.collection.updateOne(
        { _id: announcement._id },
        { $set: { workspaceId: wsObjectId } }
      );
      announcement.workspaceId = wsObjectId;
    }

    return workspaceContext.run({ workspaceId: effectiveWorkspaceId }, () => broadcastAnnouncement(announcement, announcementId));
  },

  /**
   * Archive a single expired announcement by ID.
   * Idempotent: skips if already archived.
   */
  async 'archive-announcement'(job) {
    const { announcementId, workspaceId: jobWorkspaceId } = job.data;

    const announcement = await workspaceContext.runUnscoped(async () => await Announcement.findById(announcementId));

    if (!announcement) {
      return { skipped: true, reason: 'not found' };
    }

    // Idempotency: already archived
    if (announcement.isArchived) {
      return { skipped: true, reason: 'already archived' };
    }

    const effectiveWorkspaceId = await resolveEffectiveWorkspaceId(announcement, jobWorkspaceId);

    const updateFields = {
      isArchived: true,
      archivedAt: new Date(),
      isPinned: false,
      pinPosition: null,
      updatedAt: new Date(),
    };

    if (effectiveWorkspaceId && !announcement.workspaceId) {
      const wsObjectId = effectiveWorkspaceId instanceof mongoose.Types.ObjectId
        ? effectiveWorkspaceId
        : new mongoose.Types.ObjectId(effectiveWorkspaceId);
      updateFields.workspaceId = wsObjectId;
      announcement.workspaceId = wsObjectId;
    }

    announcement.isArchived = true;
    announcement.archivedAt = updateFields.archivedAt;
    announcement.isPinned = false;
    announcement.pinPosition = undefined;

    // Direct collection update ensures legacy documents missing required fields
    // or triggering schema validation do not fail validation or loop in BullMQ retries
    await Announcement.collection.updateOne(
      { _id: announcement._id },
      { $set: updateFields }
    );

    if (effectiveWorkspaceId) {
      try {
        await workspaceContext.run({ workspaceId: effectiveWorkspaceId }, async () => {
          await emitAnnouncementEvent(announcement, 'announcement-archived', {
            announcementId: announcement._id,
            isArchived: true,
            reason: 'expired',
          });
        });
      } catch (emitErr) {
        console.warn(`[Worker:Announcement] Failed to emit archived event for ${announcementId}:`, emitErr.message);
      }
    }

    console.log(`[Worker:Announcement] archive:${announcementId} completed`);
    return { archived: true };
  },
};

async function broadcastAnnouncement(announcement, announcementId) {
    const subscriberIds = await announcementAudience(announcement.subscribers, announcement.workspaceId);

    // Create notifications — routed through notificationService (not a
    // direct insertMany) so each recipient's settings.notifications.announcements
    // toggle is actually honored.
    const notifications = subscriberIds.map((userId) => ({
      type: 'announcement_created',
      title: 'New Announcement',
      message: `${announcement.createdBy.name} posted: ${announcement.title}`,
      user: userId,
      sender: announcement.createdBy._id,
      entityId: announcement._id,
      entityType: 'Announcement',
    }));

    await notificationService.createBulkNotifications(notifications);

    // Persist first so a recipient's immediate seen/read update cannot make
    // the worker's in-memory document stale before broadcast state is saved.
    await persistAnnouncementBroadcastState(announcement, subscriberIds, {
      scheduled: true,
    });

    // Emit real-time
    const io = getIO();
    subscriberIds.forEach((userId) => {
      emitToUser(userId, 'announcement-created', {
        announcement: announcement.toJSON(),
        notification: {
          type: 'announcement_created',
          title: 'New Announcement',
          message: `${announcement.createdBy.name} posted: ${announcement.title}`,
        },
      });
    });

    // Send emails (fire-and-forget)
    notificationService.sendAnnouncementEmails(announcement, subscriberIds);

    console.log(`[Worker:Announcement] broadcast:${announcementId} → ${subscriberIds.length} users`);
    return { broadcasted: true, recipients: subscriberIds.length };
}

// ─── Worker Creation ──────────────────────────────────────────────────────────

let announcementWorker = null;

export function startAnnouncementWorker() {
  if (announcementWorker && !announcementWorker.closing) return announcementWorker;
  announcementWorker = new Worker(
    'flowtask.announcement',
    async (job) => {
      const handler = JOB_HANDLERS[job.name];
      if (!handler) {
        // Silently skip stale/unknown jobs (e.g. leftover polling jobs in Redis)
        console.warn(`[Worker:Announcement] skipping unknown job type: ${job.name} (${job.id})`);
        return { skipped: true, reason: `unknown job type: ${job.name}` };
      }
      return handler(job);
    },
    {
      connection: getWorkerConnection(),
      concurrency: 2,
    }
  );

  announcementWorker.on('failed', (job, err) => {
    console.error(`[Worker:Announcement] ${job?.name}:${job?.id} failed: ${err.message}`);
  });

  console.log('[Worker:Announcement] started');
  return announcementWorker;
}

export function getAnnouncementWorker() {
  return announcementWorker;
}
