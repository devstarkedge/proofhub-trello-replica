/**
 * Email Worker
 * 
 * Processes email jobs from the 'flowtask:email' queue.
 * Job types: send-email, send-bulk-email, send-project-emails
 */
import { Worker } from 'bullmq';
import { getWorkerConnection } from '../queues/connection.js';
import { sendEmail } from '../utils/email.js';
import User from '../models/User.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';

const JOB_HANDLERS = {
  /**
   * Send a single email.
   * Data: { to, subject, html }
   */
  async 'send-email'(job) {
    const { to, subject, html } = job.data;
    await sendEmail({ to, subject, html });
    return { sent: 1 };
  },

  /**
   * Send bulk emails (generic).
   * Data: { recipients: [{ email, name }], subject, html }
   */
  async 'send-bulk-email'(job) {
    const { recipients, subject, html } = job.data;
    let sent = 0;
    for (const recipient of recipients) {
      if (recipient.email) {
        try {
          await sendEmail({ to: recipient.email, subject, html });
          sent++;
        } catch (err) {
          console.error(`[Worker:Email] Failed to send to ${recipient.email}:`, err.message);
        }
      }
    }
    return { sent, total: recipients.length };
  },

  /**
   * Send project-assignment emails to members.
   * Data: { board: { name, description, startDate, dueDate }, memberIds: string[] }
   */
  async 'send-project-emails'(job) {
    const { board, memberIds } = job.data;
    const members = await User.find({ _id: { $in: memberIds } }).select('email name').lean();
    let sent = 0;

    for (const member of members) {
      if (member.email) {
        try {
          await sendEmail({
            to: member.email,
            subject: `You've been added to project: ${board.name}`,
            html: `
              <h2>New Project Assignment</h2>
              <p>Hi ${member.name},</p>
              <p>You have been added to the project <strong>${board.name}</strong>.</p>
              <p>Description: ${board.description || 'No description provided'}</p>
              <p>Start Date: ${board.startDate ? new Date(board.startDate).toLocaleDateString() : 'Not set'}</p>
              <p>Due Date: ${board.dueDate ? new Date(board.dueDate).toLocaleDateString() : 'Not set'}</p>
              <br>
              <p>Best regards,<br>FlowTask Team</p>
            `,
          });
          sent++;
        } catch (err) {
          console.error(`[Worker:Email] Project email failed for ${member.email}:`, err.message);
        }
      }
    }
    return { sent, total: members.length };
  },
};

// ─── Worker Creation ──────────────────────────────────────────────────────────

// A 'send-email' job that carries an invitationId (bulk invite — see
// modules/workspaces/invitationService.js#dispatchInvitationEmail) reports
// its delivery outcome back onto that invitation row for the Manage
// Invitations UI. Dynamic import avoids a static cycle: invitationService.js
// imports queueManager.js (for isQueueActive), which imports THIS file to
// start the worker — a static import back to invitationService.js here
// would complete that cycle. Same workaround already used elsewhere in this
// codebase (see membershipCreation.js#notifyMembershipAdded).
async function reportInvitationEmailOutcome(job, err = null) {
  const invitationId = job?.data?.invitationId;
  if (!invitationId) return;
  try {
    const { recordEmailDispatchOutcome } = await import('../modules/workspaces/invitationService.js');
    await recordEmailDispatchOutcome(invitationId, err);
  } catch (reportErr) {
    logger.error('[Worker:Email] Failed to record invitation email outcome', {
      error: reportErr.message, invitationId: String(invitationId)
    });
  }
}

let emailWorker = null;

export function startEmailWorker() {
  emailWorker = new Worker(
    'flowtask.email',
    async (job) => {
      const handler = JOB_HANDLERS[job.name];
      if (!handler) {
        throw new Error(`Unknown email job type: ${job.name}`);
      }
      return handler(job);
    },
    {
      connection: getWorkerConnection(),
      concurrency: config.queues.email.concurrency,
      limiter: {
        max: 20,         // max 20 emails per 10 seconds to avoid SMTP throttling
        duration: 10000,
      },
    }
  );

  emailWorker.on('completed', (job, result) => {
    if (config.isDev) console.log(`[Worker:Email] ${job.name}:${job.id} completed:`, result);
    reportInvitationEmailOutcome(job);
  });

  emailWorker.on('failed', (job, err) => {
    console.error(`[Worker:Email] ${job?.name}:${job?.id} failed:`, err.message);
    reportInvitationEmailOutcome(job, err);
  });

  console.log('[Worker:Email] started');
  return emailWorker;
}

export function getEmailWorker() {
  return emailWorker;
}
