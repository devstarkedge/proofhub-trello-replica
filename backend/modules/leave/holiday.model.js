import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

/**
 * A single holiday or compensatory special-working-day. Scope precedence in
 * leaveCalendar.service.js#classifyDate is most-specific-wins: a
 * department/location entry overrides a workspace-wide one for the same
 * date. `type: 'SPECIAL_WORKING_DAY'` supports compensatory workdays (e.g.
 * a weekend made a working day to offset an earlier holiday) without
 * needing a separate model.
 */
const holidaySchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  date: { type: Date, required: true },
  name: { type: String, required: true, trim: true, maxlength: 150 },
  type: { type: String, enum: ['HOLIDAY', 'SPECIAL_WORKING_DAY'], default: 'HOLIDAY' },
  isHalfDay: { type: Boolean, default: false },
  scope: { type: String, enum: ['workspace', 'department', 'location'], default: 'workspace' },
  departmentIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'Department', default: [] },
  locationTag: { type: String, trim: true, default: null },
  recurrenceRule: { type: String, enum: ['NONE', 'ANNUAL_SAME_DATE'], default: 'NONE' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

holidaySchema.index({ workspaceId: 1, date: 1 });
holidaySchema.index({ workspaceId: 1, scope: 1, departmentIds: 1 });

holidaySchema.plugin(workspaceScopePlugin);

export default mongoose.model('Holiday', holidaySchema);
