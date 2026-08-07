import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Ban, Loader2, Search, ShieldCheck, Users } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '../../services/api';
import * as accessControlApi from '../../services/accessControlApi';
import useAccessControl from '../../hooks/useAccessControl';
import useConfirmPermissionChange from '../../hooks/useConfirmPermissionChange';
import AuthContext from '../../context/AuthContext';
import Avatar from '../Avatar';
import ResourceActionToggleGrid, { applyViewCascade, verbForToggle } from './ResourceActionToggleGrid';

/**
 * The one reusable per-user permission matrix editor.
 *
 * Renders a users list where each row is a row of toggle buttons — one per
 * action defined for `resource` in the permission registry
 * (GET /api/access-control/registry). This is what ModuleAccessPanel
 * (Sales) and FinanceAccessControl (Finance) both are now — thin wrappers
 * passing a different `resource` key, instead of two bespoke
 * implementations of the same pattern. Adding a new module's access panel
 * anywhere else in the app means adding entries to
 * backend/config/permissionRegistry.js and rendering this component with a
 * new `resource` — no new component, no new endpoint.
 */
const ResourceAccessPanel = ({
  resource,
  title,
  description,
  icon: Icon = ShieldCheck,
  accentColor = '#10b981',
  userFilter = () => true
}) => {
  const { user: currentUser } = useContext(AuthContext);
  const { registry, refresh: refreshMyPermissions } = useAccessControl();
  const confirmChange = useConfirmPermissionChange();
  const [users, setUsers] = useState([]);
  const [effectiveByUser, setEffectiveByUser] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const actions = useMemo(
    () => registry?.resources?.[resource]?.actions || [],
    [registry, resource]
  );

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        setLoading(true);
        const response = await api.get('/api/users');
        const allUsers = (response.data?.data || []).filter(userFilter);
        if (!mounted) return;
        setUsers(allUsers);

        const entries = await Promise.all(
          allUsers.map(async (u) => {
            try {
              const effective = await accessControlApi.getUserEffectivePermissions(u._id);
              return [u._id, effective?.resources?.[resource] || {}];
            } catch {
              return [u._id, {}];
            }
          })
        );
        if (!mounted) return;
        setEffectiveByUser(Object.fromEntries(entries));
      } catch (error) {
        console.error(`Failed to load ${resource} access panel:`, error);
        toast.error('Failed to load users');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource]);

  const handleToggle = async (targetUser, actionKey, nextValue, viewKey) => {
    const userId = targetUser._id;
    const current = effectiveByUser[userId] || {};
    const next = applyViewCascade(current, actionKey, nextValue, viewKey);
    const actionLabel = actions.find((a) => a.key === actionKey)?.label || actionKey;

    // The one confirmation modal for every permission change — no bespoke
    // dialog here, just a description of what's about to happen.
    const confirmed = await confirmChange({
      targetUserName: targetUser.name,
      targetUserRole: targetUser.role,
      actionVerb: verbForToggle(actionKey, nextValue, viewKey),
      changes: [{ label: `${registry?.resources?.[resource]?.label || resource} — ${actionLabel}`, previous: current[actionKey] === true, next: nextValue }]
    });
    if (!confirmed) return;

    setEffectiveByUser((prev) => ({ ...prev, [userId]: next }));
    setSavingUserId(userId);

    try {
      await accessControlApi.putUserResourceOverride(userId, resource, {
        actions: next,
        effect: 'grant'
      });
      refreshMyPermissions().catch(() => {});
    } catch (error) {
      setEffectiveByUser((prev) => ({ ...prev, [userId]: current }));
      toast.error(error.response?.data?.message || 'Failed to update permissions');
    } finally {
      setSavingUserId(null);
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${accentColor}20`, color: accentColor }}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
            {title}
          </h2>
          {description && (
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {description}
            </p>
          )}
        </div>
      </div>

      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2"
          style={{ color: 'var(--color-text-muted)' }}
        />
        <input
          type="text"
          placeholder="Search users by name or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border text-sm outline-none"
          style={{
            backgroundColor: 'var(--color-bg-primary)',
            borderColor: 'var(--color-border-subtle)',
            color: 'var(--color-text-primary)'
          }}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-12 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading users...
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-8" style={{ color: 'var(--color-text-muted)' }}>
          <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p>No users found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredUsers.map((u) => {
            const effective = effectiveByUser[u._id] || {};
            const isSaving = savingUserId === u._id;
            const isSelf = currentUser && String(currentUser._id) === String(u._id);

            return (
              <div
                key={u._id}
                className="rounded-lg border p-4"
                style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-subtle)' }}
              >
                <div className="flex items-start gap-3">
                  <Avatar src={u.avatar} name={u.name} role={u.role} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
                        {u.name}
                      </h3>
                      {isSaving && <Loader2 className="w-4 h-4 animate-spin" style={{ color: accentColor }} />}
                    </div>
                    <p className="text-sm truncate" style={{ color: 'var(--color-text-secondary)' }}>
                      {u.email}
                    </p>
                    <span
                      className="inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded"
                      style={{ backgroundColor: 'var(--color-bg-muted)', color: 'var(--color-text-secondary)' }}
                    >
                      {u.role || 'User'}
                    </span>
                  </div>
                </div>

                {isSelf ? (
                  <div
                    className="mt-4 flex items-center gap-2 text-xs font-medium rounded-lg px-3 py-2.5"
                    style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', color: '#dc2626' }}
                  >
                    <Ban className="w-4 h-4 shrink-0" />
                    You cannot modify your own permissions.
                  </div>
                ) : (
                  <div className="mt-4">
                    <ResourceActionToggleGrid
                      actions={actions}
                      effective={effective}
                      onToggle={(actionKey, nextValue, viewKey) => handleToggle(u, actionKey, nextValue, viewKey)}
                      accentColor={accentColor}
                      disabled={isSaving}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ResourceAccessPanel;
