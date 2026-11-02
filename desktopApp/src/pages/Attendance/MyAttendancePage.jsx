import useAttendanceSession from '../../hooks/useAttendanceSession';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { Plus, X, Ban, Clock3, CircleAlert, ClipboardCheck, House, LoaderCircle } from 'lucide-react';
import { Button } from '../../components/ui/button';
import LeaveEmptyState from '../../components/Leave/LeaveEmptyState';
import WorkspaceContext from '../../context/WorkspaceContext';
import MyAttendanceOverview from '../../components/Attendance/MyAttendanceOverview';
import MyAttendanceRequests from '../../components/Attendance/MyAttendanceRequests';
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

const Panel = ({ title, description, action, children, compact = false }) => (
  <section className={`rounded-2xl border shadow-sm ${compact ? 'px-4 py-3 sm:px-5' : 'p-4 sm:p-5'}`} style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border-default)' }}>
    <div className={`${compact ? 'mb-2' : 'mb-4'} flex items-start justify-between gap-3`}>
      <div>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{title}</h2>
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
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border p-4" style={{ borderColor: 'var(--color-border-subtle)' }}>
      <div className="grid grid-cols-2 gap-3">
        <div><label htmlFor="wfh-start" className={labelClass} style={labelStyle}>From</label><input id="wfh-start" type="date" className={inputClass} style={inputStyle} value={startDate} onChange={(e) => setStartDate(e.target.value)} required /></div>
        <div><label htmlFor="wfh-end" className={labelClass} style={labelStyle}>To</label><input id="wfh-end" type="date" className={inputClass} style={inputStyle} value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate} /></div>
      </div>
      <div><label htmlFor="wfh-reason" className={labelClass} style={labelStyle}>Reason</label><input id="wfh-reason" className={inputClass} style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" /></div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" disabled={submitting || !startDate}>{submitting ? 'Submitting…' : 'Submit Request'}</Button>
      </div>
    </form>
  );
};

const RegularizationRequestForm = ({ onCancel, onSubmitted, initialValues }) => {
  const [workDateKey, setWorkDateKey] = useState(initialValues?.workDateKey || '');
  const [type, setType] = useState(initialValues?.type || REGULARIZATION_TYPES[0].value);
  const [checkInAt, setCheckInAt] = useState('');
  const [checkOutAt, setCheckOutAt] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (initialValues?.workDateKey) setWorkDateKey(initialValues.workDateKey);
    if (initialValues?.type) setType(initialValues.type);
    if (initialValues?.checkInAt) setCheckInAt(initialValues.checkInAt);
    if (initialValues?.checkOutAt) setCheckOutAt(initialValues.checkOutAt);
    if (initialValues?.reason) setReason(initialValues.reason);
  }, [initialValues]);

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
        <div><label htmlFor="regularization-date" className={labelClass} style={labelStyle}>Date</label><input id="regularization-date" type="date" className={inputClass} style={inputStyle} value={workDateKey} onChange={(e) => setWorkDateKey(e.target.value)} required /></div>
        <div><label htmlFor="regularization-type" className={labelClass} style={labelStyle}>Type</label><select id="regularization-type" className={inputClass} style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}>{REGULARIZATION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label htmlFor="regularization-check-in" className={labelClass} style={labelStyle}>Correct check-in time</label><input id="regularization-check-in" type="time" className={inputClass} style={inputStyle} value={checkInAt} onChange={(e) => setCheckInAt(e.target.value)} /></div>
        <div><label htmlFor="regularization-check-out" className={labelClass} style={labelStyle}>Correct check-out time</label><input id="regularization-check-out" type="time" className={inputClass} style={inputStyle} value={checkOutAt} onChange={(e) => setCheckOutAt(e.target.value)} /></div>
      </div>
      <div><label htmlFor="regularization-reason" className={labelClass} style={labelStyle}>Reason</label><input id="regularization-reason" className={inputClass} style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} required /></div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" disabled={submitting || !workDateKey || (!checkInAt && !checkOutAt) || !reason}>{submitting ? 'Submitting…' : 'Submit Request'}</Button>
      </div>
    </form>
  );
};

