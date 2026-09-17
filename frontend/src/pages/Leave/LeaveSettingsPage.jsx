import React, { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Archive, CalendarDays, FileText, Layers3, PlayCircle, Plus, SquarePen, Users, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { Button } from '../../components/ui/button';
import LeaveEmptyState from '../../components/Leave/LeaveEmptyState';
import ManualAdjustmentModal from '../../components/Leave/ManualAdjustmentModal';
import PolicyStatusBadge from '../../components/Leave/PolicyStatusBadge';
import PolicyFormModal from '../../components/Leave/PolicyFormModal';
import PolicyDiffConfirmModal from '../../components/Leave/PolicyDiffConfirmModal';
import OverridePolicyFormModal from '../../components/Leave/OverridePolicyFormModal';
import { buildPolicyDiff } from '../../utils/leavePolicyDiff';
import * as leaveApi from '../../services/leaveApi';

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

// Every policy effective date is stored as the UTC instant of midnight IN
// THE WORKSPACE'S TIMEZONE (see backend's dateOnlyToInstant) — forcing
// timeZone:'UTC' here would read that instant back as if UTC were the
// real zone, which for any positive-offset workspace (the Asia/Kolkata
// default included) reads the PREVIOUS day/month. That was the exact bug
// behind an edited policy appearing to keep its old effective month after
// saving: the save was correct, but this display silently read the new
// UTC instant one month early. Using the Date's own local getters instead
// (no forced timezone) is the same fix already applied to the Leave
// Calendar grid's date-key bug — see utils/leaveDateKey.js.
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
function formatMonthYear(dateLike) {
  if (!dateLike) return '—';
  const d = new Date(dateLike);
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

function allocationSummary(version) {
  if (!version?.leaveTypeRules?.length) return 'No allocations configured';
  return version.leaveTypeRules
    .map((rule) => `${rule.leaveType?.name || 'Leave'}: ${rule.monthlyCreditAmount}/mo`)
    .join(' · ');
}

const PoliciesTab = () => {
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
                    Effective from {formatMonthYear(policy.effectiveDate)} · {allocationSummary(policy.currentVersion)}
                  </p>
                  {policy.pendingVersion && (
                    <p className="mt-1 text-xs font-medium" style={{ color: 'var(--color-info-text)' }}>
                      Update scheduled for {formatMonthYear(policy.pendingVersion.effectiveFrom)} · {allocationSummary(policy.pendingVersion)}
                    </p>
                  )}
                </div>
                <div className="flex flex-none flex-wrap gap-2">
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
                <p className="mt-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>{allocationSummary(policy.currentVersion)}</p>
              </div>
              <div className="flex flex-none flex-wrap gap-2">
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

const WorkCalendarTab = () => {
  const [calendars, setCalendars] = useState([]);
  const load = () => leaveApi.getWorkCalendars().then(({ data }) => setCalendars(data)).catch(() => {});
  useEffect(() => { load(); }, []);

  useEffect(() => {
    const onCalendarUpdated = () => load();
    window.addEventListener('socket-leave-calendar-updated', onCalendarUpdated);
    return () => window.removeEventListener('socket-leave-calendar-updated', onCalendarUpdated);
  }, []);

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <SettingsPanel
      title="Work Calendar"
      description="This weekly pattern (plus any holidays below) is the one source of truth for every working-day decision in the workspace — the Leave Calendar, request validation, reports, and the Teams time-tracking overlay all classify each date through it. It is scoped to this workspace only and never shared across workspaces; a department can optionally override it."
    >
      {calendars.length ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {calendars.map((calendar) => (
            <div key={calendar._id} className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border-default)', backgroundColor: 'var(--color-bg-subtle)' }}>
              <p className="mb-3 text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                {calendar.scope === 'workspace' ? 'Workspace default' : 'Department calendar'}
              </p>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] sm:gap-2 sm:text-xs">
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
      ) : <LeaveEmptyState icon={CalendarDays} title="No work calendar configured" description="Enable the Leave module defaults to create the workspace calendar." compact />}
    </SettingsPanel>
  );
};

const HolidaysTab = () => {
  const [holidays, setHolidays] = useState([]);
  const [form, setForm] = useState({ date: '', name: '' });
  const load = () => leaveApi.getHolidays().then(({ data }) => setHolidays(data));
  useEffect(() => { load(); }, []);

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
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{new Date(holiday.date).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        ) : <LeaveEmptyState icon={CalendarDays} title="No holidays configured" description="Add a holiday using the form above." compact />}
      </div>
    </SettingsPanel>
  );
};

const AdjustmentsTab = () => {
  const [showModal, setShowModal] = useState(false);
  return (
    <SettingsPanel title="Balance Adjustments" description="Credit or debit an employee’s balance with a fully auditable ledger entry.">
      <p className="max-w-3xl text-sm leading-6" style={{ color: 'var(--color-text-muted)' }}>
        Every adjustment requires a reason and is recorded in the immutable leave ledger and audit log. Existing balances are never directly overwritten.
      </p>
      <Button onClick={() => setShowModal(true)} className="mt-4 flex items-center gap-2">
        <Plus className="h-4 w-4" /> New Adjustment
      </Button>
      {showModal && <ManualAdjustmentModal onClose={() => setShowModal(false)} onDone={() => setShowModal(false)} />}
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
