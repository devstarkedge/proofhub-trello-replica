import Reminder from '../models/Reminder.js';
import Board from '../models/Board.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { sendEmail } from './email.js';
import { emitNotification } from '../realtime/index.js';
import { runBackground } from './backgroundTasks.js';
import { slackHooks } from './slackHooks.js';

// Interval for checking reminders (every 15 minutes)
const CHECK_INTERVAL = 15 * 60 * 1000;

// Store interval reference
let reminderCheckInterval = null;

/**
 * Start the reminder scheduler
 */
export const startReminderScheduler = () => {
  if (reminderCheckInterval) {
    clearInterval(reminderCheckInterval);
  }

  // Run immediately on start
  checkAndSendReminders();

  // Then run at regular intervals
  reminderCheckInterval = setInterval(checkAndSendReminders, CHECK_INTERVAL);
  console.log('Reminder scheduler started');
};

/**
 * Stop the reminder scheduler
 */
export const stopReminderScheduler = () => {
  if (reminderCheckInterval) {
    clearInterval(reminderCheckInterval);
    reminderCheckInterval = null;
    console.log('Reminder scheduler stopped');
  }
};

/**
 * Check for reminders that need notification (1 day before)
 */
export const checkAndSendReminders = async () => {
  try {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    // Find reminders due within 24 hours that haven't been notified yet
    const remindersToNotify = await Reminder.find({
      status: 'pending',
      scheduledDate: { $gte: now, $lte: tomorrow },
      notificationSentAt: { $exists: false }
    })
    .populate('project', 'name clientDetails')
    .populate('createdBy', 'name email')
    .populate('department', 'name');

    console.log(`Found ${remindersToNotify.length} reminders to notify`);

    for (const reminder of remindersToNotify) {
      await sendReminderNotification(reminder);
    }

    // Check for overdue reminders and mark them as missed
    await markOverdueReminders();

  } catch (error) {
    console.error('Error checking reminders:', error);
  }
};

/**
 * Send notification for a reminder
 */
export const sendReminderNotification = async (reminder) => {
  try {
    const user = await User.findById(reminder.createdBy._id || reminder.createdBy);
    
    if (!user) {
      console.error('User not found for reminder notification');
      return;
    }

    // Create in-app notification
    const notification = await Notification.create({
      type: 'reminder_due_soon',
      title: 'Reminder Due Soon',
      message: `Reminder for project "${reminder.project?.name || 'Unknown'}" is due in 24 hours. Client: ${reminder.client?.name || 'N/A'}`,
      user: user._id,
      relatedBoard: reminder.project._id || reminder.project
    });

    // Emit real-time notification
    emitNotification(user._id.toString(), notification);

    // Send email notification
    await sendReminderEmail(reminder, user);

    // Update reminder with notification timestamp
    reminder.notificationSentAt = new Date();
    await reminder.save();

    // Send Slack notification
    const board = await Board.findById(reminder.project._id || reminder.project).select('name');
    slackHooks.onReminder(reminder, null, board).catch(console.error);

    console.log(`Notification sent for reminder ${reminder._id}`);
  } catch (error) {
    console.error('Error sending reminder notification:', error);
  }
};

/**
 * Send reminder email
 */
