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
          console.error(`[EmailWorker] Failed to send to ${recipient.email}:`, err.message);
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
          console.error(`[EmailWorker] Project email failed for ${member.email}:`, err.message);
        }
      }
    }
    return { sent, total: members.length };
  },
};

// ─── Worker Creation ──────────────────────────────────────────────────────────

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
    if (config.isDev) console.log(`[EmailWorker] Job ${job.id} (${job.name}) completed:`, result);
  });

  emailWorker.on('failed', (job, err) => {
    console.error(`[EmailWorker] Job ${job?.id} (${job?.name}) failed:`, err.message);
  });

  console.log('[EmailWorker] Started');
  return emailWorker;
}

export function getEmailWorker() {
  return emailWorker;
}
