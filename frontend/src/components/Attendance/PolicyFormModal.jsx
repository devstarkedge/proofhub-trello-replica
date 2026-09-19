import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/button';

const inputClass = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]';
const inputStyle = { backgroundColor: 'var(--color-bg-base)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' };
const labelClass = 'mb-1 block text-xs font-medium';
const labelStyle = { color: 'var(--color-text-secondary)' };

const WORK_MODES = ['OFFICE', 'WFH', 'HYBRID', 'FIELD'];

function defaultContent(version) {
  return {
    allowedWorkModes: version?.allowedWorkModes || ['OFFICE'],
    graceMinutes: version?.graceMinutes ?? 15,
    earlyExitGraceMinutes: version?.earlyExitGraceMinutes ?? 0,
    minimumFullDayMinutes: version?.minimumFullDayMinutes ?? 480,
    minimumHalfDayMinutes: version?.minimumHalfDayMinutes ?? 240,
    halfDayTrigger: version?.halfDayTrigger || 'MINIMUM_DURATION',
    offDayAttendanceBehavior: version?.offDayAttendanceBehavior || 'REJECT',
    holidayAttendanceBehavior: version?.holidayAttendanceBehavior || 'REJECT',
    fullDayLeaveCheckInBehavior: version?.fullDayLeaveCheckInBehavior || 'REJECT',
    gpsRequirements: {
      maximumGpsAccuracyMeters: version?.gpsRequirements?.maximumGpsAccuracyMeters ?? 100,
      maximumCoordinateAgeSeconds: version?.gpsRequirements?.maximumCoordinateAgeSeconds ?? 120,
      locationRequestTimeoutSeconds: version?.gpsRequirements?.locationRequestTimeoutSeconds ?? 30
    },
    office: {
      allowAnyActiveWorkspaceLocation: version?.office?.allowAnyActiveWorkspaceLocation ?? false,
      requireCheckoutGeofence: version?.office?.requireCheckoutGeofence ?? true
    },
    missingCheckout: {
      behavior: version?.missingCheckout?.behavior || 'FLAG_ONLY',
      autoCloseAtLocalTime: version?.missingCheckout?.autoCloseAtLocalTime || '23:59'
    },
    wfh: {
      enabled: version?.wfh?.enabled ?? false,
      requireApproval: version?.wfh?.requireApproval ?? true,
      approverLevels: version?.wfh?.approverLevels || ['MANAGER'],
      requireGps: version?.wfh?.requireGps ?? false,
      allowFutureDates: version?.wfh?.allowFutureDates ?? true,
      maxDurationDays: version?.wfh?.maxDurationDays ?? '',
      allowRecurring: version?.wfh?.allowRecurring ?? false
    },
    hybrid: {
      enabled: version?.hybrid?.enabled ?? false,
      scheduleMode: version?.hybrid?.scheduleMode || 'APPROVED_WFH_DATES'
    },
    field: {
      enabled: version?.field?.enabled ?? false,
      requireGeofence: version?.field?.requireGeofence ?? false
    },
    regularization: {
      enabled: version?.regularization?.enabled ?? true,
      requireApproval: version?.regularization?.requireApproval ?? true,
      approverLevels: version?.regularization?.approverLevels || ['MANAGER']
    }
  };
}

const Section = ({ title, description, children }) => (
  <div className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0" style={{ borderColor: 'var(--color-border-subtle)' }}>
    <div>
      <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{title}</h3>
      {description && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{description}</p>}
    </div>
    {children}
  </div>
);

const Checkbox = ({ checked, onChange, label }) => (
  <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-primary)' }}>
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded" />
    {label}
  </label>
);

