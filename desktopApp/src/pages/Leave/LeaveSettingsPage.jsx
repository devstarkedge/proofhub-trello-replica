import WorkspaceContext from '../../context/WorkspaceContext';
import React, { useContext, useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Archive, ArrowDownRight, ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Eye, FileText, History, Layers3, PlayCircle, Plus, RotateCcw, Search, SquarePen, Users, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { Button } from '../../components/ui/button';
import LeaveEmptyState from '../../components/Leave/LeaveEmptyState';
import ManualAdjustmentModal from '../../components/Leave/ManualAdjustmentModal';
import PolicyStatusBadge from '../../components/Leave/PolicyStatusBadge';
import PolicyFormModal from '../../components/Leave/PolicyFormModal';
import PolicyDiffConfirmModal from '../../components/Leave/PolicyDiffConfirmModal';
import OverridePolicyFormModal from '../../components/Leave/OverridePolicyFormModal';
import WorkCalendarSettingsPanel from '../../components/Leave/WorkCalendar/WorkCalendarSettingsPanel';
import { buildPolicyDiff } from '../../utils/leavePolicyDiff';
import * as leaveApi from '../../services/leaveApi';
import Database from '../../services/database';

const inputClass = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]';
const inputStyle = { backgroundColor: 'var(--color-bg-base)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' };

const SettingsPanel = ({ title, description, children }) => (
  <section className="rounded-2xl border p-4 shadow-sm sm:p-6" style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border-default)' }}>
    <div className="mb-5">
      <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>{title}</h2>
      {description && <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>{description}</p>}
    </div>
    {children}
  </section>
);

const LeaveTypesTab = () => {
  const [types, setTypes] = useState([]);
  const [form, setForm] = useState({ key: '', name: '', category: 'STANDARD' });
  const load = () => leaveApi.getLeaveTypes({ includeInactive: true }).then(({ data }) => setTypes(data));
  useEffect(() => { load(); }, []);

  const create = async (event) => {
    event.preventDefault();
    try {
      await leaveApi.createLeaveType(form);
      toast.success('Leave type created');
      setForm({ key: '', name: '', category: 'STANDARD' });
      load();
    } catch { /* The API interceptor owns error notifications. */ }
  };

  return (
    <SettingsPanel title="Leave Types" description="Create the leave categories employees can request in this workspace.">
      <form onSubmit={create} className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_200px_auto] md:items-end">
        <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          Key
          <input placeholder="e.g. sick_leave" className={`${inputClass} mt-1.5`} style={inputStyle} value={form.key} onChange={(event) => setForm({ ...form, key: event.target.value })} />
        </label>
        <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          Display name
          <input placeholder="Sick leave" className={`${inputClass} mt-1.5`} style={inputStyle} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </label>
        <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          Category
          <select className={`${inputClass} mt-1.5`} style={inputStyle} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
            <option value="STANDARD">Standard</option>
            <option value="SHORT_LEAVE">Short Leave</option>
            <option value="UNPAID">Unpaid</option>
            <option value="COMPENSATORY">Compensatory</option>
          </select>
        </label>
        <Button type="submit" className="flex items-center justify-center gap-1"><Plus className="h-4 w-4" /> Add</Button>
      </form>

      <div className="mt-6">
        {types.length ? (
          <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--color-border-default)' }}>
            {types.map((type) => (
              <div key={type._id} className="flex flex-col gap-1 border-b px-4 py-3 text-sm last:border-b-0 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--color-border-subtle)' }}>
                <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{type.name}</span>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{type.category}</span>
              </div>
            ))}
          </div>
        ) : <LeaveEmptyState icon={Layers3} title="No leave types configured" description="Add the first leave type using the form above." compact />}
      </div>
    </SettingsPanel>
  );
};

function formatMonthYear(dateLike, timezone) {
  return dateLike ? new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: timezone || 'Asia/Kolkata' }).format(new Date(dateLike)) : '—';
}

