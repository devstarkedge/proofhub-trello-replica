import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Plus, X, Ban } from 'lucide-react';
import { Button } from '../../components/ui/button';
import PresenceStatusBadge from '../../components/Attendance/PresenceStatusBadge';
import { resolveDisplayStatus } from '../../utils/attendanceStatus';
import LeaveEmptyState from '../../components/Leave/LeaveEmptyState';
import * as attendanceApi from '../../services/attendanceApi';

const inputClass = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]';
const inputStyle = { backgroundColor: 'var(--color-bg-base)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' };
const labelClass = 'mb-1 block text-xs font-medium';
const labelStyle = { color: 'var(--color-text-secondary)' };

const REQUEST_STATUS_STYLES = {
  PENDING_APPROVAL: { label: 'Pending', color: 'var(--color-warning-text)', backgroundColor: 'var(--color-warning-subtle)' },
  APPROVED: { label: 'Approved', color: 'var(--color-success-text)', backgroundColor: 'var(--color-success-subtle)' },
  REJECTED: { label: 'Rejected', color: 'var(--color-error-text)', backgroundColor: 'var(--color-error-subtle)' },
  CANCELLED: { label: 'Cancelled', color: 'var(--color-text-muted)', backgroundColor: 'var(--color-bg-muted)' }
};
const RequestStatusBadge = ({ status }) => {
  const style = REQUEST_STATUS_STYLES[status] || REQUEST_STATUS_STYLES.PENDING_APPROVAL;
  return <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: style.color, backgroundColor: style.backgroundColor }}>{style.label}</span>;
};

const Panel = ({ title, description, action, children }) => (
  <section className="rounded-2xl border p-4 shadow-sm sm:p-6" style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border-default)' }}>
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>{title}</h2>
        {description && <p className="mt-0.5 text-sm" style={{ color: 'var(--color-text-muted)' }}>{description}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>
);

const REGULARIZATION_TYPES = [
  { value: 'MISSED_CHECK_IN', label: 'Missed check-in' },
  { value: 'MISSED_CHECK_OUT', label: 'Missed check-out' },
  { value: 'INCORRECT_TIME', label: 'Incorrect time recorded' },
  { value: 'GPS_PROBLEM', label: 'GPS/location problem' },
  { value: 'FIELD_WORK', label: 'Field work' },
  { value: 'FORGOTTEN_ATTENDANCE', label: 'Forgot to mark attendance' },
  { value: 'OTHER', label: 'Other' }
];

const WfhRequestForm = ({ onCancel, onSubmitted }) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await attendanceApi.submitWfhRequest({ startDate, endDate: endDate || startDate, reason });
      toast.success('Work-from-home request submitted');
      onSubmitted();
    } catch { /* interceptor */ } finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border p-4" style={{ borderColor: 'var(--color-border-subtle)' }}>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelClass} style={labelStyle}>From</label><input type="date" className={inputClass} style={inputStyle} value={startDate} onChange={(e) => setStartDate(e.target.value)} required /></div>
        <div><label className={labelClass} style={labelStyle}>To</label><input type="date" className={inputClass} style={inputStyle} value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate} /></div>
      </div>
      <div><label className={labelClass} style={labelStyle}>Reason</label><input className={inputClass} style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" /></div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" disabled={submitting || !startDate}>{submitting ? 'Submitting…' : 'Submit Request'}</Button>
      </div>
    </form>
  );
};

const RegularizationRequestForm = ({ onCancel, onSubmitted }) => {
  const [workDateKey, setWorkDateKey] = useState('');
  const [type, setType] = useState(REGULARIZATION_TYPES[0].value);
  const [checkInAt, setCheckInAt] = useState('');
  const [checkOutAt, setCheckOutAt] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const proposedCorrection = {};
      if (checkInAt) proposedCorrection.checkInAt = new Date(`${workDateKey}T${checkInAt}:00`).toISOString();
      if (checkOutAt) proposedCorrection.checkOutAt = new Date(`${workDateKey}T${checkOutAt}:00`).toISOString();
      await attendanceApi.submitRegularization({ workDateKey, type, proposedCorrection, reason });
      toast.success('Regularization request submitted');
      onSubmitted();
    } catch { /* interceptor */ } finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border p-4" style={{ borderColor: 'var(--color-border-subtle)' }}>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelClass} style={labelStyle}>Date</label><input type="date" className={inputClass} style={inputStyle} value={workDateKey} onChange={(e) => setWorkDateKey(e.target.value)} required /></div>
        <div><label className={labelClass} style={labelStyle}>Type</label><select className={inputClass} style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}>{REGULARIZATION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelClass} style={labelStyle}>Correct check-in time</label><input type="time" className={inputClass} style={inputStyle} value={checkInAt} onChange={(e) => setCheckInAt(e.target.value)} /></div>
        <div><label className={labelClass} style={labelStyle}>Correct check-out time</label><input type="time" className={inputClass} style={inputStyle} value={checkOutAt} onChange={(e) => setCheckOutAt(e.target.value)} /></div>
      </div>
      <div><label className={labelClass} style={labelStyle}>Reason</label><input className={inputClass} style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} required /></div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" disabled={submitting || !workDateKey || (!checkInAt && !checkOutAt) || !reason}>{submitting ? 'Submitting…' : 'Submit Request'}</Button>
      </div>
    </form>
  );
};