/** Create or edit an AttendancePolicy — mode='create'|'edit'. onSubmit({name, description, effectiveDate, content}). */
const PolicyFormModal = ({ mode = 'create', initialPolicy, initialVersion, submitting, onCancel, onSubmit }) => {
  const [name, setName] = useState(initialPolicy?.name || '');
  const [description, setDescription] = useState(initialPolicy?.description || '');
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [content, setContent] = useState(() => defaultContent(initialVersion));

  const updateContent = (patch) => setContent((prev) => ({ ...prev, ...patch }));
  const updateNested = (key, patch) => setContent((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const toggleWorkMode = (mode_) => {
    const set = new Set(content.allowedWorkModes);
    if (set.has(mode_)) set.delete(mode_); else set.add(mode_);
    updateContent({ allowedWorkModes: Array.from(set) });
  };
  const toggleLevel = (key, level) => {
    const set = new Set(content[key].approverLevels);
    if (set.has(level)) set.delete(level); else set.add(level);
    updateNested(key, { approverLevels: Array.from(set) });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit({
      name, description, effectiveDate,
      content: {
        ...content,
        wfh: { ...content.wfh, maxDurationDays: content.wfh.maxDurationDays === '' ? null : Number(content.wfh.maxDurationDays) }
      }
    });
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4" onClick={onCancel}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-6 space-y-5"
        style={{ backgroundColor: 'var(--color-bg-base)' }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
            {mode === 'create' ? 'Create Attendance Policy' : 'Edit Attendance Policy'}
          </h2>
          <button type="button" onClick={onCancel} className="rounded-lg p-1.5 hover:bg-[var(--color-bg-muted)]"><X className="h-4 w-4" /></button>
        </div>

        <Section title="General">
          <div>
            <label className={labelClass} style={labelStyle}>Policy name</label>
            <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>Description</label>
            <input className={inputClass} style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>Effective date</label>
            <input type="date" className={inputClass} style={inputStyle} value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} required />
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>A past/today date activates immediately; a future date schedules this version.</p>
          </div>
        </Section>

        <Section title="Allowed work modes" description="Which modes employees may be assigned in this workspace.">
          <div className="flex flex-wrap gap-3">
            {WORK_MODES.map((mode_) => (
              <Checkbox key={mode_} checked={content.allowedWorkModes.includes(mode_)} onChange={() => toggleWorkMode(mode_)} label={mode_} />
            ))}
          </div>
        </Section>

        <Section title="Punctuality & duration">
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelClass} style={labelStyle}>Grace (minutes)</label><input type="number" min="0" className={inputClass} style={inputStyle} value={content.graceMinutes} onChange={(e) => updateContent({ graceMinutes: Number(e.target.value) })} /></div>
            <div><label className={labelClass} style={labelStyle}>Early-exit grace (minutes)</label><input type="number" min="0" className={inputClass} style={inputStyle} value={content.earlyExitGraceMinutes} onChange={(e) => updateContent({ earlyExitGraceMinutes: Number(e.target.value) })} /></div>
            <div><label className={labelClass} style={labelStyle}>Full-day minimum (minutes)</label><input type="number" min="1" className={inputClass} style={inputStyle} value={content.minimumFullDayMinutes} onChange={(e) => updateContent({ minimumFullDayMinutes: Number(e.target.value) })} /></div>
            <div><label className={labelClass} style={labelStyle}>Half-day minimum (minutes)</label><input type="number" min="1" className={inputClass} style={inputStyle} value={content.minimumHalfDayMinutes} onChange={(e) => updateContent({ minimumHalfDayMinutes: Number(e.target.value) })} /></div>
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>Half-day is triggered by</label>
            <select className={inputClass} style={inputStyle} value={content.halfDayTrigger} onChange={(e) => updateContent({ halfDayTrigger: e.target.value })}>
              <option value="MINIMUM_DURATION">Duration worked only</option>
              <option value="LATE_ARRIVAL">Late arrival</option>
              <option value="EARLY_DEPARTURE">Early departure</option>
              <option value="COMBINED">Duration, late arrival, or early departure</option>
            </select>
          </div>
        </Section>

        <Section title="GPS & geofence">
          <div className="grid grid-cols-3 gap-3">
            <div><label className={labelClass} style={labelStyle}>Max GPS accuracy (m)</label><input type="number" min="1" className={inputClass} style={inputStyle} value={content.gpsRequirements.maximumGpsAccuracyMeters} onChange={(e) => updateNested('gpsRequirements', { maximumGpsAccuracyMeters: Number(e.target.value) })} /></div>
            <div><label className={labelClass} style={labelStyle}>Max coordinate age (s)</label><input type="number" min="1" className={inputClass} style={inputStyle} value={content.gpsRequirements.maximumCoordinateAgeSeconds} onChange={(e) => updateNested('gpsRequirements', { maximumCoordinateAgeSeconds: Number(e.target.value) })} /></div>
            <div><label className={labelClass} style={labelStyle}>Location timeout (s)</label><input type="number" min="1" className={inputClass} style={inputStyle} value={content.gpsRequirements.locationRequestTimeoutSeconds} onChange={(e) => updateNested('gpsRequirements', { locationRequestTimeoutSeconds: Number(e.target.value) })} /></div>
          </div>
          <Checkbox checked={content.office.allowAnyActiveWorkspaceLocation} onChange={(v) => updateNested('office', { allowAnyActiveWorkspaceLocation: v })} label="Allow check-in at ANY active workspace location (not just assigned ones)" />
          <Checkbox checked={content.office.requireCheckoutGeofence} onChange={(v) => updateNested('office', { requireCheckoutGeofence: v })} label="Require geofence validation at check-out too" />
        </Section>

        <Section title="Off-days, holidays & leave">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div><label className={labelClass} style={labelStyle}>Working on a day off</label><select className={inputClass} style={inputStyle} value={content.offDayAttendanceBehavior} onChange={(e) => updateContent({ offDayAttendanceBehavior: e.target.value })}><option value="REJECT">Reject check-in</option><option value="ALLOW_WITH_FLAG">Allow, flagged</option></select></div>
            <div><label className={labelClass} style={labelStyle}>Working on a holiday</label><select className={inputClass} style={inputStyle} value={content.holidayAttendanceBehavior} onChange={(e) => updateContent({ holidayAttendanceBehavior: e.target.value })}><option value="REJECT">Reject check-in</option><option value="ALLOW_WITH_FLAG">Allow, flagged</option></select></div>
            <div><label className={labelClass} style={labelStyle}>Check-in on full-day leave</label><select className={inputClass} style={inputStyle} value={content.fullDayLeaveCheckInBehavior} onChange={(e) => updateContent({ fullDayLeaveCheckInBehavior: e.target.value })}><option value="REJECT">Reject check-in</option><option value="ALLOW_WITH_OVERRIDE">Allow with override</option></select></div>
          </div>
        </Section>

        <Section title="Missing check-out">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} style={labelStyle}>Behavior</label>
              <select className={inputClass} style={inputStyle} value={content.missingCheckout.behavior} onChange={(e) => updateNested('missingCheckout', { behavior: e.target.value })}>
                <option value="FLAG_ONLY">Flag only</option>
                <option value="REQUIRE_REGULARIZATION">Require regularization</option>
                <option value="AUTO_CLOSE_AT_CONFIGURED_TIME">Auto-close at a configured time</option>
              </select>
            </div>
            {content.missingCheckout.behavior === 'AUTO_CLOSE_AT_CONFIGURED_TIME' && (
              <div><label className={labelClass} style={labelStyle}>Auto-close time</label><input type="time" className={inputClass} style={inputStyle} value={content.missingCheckout.autoCloseAtLocalTime} onChange={(e) => updateNested('missingCheckout', { autoCloseAtLocalTime: e.target.value })} /></div>
            )}
          </div>
        </Section>

        <Section title="Work From Home">
          <Checkbox checked={content.wfh.enabled} onChange={(v) => updateNested('wfh', { enabled: v })} label="Enable Work From Home" />
          {content.wfh.enabled && (
            <div className="space-y-3 pl-6">
              <Checkbox checked={content.wfh.requireApproval} onChange={(v) => updateNested('wfh', { requireApproval: v })} label="Require approval for ad hoc WFH day requests" />
              {content.wfh.requireApproval && (
                <div className="flex gap-4">
                  <Checkbox checked={content.wfh.approverLevels.includes('MANAGER')} onChange={() => toggleLevel('wfh', 'MANAGER')} label="Manager approves" />
                  <Checkbox checked={content.wfh.approverLevels.includes('HR')} onChange={() => toggleLevel('wfh', 'HR')} label="HR approves" />
                </div>
              )}
              <Checkbox checked={content.wfh.requireGps} onChange={(v) => updateNested('wfh', { requireGps: v })} label="Capture GPS on WFH check-in (no geofence, evidence only)" />
              <Checkbox checked={content.wfh.allowFutureDates} onChange={(v) => updateNested('wfh', { allowFutureDates: v })} label="Allow requesting future dates" />
              <Checkbox checked={content.wfh.allowRecurring} onChange={(v) => updateNested('wfh', { allowRecurring: v })} label="Allow recurring WFH requests" />
              <div className="max-w-xs"><label className={labelClass} style={labelStyle}>Max request length (days, blank = no limit)</label><input type="number" min="1" className={inputClass} style={inputStyle} value={content.wfh.maxDurationDays} onChange={(e) => updateNested('wfh', { maxDurationDays: e.target.value })} /></div>
            </div>
          )}
        </Section>

        <Section title="Hybrid">
          <Checkbox checked={content.hybrid.enabled} onChange={(v) => updateNested('hybrid', { enabled: v })} label="Enable Hybrid work mode" />
          {content.hybrid.enabled && (
            <div className="pl-6">
              <label className={labelClass} style={labelStyle}>How Hybrid days are decided</label>
              <select className={inputClass} style={inputStyle} value={content.hybrid.scheduleMode} onChange={(e) => updateNested('hybrid', { scheduleMode: e.target.value })}>
                <option value="APPROVED_WFH_DATES">Office by default, WFH only on approved dates</option>
                <option value="FIXED_OFFICE_DAYS">Fixed office days of the week</option>
                <option value="FIXED_WFH_DAYS">Fixed WFH days of the week</option>
              </select>
              <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>Fixed weekday schedules are configured per employee/department assignment.</p>
            </div>
          )}
        </Section>

        <Section title="Field">
          <Checkbox checked={content.field.enabled} onChange={(v) => updateNested('field', { enabled: v })} label="Enable Field work mode" />
          {content.field.enabled && (
            <div className="pl-6"><Checkbox checked={content.field.requireGeofence} onChange={(v) => updateNested('field', { requireGeofence: v })} label="Require geofence at an assigned field site" /></div>
          )}
        </Section>

        <Section title="Regularization">
          <Checkbox checked={content.regularization.enabled} onChange={(v) => updateNested('regularization', { enabled: v })} label="Allow employees to request attendance corrections" />
          {content.regularization.enabled && (
            <div className="space-y-3 pl-6">
              <Checkbox checked={content.regularization.requireApproval} onChange={(v) => updateNested('regularization', { requireApproval: v })} label="Require approval" />
              {content.regularization.requireApproval && (
                <div className="flex gap-4">
                  <Checkbox checked={content.regularization.approverLevels.includes('MANAGER')} onChange={() => toggleLevel('regularization', 'MANAGER')} label="Manager approves" />
                  <Checkbox checked={content.regularization.approverLevels.includes('HR')} onChange={() => toggleLevel('regularization', 'HR')} label="HR approves" />
                </div>
              )}
            </div>
          )}
        </Section>

        <div className="flex justify-end gap-2 border-t pt-4" style={{ borderColor: 'var(--color-border-subtle)' }}>
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={submitting || !content.allowedWorkModes.length}>{submitting ? 'Saving…' : mode === 'create' ? 'Create Policy' : 'Save Changes'}</Button>
        </div>
      </form>
    </div>
  );
};

export default PolicyFormModal;
