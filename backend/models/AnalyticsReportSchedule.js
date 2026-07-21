import mongoose from 'mongoose';

const analyticsReportScheduleSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  recipients: [{ type: String, required: true, lowercase: true, trim: true }],
  frequency: { type: String, enum: ['daily', 'weekly', 'monthly'], required: true },
  format: { type: String, enum: ['csv', 'xlsx'], default: 'xlsx' },
  hourUtc: { type: Number, min: 0, max: 23, default: 8 },
  dayOfWeek: { type: Number, min: 0, max: 6, default: 1 },
  dayOfMonth: { type: Number, min: 1, max: 28, default: 1 },
  filters: { type: mongoose.Schema.Types.Mixed, default: {} },
  active: { type: Boolean, default: true },
  nextRunAt: { type: Date, required: true },
  lockedUntil: { type: Date, default: null },
  lastRunAt: { type: Date, default: null },
  lastStatus: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
  lastError: { type: String, maxlength: 500, default: '' },
}, { timestamps: true });

analyticsReportScheduleSchema.index({ active: 1, nextRunAt: 1, lockedUntil: 1 });

export default mongoose.model('AnalyticsReportSchedule', analyticsReportScheduleSchema);

