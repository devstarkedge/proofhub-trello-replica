import React, { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Plus, SquarePen, Ban, Rocket, Archive } from 'lucide-react';
import { Button } from '../../components/ui/button';
import AttendancePolicyStatusBadge from '../../components/Attendance/AttendancePolicyStatusBadge';
import PolicyFormModal from '../../components/Attendance/PolicyFormModal';
import ShiftFormModal from '../../components/Attendance/ShiftFormModal';
import LocationFormModal from '../../components/Attendance/LocationFormModal';
import AssignmentFormModal from '../../components/Attendance/AssignmentFormModal';
import WorkModeOverrideFormModal from '../../components/Attendance/WorkModeOverrideFormModal';
import LeaveEmptyState from '../../components/Leave/LeaveEmptyState';
import * as attendanceApi from '../../services/attendanceApi';

const SettingsPanel = ({ title, description, action, children }) => (
  <section className="rounded-2xl border p-4 shadow-sm sm:p-6" style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border-default)' }}>
    <div className="mb-5 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>{title}</h2>
        {description && <p className="mt-0.5 text-sm" style={{ color: 'var(--color-text-muted)' }}>{description}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>
);

const Row = ({ children }) => (
  <div className="flex flex-col gap-1 border-b px-4 py-3 text-sm last:border-b-0 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--color-border-subtle)' }}>
    {children}
  </div>
);
const RowList = ({ children }) => (
  <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--color-border-default)' }}>{children}</div>
);

// ─── Policy tab ─────────────────────────────────────────────────────────────
const PoliciesTab = () => {
  const [config, setConfig] = useState(undefined); // undefined = loading, null = none exists
  const [formState, setFormState] = useState(null); // { mode: 'create'|'edit' }
  const [submitting, setSubmitting] = useState(false);

  const load = () => attendanceApi.getPolicyConfig().then(({ data }) => setConfig(data)).catch(() => setConfig(null));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const onChanged = () => load();
    window.addEventListener('socket-attendance-updated', onChanged);
    return () => window.removeEventListener('socket-attendance-updated', onChanged);
  }, []);

  const handleCreate = async (values) => {
    setSubmitting(true);
    try {
      await attendanceApi.createPolicy(values);
      toast.success('Attendance policy created');
      setFormState(null);
      load();
    } catch { /* interceptor owns error toasts */ } finally { setSubmitting(false); }
  };

  const handleEdit = async (values) => {
    setSubmitting(true);
    try {
      await attendanceApi.editPolicy(config._id, values);
      toast.success('Attendance policy updated');
      setFormState(null);
      load();
    } catch { /* interceptor owns error toasts */ } finally { setSubmitting(false); }
  };

  const activateNow = async () => {
    try {
      await attendanceApi.activatePolicy(config._id);
      toast.success('Policy activated');
      load();
    } catch { /* interceptor owns error toasts */ }
  };

  const archiveNow = async () => {
    try {
      await attendanceApi.archivePolicy(config._id);
      toast.success('Policy archived');
      load();
    } catch { /* interceptor owns error toasts */ }
  };

  if (config === undefined) return null;

  return (
    <div className="space-y-4">
      <SettingsPanel
        title="Attendance Policy"
        description="Controls work modes, punctuality, GPS/geofence, WFH, Hybrid, Field, and regularization rules for this workspace."
        action={config ? (
          <Button size="sm" onClick={() => setFormState({ mode: 'edit' })}><SquarePen className="h-3.5 w-3.5" /> Edit</Button>
        ) : (
          <Button size="sm" onClick={() => setFormState({ mode: 'create' })}><Plus className="h-3.5 w-3.5" /> Create Policy</Button>
        )}
      >
        {!config ? (
          <LeaveEmptyState title="No attendance policy yet" description="Create one to start configuring check-in/check-out rules." compact />
        ) : (
          <RowList>
            <Row>
              <div>
                <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{config.name}</span>
                {config.description && <span className="ml-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>{config.description}</span>}
              </div>
              <AttendancePolicyStatusBadge status={config.status} />
            </Row>
            {config.currentVersion && (
              <Row>
                <span style={{ color: 'var(--color-text-secondary)' }}>Active version: work modes {config.currentVersion.allowedWorkModes?.join(', ')}, grace {config.currentVersion.graceMinutes}m</span>
                {config.status !== 'active' && <Button variant="outline" size="sm" onClick={activateNow}><Rocket className="h-3.5 w-3.5" /> Activate now</Button>}
              </Row>
            )}
            {config.pendingVersion && (
              <Row>
                <span style={{ color: 'var(--color-warning-text)' }}>A pending version is scheduled and will take effect automatically.</span>
              </Row>
            )}
            {config.status !== 'active' && config.status !== 'archived' && (
              <Row><span /><Button variant="outline" size="sm" onClick={archiveNow}><Archive className="h-3.5 w-3.5" /> Archive</Button></Row>
            )}
          </RowList>
        )}
      </SettingsPanel>

      {formState && (
        <PolicyFormModal
          mode={formState.mode}
          initialPolicy={formState.mode === 'edit' ? config : null}
          initialVersion={formState.mode === 'edit' ? (config.pendingVersion || config.currentVersion) : null}
          submitting={submitting}
          onCancel={() => setFormState(null)}
          onSubmit={formState.mode === 'create' ? handleCreate : handleEdit}
        />
      )}
    </div>
  );
};