const MyAttendancePage = () => {
  const [today, setToday] = useState(undefined);
  const [wfhRequests, setWfhRequests] = useState([]);
  const [regularizations, setRegularizations] = useState([]);
  const [showWfhForm, setShowWfhForm] = useState(false);
  const [showRegularizationForm, setShowRegularizationForm] = useState(false);

  const loadToday = () => attendanceApi.getMyTodayStatus().then(({ data }) => setToday(data)).catch(() => setToday({ attendanceApplicable: false }));
  const loadRequests = () => {
    attendanceApi.getMyWfhRequests().then(({ data }) => setWfhRequests(data)).catch(() => {});
    attendanceApi.getMyRegularizations().then(({ data }) => setRegularizations(data)).catch(() => {});
  };

  useEffect(() => { loadToday(); loadRequests(); }, []);
  useEffect(() => {
    const refresh = () => { loadToday(); loadRequests(); };
    window.addEventListener('socket-attendance-checked-in', refresh);
    window.addEventListener('socket-attendance-checked-out', refresh);
    window.addEventListener('socket-attendance-wfh-decided', refresh);
    window.addEventListener('socket-attendance-regularization-decided', refresh);
    return () => {
      window.removeEventListener('socket-attendance-checked-in', refresh);
      window.removeEventListener('socket-attendance-checked-out', refresh);
      window.removeEventListener('socket-attendance-wfh-decided', refresh);
      window.removeEventListener('socket-attendance-regularization-decided', refresh);
    };
  }, []);

  const cancelWfh = async (request) => {
    try { await attendanceApi.cancelWfhRequest(request._id); toast.success('Request cancelled'); loadRequests(); } catch { /* interceptor */ }
  };
  const cancelRegularization = async (request) => {
    try { await attendanceApi.cancelRegularization(request._id); toast.success('Request cancelled'); loadRequests(); } catch { /* interceptor */ }
  };

  if (today === undefined) return null;

  if (!today.attendanceApplicable) {
    return <LeaveEmptyState title="Attendance doesn't apply to your account" description="You're not required to check in or out in this workspace." />;
  }

  return (
    <div className="space-y-4">
      <Panel title="Today">
        <div className="flex flex-wrap items-center gap-3">
          <PresenceStatusBadge status={resolveDisplayStatus(today)} />
          {today.activeSession && <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Checked in at {new Date(today.activeSession.checkInAt).toLocaleTimeString()}</span>}
          {typeof today.workedMinutes === 'number' && today.workedMinutes > 0 && <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{Math.floor(today.workedMinutes / 60)}h {Math.round(today.workedMinutes % 60)}m worked</span>}
        </div>
        <p className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>Use the Check In / Check Out control on your Home page to record attendance.</p>
      </Panel>

      <Panel
        title="Work From Home Requests"
        action={!showWfhForm && <Button size="sm" onClick={() => setShowWfhForm(true)}><Plus className="h-3.5 w-3.5" /> New Request</Button>}
      >
        {showWfhForm && <div className="mb-4"><WfhRequestForm onCancel={() => setShowWfhForm(false)} onSubmitted={() => { setShowWfhForm(false); loadRequests(); }} /></div>}
        {!wfhRequests.length ? <LeaveEmptyState title="No WFH requests yet" compact /> : (
          <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--color-border-default)' }}>
            {wfhRequests.map((request) => (
              <div key={request._id} className="flex flex-col gap-1 border-b px-4 py-3 text-sm last:border-b-0 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--color-border-subtle)' }}>
                <span style={{ color: 'var(--color-text-primary)' }}>{new Date(request.startDate).toLocaleDateString()} – {new Date(request.endDate).toLocaleDateString()}</span>
                <div className="flex items-center gap-2">
                  <RequestStatusBadge status={request.status} />
                  {request.status === 'PENDING_APPROVAL' && <Button variant="outline" size="sm" onClick={() => cancelWfh(request)}><X className="h-3.5 w-3.5" /> Cancel</Button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Regularization Requests"
        action={!showRegularizationForm && <Button size="sm" onClick={() => setShowRegularizationForm(true)}><Plus className="h-3.5 w-3.5" /> New Request</Button>}
      >
        {showRegularizationForm && <div className="mb-4"><RegularizationRequestForm onCancel={() => setShowRegularizationForm(false)} onSubmitted={() => { setShowRegularizationForm(false); loadRequests(); }} /></div>}
        {!regularizations.length ? <LeaveEmptyState title="No regularization requests yet" compact /> : (
          <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--color-border-default)' }}>
            {regularizations.map((request) => (
              <div key={request._id} className="flex flex-col gap-1 border-b px-4 py-3 text-sm last:border-b-0 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--color-border-subtle)' }}>
                <span style={{ color: 'var(--color-text-primary)' }}>{request.workDateKey} · {REGULARIZATION_TYPES.find((t) => t.value === request.type)?.label || request.type}</span>
                <div className="flex items-center gap-2">
                  <RequestStatusBadge status={request.status} />
                  {request.status === 'PENDING_APPROVAL' && <Button variant="outline" size="sm" onClick={() => cancelRegularization(request)}><Ban className="h-3.5 w-3.5" /> Cancel</Button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
};

export default MyAttendancePage;