export const sendReminderEmail = async (reminder, user) => {
  try {
    const projectName = reminder.project?.name || 'Unknown Project';
    const clientName = reminder.client?.name || 'N/A';
    const clientEmail = reminder.client?.email || 'N/A';
    const clientPhone = reminder.client?.phone || 'N/A';
    const reminderDate = new Date(reminder.scheduledDate).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Reminder Due Soon - FlowTask</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
            .reminder-box { background: linear-gradient(135deg, #fef3c7, #fde68a); border: 1px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .reminder-box h3 { color: #92400e; margin-top: 0; }
            .client-info { background: #f3f4f6; border-radius: 8px; padding: 15px; margin: 15px 0; }
            .client-info h4 { color: #374151; margin-top: 0; margin-bottom: 10px; }
            .info-row { display: flex; margin: 8px 0; }
            .info-label { font-weight: 600; color: #6b7280; min-width: 100px; }
            .info-value { color: #111827; }
            .button { display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 12px 28px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600; }
            .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none; }
            .badge { display: inline-block; background: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⏰ Reminder Due Soon</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">Action required within 24 hours</p>
            </div>
            <div class="content">
              <p>Hi ${user.name},</p>
              <p>This is a reminder that you have a scheduled follow-up due soon:</p>
              
              <div class="reminder-box">
                <h3>📋 ${projectName}</h3>
                <div class="info-row">
                  <span class="info-label">Due Date:</span>
                  <span class="info-value">${reminderDate}</span>
                </div>
                ${reminder.notes ? `
                <div class="info-row">
                  <span class="info-label">Notes:</span>
                  <span class="info-value">${reminder.notes}</span>
                </div>
                ` : ''}
              </div>

              <div class="client-info">
                <h4>👤 Client Information</h4>
                <div class="info-row">
                  <span class="info-label">Name:</span>
                  <span class="info-value">${clientName}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Email:</span>
                  <span class="info-value">${clientEmail}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Phone:</span>
                  <span class="info-value">${clientPhone}</span>
                </div>
              </div>

              <div style="text-align: center;">
                <a href="${process.env.FRONTEND_URL}/projects/${reminder.project._id || reminder.project}" class="button">
                  View Project Details
                </a>
              </div>

              <p style="color: #6b7280; font-size: 14px;">
                Please ensure you follow up with the client by the scheduled date. You can mark the reminder as completed once the follow-up is done.
              </p>
            </div>
            <div class="footer">
              <p>This is an automated reminder from FlowTask.</p>
              <p>© ${new Date().getFullYear()} FlowTask. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await sendEmail({
      to: user.email,
      subject: `⏰ Reminder Due Soon: ${projectName}`,
      html: emailHtml
    });

    // Update email sent timestamp
    reminder.emailSentAt = new Date();
    await reminder.save();

    console.log(`Reminder email sent to ${user.email}`);
  } catch (error) {
    console.error('Error sending reminder email:', error);
  }
};

/**
 * Mark overdue reminders as missed
 */
export const markOverdueReminders = async () => {
  try {
    const now = new Date();
    
    // Find overdue pending reminders (past due date by more than 24 hours)
    const overdueThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const result = await Reminder.updateMany(
      {
        status: 'pending',
        scheduledDate: { $lt: overdueThreshold }
      },
      {
        $set: { status: 'missed' },
        $push: {
          history: {
            action: 'missed',
            timestamp: now,
            notes: 'Automatically marked as missed (overdue by more than 24 hours)'
          }
        }
      }
    );

    if (result.modifiedCount > 0) {
      console.log(`Marked ${result.modifiedCount} reminders as missed`);
    }
  } catch (error) {
    console.error('Error marking overdue reminders:', error);
  }
};

/**
 * Send reminder notification in background
 */
export const sendReminderNotificationInBackground = (reminder, userId) => {
  runBackground(async () => {
    try {
      await sendReminderNotification(reminder);
    } catch (error) {
      console.error('Error in background reminder notification:', error);
    }
  });
};

/**
 * Check and tag project as "Awaiting Client Response" if 3+ reminders sent
 */
export const checkAndTagAwaitingResponse = async (reminder) => {
  try {
    if (reminder.reminderCount >= reminder.maxReminders && !reminder.awaitingClientResponse) {
      // Update reminder
      reminder.awaitingClientResponse = true;
      await reminder.save();

      // Notify all admins
      const admins = await User.find({ role: 'admin', isActive: true }).select('_id email name');
      
      for (const admin of admins) {
        const notification = await Notification.create({
          type: 'awaiting_client_response',
          title: 'Project Awaiting Client Response',
          message: `Project "${reminder.project?.name || 'Unknown'}" has had ${reminder.reminderCount} reminders sent without client response.`,
          user: admin._id,
          relatedBoard: reminder.project._id || reminder.project
        });

        emitNotification(admin._id.toString(), notification);
      }

      console.log(`Project ${reminder.project._id || reminder.project} tagged as awaiting client response`);
    }
  } catch (error) {
    console.error('Error checking awaiting response:', error);
  }
};

/**
 * Schedule next reminder based on frequency
 */
export const scheduleNextReminder = async (reminder) => {
  try {
    if (reminder.status !== 'completed' || reminder.frequency === 'one-time') {
      return null;
    }

    let nextDate = new Date(reminder.scheduledDate);

    switch (reminder.frequency) {
      case 'every-3-days':
        nextDate.setDate(nextDate.getDate() + 3);
        break;
      case 'weekly':
        nextDate.setDate(nextDate.getDate() + 7);
        break;
      case 'custom':
        if (reminder.customIntervalDays) {
          nextDate.setDate(nextDate.getDate() + reminder.customIntervalDays);
        }
        break;
      default:
        return null;
    }

    // Create next reminder
    const nextReminder = await Reminder.create({
      project: reminder.project,
      client: reminder.client,
      scheduledDate: nextDate,
      frequency: reminder.frequency,
      customIntervalDays: reminder.customIntervalDays,
      notes: reminder.notes,
      createdBy: reminder.createdBy,
      department: reminder.department,
      priority: reminder.priority,
      tags: reminder.tags
    });

    nextReminder.addHistoryEntry('created', reminder.createdBy, 'Auto-scheduled based on frequency');
    await nextReminder.save();

    return nextReminder;
  } catch (error) {
    console.error('Error scheduling next reminder:', error);
    return null;
  }
};

export default {
  startReminderScheduler,
  stopReminderScheduler,
  checkAndSendReminders,
  sendReminderNotification,
  sendReminderEmail,
  markOverdueReminders,
  sendReminderNotificationInBackground,
  checkAndTagAwaitingResponse,
  scheduleNextReminder
};
