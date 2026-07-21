import ExcelJS from 'exceljs';
import AnalyticsReportSchedule from '../../models/AnalyticsReportSchedule.js';
import User from '../../models/User.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { sendEmail } from '../../utils/email.js';
import { parseAnalyticsFilters } from './analyticsFilters.js';
import { getDashboardAnalytics } from './analyticsService.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const calculateNextRun = (schedule, after = new Date()) => {
  const candidate = new Date(after);
  candidate.setUTCMinutes(0, 0, 0);
  candidate.setUTCHours(schedule.hourUtc ?? 8);
  if (schedule.frequency === 'daily') {
    if (candidate <= after) candidate.setUTCDate(candidate.getUTCDate() + 1);
  } else if (schedule.frequency === 'weekly') {
    const targetDay = schedule.dayOfWeek ?? 1;
    let offset = (targetDay - candidate.getUTCDay() + 7) % 7;
    if (offset === 0 && candidate <= after) offset = 7;
    candidate.setUTCDate(candidate.getUTCDate() + offset);
  } else {
    candidate.setUTCDate(Math.min(28, schedule.dayOfMonth ?? 1));
    if (candidate <= after) {
      candidate.setUTCMonth(candidate.getUTCMonth() + 1, Math.min(28, schedule.dayOfMonth ?? 1));
    }
  }
  return candidate;
};

const reportRows = (data) => [
  ...Object.entries(data.kpis.tasks).map(([metric, value]) => ({ section: 'Tasks', metric, value })),
  ...Object.entries(data.kpis.projects).map(([metric, value]) => ({ section: 'Projects', metric, value })),
  ...Object.entries(data.kpis.time).map(([metric, value]) => ({ section: 'Time', metric, value })),
  ...data.projects.map((project) => ({ section: 'Project portfolio', metric: project.name, value: `${project.progress}% progress, ${project.loggedHours}h logged` })),
  ...data.employees.map((employee) => ({ section: 'People', metric: employee.name, value: `${employee.productivityScore}% productivity, ${employee.loggedHours}h logged` })),
];

const makeAttachment = async (data, format) => {
  const rows = reportRows(data);
  if (format === 'csv') {
    const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [['Section', 'Metric', 'Value'], ...rows.map((row) => [row.section, row.metric, row.value])].map((row) => row.map(escape).join(',')).join('\n');
    return { filename: 'flowtask-analytics.csv', content: Buffer.from(csv), contentType: 'text/csv' };
  }
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Analytics');
  sheet.columns = [{ header: 'Section', key: 'section', width: 24 }, { header: 'Metric', key: 'metric', width: 34 }, { header: 'Value', key: 'value', width: 48 }];
  sheet.addRows(rows); sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }; sheet.views = [{ state: 'frozen', ySplit: 1 }];
  return { filename: 'flowtask-analytics.xlsx', content: await workbook.xlsx.writeBuffer(), contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
};

export const createReportSchedule = async (user, input) => {
  const recipients = [...new Set((input.recipients || []).map((email) => String(email).trim().toLowerCase()).filter(Boolean))];
  if (!input.name || !['daily', 'weekly', 'monthly'].includes(input.frequency)) throw new ErrorResponse('Name and a valid frequency are required', 400);
  if (!recipients.length || recipients.length > 10 || recipients.some((email) => !EMAIL_PATTERN.test(email))) throw new ErrorResponse('Provide between 1 and 10 valid recipient emails', 400);
  const schedule = new AnalyticsReportSchedule({
    name: String(input.name).trim().slice(0, 100), createdBy: user._id || user.id, recipients,
    frequency: input.frequency, format: input.format === 'csv' ? 'csv' : 'xlsx',
    hourUtc: Number.isInteger(Number(input.hourUtc)) ? Number(input.hourUtc) : 8,
    dayOfWeek: Number.isInteger(Number(input.dayOfWeek)) ? Number(input.dayOfWeek) : 1,
    dayOfMonth: Number.isInteger(Number(input.dayOfMonth)) ? Number(input.dayOfMonth) : 1,
    filters: Object.fromEntries(Object.entries(input.filters || {}).filter(([, value]) => typeof value === 'string' && value)),
    nextRunAt: new Date(),
  });
  schedule.nextRunAt = calculateNextRun(schedule);
  return schedule.save();
};

export const listReportSchedules = (user) => AnalyticsReportSchedule.find({ createdBy: user._id || user.id }).select('-lockedUntil').sort({ createdAt: -1 }).lean();

export const deleteReportSchedule = async (user, scheduleId) => {
  const removed = await AnalyticsReportSchedule.findOneAndDelete({ _id: scheduleId, createdBy: user._id || user.id });
  if (!removed) throw new ErrorResponse('Report schedule not found', 404);
};

export const deliverScheduledReport = async (schedule) => {
  const user = await User.findById(schedule.createdBy).select('_id role department accessType allowedProjects isActive').lean();
  if (!user?.isActive) throw new Error('Schedule owner is inactive');
  const data = await getDashboardAnalytics(user, parseAnalyticsFilters(schedule.filters || {}));
  const attachment = await makeAttachment(data, schedule.format);
  await sendEmail({
    to: schedule.recipients.join(','),
    subject: `${schedule.name} — FlowTask analytics`,
    html: `<div style="font-family:Arial,sans-serif;color:#172033"><h2>${schedule.name}</h2><p>Your role-scoped FlowTask analytics report is attached.</p><p><strong>${data.kpis.tasks.total}</strong> tasks · <strong>${data.kpis.projects.total}</strong> projects · <strong>${data.kpis.time.loggedHours}h</strong> logged</p><p style="color:#68758a;font-size:12px">Generated ${new Date(data.meta.generatedAt).toLocaleString('en-US', { timeZone: 'UTC' })} UTC</p></div>`,
    attachments: [attachment],
  });
};