// ─── Shifts tab ─────────────────────────────────────────────────────────────
const ShiftsTab = () => {
  const [shifts, setShifts] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [formState, setFormState] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    attendanceApi.getShifts({ includeInactive: true }).then(({ data }) => setShifts(data)).catch(() => {});
    attendanceApi.getShiftAssignments().then(({ data }) => setAssignments(data)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async (payload) => {
    setSubmitting(true);
    try { await attendanceApi.createShift(payload); toast.success('Shift added'); setFormState(null); load(); }
    catch { /* interceptor */ } finally { setSubmitting(false); }
  };
  const handleEdit = async (payload) => {
    setSubmitting(true);
    try { await attendanceApi.updateShift(formState.shift._id, payload); toast.success('Shift updated'); setFormState(null); load(); }
    catch { /* interceptor */ } finally { setSubmitting(false); }
  };
  const deactivate = async (shift) => {
    try { await attendanceApi.deactivateShift(shift._id); toast.success('Shift deactivated'); load(); } catch { /* interceptor */ }
  };
  const handleAssign = async ({ targetId, scope, scopeRef }) => {
    setSubmitting(true);
    try { await attendanceApi.createShiftAssignment({ shiftId: targetId, scope, scopeRef }); toast.success('Shift assigned'); setAssigning(false); load(); }
    catch { /* interceptor */ } finally { setSubmitting(false); }
  };
  const removeAssignment = async (assignment) => {
    try { await attendanceApi.removeShiftAssignment(assignment._id); toast.success('Assignment removed'); load(); } catch { /* interceptor */ }
  };

  return (
    <div className="space-y-4">
      <SettingsPanel title="Shifts" description="Named start/end time templates employees are assigned to." action={<Button size="sm" onClick={() => setFormState({ mode: 'create' })}><Plus className="h-3.5 w-3.5" /> Add Shift</Button>}>
        {!shifts.length ? <LeaveEmptyState title="No shifts yet" description="Add a shift template to get started." compact /> : (
          <RowList>
            {shifts.map((shift) => (
              <Row key={shift._id}>
                <div>
                  <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{shift.name}</span>
                  <span className="ml-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>{shift.startLocalTime}–{shift.endLocalTime}{shift.isDefault ? ' · default' : ''}{!shift.isActive ? ' · inactive' : ''}</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setFormState({ mode: 'edit', shift })}><SquarePen className="h-3.5 w-3.5" /> Edit</Button>
                  {shift.isActive && <Button variant="outline" size="sm" onClick={() => deactivate(shift)}><Ban className="h-3.5 w-3.5" /> Deactivate</Button>}
                </div>
              </Row>
            ))}
          </RowList>
        )}
      </SettingsPanel>

      <SettingsPanel title="Shift Assignments" description="Who each shift applies to (person > department > everyone)." action={<Button size="sm" disabled={!shifts.length} onClick={() => setAssigning(true)}><Plus className="h-3.5 w-3.5" /> Assign</Button>}>
        {!assignments.length ? <LeaveEmptyState title="No assignments yet" compact /> : (
          <RowList>
            {assignments.map((a) => (
              <Row key={a._id}>
                <span style={{ color: 'var(--color-text-primary)' }}>{a.shift?.name || 'Unknown shift'} → {a.scope === 'workspace' ? 'Everyone' : a.scope}</span>
                <Button variant="outline" size="sm" onClick={() => removeAssignment(a)}><Ban className="h-3.5 w-3.5" /> Remove</Button>
              </Row>
            ))}
          </RowList>
        )}
      </SettingsPanel>

      {formState && (
        <ShiftFormModal mode={formState.mode} initialShift={formState.shift} submitting={submitting} onCancel={() => setFormState(null)} onSubmit={formState.mode === 'create' ? handleCreate : handleEdit} />
      )}
      {assigning && (
        <AssignmentFormModal
          targetLabel="Shift" targetOptions={shifts.map((s) => ({ value: s._id, label: s.name }))} scopeOptions={['workspace', 'department', 'user']}
          submitting={submitting} onCancel={() => setAssigning(false)} onSubmit={handleAssign}
        />
      )}
    </div>
  );
};

// ─── Locations tab ──────────────────────────────────────────────────────────
const LocationsTab = () => {
  const [locations, setLocations] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [formState, setFormState] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    attendanceApi.getLocations({ includeInactive: true }).then(({ data }) => setLocations(data)).catch(() => {});
    attendanceApi.getLocationAssignments().then(({ data }) => setAssignments(data)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async (payload) => {
    setSubmitting(true);
    try { await attendanceApi.createLocation(payload); toast.success('Location added'); setFormState(null); load(); }
    catch { /* interceptor */ } finally { setSubmitting(false); }
  };
  const handleEdit = async (payload) => {
    setSubmitting(true);
    try { await attendanceApi.updateLocation(formState.location._id, payload); toast.success('Location updated'); setFormState(null); load(); }
    catch { /* interceptor */ } finally { setSubmitting(false); }
  };
  const deactivate = async (location) => {
    try { await attendanceApi.deactivateLocation(location._id); toast.success('Location deactivated'); load(); } catch { /* interceptor */ }
  };
  const handleAssign = async ({ targetId, scope, scopeRef }) => {
    setSubmitting(true);
    try { await attendanceApi.createLocationAssignment({ locationId: targetId, scope, scopeRef }); toast.success('Location assigned'); setAssigning(false); load(); }
    catch { /* interceptor */ } finally { setSubmitting(false); }
  };
  const removeAssignment = async (assignment) => {
    try { await attendanceApi.removeLocationAssignment(assignment._id); toast.success('Assignment removed'); load(); } catch { /* interceptor */ }
  };

  return (
    <div className="space-y-4">
      <SettingsPanel title="Locations" description="Offices, branches, warehouses, or client/field sites employees can check in at." action={<Button size="sm" onClick={() => setFormState({ mode: 'create' })}><Plus className="h-3.5 w-3.5" /> Add Location</Button>}>
        {!locations.length ? <LeaveEmptyState title="No locations yet" description="Add your office or site to enable geofenced check-in." compact /> : (
          <RowList>
            {locations.map((location) => (
              <Row key={location._id}>
                <div>
                  <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{location.name}</span>
                  <span className="ml-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>{location.type} · {location.allowedRadiusMeters}m radius{!location.active ? ' · inactive' : ''}</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setFormState({ mode: 'edit', location })}><SquarePen className="h-3.5 w-3.5" /> Edit</Button>
                  {location.active && <Button variant="outline" size="sm" onClick={() => deactivate(location)}><Ban className="h-3.5 w-3.5" /> Deactivate</Button>}
                </div>
              </Row>
            ))}
          </RowList>
        )}
      </SettingsPanel>

      <SettingsPanel title="Location Assignments" description="Who may check in at each location." action={<Button size="sm" disabled={!locations.length} onClick={() => setAssigning(true)}><Plus className="h-3.5 w-3.5" /> Assign</Button>}>
        {!assignments.length ? <LeaveEmptyState title="No assignments yet" compact /> : (
          <RowList>
            {assignments.map((a) => (
              <Row key={a._id}>
                <span style={{ color: 'var(--color-text-primary)' }}>{a.location?.name || 'Unknown location'} → {a.scope}</span>
                <Button variant="outline" size="sm" onClick={() => removeAssignment(a)}><Ban className="h-3.5 w-3.5" /> Remove</Button>
              </Row>
            ))}
          </RowList>
        )}
      </SettingsPanel>

      {formState && (
        <LocationFormModal mode={formState.mode} initialLocation={formState.location} submitting={submitting} onCancel={() => setFormState(null)} onSubmit={formState.mode === 'create' ? handleCreate : handleEdit} />
      )}
      {assigning && (
        <AssignmentFormModal
          targetLabel="Location" targetOptions={locations.map((l) => ({ value: l._id, label: l.name }))} scopeOptions={['user', 'department']}
          submitting={submitting} onCancel={() => setAssigning(false)} onSubmit={handleAssign}
        />
      )}
    </div>
  );
};

// ─── Work Mode Overrides tab ────────────────────────────────────────────────
const WorkModeOverridesTab = () => {
  const [overrides, setOverrides] = useState([]);
  const [formState, setFormState] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const load = () => attendanceApi.getWorkModeOverrides().then(({ data }) => setOverrides(data)).catch(() => {});
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const onChanged = () => load();
    window.addEventListener('socket-attendance-work-mode-override-updated', onChanged);
    return () => window.removeEventListener('socket-attendance-work-mode-override-updated', onChanged);
  }, []);

  const handleCreate = async (payload) => {
    setSubmitting(true);
    try { await attendanceApi.createWorkModeOverride(payload); toast.success('Work mode override created'); setFormState(null); load(); }
    catch { /* interceptor owns error toasts */ } finally { setSubmitting(false); }
  };
  const handleEdit = async (payload) => {
    setSubmitting(true);
    try { await attendanceApi.updateWorkModeOverride(formState.override._id, payload); toast.success('Work mode override updated'); setFormState(null); load(); }
    catch { /* interceptor */ } finally { setSubmitting(false); }
  };
  const deactivate = async (override) => {
    try { await attendanceApi.deactivateWorkModeOverride(override._id); toast.success('Override deactivated'); load(); } catch { /* interceptor */ }
  };

  return (
    <div className="space-y-4">
      <SettingsPanel
        title="Work Mode Overrides"
        description="Narrow which work modes apply to a specific role, department, or person — most specific wins (User > Department > Role > workspace default from the Policy tab)."
        action={<Button size="sm" onClick={() => setFormState({ mode: 'create' })}><Plus className="h-3.5 w-3.5" /> Add Override</Button>}
      >
        {!overrides.length ? <LeaveEmptyState title="No overrides yet" description="Everyone currently uses the workspace default from the Policy tab." compact /> : (
          <RowList>
            {overrides.map((override) => (
              <Row key={override._id}>
                <div>
                  <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{override.scopeType}: {override.scopeName}</span>
                  <span className="ml-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>{override.allowedModes.join(', ')} (default {override.defaultMode})</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setFormState({ mode: 'edit', override })}><SquarePen className="h-3.5 w-3.5" /> Edit</Button>
                  <Button variant="outline" size="sm" onClick={() => deactivate(override)}><Ban className="h-3.5 w-3.5" /> Deactivate</Button>
                </div>
              </Row>
            ))}
          </RowList>
        )}
      </SettingsPanel>

      {formState && (
        <WorkModeOverrideFormModal
          mode={formState.mode}
          initialOverride={formState.mode === 'edit' ? formState.override : null}
          submitting={submitting}
          onCancel={() => setFormState(null)}
          onSubmit={formState.mode === 'create' ? handleCreate : handleEdit}
        />
      )}
    </div>
  );
};

const SECTION_COMPONENTS = { policy: PoliciesTab, shifts: ShiftsTab, locations: LocationsTab, 'work-modes': WorkModeOverridesTab };

const AttendanceSettingsPage = () => {
  const { section } = useParams();
  const ActiveSection = SECTION_COMPONENTS[section];
  return ActiveSection ? <ActiveSection /> : <Navigate to="/attendance/settings/policy" replace />;
};

export default AttendanceSettingsPage;
