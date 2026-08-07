import React, { useEffect, useMemo, useState } from 'react';
import { Ban, Building2, ChevronDown, Loader2, Save, Shield, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '../../services/api';
import * as accessControlApi from '../../services/accessControlApi';
import useRoleStore from '../../store/roleStore';
import useDepartmentStore from '../../store/departmentStore';
import useAccessControl from '../../hooks/useAccessControl';
import useConfirmPermissionChange from '../../hooks/useConfirmPermissionChange';
import AccessScopePicker from './AccessScopePicker';
import ResourceActionToggleGrid, { applyViewCascade, verbForToggle } from './ResourceActionToggleGrid';

const ACCESS_SCOPE_LABELS = {
  full_department: 'Full Dept',
  selected_projects: 'Selected',
  assigned_tasks: 'My Tasks'
};

/**
 * The one place a user's entire access profile — role, department, access
 * scope, and every module's resource overrides — is edited. This is the
 * centralized Access & Permissions module's core editor: the "Users" tab
 * opens it for any user, and HRPanel's "Assign" button now opens the exact
 * same component instead of a second, hand-rolled implementation of the
 * same role/department/scope form.
 *
 * Role/department/scope are batch-saved (one "Save Profile" click, matching
 * the pre-existing HR workflow); resource overrides (Sales, Finance,
 * delegated Access Control) save instantly per toggle, matching the rest of
 * the centralized module.
 */
const UserAccessEditor = ({ userId, currentUserId, onUserUpdated }) => {
  const { loadRoles, changeUserRole, getRolesForDropdown } = useRoleStore();
  // Admin can assign any role, including Admin. A delegated non-admin editor
  // (access_control.manage without actually being Admin) must not see or be
  // able to pick "Admin" — matches the server-side check in changeUserRole.
  const roles = getRolesForDropdown();
  const departmentStore = useDepartmentStore();
  const { registry, refresh: refreshMyPermissions } = useAccessControl();
  const confirmChange = useConfirmPermissionChange();

  const [targetUser, setTargetUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [selectedRole, setSelectedRole] = useState('');
  const [selectedDepartments, setSelectedDepartments] = useState([]);
  const [showDepartmentDropdown, setShowDepartmentDropdown] = useState(false);
  const [accessType, setAccessType] = useState('full_department');
  const [allowedProjects, setAllowedProjects] = useState([]);

  const [resourceEffective, setResourceEffective] = useState({});
  const [resourceSavingKey, setResourceSavingKey] = useState(null);

  const isSelf = currentUserId && userId && String(currentUserId) === String(userId);
  const isTargetAdmin = targetUser?.role === 'admin';

  useEffect(() => {
    if (!departmentStore.departments?.length) departmentStore.loadDepartments();
    if (!roles?.length) loadRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const [userRes, effective] = await Promise.all([
          api.get(`/api/users/${userId}`),
          accessControlApi.getUserEffectivePermissions(userId).catch(() => null)
        ]);
        if (!mounted) return;

        const u = userRes.data?.data;
        setTargetUser(u);
        setSelectedRole(u?.role || 'employee');
        setSelectedDepartments((u?.department || []).map((d) => d._id || d));
        setAccessType(u?.accessType || 'full_department');
        setAllowedProjects((u?.allowedProjects || []).map((p) => p._id || p));
        setResourceEffective(effective?.resources || {});
      } catch (error) {
        console.error('Failed to load user access profile:', error);
        toast.error('Failed to load user');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [userId]);

  const departmentOptions = departmentStore.departments || [];
  const availableDepartments = useMemo(
    () => departmentOptions.filter((d) => !selectedDepartments.includes(d._id)),
    [departmentOptions, selectedDepartments]
  );
  const selectedDepartmentObjects = useMemo(
    () => departmentOptions.filter((d) => selectedDepartments.includes(d._id)),
    [departmentOptions, selectedDepartments]
  );

  const profileDirty =
    targetUser &&
    (selectedRole !== targetUser.role ||
      accessType !== (targetUser.accessType || 'full_department') ||
      JSON.stringify([...selectedDepartments].sort()) !== JSON.stringify((targetUser.department || []).map((d) => d._id || d).sort()) ||
      JSON.stringify([...allowedProjects].sort()) !== JSON.stringify((targetUser.allowedProjects || []).map((p) => p._id || p).sort()));

  const handleSaveProfile = async () => {
    if (!targetUser || isSelf) return;

    const changes = [];
    if (selectedRole !== targetUser.role) {
      changes.push({ label: 'Role', previous: targetUser.role, next: selectedRole });
    }
    if (accessType !== (targetUser.accessType || 'full_department')) {
      changes.push({ label: 'Access Scope', previous: ACCESS_SCOPE_LABELS[targetUser.accessType] || 'Full Dept', next: ACCESS_SCOPE_LABELS[accessType] });
    }
    const previousDeptIds = (targetUser.department || []).map((d) => d._id || d).sort();
    if (JSON.stringify([...selectedDepartments].sort()) !== JSON.stringify(previousDeptIds)) {
      changes.push({
        label: 'Departments',
        previous: departmentOptions.filter((d) => previousDeptIds.includes(d._id)).map((d) => d.name),
        next: selectedDepartmentObjects.map((d) => d.name)
      });
    }
    if (changes.length === 0) return;

    const confirmed = await confirmChange({
      targetUserName: targetUser.name,
      targetUserRole: targetUser.role,
      actionVerb: 'update',
      changes
    });
    if (!confirmed) return;

    setSaving(true);
    try {
      if (selectedRole !== targetUser.role) {
        await changeUserRole(userId, selectedRole);
      }
      await api.put(`/api/users/${userId}/assign`, {
        departments: selectedDepartments,
        team: null,
        accessType,
        allowedProjects: accessType === 'selected_projects' ? allowedProjects : []
      });
      toast.success('User profile updated');
      setTargetUser((prev) => ({
        ...prev,
        role: selectedRole,
        accessType,
        allowedProjects,
        department: departmentOptions.filter((d) => selectedDepartments.includes(d._id))
      }));
      onUserUpdated?.();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleResource = async (resource, actionKey, nextValue, viewKey) => {
    if (isSelf) return;
    const current = resourceEffective[resource] || {};
    const next = applyViewCascade(current, actionKey, nextValue, viewKey);
    const actionLabel = registry?.resources?.[resource]?.actions?.find((a) => a.key === actionKey)?.label || actionKey;

    const confirmed = await confirmChange({
      targetUserName: targetUser.name,
      targetUserRole: targetUser.role,
      actionVerb: verbForToggle(actionKey, nextValue, viewKey),
      changes: [{ label: `${registry?.resources?.[resource]?.label || resource} — ${actionLabel}`, previous: current[actionKey] === true, next: nextValue }]
    });
    if (!confirmed) return;

    setResourceEffective((prev) => ({ ...prev, [resource]: next }));
    setResourceSavingKey(resource);

    try {
      await accessControlApi.putUserResourceOverride(userId, resource, { actions: next, effect: 'grant' });
      refreshMyPermissions().catch(() => {});
    } catch (error) {
      setResourceEffective((prev) => ({ ...prev, [resource]: current }));
      toast.error(error.response?.data?.message || 'Failed to update permissions');
    } finally {
      setResourceSavingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-12 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading user access profile...
      </div>
    );
  }

  if (!targetUser) {
    return <p className="text-sm text-center py-8" style={{ color: 'var(--color-text-muted)' }}>User not found.</p>;
  }

  return (
    <div className="space-y-6">
      {isSelf && (
        <div
          className="flex items-start gap-2 text-sm font-medium rounded-lg px-4 py-3"
          style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', color: '#dc2626' }}
        >
          <Ban className="w-4 h-4 shrink-0 mt-0.5" />
          <span>You cannot modify your own role, access scope, department, or permissions. Ask another admin or a delegated manager to make this change.</span>
        </div>
      )}

      {/* ── Role ── */}
      <div>
        <label className="block text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--color-text-primary)' }}>
          <Shield className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
          Role
        </label>
        <div className="relative">
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            disabled={isSelf}
            className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border-subtle)', color: 'var(--color-text-primary)' }}
          >
            {roles.filter((r) => r.isActive !== false).map((r) => (
              <option key={r._id} value={r.slug}>{r.name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
        </div>
        {isSelf && (
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>You cannot change your own role.</p>
        )}
        {!isSelf && selectedRole !== targetUser.role && (
          <p className="text-xs text-blue-600 mt-1">
            Role will change from <strong>{targetUser.role}</strong> to <strong>{selectedRole}</strong>
          </p>
        )}
      </div>

      {/* ── Departments ── */}
      <div>
        <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
          Departments
        </label>
        <div className="relative">
          <button
            type="button"
            onClick={() => !isSelf && setShowDepartmentDropdown((v) => !v)}
            disabled={isSelf}
            className="w-full px-4 py-3 text-left border rounded-lg flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border-subtle)', color: 'var(--color-text-primary)' }}
          >
            <span>{availableDepartments.length > 0 ? 'Choose departments...' : 'All departments selected'}</span>
            <ChevronDown className={`w-5 h-5 transition-transform ${showDepartmentDropdown ? 'rotate-180' : ''}`} style={{ color: 'var(--color-text-muted)' }} />
          </button>
          {!isSelf && showDepartmentDropdown && availableDepartments.length > 0 && (
            <div className="absolute z-10 w-full mt-2 bg-white dark:bg-gray-800 border rounded-lg shadow-lg max-h-48 overflow-y-auto" style={{ borderColor: 'var(--color-border-subtle)' }}>
              {availableDepartments.map((dept) => (
                <button
                  key={dept._id}
                  onClick={() => {
                    setSelectedDepartments((prev) => [...prev, dept._id]);
                    setShowDepartmentDropdown(false);
                  }}
                  className="w-full px-4 py-3 text-left hover:bg-blue-50 dark:hover:bg-gray-700 flex items-center gap-2 border-b last:border-b-0"
                  style={{ borderColor: 'var(--color-border-subtle)' }}
                >
                  <Building2 className="w-4 h-4 text-blue-600" />
                  <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{dept.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {selectedDepartmentObjects.length > 0 && (
          <div className="flex flex-wrap gap-2 p-3 mt-2 rounded-lg border min-h-[52px]" style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-subtle)' }}>
            {selectedDepartmentObjects.map((dept) => (
              <span key={dept._id} className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium">
                <Building2 className="w-4 h-4" />
                {dept.name}
                {!isSelf && (
                  <button onClick={() => setSelectedDepartments((prev) => prev.filter((id) => id !== dept._id))} className="hover:bg-blue-800 rounded-full p-0.5">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Access Scope (shared component) ── */}
      <AccessScopePicker
        role={selectedRole}
        departmentIds={selectedDepartments}
        accessType={accessType}
        onAccessTypeChange={setAccessType}
        allowedProjects={allowedProjects}
        onAllowedProjectsChange={setAllowedProjects}
        disabled={isSelf}
      />

      <div className="flex justify-end pt-2 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
        <button
          type="button"
          onClick={handleSaveProfile}
          disabled={saving || !profileDirty || isSelf}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: '#2563eb' }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Profile
        </button>
      </div>

      {/* ── Resource overrides (Sales, Finance, delegated Access Control) ── */}
      {isTargetAdmin ? (
        <div className="rounded-lg border p-4 text-sm" style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)' }}>
          Admins already have full access to every module — there's nothing to grant here. To suspend a specific permission for this admin instead, use a deny override via the API (not yet exposed in this UI).
        </div>
      ) : (
        Object.entries(registry?.resources || {}).map(([resourceKey, resourceDef]) => (
          <div key={resourceKey} className="rounded-lg border p-4" style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-subtle)' }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{resourceDef.label}</h4>
                {resourceDef.description && (
                  <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{resourceDef.description}</p>
                )}
              </div>
              {resourceSavingKey === resourceKey && <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-text-muted)' }} />}
            </div>
            <ResourceActionToggleGrid
              actions={resourceDef.actions}
              effective={resourceEffective[resourceKey] || {}}
              onToggle={(actionKey, nextValue, viewKey) => handleToggleResource(resourceKey, actionKey, nextValue, viewKey)}
              accentColor={resourceKey === 'access_control' ? '#7c3aed' : '#10b981'}
              disabled={resourceSavingKey === resourceKey || isSelf}
            />
          </div>
        ))
      )}
    </div>
  );
};

export default UserAccessEditor;
