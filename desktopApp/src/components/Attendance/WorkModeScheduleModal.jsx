import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { X, Plus, Ban } from 'lucide-react';
import { Button } from '../ui/button';
import * as attendanceApi from '../../services/attendanceApi';

const inputClass = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]';
const inputStyle = { backgroundColor: 'var(--color-bg-base)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' };
const labelClass = 'mb-1 block text-xs font-medium';
const labelStyle = { color: 'var(--color-text-secondary)' };

const DAYS = [
  { value: 0, label: 'Sunday' }, { value: 1, label: 'Monday' }, { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' }, { value: 4, label: 'Thursday' }, { value: 5, label: 'Friday' }, { value: 6, label: 'Saturday' }
];
const OCCURRENCES = [
  { value: 'EVERY', label: 'Every week' }, { value: 'FIRST', label: '1st' }, { value: 'SECOND', label: '2nd' },
  { value: 'THIRD', label: '3rd' }, { value: 'FOURTH', label: '4th' }, { value: 'FIFTH', label: '5th' }, { value: 'LAST', label: 'Last' }
];

const dayLabel = (value) => DAYS.find((d) => d.value === value)?.label || value;
const occurrenceLabel = (value) => OCCURRENCES.find((o) => o.value === value)?.label || value;

/**
 * Manage the day-of-week / specific-date schedule for one Work Mode
 * Override (spec §5-6, §11-14) — "Monday-Wednesday = OFFICE, Thursday-
 * Friday = WFH", "every Thursday = WFH", "1st and 3rd Friday = WFH", or an
 * exact date/range. A rule's mode is restricted to the parent override's
 * own allowedModes, enforced server-side.
 */
const WorkModeScheduleModal = ({ override, onClose }) => {
  const [rules, setRules] = useState([]);
  const [dateOverrides, setDateOverrides] = useState([]);
  const [ruleForm, setRuleForm] = useState({ dayOfWeek: 1, occurrence: 'EVERY', mode: override.allowedModes[0] });
  const [dateForm, setDateForm] = useState({ startDate: '', endDate: '', mode: override.allowedModes[0] });
  const [submitting, setSubmitting] = useState(false);

  const overrideId = override._id;
  const load = () => {
    attendanceApi.getWorkModeScheduleRules(overrideId).then(({ data }) => setRules(data)).catch(() => {});
    attendanceApi.getWorkModeDateOverrides(overrideId).then(({ data }) => setDateOverrides(data)).catch(() => {});
  };
  useEffect(() => { load(); }, [overrideId]);

  const addRule = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await attendanceApi.createWorkModeScheduleRule(override._id, ruleForm);
      toast.success('Schedule rule added');
      load();
    } catch { /* interceptor owns error toasts */ } finally { setSubmitting(false); }
  };
  const removeRule = async (rule) => {
    try { await attendanceApi.deactivateWorkModeScheduleRule(rule._id); toast.success('Rule removed'); load(); } catch { /* interceptor */ }
  };

  const addDateOverride = async (event) => {
    event.preventDefault();
    if (!dateForm.startDate) return;
    setSubmitting(true);
    try {
      await attendanceApi.createWorkModeDateOverrides(override._id, dateForm);
      toast.success('Date override added');
      load();
    } catch { /* interceptor */ } finally { setSubmitting(false); }
  };
  const removeDateOverride = async (row) => {
    try { await attendanceApi.deactivateWorkModeDateOverride(row._id); toast.success('Date override removed'); load(); } catch { /* interceptor */ }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-6 space-y-5"
        style={{ backgroundColor: 'var(--color-bg-base)' }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>Schedule — {override.scopeType}: {override.scopeName}</h2>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>When set, this decides the mode for each business date automatically — employees can't pick a different one on a scheduled day.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-[var(--color-bg-muted)]"><X className="h-4 w-4" /></button>
        </div>

        <section className="space-y-3 rounded-xl border p-4" style={{ borderColor: 'var(--color-border-subtle)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Weekly pattern</h3>
          {rules.length > 0 && (
            <div className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--color-border-default)' }}>
              {rules.map((rule) => (
                <div key={rule._id} className="flex items-center justify-between border-b px-3 py-2 text-sm last:border-b-0" style={{ borderColor: 'var(--color-border-subtle)' }}>
                  <span style={{ color: 'var(--color-text-primary)' }}>{occurrenceLabel(rule.occurrence)} {dayLabel(rule.dayOfWeek)} → {rule.mode}</span>
                  <Button variant="outline" size="sm" onClick={() => removeRule(rule)}><Ban className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={addRule} className="flex flex-wrap items-end gap-2">
            <div>
              <label className={labelClass} style={labelStyle}>Occurrence</label>
              <select className={inputClass} style={inputStyle} value={ruleForm.occurrence} onChange={(e) => setRuleForm((f) => ({ ...f, occurrence: e.target.value }))}>
                {OCCURRENCES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Day</label>
              <select className={inputClass} style={inputStyle} value={ruleForm.dayOfWeek} onChange={(e) => setRuleForm((f) => ({ ...f, dayOfWeek: Number(e.target.value) }))}>
                {DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Mode</label>
              <select className={inputClass} style={inputStyle} value={ruleForm.mode} onChange={(e) => setRuleForm((f) => ({ ...f, mode: e.target.value }))}>
                {override.allowedModes.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <Button type="submit" size="sm" disabled={submitting}><Plus className="h-3.5 w-3.5" /> Add Rule</Button>
          </form>
        </section>

        <section className="space-y-3 rounded-xl border p-4" style={{ borderColor: 'var(--color-border-subtle)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Specific dates (override the weekly pattern for just these dates)</h3>
          {dateOverrides.length > 0 && (
            <div className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--color-border-default)' }}>
              {dateOverrides.map((row) => (
                <div key={row._id} className="flex items-center justify-between border-b px-3 py-2 text-sm last:border-b-0" style={{ borderColor: 'var(--color-border-subtle)' }}>
                  <span style={{ color: 'var(--color-text-primary)' }}>{new Date(row.date).toLocaleDateString()} → {row.mode}</span>
                  <Button variant="outline" size="sm" onClick={() => removeDateOverride(row)}><Ban className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={addDateOverride} className="flex flex-wrap items-end gap-2">
            <div>
              <label className={labelClass} style={labelStyle}>From</label>
              <input type="date" className={inputClass} style={inputStyle} value={dateForm.startDate} onChange={(e) => setDateForm((f) => ({ ...f, startDate: e.target.value }))} required />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>To (optional, for a range)</label>
              <input type="date" className={inputClass} style={inputStyle} value={dateForm.endDate} min={dateForm.startDate} onChange={(e) => setDateForm((f) => ({ ...f, endDate: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Mode</label>
              <select className={inputClass} style={inputStyle} value={dateForm.mode} onChange={(e) => setDateForm((f) => ({ ...f, mode: e.target.value }))}>
                {override.allowedModes.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <Button type="submit" size="sm" disabled={submitting || !dateForm.startDate}><Plus className="h-3.5 w-3.5" /> Add Date</Button>
          </form>
        </section>

        <div className="flex justify-end border-t pt-4" style={{ borderColor: 'var(--color-border-subtle)' }}>
          <Button type="button" variant="outline" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
};

export default WorkModeScheduleModal;
