import { useContext, useEffect, useId, useRef, useState } from 'react';
import { Ban, ChevronDown, Loader2, Save, Shield } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '../../services/api';
import * as accessControlApi from '../../services/accessControlApi';
import useRoleStore from '../../store/roleStore';
import useDepartmentStore from '../../store/departmentStore';
import useAccessControl from '../../hooks/useAccessControl';
import WorkspaceContext from '../../context/WorkspaceContext';
import useConfirmPermissionChange from '../../hooks/useConfirmPermissionChange';
import AccessScopePicker from './AccessScopePicker';
import PermissionCheckbox from './PermissionCheckbox';
import ResourceActionToggleGrid from './ResourceActionToggleGrid';
import { applyViewCascade, idsOf, sameIds, resourceDescription, verbForToggle, isRoleManagedResource } from './permissionEditorUtils';

const SCOPE_LABELS = { full_department: 'All department projects', selected_projects: 'Selected projects', assigned_tasks: 'Assigned work only', none: 'No projects' };
const cardStyle = { backgroundColor: 'var(--color-bg-subtle)', borderColor: 'var(--color-border-default)' };

/** Shared editor for Access & Permissions and the HR member-assignment dialog. */
export default function UserAccessEditor({ userId, currentUserId, onUserUpdated, onBusyChange }) {
  const { loadRoles, changeUserRole, roles: roleCatalog, error: roleError, loading: rolesLoading } = useRoleStore();
  const { currentWorkspace } = useContext(WorkspaceContext);
  const departmentStore = useDepartmentStore();
  const { registry, registryError, myPermissions, isAdmin, canManageAccessControl, refresh } = useAccessControl();
  const confirmChange = useConfirmPermissionChange();
  const roleId = useId();
  const contextKey = `${currentWorkspace?._id || ''}:${userId}`;
  const activeContext = useRef(contextKey);
  activeContext.current = contextKey;
  const operation = useRef(false);
  const [loadedContext, setLoadedContext] = useState(null);
  const [targetUser, setTargetUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [permissionError, setPermissionError] = useState('');
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [resourceSavingKey, setResourceSavingKey] = useState(null);
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedDepartments, setSelectedDepartments] = useState([]);
  const [departmentSearch, setDepartmentSearch] = useState('');
  const [accessType, setAccessType] = useState('full_department');
  const [allowedProjects, setAllowedProjects] = useState([]);
  const [resourceEffective, setResourceEffective] = useState({});
  const [resourceDetails, setResourceDetails] = useState({});

  const isSelf = Boolean(currentUserId && String(currentUserId) === String(userId));
  const canEditRole = !isSelf && (isAdmin || canManageAccessControl);
  const canAssign = !isSelf && (isAdmin || canManageAccessControl || ['manager', 'hr'].includes(myPermissions?.role));
  const isOwner = String(currentWorkspace?.owner?._id || currentWorkspace?.owner) === String(userId);
  const profileLocked = busy || !canAssign || isOwner || (!isAdmin && targetUser?.role === 'admin');
  const departments = departmentStore.departments || [];
  const roles = roleCatalog.filter((role) => role.isActive !== false && (isAdmin || role.slug !== 'admin') && (currentWorkspace?.type !== 'team' || role.isSystem));
  const visibleDepartments = departments.filter((department) => department.name?.toLowerCase().includes(departmentSearch.toLowerCase()));

  useEffect(() => {
    departmentStore.loadDepartments().catch(() => {});
    loadRoles().catch(() => {});
    // Store methods are stable; reload the catalog for the active workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace?._id]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    setPermissionError('');
    setTargetUser(null);
    setResourceEffective({});
    setResourceDetails({});
    (async () => {
      try {
        const [profile, permissions] = await Promise.allSettled([
          api.get(`/api/users/${userId}`, { skipOfflineQueue: true }),
          canManageAccessControl ? accessControlApi.getUserEffectivePermissions(userId) : Promise.resolve(null)
        ]);
        if (!active) return;
        if (profile.status !== 'fulfilled' || !profile.value.data?.data) throw new Error('Unable to load this member. Please try again.');
        const user = profile.value.data.data;
        setTargetUser(user);
        setSelectedRole(user.role || 'employee');
        setSelectedDepartments(idsOf(user.department));
        setAccessType(user.accessType || 'full_department');
        setAllowedProjects(idsOf(user.allowedProjects));
        if (permissions.status === 'fulfilled' && permissions.value?.resources) {
          setResourceEffective(permissions.value.resources);
          setResourceDetails(permissions.value.resourceDetails || {});
        }
        else if (canManageAccessControl) setPermissionError('Permissions could not be loaded. Editing is disabled until you retry.');
        setLoadedContext(contextKey);
      } catch (error) {
        if (active) setLoadError(error.message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [contextKey, userId, canManageAccessControl, retry]);

  useEffect(() => {
    activeContext.current = contextKey;
    return () => { activeContext.current = null; };
  }, [contextKey]);

  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);

  const profileDirty = targetUser && (selectedRole !== targetUser.role || accessType !== (targetUser.accessType || 'full_department') ||
    !sameIds(selectedDepartments, idsOf(targetUser.department)) || !sameIds(allowedProjects, idsOf(targetUser.allowedProjects)));

  const begin = () => {
    if (operation.current) return false;
    operation.current = true;
    setBusy(true);
    return true;
  };
  const end = () => { operation.current = false; setBusy(false); setResourceSavingKey(null); };

  const handleSaveProfile = async () => {
    if (!targetUser || profileLocked || !profileDirty || !begin()) return;
    const requestContext = contextKey;
    let roleSaved = false;
    try {
      const changes = [];
      if (selectedRole !== targetUser.role) changes.push({ label: 'Role', previous: targetUser.role, next: selectedRole });
      if (accessType !== (targetUser.accessType || 'full_department')) changes.push({ label: 'Project access', previous: SCOPE_LABELS[targetUser.accessType], next: SCOPE_LABELS[accessType] });
      if (!sameIds(selectedDepartments, idsOf(targetUser.department))) changes.push({ label: 'Departments',
        previous: (targetUser.department || []).map((department) => department.name || String(department)),
        next: departments.filter((department) => selectedDepartments.includes(String(department._id))).map((department) => department.name) });
      if (!sameIds(allowedProjects, idsOf(targetUser.allowedProjects))) changes.push({ label: 'Selected projects', previous: `${(targetUser.allowedProjects || []).length} selected`, next: `${allowedProjects.length} selected` });
      const confirmed = await confirmChange({ targetUserName: targetUser.name, targetUserRole: targetUser.role, actionVerb: 'update', changes });
      if (!confirmed || activeContext.current !== requestContext) return;
      if (selectedRole !== targetUser.role) {
        await changeUserRole(userId, selectedRole);
        roleSaved = true;
        if (activeContext.current !== requestContext) return;
      }
      const response = await api.put(`/api/users/${userId}/assign`, {
        departments: selectedDepartments, accessType,
        allowedProjects: accessType === 'selected_projects' ? allowedProjects : []
      }, { skipOfflineQueue: true });
      if (!response.data?.success) throw new Error('The profile was not saved. Please try again.');
      if (activeContext.current !== requestContext) return;
      toast.success('Member access profile saved');
      setRetry((value) => value + 1);
      onUserUpdated?.();
    } catch (error) {
      if (activeContext.current !== requestContext) return;
      toast.error(roleSaved ? 'The role was saved, but the access profile failed. Reloading the current profile.' : error.response?.data?.message || error.message || 'Failed to save member access');
      if (roleSaved) { setRetry((value) => value + 1); onUserUpdated?.(); }
    } finally { end(); }
  };

  const handleToggleResource = async (resource, actionKey, nextValue, viewKey) => {
    if (isSelf || !canManageAccessControl || permissionError || registryError || targetUser?.role === 'admin' || isRoleManagedResource(resource, resourceDetails[resource]) || !begin()) return;
    const requestContext = contextKey;
    const current = resourceEffective[resource] || {};
    const next = applyViewCascade(current, actionKey, nextValue, viewKey);
    try {
      const changes = (registry?.resources?.[resource]?.actions || [])
        .filter((action) => Boolean(current[action.key]) !== Boolean(next[action.key]))
        .map((action) => ({ label: `${registry.resources[resource].label} — ${action.label}`, previous: current[action.key] === true, next: next[action.key] === true }));
      const confirmed = await confirmChange({ targetUserName: targetUser.name, targetUserRole: targetUser.role,
        actionVerb: verbForToggle(actionKey, nextValue, viewKey), changes });
      if (!confirmed || activeContext.current !== requestContext) return;
      setResourceSavingKey(resource);
      const result = await accessControlApi.putUserResourceOverride(userId, resource, { actions: next, effect: 'grant' });
      if (activeContext.current !== requestContext) return;
      if (!result?.effective?.actions) throw new Error('Unable to verify the saved permissions. Reload before making another change.');
      setResourceEffective((previous) => ({ ...previous, [resource]: result.effective.actions }));
      setResourceDetails((previous) => ({ ...previous, [resource]: { source: result.effective.source, scope: result.effective.scope } }));
      toast.success('Permissions saved');
    } catch (error) {
      if (activeContext.current === requestContext) {
        toast.error(error.response?.data?.message || error.message || 'Failed to update permissions');
        // A timeout can follow a successful write. Re-read instead of guessing the saved state.
        setRetry((value) => value + 1);
      }
    } finally { end(); }
  };

  if (loading || (!loadError && loadedContext !== contextKey)) return <div role="status" className="flex justify-center items-center gap-3 py-12 text-sm"><Loader2 className="w-5 h-5 animate-spin" />Loading member access…</div>;
  if (loadError || !targetUser) return <div role="alert" className="p-6 text-sm text-center"><p>{loadError || 'Member not found.'}</p><button type="button" className="mt-3 text-purple-600 underline" onClick={() => setRetry((value) => value + 1)}>Retry</button></div>;

  return <div className="space-y-6">
    {isSelf && <div className="flex gap-2 rounded-lg p-3 text-sm" style={cardStyle}><Ban className="w-4 h-4 shrink-0 mt-0.5" /><span>Your access is read-only here. Ask another authorized administrator to make changes.</span></div>}
    {isOwner && !isSelf && <p className="rounded-lg border p-3 text-sm" style={cardStyle}>The workspace owner’s role and assignment profile are locked.</p>}
    <section className="rounded-xl border p-4 sm:p-5 space-y-5" style={cardStyle} aria-labelledby={`${roleId}-profile`}>
      <div><h3 id={`${roleId}-profile`} className="font-semibold">Workspace profile</h3><p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>Choose a role, departments, and project access, then save the profile.</p></div>
      <div>
        <label htmlFor={roleId} className="mb-2 flex items-center gap-2 text-sm font-semibold"><Shield className="w-4 h-4" />Role</label>
        <div className="relative"><select id={roleId} value={selectedRole} disabled={profileLocked || !canEditRole || rolesLoading || Boolean(roleError)}
          onChange={(event) => { const role = event.target.value; setSelectedRole(role); if (role === 'admin') { setAccessType('full_department'); setAllowedProjects([]); } }}
          className="w-full rounded-lg border px-3 py-2.5 pr-10 text-sm appearance-none focus:ring-2 focus:ring-purple-500 disabled:opacity-60" style={{ ...cardStyle, backgroundColor: 'var(--color-bg-base)' }}>
          {!roles.some((role) => role.slug === selectedRole) && <option value={selectedRole}>{selectedRole}</option>}
          {roles.map((role) => <option key={role._id} value={role.slug}>{role.name}</option>)}
        </select><ChevronDown className="pointer-events-none absolute right-3 top-3 w-4 h-4" /></div>
        {!canEditRole && !isSelf && <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>Role changes require permission to manage workspace access.</p>}
        {roleError && <p role="alert" className="text-xs mt-1">Role options could not be loaded. <button type="button" className="text-purple-600 underline" onClick={() => loadRoles().catch(() => {})}>Retry roles</button></p>}
      </div>
      <fieldset><legend className="text-sm font-semibold mb-2">Departments <span className="font-normal text-xs">({selectedDepartments.length} selected)</span></legend>
        <input type="search" aria-label="Search departments" placeholder="Search departments…" value={departmentSearch} onChange={(event) => setDepartmentSearch(event.target.value)}
          className="w-full rounded-lg border px-3 py-2 mb-2 text-sm" style={{ ...cardStyle, backgroundColor: 'var(--color-bg-base)' }} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto p-1">
          {visibleDepartments.map((department) => <PermissionCheckbox key={department._id} label={department.name} checked={selectedDepartments.includes(String(department._id))} disabled={profileLocked}
            onChange={(checked) => setSelectedDepartments((previous) => checked ? [...previous, String(department._id)] : previous.filter((id) => id !== String(department._id)))} />)}
        </div>
        {visibleDepartments.length === 0 && <p className="text-xs py-2" style={{ color: 'var(--color-text-secondary)' }}>{departmentStore.loading ? 'Loading departments…' : departmentStore.error ? 'Departments could not be loaded. Close and reopen to retry.' : 'No matching departments.'}</p>}
      </fieldset>
      <AccessScopePicker role={selectedRole} departmentIds={selectedDepartments} accessType={accessType} onAccessTypeChange={setAccessType} allowedProjects={allowedProjects} onAllowedProjectsChange={setAllowedProjects} disabled={profileLocked} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: 'var(--color-border-default)' }}>
        <p role="status" className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{profileDirty ? 'Unsaved profile changes' : 'Profile is up to date'}</p>
        <button type="button" onClick={handleSaveProfile} disabled={profileLocked || !profileDirty || Boolean(departmentStore.error)} className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed">
          {busy && !resourceSavingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save profile
        </button>
      </div>
    </section>
    <section className="space-y-4" aria-labelledby={`${roleId}-modules`}>
      <div><h3 id={`${roleId}-modules`} className="font-semibold">Module permissions</h3><p className="mt-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>Checkbox changes are saved after confirmation. Workspace rules also determine personal leave and attendance access.</p></div>
      {targetUser.role === 'admin' && <p className="rounded-lg border p-4 text-sm" style={cardStyle}>Administrator permissions are read-only in this grant editor. The checkboxes show their current effective access.</p>}
      {!canManageAccessControl ? <p className="rounded-lg border p-4 text-sm" style={cardStyle}>Module permissions require access-management permission. An authorized administrator can update them in Access & Permissions.</p> :
        permissionError || registryError ? <div role="alert" className="rounded-lg border p-4 text-sm" style={cardStyle}><p>{permissionError || 'The permission catalog could not be loaded.'}</p><button type="button" className="mt-2 text-purple-600 underline" onClick={() => { refresh().catch(() => {}); setRetry((value) => value + 1); }}>Retry permissions</button></div> :
        !registry ? <p role="status" className="text-sm">Loading permission catalog…</p> :
        Object.entries(registry.resources || {}).map(([key, definition]) => {
          const effective = resourceEffective[key];
          const roleManaged = isRoleManagedResource(key, resourceDetails[key]);
          const count = definition.actions.filter((action) => effective?.[action.key] === true).length;
          return <fieldset key={key} className="rounded-xl border p-4 sm:p-5" style={cardStyle}>
            <legend className="px-1 font-semibold text-sm">{definition.label}</legend>
            <div className="mb-3 flex items-start justify-between gap-3"><p className="text-xs leading-5" style={{ color: 'var(--color-text-secondary)' }}>{resourceDescription(key)}</p><span className="shrink-0 rounded-full px-2 py-1 text-xs" style={{ backgroundColor: 'var(--color-bg-muted)' }}>{count}/{definition.actions.length}</span></div>
            {!effective && <p role="alert" className="text-xs mb-2">Permissions are unavailable for this module. Retry before editing.</p>}
            {resourceSavingKey === key && <p role="status" className="mb-2 text-xs">Saving permissions…</p>}
            {roleManaged && <p className="mb-3 text-xs" style={{ color: 'var(--color-text-secondary)' }}>Included in this workspace role. Individual grant checkboxes cannot restrict this module.</p>}
            <ResourceActionToggleGrid actions={definition.actions} effective={effective} onToggle={(action, value, view) => handleToggleResource(key, action, value, view)} disabled={busy || isSelf || targetUser.role === 'admin' || profileDirty || !effective || roleManaged} />
            {profileDirty && <p className="mt-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>Save your profile changes before editing module permissions.</p>}
          </fieldset>;
        })}
    </section>
  </div>;
}
