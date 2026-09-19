import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

const pointSchema = new mongoose.Schema({
  type: { type: String, enum: ['Point'], default: 'Point' },
  // GeoJSON order is [longitude, latitude] — NOT [lat, lng]. Every reader
  // of this field (attendanceGeofence.service.js, the frontend map/form)
  // must respect this order; getting it backwards silently produces a
  // location on the wrong side of the planet rather than an error.
  coordinates: {
    type: [Number],
    required: true,
    validate: {
      validator: (value) => Array.isArray(value) && value.length === 2
        && value[0] >= -180 && value[0] <= 180
        && value[1] >= -90 && value[1] <= 90,
      message: 'coordinates must be [longitude, latitude] with longitude in [-180,180] and latitude in [-90,90]'
    }
  }
}, { _id: false });

/**
 * One centralized physical-site model for every attendance location type —
 * office, branch, warehouse, client site, or field site — so Field mode
 * (spec §11) reuses this instead of a separate coordinate/geofence
 * implementation. Never hard-deleted (spec §15): deactivating a location
 * only flips `active`, so historical AttendanceSession.locationSnapshot
 * references stay resolvable forever.
 */
const attendanceLocationSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  name: { type: String, required: true, trim: true, maxlength: 150 },
  normalizedName: { type: String, trim: true, lowercase: true, maxlength: 150 },
  type: { type: String, enum: ['OFFICE', 'BRANCH', 'WAREHOUSE', 'CLIENT_SITE', 'FIELD_SITE'], default: 'OFFICE' },
  location: { type: pointSchema, required: true },
  allowedRadiusMeters: { type: Number, required: true, min: 1, max: 50000 },
  active: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

attendanceLocationSchema.index({ workspaceId: 1, active: 1 });
attendanceLocationSchema.index({ workspaceId: 1, normalizedName: 1 });
attendanceLocationSchema.index({ location: '2dsphere' });

attendanceLocationSchema.pre('validate', function normalizeNameBeforeValidate(next) {
  if (this.name) this.normalizedName = this.name.trim().toLowerCase();
  next();
});

attendanceLocationSchema.plugin(workspaceScopePlugin);

export default mongoose.model('AttendanceLocation', attendanceLocationSchema);
