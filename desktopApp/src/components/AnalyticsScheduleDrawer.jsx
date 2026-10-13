import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, X } from 'lucide-react';
import Database from '../services/database';
import { formatAnalyticsDateTime } from '../utils/analyticsFormat';

const titleCase = (value = '') => value.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const AnalyticsScheduleDrawer = ({ filters, user, onClose }) => {
  const [form, setForm] = useState({ name: 'Analytics report', recipients: user?.email || '', frequency: 'weekly', format: 'xlsx', hourUtc: '8' });
  const [schedules, setSchedules] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const loadSchedules = useCallback(async () => {
    try { setSchedules((await Database.getAnalyticsReportSchedules()).data || []); }
    catch (requestError) { setError(requestError.message); }
  }, []);
  useEffect(() => { loadSchedules(); }, [loadSchedules]);

  const save = async (event) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      await Database.createAnalyticsReportSchedule({ ...form, hourUtc: Number(form.hourUtc), recipients: form.recipients.split(',').map((email) => email.trim()).filter(Boolean), filters });
      await loadSchedules();
    } catch (requestError) { setError(requestError.message); }
    finally { setSaving(false); }
  };
  const remove = async (scheduleId) => {
    try { await Database.deleteAnalyticsReportSchedule(scheduleId); setSchedules((previous) => previous.filter((schedule) => schedule._id !== scheduleId)); }
    catch (requestError) { setError(requestError.message); }
  };

  return <div className="analytics-drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside className="analytics-drawer" role="dialog" aria-modal="true" aria-label="Scheduled reports">
    <div className="analytics-drawer-head"><div><div className="analytics-drawer-title">Scheduled reports</div><div className="analytics-drawer-subtitle">Email a fresh, role-scoped report on a recurring schedule</div></div><button className="analytics-button icon-only" onClick={onClose} aria-label="Close scheduled reports"><X size={18} /></button></div>
    <form onSubmit={save} style={{ display: 'grid', gap: 10, margin: '18px 0 24px' }}><input className="analytics-select" style={{ width: '100%' }} aria-label="Report name" placeholder="Report name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /><input className="analytics-select" style={{ width: '100%' }} aria-label="Recipient emails" placeholder="Recipients, comma separated" value={form.recipients} onChange={(event) => setForm({ ...form, recipients: event.target.value })} /><div className="analytics-schedule-fields"><select className="analytics-select" value={form.frequency} onChange={(event) => setForm({ ...form, frequency: event.target.value })}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select><select className="analytics-select" value={form.format} onChange={(event) => setForm({ ...form, format: event.target.value })}><option value="xlsx">Excel</option><option value="csv">CSV</option></select><select className="analytics-select" value={form.hourUtc} onChange={(event) => setForm({ ...form, hourUtc: event.target.value })}>{Array.from({ length: 24 }, (_, hour) => { let istHour = hour + 5; if (istHour >= 24) istHour -= 24; const ampm = istHour >= 12 ? 'PM' : 'AM'; const displayHour = istHour % 12 || 12; return <option value={hour} key={hour}>{displayHour}:30 {ampm}</option>; })}</select></div>{error && <span style={{ color: '#c93645', fontSize: 12 }}>{error}</span>}<button className="analytics-button primary" type="submit" disabled={saving}>{saving ? 'Scheduling…' : 'Create schedule'}</button></form>
    <div className="analytics-panel-title" style={{ marginBottom: 10 }}>Your schedules</div><div className="analytics-detail-list">{schedules.length ? schedules.map((schedule) => <div className="analytics-detail-item" key={schedule._id}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><div><div className="analytics-detail-item-title">{schedule.name}</div><div className="analytics-detail-item-meta"><span>{titleCase(schedule.frequency)} • {schedule.format.toUpperCase()}</span><span>Next report: {formatAnalyticsDateTime(schedule.nextRunAt)}</span><span className="analytics-badge">{titleCase(schedule.lastStatus)}</span></div></div><button type="button" className="analytics-button icon-only" onClick={() => remove(schedule._id)} title="Delete schedule"><X size={14} /></button></div></div>) : <div className="analytics-empty"><div className="analytics-empty-icon"><CalendarDays size={20} /></div><strong>No scheduled reports</strong><span>Create one above to receive recurring exports.</span></div>}</div>
  </aside></div>;
};

export default AnalyticsScheduleDrawer;