const MyAttendancePage = () => {
  const { currentWorkspace } = useContext(WorkspaceContext) || {};
  const {status:today,error:sessionError,reload:loadToday,scope}=useAttendanceSession();
  const [wfhRequests, setWfhRequests] = useState([]);
  const [regularizations, setRegularizations] = useState([]);
  const [activeAction, setActiveAction] = useState(null);
  const [regularizationInitialValues, setRegularizationInitialValues] = useState(null);
  const regularizationFormRef = useRef(null);

  const requestGeneration=useRef(0),activeScope=useRef(scope);activeScope.current=scope;
  const invalidateRequests=useCallback(()=>{requestGeneration.current++;},[]);
  const loadRequests = useCallback(() => {
    const generation=++requestGeneration.current,expectedScope=scope;
    const current=()=>generation===requestGeneration.current&&activeScope.current===expectedScope;
    attendanceApi.getMyWfhRequests().then(({ data }) => {if(current())setWfhRequests(data);}).catch(() => {});
    attendanceApi.getMyRegularizations().then(({ data }) => {if(current())setRegularizations(data);}).catch(() => {});
  },[scope]);

  useEffect(() => {setWfhRequests([]);setRegularizations([]);setActiveAction(null);loadRequests();return invalidateRequests;}, [loadRequests,invalidateRequests,currentWorkspace?._id]);
  useEffect(() => {
    const refresh = () => { loadRequests(); };
    window.addEventListener('socket-attendance-checked-in', refresh);
    window.addEventListener('socket-attendance-checked-out', refresh);
    window.addEventListener('socket-attendance-missed-checkout', refresh);
    window.addEventListener('socket-attendance-updated', refresh);
    window.addEventListener('socket-attendance-wfh-decided', refresh);
    window.addEventListener('socket-attendance-regularization-decided', refresh);
    // A Location changed for this workspace — refetch so "Today" reflects
    // the current GPS/geofence requirement immediately (new spec §5).
    window.addEventListener('socket-attendance-locations-updated', refresh);
    return () => {
      window.removeEventListener('socket-attendance-checked-in', refresh);
      window.removeEventListener('socket-attendance-checked-out', refresh);
      window.removeEventListener('socket-attendance-missed-checkout', refresh);
      window.removeEventListener('socket-attendance-updated', refresh);
      window.removeEventListener('socket-attendance-locations-updated', refresh);
      window.removeEventListener('socket-attendance-wfh-decided', refresh);
      window.removeEventListener('socket-attendance-regularization-decided', refresh);
    };
  }, [loadRequests]);

  const cancelWfh = (request) => {
    const previous = [...wfhRequests];
    // Optimistic UI update: instantly mark cancelled without waiting for server response
    setWfhRequests((prev) =>
      prev.map((r) => (r._id === request._id ? { ...r, status: 'CANCELLED' } : r))
    );
    toast.success('Request cancelled');

    attendanceApi.cancelWfhRequest(request._id).catch((error) => {
      setWfhRequests(previous);
      toast.error(error?.response?.data?.message || error?.message || 'Failed to cancel request');
    });
  };

  const cancelRegularization = (request) => {
    const previous = [...regularizations];
    // Optimistic UI update: instantly mark cancelled without waiting for server response
    setRegularizations((prev) =>
      prev.map((r) => (r._id === request._id ? { ...r, status: 'CANCELLED' } : r))
    );
    toast.success('Request cancelled');
    window.dispatchEvent(new CustomEvent('attendance-regularization-refresh'));

    attendanceApi.cancelRegularization(request._id).catch((error) => {
      setRegularizations(previous);
      toast.error(error?.response?.data?.message || error?.message || 'Failed to cancel request');
    });
  };

  if (!today) return <div role={sessionError?'alert':'status'} className="flex items-center gap-3 rounded-2xl border p-6 text-sm" style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-secondary)' }}>{!sessionError && <LoaderCircle className="h-5 w-5 animate-spin" />}{sessionError||'Loading attendance…'}{sessionError&&<button className="ml-auto rounded-lg border px-3 py-2" onClick={loadToday}>Retry</button>}</div>;

  if (!today.attendanceApplicable) {
    return <LeaveEmptyState title="Attendance doesn't apply to your account" description="You're not required to check in or out in this workspace." />;
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3"><span className="rounded-xl p-2.5" style={{ backgroundColor: 'var(--color-primary-subtle)', color: 'var(--color-primary)' }}><Clock3 className="h-6 w-6" /></span><div><h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>My Attendance</h1><p className="mt-0.5 text-xs sm:text-sm" style={{ color: 'var(--color-text-muted)' }}>Your attendance, daily details, and requests in one place.</p></div></header>
      {sessionError&&<p role="status" className="rounded-xl border px-4 py-3 text-sm">{sessionError} <button className="ml-2 underline" onClick={loadToday}>Retry</button></p>}
      {today.unresolvedMissedCheckout && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" /><div>
            <p className="font-semibold text-amber-900 dark:text-amber-100">Missed Check-Out Detected</p>
            <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
              You missed checking out for work date <span className="font-bold">{today.unresolvedMissedCheckout.workDateKey}</span>. Please submit a regularization request to verify your working hours.
            </p>
          </div></div>
          <Button
            size="sm"
            className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
            onClick={() => {
              let prefilledCheckIn = '';
              if (today.unresolvedMissedCheckout.checkInAt) {
                const d = new Date(today.unresolvedMissedCheckout.checkInAt);
                if (!isNaN(d.getTime())) {
                  const hours = String(d.getHours()).padStart(2, '0');
                  const minutes = String(d.getMinutes()).padStart(2, '0');
                  prefilledCheckIn = `${hours}:${minutes}`;
                }
              }
              setRegularizationInitialValues({
                workDateKey: today.unresolvedMissedCheckout.workDateKey,
                type: 'MISSED_CHECK_OUT',
                checkInAt: prefilledCheckIn,
                checkOutAt: '',
                reason: ''
              });
              setActiveAction('regularization');
              setTimeout(() => {
                regularizationFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 50);
            }}
          >
            Request Regularization
          </Button>
        </div>
      )}

      <MyAttendanceOverview key={scope} today={today} workspace={currentWorkspace} scope={scope}>
        <Panel title={<span className="inline-flex items-center gap-2"><ClipboardCheck className="h-4 w-4" />Quick actions</span>}>
          <div role="tablist" aria-label="Quick actions" className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              role="tab"
              aria-selected={activeAction === 'regularization'}
              aria-controls="quick-action-regularization-panel"
              size="sm"
              variant={activeAction === 'regularization' ? 'default' : 'outline'}
              className="gap-1.5 transition-all"
              onClick={() => {
                if (activeAction === 'regularization') {
                  setActiveAction(null);
                  setRegularizationInitialValues(null);
                } else {
                  setRegularizationInitialValues(null);
                  setActiveAction('regularization');
                }
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Request Regularization
            </Button>
            <Button
              type="button"
              role="tab"
              aria-selected={activeAction === 'wfh'}
              aria-controls="quick-action-wfh-panel"
              size="sm"
              variant={activeAction === 'wfh' ? 'default' : 'outline'}
              className="gap-1.5 transition-all"
              onClick={() => {
                setActiveAction(activeAction === 'wfh' ? null : 'wfh');
              }}
            >
              <House className="h-3.5 w-3.5" /> New WFH Request
            </Button>
          </div>

          {activeAction && (
            <div className="mt-4 pt-3 border-t space-y-3" style={{ borderColor: 'var(--color-border-subtle)' }}>
              {activeAction === 'regularization' && (
                <div id="quick-action-regularization-panel" role="tabpanel" ref={regularizationFormRef}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>Request regularization</h3>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveAction(null);
                        setRegularizationInitialValues(null);
                      }}
                      className="rounded-lg p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      aria-label="Close form"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <RegularizationRequestForm
                    initialValues={regularizationInitialValues}
                    onCancel={() => {
                      setActiveAction(null);
                      setRegularizationInitialValues(null);
                    }}
                    onSubmitted={() => {
                      setActiveAction(null);
                      setRegularizationInitialValues(null);
                      loadRequests();
                    }}
                  />
                </div>
              )}

              {activeAction === 'wfh' && (
                <div id="quick-action-wfh-panel" role="tabpanel">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>New work-from-home request</h3>
                    <button
                      type="button"
                      onClick={() => setActiveAction(null)}
                      className="rounded-lg p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      aria-label="Close form"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <WfhRequestForm
                    onCancel={() => setActiveAction(null)}
                    onSubmitted={() => {
                      setActiveAction(null);
                      loadRequests();
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </Panel>
        <MyAttendanceRequests key={scope} regularizationCount={regularizations.length} wfhCount={wfhRequests.length}
          regularization={<div aria-label="Regularization Requests" className="max-h-80 overflow-y-auto">
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

          </div>}
          wfh={<div aria-label="Work From Home Requests" className="max-h-80 overflow-y-auto">
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

          </div>}
        />
      </MyAttendanceOverview>
    </div>
  );
};

export default MyAttendancePage;