function allocationSummary(version) {
  if (!version?.leaveTypeRules?.length) return 'No allocations configured';
  return version.leaveTypeRules
    .map((rule) => `${rule.leaveType?.name || 'Leave'}: ${rule.monthlyCreditAmount}/mo`)
    .join(' · ');
}

const PoliciesTab = () => {
  const { currentWorkspace } = useContext(WorkspaceContext);
  const [policies, setPolicies] = useState([]);
  const [formState, setFormState] = useState(null); // { mode: 'create'|'edit', policy? }
  const [diffState, setDiffState] = useState(null); // { policy, diff, values }
  const [submitting, setSubmitting] = useState(false);

  const load = () => leaveApi.getDefaultPolicies().then(({ data }) => setPolicies(data)).catch(() => {});
  useEffect(() => { load(); }, []);

  useEffect(() => {
    const onPolicyUpdated = () => load();
    window.addEventListener('socket-leave-policy-updated', onPolicyUpdated);
    return () => window.removeEventListener('socket-leave-policy-updated', onPolicyUpdated);
  }, []);

  const deleteArchived = async (policy) => {
    if (!window.confirm(`Permanently delete "${policy.name}"? This cannot be undone. Policies referenced by employee history cannot be deleted.`)) return;
    try { await leaveApi.deleteArchivedPolicy(policy._id); toast.success('Archived policy deleted'); load(); } catch { /* API shows reason if blocked. */ }
  };

  const openCreate = () => setFormState({ mode: 'create' });
  const openEdit = (policy) => setFormState({ mode: 'edit', policy });
  const closeForm = () => setFormState(null);

  const handleCreateSubmit = async (values) => {
    setSubmitting(true);
    try {
      await leaveApi.createDefaultPolicy(values);
      toast.success('Policy created');
      closeForm();
      load();
    } catch { /* The API interceptor owns error notifications. */ } finally { setSubmitting(false); }
  };

  const handleEditSubmit = (values) => {
    const policy = formState.policy;
    const oldVersion = policy.pendingVersion || policy.currentVersion;
    const diff = buildPolicyDiff({ oldPolicy: policy, oldVersion, newValues: values });
    if (!diff.length) {
      toast.info('No changes to save');
      closeForm();
      return;
    }
    setDiffState({ policy, diff, values });
    setFormState(null);
  };

  const confirmEdit = async () => {
    setSubmitting(true);
    try {
      await leaveApi.editDefaultPolicy(diffState.policy._id, diffState.values);
      toast.success('Policy updated');
      setDiffState(null);
      load();
    } catch { /* The API interceptor owns error notifications. */ } finally { setSubmitting(false); }
  };

  const activateNow = async (policy) => {
    if (!window.confirm(`Activate "${policy.name}"? The current active workspace policy will be replaced. Historical records are preserved.`)) return;
    try {
      await leaveApi.activateDefaultPolicy(policy._id);
      toast.success(`"${policy.name}" is now active`);
      load();
    } catch { /* Friendly "scheduled for <date>, can't activate early" etc. comes from the API interceptor. */ }
  };

  const archive = async (policy) => {
    if (!window.confirm(`Archive "${policy.name}"? It will no longer be selectable for activation.`)) return;
    try {
      await leaveApi.archiveDefaultPolicy(policy._id);
      toast.success('Policy archived');
      load();
    } catch { /* The API interceptor owns error notifications. */ }
  };

  return (
    <SettingsPanel
      title="Policies"
      description="The active policy is the single source of truth for every leave calculation in this workspace — accrual, balances, expiry, and eligibility all read from it. Only one policy can be active at a time; department/role/employee-specific overrides remain available via the API for advanced setups."
    >
      <div className="flex justify-end">
        <Button onClick={openCreate} className="flex items-center justify-center gap-1"><Plus className="h-4 w-4" /> Create Policy</Button>
      </div>

      <div className="mt-6 space-y-3">
        {policies.length ? policies.map((policy) => {
          const displayedVersion = policy.currentVersion || policy.pendingVersion;
          return (
            <div key={policy._id} className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border-default)', backgroundColor: 'var(--color-bg-subtle)' }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{policy.name}</span>
                    <PolicyStatusBadge status={policy.status} />
                  </div>
                  {policy.description && <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>{policy.description}</p>}
                  <p className="mt-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    Effective from {formatMonthYear(policy.effectiveDate, currentWorkspace?.timezone)} · {allocationSummary(displayedVersion)}
                  </p>
                  {policy.pendingVersion && (
                    <p className="mt-1 text-xs font-medium" style={{ color: 'var(--color-info-text)' }}>
                      {policy.pendingVersion.status === 'draft' ? 'Draft starts' : 'Update scheduled for'} {formatMonthYear(policy.pendingVersion.effectiveFrom, currentWorkspace?.timezone)} · {allocationSummary(policy.pendingVersion)}
                    </p>
                  )}
                </div>
                <div className="flex flex-none flex-wrap gap-2">
                  {policy.status === 'archived' && policy.canDelete && <Button variant="outline" size="sm" onClick={() => deleteArchived(policy)}>Delete</Button>}
                  {policy.status === 'archived' && policy.deletionBlockReason && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{policy.deletionBlockReason}</p>}
                  {policy.status !== 'archived' && (
                    <Button variant="outline" size="sm" onClick={() => openEdit(policy)} className="flex items-center gap-1">
                      <SquarePen className="h-3.5 w-3.5" /> Edit
                    </Button>
                  )}
                  {(policy.status === 'scheduled' || policy.status === 'inactive' || policy.status === 'draft') && (
                    <Button variant="outline" size="sm" onClick={() => activateNow(policy)} className="flex items-center gap-1">
                      <PlayCircle className="h-3.5 w-3.5" /> Activate Now
                    </Button>
                  )}
                  {['draft', 'inactive', 'scheduled'].includes(policy.status) && (
                    <Button variant="outline" size="sm" onClick={() => archive(policy)} className="flex items-center gap-1">
                      <Archive className="h-3.5 w-3.5" /> Archive
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        }) : <LeaveEmptyState icon={FileText} title="No policies configured" description="Create a policy to begin defining the workspace leave rules." compact />}
      </div>

      {formState && (
        <PolicyFormModal
          mode={formState.mode}
          initialPolicy={formState.policy}
          initialVersion={formState.policy ? (formState.policy.pendingVersion || formState.policy.currentVersion) : null}
          submitting={submitting}
          onCancel={closeForm}
          onSubmit={formState.mode === 'create' ? handleCreateSubmit : handleEditSubmit}
        />
      )}

      {diffState && (
        <PolicyDiffConfirmModal
          diff={diffState.diff}
          submitting={submitting}
          onCancel={() => setDiffState(null)}
          onConfirm={confirmEdit}
        />
      )}
    </SettingsPanel>
  );
};

const SCOPE_LABELS = { department: 'Department', role: 'Role', employee: 'Employee' };

const OverridesTab = () => {
  const [policies, setPolicies] = useState([]);
  const [formState, setFormState] = useState(null); // { mode: 'create'|'edit', policy? }
  const [submitting, setSubmitting] = useState(false);

  const load = () => leaveApi.getOverridePolicies().then(({ data }) => setPolicies(data)).catch(() => {});
  useEffect(() => { load(); }, []);

  useEffect(() => {
    const onPolicyUpdated = () => load();
    window.addEventListener('socket-leave-policy-updated', onPolicyUpdated);
    return () => window.removeEventListener('socket-leave-policy-updated', onPolicyUpdated);
  }, []);

  const closeForm = () => setFormState(null);

  const handleSubmit = async (values) => {
    setSubmitting(true);
    try {
      if (formState.mode === 'create') {
        await leaveApi.createOverridePolicy(values);
        toast.success('Override created');
      } else {
        await leaveApi.editOverridePolicy(formState.policy._id, values);
        toast.success('Override updated');
      }
      closeForm();
      load();
    } catch { /* The API interceptor owns error notifications. */ } finally { setSubmitting(false); }
  };

  const deleteArchived = async (policy) => {
    if (!window.confirm(`Permanently delete "${policy.name}"? This cannot be undone. Overrides referenced by employee history cannot be deleted.`)) return;
    try { await leaveApi.deleteArchivedPolicy(policy._id, 'overrides'); toast.success('Archived override deleted'); load(); } catch { /* API shows reason if blocked. */ }
  };

  const archive = async (policy) => {
    if (!window.confirm(`Archive "${policy.name}"? Everyone it currently applies to will revert to the default policy.`)) return;
    try {
      await leaveApi.archiveOverridePolicy(policy._id);
      toast.success('Override archived');
      load();
    } catch { /* The API interceptor owns error notifications. */ }
  };

  const removeAssignment = async (assignment) => {
    if (!window.confirm(`Remove this override for ${assignment.targetName}? They will revert to the default policy.`)) return;
    try {
      await leaveApi.removeOverrideAssignment(assignment._id);
      toast.success('Override removed');
      load();
    } catch { /* The API interceptor owns error notifications. */ }
  };

  return (
    <SettingsPanel
      title="Policy Overrides"
      description="Give one specific department, role, or employee a different policy than the workspace default — everyone not listed below keeps following the default policy on the Policies tab."
    >
      <div className="flex justify-end">
        <Button onClick={() => setFormState({ mode: 'create' })} className="flex items-center justify-center gap-1">
          <Plus className="h-4 w-4" /> Create Override
        </Button>
      </div>

      <div className="mt-6 space-y-3">
        {policies.length ? policies.map((policy) => (
          <div key={policy._id} className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border-default)', backgroundColor: 'var(--color-bg-subtle)' }}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{policy.name}</span>
                  <PolicyStatusBadge status={policy.status} />
                </div>
                {policy.description && <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>{policy.description}</p>}
                <p className="mt-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>{allocationSummary(policy.currentVersion || policy.pendingVersion)}</p>
              </div>
              <div className="flex flex-none flex-wrap gap-2">
                {policy.status === 'archived' && policy.canDelete && <Button variant="outline" size="sm" onClick={() => deleteArchived(policy)}>Delete</Button>}
                  {policy.status === 'archived' && policy.deletionBlockReason && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{policy.deletionBlockReason}</p>}
                  {policy.status !== 'archived' && (
                  <Button variant="outline" size="sm" onClick={() => setFormState({ mode: 'edit', policy })} className="flex items-center gap-1">
                    <SquarePen className="h-3.5 w-3.5" /> Edit
                  </Button>
                )}
                
                  {policy.status !== 'archived' && (
                  <Button variant="outline" size="sm" onClick={() => archive(policy)} className="flex items-center gap-1">
                    <Archive className="h-3.5 w-3.5" /> Archive
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {policy.assignments.length ? policy.assignments.map((assignment) => (
                <span
                  key={assignment._id}
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
                  style={{ backgroundColor: 'var(--color-info-subtle)', color: 'var(--color-info-text)' }}
                >
                  <Users className="h-3 w-3" /> {SCOPE_LABELS[assignment.scope]}: {assignment.targetName}
                  <button type="button" onClick={() => removeAssignment(assignment)} aria-label="Remove this override" className="ml-0.5 hover:opacity-70">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )) : (
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Not currently applied to anyone.</span>
              )}
            </div>
          </div>
        )) : <LeaveEmptyState icon={Users} title="No overrides configured" description="Create an override to give a specific department, role, or employee different leave rules." compact />}
      </div>

      {formState && (
        <OverridePolicyFormModal
          mode={formState.mode}
          initialPolicy={formState.policy}
          initialAssignment={formState.policy?.assignments?.[0]}
          submitting={submitting}
          onCancel={closeForm}
          onSubmit={handleSubmit}
        />
      )}
    </SettingsPanel>
  );
};

const DepartmentCalendarsReadOnly = () => {
  const [calendars, setCalendars] = useState([]);
  const load = () => leaveApi.getWorkCalendars().then(({ data }) => setCalendars((data || []).filter((c) => c.scope === 'department'))).catch(() => {});
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const onCalendarUpdated = () => load();
    window.addEventListener('socket-leave-calendar-updated', onCalendarUpdated);
    return () => window.removeEventListener('socket-leave-calendar-updated', onCalendarUpdated);
  }, []);
  if (!calendars.length) return null;

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border-default)', backgroundColor: 'var(--color-bg-subtle)' }}>
      <p className="mb-3 text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Department Overrides (advanced, managed via the API)</p>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {calendars.map((calendar) => (
          <div key={calendar._id} className="rounded-xl border p-3" style={{ borderColor: 'var(--color-border-subtle)' }}>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
              {calendar.weeklyPattern.map((day) => (
                <div key={day.dayOfWeek} className="rounded-lg px-1 py-2" style={{
                  backgroundColor: day.isWorkingDay ? 'var(--color-success-subtle)' : 'var(--color-bg-muted)',
                  color: day.isWorkingDay ? 'var(--color-success-text)' : 'var(--color-text-muted)'
                }}>
                  {dayNames[day.dayOfWeek]}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const WorkCalendarTab = () => (
  <SettingsPanel
    title="Work Calendar"
    description="This is the one source of truth for every working-day decision in the workspace — the Leave Calendar, request validation, reports, and the Teams time-tracking overlay all classify each date through it. Scoped to this workspace only, never shared across workspaces."
  >
    <WorkCalendarSettingsPanel />
    <div className="mt-6">
      <DepartmentCalendarsReadOnly />
    </div>
  </SettingsPanel>
);

const HolidaysTab = () => {
  const [holidays, setHolidays] = useState([]);
  const [form, setForm] = useState({ date: '', name: '' });
  const load = () => leaveApi.getHolidays().then(({ data }) => setHolidays(data));
  useEffect(() => { load(); }, []);

  const remove = async (holiday) => {
    if (!window.confirm(`Delete past holiday "${holiday.name}"? Finalized leave calculations will be preserved. This cannot be undone.`)) return;
    try { await leaveApi.deleteHoliday(holiday._id); toast.success('Holiday deleted'); load(); } catch { /* API displays errors. */ }
  };
  const create = async (event) => {
    event.preventDefault();
    try {
      await leaveApi.createHoliday(form);
      toast.success('Holiday added');
      setForm({ date: '', name: '' });
      load();
    } catch { /* The API interceptor owns error notifications. */ }
  };

  return (
    <SettingsPanel title="Holidays" description="Maintain workspace holidays that should not consume an employee’s leave balance.">
      <form onSubmit={create} className="grid grid-cols-1 gap-3 sm:grid-cols-[220px_minmax(0,1fr)_auto] sm:items-end">
        <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          Date
          <input type="date" className={`${inputClass} mt-1.5`} style={inputStyle} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
        </label>
        <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          Holiday name
          <input placeholder="Holiday name" className={`${inputClass} mt-1.5`} style={inputStyle} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </label>
        <Button type="submit" className="flex items-center justify-center gap-1"><Plus className="h-4 w-4" /> Add</Button>
      </form>

      <div className="mt-6">
        {holidays.length ? (
          <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--color-border-default)' }}>
            {holidays.map((holiday) => (
              <div key={holiday._id} className="flex flex-col gap-1 border-b px-4 py-3 text-sm last:border-b-0 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--color-border-subtle)' }}>
                <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{holiday.name}</span>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{holiday.dateKey || String(holiday.date).slice(0, 10)}</span>
                {holiday.canDelete && <Button variant="outline" size="sm" onClick={() => remove(holiday)}>Delete</Button>}
              </div>
            ))}
          </div>
        ) : <LeaveEmptyState icon={CalendarDays} title="No holidays configured" description="Add a holiday using the form above." compact />}
      </div>
    </SettingsPanel>
  );
};

const AdjustmentDetailModal = ({ adjustment, onClose }) => {
  if (!adjustment) return null;
  const isCredit = adjustment.type === 'MANUAL_CREDIT';

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl p-6 shadow-xl border space-y-4"
        style={{ backgroundColor: 'var(--color-bg-base)', borderColor: 'var(--color-border-default)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--color-border-subtle)' }}>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${isCredit ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
              {isCredit ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {isCredit ? 'Credit' : 'Debit'}
            </span>
            <h3 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>Adjustment Details</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <span className="block font-medium mb-0.5" style={{ color: 'var(--color-text-secondary)' }}>Employee</span>
            <div className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
              {adjustment.user?.name || 'Unknown'}
            </div>
            <div style={{ color: 'var(--color-text-muted)' }}>{adjustment.user?.email || 'N/A'}</div>
          </div>

          <div>
            <span className="block font-medium mb-0.5" style={{ color: 'var(--color-text-secondary)' }}>Leave Type</span>
            <div className="flex items-center gap-1.5 font-semibold text-sm mt-0.5" style={{ color: 'var(--color-text-primary)' }}>
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: adjustment.leaveType?.color || '#3b82f6' }} />
              {adjustment.leaveType?.name || 'Unknown'}
            </div>
            <div className="text-[11px] capitalize" style={{ color: 'var(--color-text-muted)' }}>{adjustment.leaveType?.category?.toLowerCase() || 'standard'}</div>
          </div>

          <div>
            <span className="block font-medium mb-0.5" style={{ color: 'var(--color-text-secondary)' }}>Adjustment Amount</span>
            <div className={`text-base font-bold ${isCredit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {isCredit ? '+' : '-'}{adjustment.amount} {adjustment.amount === 1 ? 'leave' : 'leaves'}
            </div>
          </div>

          <div>
            <span className="block font-medium mb-0.5" style={{ color: 'var(--color-text-secondary)' }}>Timestamp</span>
            <div className="font-medium text-xs mt-1" style={{ color: 'var(--color-text-primary)' }}>
              {new Date(adjustment.occurredAt || adjustment.createdAt).toLocaleString(undefined, {
                year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
              })}
            </div>
          </div>

          <div>
            <span className="block font-medium mb-0.5" style={{ color: 'var(--color-text-secondary)' }}>Performed By</span>
            <div className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
              {adjustment.actor?.name || 'System / Auto'}
            </div>
            <div style={{ color: 'var(--color-text-muted)' }}>{adjustment.actor?.email || ''}</div>
          </div>

          <div>
            <span className="block font-medium mb-0.5" style={{ color: 'var(--color-text-secondary)' }}>Policy Version</span>
            <div className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
              {adjustment.policyVersion?.versionNumber ? `v${adjustment.policyVersion.versionNumber}` : 'Current Policy'}
            </div>
          </div>
        </div>

        <div className="pt-2 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
          <span className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Reason</span>
          <div className="rounded-lg p-3 text-xs leading-relaxed border" style={{ backgroundColor: 'var(--color-bg-base)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' }}>
            {adjustment.reason || 'No reason provided.'}
          </div>
        </div>

        {(adjustment.clientAdjustmentId || adjustment._id) && (
          <div className="text-[11px] space-y-1 pt-1" style={{ color: 'var(--color-text-muted)' }}>
            <div><span className="font-mono">Transaction ID:</span> {adjustment._id}</div>
            {adjustment.clientAdjustmentId && <div><span className="font-mono">Client ID:</span> {adjustment.clientAdjustmentId}</div>}
          </div>
        )}

        <div className="pt-3 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
};

const AdjustmentsTab = () => {
  const [showModal, setShowModal] = useState(false);
  const [selectedAdjustment, setSelectedAdjustment] = useState(null);
  const [adjustments, setAdjustments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, pages: 1 });
  const [users, setUsers] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);

  // Filters
  const [userId, setUserId] = useState('');
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [operation, setOperation] = useState('ALL');
  const [search, setSearch] = useState('');

  const loadAdjustments = async (page = 1) => {
    setLoading(true);
    try {
      const res = await leaveApi.getAdjustments({
        page,
        limit: 10,
        userId: userId || undefined,
        leaveTypeId: leaveTypeId || undefined,
        operation: operation !== 'ALL' ? operation : undefined,
        search: search.trim() || undefined
      });
      if (res?.data) {
        setAdjustments(res.data.adjustments || []);
        setPagination(res.data.pagination || { page: 1, limit: 10, total: 0, pages: 1 });
      }
    } catch {
      setAdjustments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Database.getUsers().then((res) => setUsers(res?.data || res?.users || [])).catch(() => setUsers([]));
    leaveApi.getLeaveTypes().then(({ data }) => setLeaveTypes(data || [])).catch(() => setLeaveTypes([]));
  }, []);

  useEffect(() => {
    loadAdjustments(1);
  }, [userId, leaveTypeId, operation]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadAdjustments(1);
  };

  const resetFilters = () => {
    setUserId('');
    setLeaveTypeId('');
    setOperation('ALL');
    setSearch('');
  };

  const hasActiveFilters = Boolean(userId || leaveTypeId || operation !== 'ALL' || search);

  return (
    <SettingsPanel
      title="Balance Adjustments"
      description="Credit or debit an employee’s balance with a fully auditable ledger entry. All adjustments are permanently tracked in the immutable ledger."
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <p className="max-w-2xl text-sm leading-6" style={{ color: 'var(--color-text-muted)' }}>
          Every manual adjustment creates an immutable ledger transaction with audit attribution. Adjustments never overwrite past calculations or invalidate approved leave.
        </p>
        <Button onClick={() => setShowModal(true)} className="flex items-center gap-2 shrink-0">
          <Plus className="h-4 w-4" /> New Adjustment
        </Button>
      </div>

      {/* Filter Toolbar */}
      <div className="rounded-xl border p-3.5 mb-6 space-y-3" style={{ backgroundColor: 'var(--color-bg-base)', borderColor: 'var(--color-border-default)' }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <form onSubmit={handleSearchSubmit} className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search reason or employee…"
              className={`${inputClass} pl-9`}
              style={inputStyle}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>

          {/* Employee Filter */}
          <select
            className={inputClass}
            style={inputStyle}
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="">All Employees</option>
            {users.map((u) => (
              <option key={u._id} value={u._id}>{u.name} ({u.email})</option>
            ))}
          </select>

          {/* Leave Type Filter */}
          <select
            className={inputClass}
            style={inputStyle}
            value={leaveTypeId}
            onChange={(e) => setLeaveTypeId(e.target.value)}
          >
            <option value="">All Leave Types</option>
            {leaveTypes.map((t) => (
              <option key={t._id} value={t._id}>{t.name}</option>
            ))}
          </select>

          {/* Operation Filter */}
          <div className="flex items-center gap-2">
            <select
              className={inputClass}
              style={inputStyle}
              value={operation}
              onChange={(e) => setOperation(e.target.value)}
            >
              <option value="ALL">All Operations</option>
              <option value="CREDIT">Credits Only</option>
              <option value="DEBIT">Debits Only</option>
            </select>

            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={resetFilters}
                className="shrink-0 flex items-center gap-1"
                title="Reset filters"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="mt-4">
        {loading ? (
          <div className="py-16 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Loading adjustment history…
          </div>
        ) : adjustments.length > 0 ? (
          <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--color-border-default)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-xs font-semibold uppercase tracking-wider" style={{ backgroundColor: 'var(--color-bg-base)', borderColor: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)' }}>
                  <tr>
                    <th className="px-4 py-3">Date & Time</th>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Leave Type</th>
                    <th className="px-4 py-3">Operation & Amount</th>
                    <th className="px-4 py-3">Adjusted By</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--color-border-subtle)' }}>
                  {adjustments.map((item) => {
                    const isCredit = item.type === 'MANUAL_CREDIT';
                    return (
                      <tr
                        key={item._id}
                        className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {new Date(item.occurredAt || item.createdAt).toLocaleDateString(undefined, {
                            month: 'short', day: 'numeric', year: 'numeric'
                          })}
                          <span className="block text-[11px] opacity-75">
                            {new Date(item.occurredAt || item.createdAt).toLocaleTimeString(undefined, {
                              hour: '2-digit', minute: '2-digit'
                            })}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                              {(item.user?.name || 'U').charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-medium text-xs" style={{ color: 'var(--color-text-primary)' }}>
                                {item.user?.name || 'Unknown User'}
                              </div>
                              <div className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                                {item.user?.email || ''}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs">
                          <div className="flex items-center gap-1.5 font-medium" style={{ color: 'var(--color-text-primary)' }}>
                            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: item.leaveType?.color || '#3b82f6' }} />
                            {item.leaveType?.name || 'Leave'}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${isCredit ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
                            {isCredit ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                            {isCredit ? `+${item.amount}` : `-${item.amount}`}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                          {item.actor?.name || 'System'}
                        </td>
                        <td className="px-4 py-3.5 max-w-xs truncate text-xs" title={item.reason} style={{ color: 'var(--color-text-muted)' }}>
                          {item.reason}
                        </td>
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => setSelectedAdjustment(item)}
                            title="View details"
                          >
                            <Eye className="h-4 w-4 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {pagination.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t text-xs" style={{ borderColor: 'var(--color-border-subtle)', backgroundColor: 'var(--color-bg-base)' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>
                  Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} adjustments
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page <= 1}
                    onClick={() => loadAdjustments(pagination.page - 1)}
                    className="h-8 px-2 flex items-center gap-1 text-xs"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Prev
                  </Button>
                  <span className="font-medium px-1" style={{ color: 'var(--color-text-primary)' }}>
                    {pagination.page} / {pagination.pages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page >= pagination.pages}
                    onClick={() => loadAdjustments(pagination.page + 1)}
                    className="h-8 px-2 flex items-center gap-1 text-xs"
                  >
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <LeaveEmptyState
            icon={History}
            title={hasActiveFilters ? "No matching adjustments" : "No balance adjustments recorded yet"}
            description={hasActiveFilters ? "Try clearing your filters to see more entries." : "Use 'New Adjustment' to credit or debit an employee's balance with an auditable ledger record."}
            compact
          />
        )}
      </div>

      {showModal && (
        <ManualAdjustmentModal
          onClose={() => setShowModal(false)}
          onDone={() => {
            setShowModal(false);
            loadAdjustments(1);
          }}
        />
      )}

      {selectedAdjustment && (
        <AdjustmentDetailModal
          adjustment={selectedAdjustment}
          onClose={() => setSelectedAdjustment(null)}
        />
      )}
    </SettingsPanel>
  );
};

const SECTION_COMPONENTS = {
  policies: PoliciesTab,
  overrides: OverridesTab,
  'leave-types': LeaveTypesTab,
  'work-calendar': WorkCalendarTab,
  holidays: HolidaysTab,
  adjustments: AdjustmentsTab
};

const LeaveSettingsPage = () => {
  const { section } = useParams();
  const ActiveSection = SECTION_COMPONENTS[section];
  return ActiveSection ? <ActiveSection /> : <Navigate to="/leave/settings/policies" replace />;
};

export default LeaveSettingsPage;
