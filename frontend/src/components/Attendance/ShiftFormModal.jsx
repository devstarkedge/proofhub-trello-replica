import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/button';

const inputClass = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]';
const inputStyle = { backgroundColor: 'var(--color-bg-base)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' };
const labelClass = 'mb-1 block text-xs font-medium';
const labelStyle = { color: 'var(--color-text-secondary)' };

/** Create or edit an AttendanceShift. onSubmit(payload). */
const ShiftFormModal = ({ mode = 'create', initialShift, submitting, onCancel, onSubmit }) => {
  const [name, setName] = useState(initialShift?.name || '');
  const [startLocalTime, setStartLocalTime] = useState(initialShift?.startLocalTime || '09:00');
  const [endLocalTime, setEndLocalTime] = useState(initialShift?.endLocalTime || '18:00');
  const [breakMinutes, setBreakMinutes] = useState(initialShift?.breakMinutes ?? 0);
  const [overrideGrace, setOverrideGrace] = useState(initialShift?.graceMinutes != null);
  const [graceMinutes, setGraceMinutes] = useState(initialShift?.graceMinutes ?? 15);
  const [isDefault, setIsDefault] = useState(initialShift?.isDefault ?? false);

  const isOvernight = endLocalTime <= startLocalTime;

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit({
      name, startLocalTime, endLocalTime, breakMinutes: Number(breakMinutes),
      graceMinutes: overrideGrace ? Number(graceMinutes) : null, isDefault
    });
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4" onClick={onCancel}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl p-6 space-y-4"
        style={{ backgroundColor: 'var(--color-bg-base)' }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>{mode === 'create' ? 'Add Shift' : 'Edit Shift'}</h2>
          <button type="button" onClick={onCancel} className="rounded-lg p-1.5 hover:bg-[var(--color-bg-muted)]"><X className="h-4 w-4" /></button>
        </div>

        <div>
          <label className={labelClass} style={labelStyle}>Shift name</label>
          <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Day Shift" required />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelClass} style={labelStyle}>Start time</label><input type="time" className={inputClass} style={inputStyle} value={startLocalTime} onChange={(e) => setStartLocalTime(e.target.value)} required /></div>
          <div><label className={labelClass} style={labelStyle}>End time</label><input type="time" className={inputClass} style={inputStyle} value={endLocalTime} onChange={(e) => setEndLocalTime(e.target.value)} required /></div>
        </div>
        {isOvernight && (
          <p className="text-xs" style={{ color: 'var(--color-warning-text)' }}>This is an overnight shift (crosses midnight) — attendance for it will count against the day it starts.</p>
        )}

        <div>
          <label className={labelClass} style={labelStyle}>Unpaid break (minutes)</label>
          <input type="number" min="0" className={inputClass} style={inputStyle} value={breakMinutes} onChange={(e) => setBreakMinutes(e.target.value)} />
        </div>

        <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: 'var(--color-border-subtle)' }}>
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-primary)' }}>
            <input type="checkbox" checked={overrideGrace} onChange={(e) => setOverrideGrace(e.target.checked)} className="h-4 w-4 rounded" />
            Override the policy's default grace period for this shift
          </label>
          {overrideGrace && (
            <input type="number" min="0" className={inputClass} style={inputStyle} value={graceMinutes} onChange={(e) => setGraceMinutes(e.target.value)} />
          )}
        </div>

        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-primary)' }}>
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="h-4 w-4 rounded" />
          Mark as the default shift template
        </label>

        <div className="flex justify-end gap-2 border-t pt-4" style={{ borderColor: 'var(--color-border-subtle)' }}>
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : mode === 'create' ? 'Add Shift' : 'Save Changes'}</Button>
        </div>
      </form>
    </div>
  );
};

export default ShiftFormModal;
