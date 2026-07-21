import cron from 'node-cron';
import AnalyticsReportSchedule from '../models/AnalyticsReportSchedule.js';
import { calculateNextRun, deliverScheduledReport } from '../services/analytics/analyticsReportService.js';
import logger from '../utils/logger.js';

let task;
let running = false;

const processDueSchedules = async () => {
  if (running) return;
  running = true;
  try {
    for (let count = 0; count < 20; count += 1) {
      const now = new Date();
      const schedule = await AnalyticsReportSchedule.findOneAndUpdate(
        { active: true, nextRunAt: { $lte: now }, $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }] },
        { $set: { lockedUntil: new Date(now.getTime() + 10 * 60 * 1000) } },
        { new: true, sort: { nextRunAt: 1 } },
      );
      if (!schedule) break;
      try {
        await deliverScheduledReport(schedule);
        schedule.lastRunAt = new Date(); schedule.lastStatus = 'sent'; schedule.lastError = '';
        schedule.nextRunAt = calculateNextRun(schedule, schedule.lastRunAt);
      } catch (error) {
        schedule.lastStatus = 'failed'; schedule.lastError = String(error.message || error).slice(0, 500);
        schedule.nextRunAt = new Date(Date.now() + 15 * 60 * 1000);
        logger.error('Scheduled analytics report failed', { scheduleId: schedule._id.toString(), error: schedule.lastError });
      }
      schedule.lockedUntil = null;
      await schedule.save();
    }
  } finally { running = false; }
};

export const startAnalyticsReportScheduler = () => {
  if (task) return;
  task = cron.schedule('*/5 * * * *', processDueSchedules);
  processDueSchedules().catch((error) => logger.error('Analytics scheduler startup failed', { error: error.message }));
};

export const stopAnalyticsReportScheduler = () => { task?.stop(); task = null; };

