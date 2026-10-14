import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Ban, Loader2, Search, ShieldCheck, Users } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '../../services/api';
import * as accessControlApi from '../../services/accessControlApi';
import useAccessControl from '../../hooks/useAccessControl';
import useConfirmPermissionChange from '../../hooks/useConfirmPermissionChange';
import AuthContext from '../../context/AuthContext';
import WorkspaceContext from '../../context/WorkspaceContext';
import Avatar from '../Avatar';
import ResourceActionToggleGrid from './ResourceActionToggleGrid';
import { applyViewCascade, verbForToggle, isRoleManagedResource } from './permissionEditorUtils';

/** Shared checkbox matrix for the central Modules tab and module access panels. */
const ResourceAccessPanel = ({ resource, title, description, icon = ShieldCheck, accentColor = '#7c3aed', userFilter = () => true }) => {
  const Icon = icon;
  const { user: currentUser } = useContext(AuthContext);
  const { currentWorkspace } = useContext(WorkspaceContext);
  const { registry, registryError, canManageAccessControl, refresh } = useAccessControl();
  const confirmChange = useConfirmPermissionChange();
  const [users, setUsers] = useState([]);
  const [effectiveByUser, setEffectiveByUser] = useState({});
  const [detailsByUser, setDetailsByUser] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [failedUsers, setFailedUsers] = useState([]);
  const [retry, setRetry] = useState(0);
  const [savingUserId, setSavingUserId] = useState(null);
  const [search, setSearch] = useState('');
  const [loadedContext, setLoadedContext] = useState(null);
  const contextKey = `${currentWorkspace?._id}:${resource}`;
  const activeContext = useRef(contextKey);
  activeContext.current = contextKey;
  const operation = useRef(false);
  const filter = useRef(userFilter);
  filter.current = userFilter;
  const actions = useMemo(() => registry?.resources?.[resource]?.actions || [], [registry, resource]);

  useEffect(() => {
    let active = true;
    activeContext.current = contextKey;
    setLoading(true);
    setError('');
    setUsers([]);
    setEffectiveByUser({});
    setDetailsByUser({});
    setFailedUsers([]);
    (async () => {
      try {
        const response = await api.get('/api/users', { skipOfflineQueue: true });
        if (!Array.isArray(response.data?.data)) throw new Error('Unable to load workspace members.');
        const members = response.data.data.filter(filter.current);
        const results = await Promise.allSettled(members.map((member) => accessControlApi.getUserEffectivePermissions(member._id)));
        if (!active) return;
        const effective = {};
        const details = {};
        const failed = [];
        results.forEach((result, index) => {
          const id = members[index]._id;
          if (result.status === 'fulfilled' && result.value?.resources?.[resource]) effective[id] = result.value.resources[resource];
          else failed.push(id);
          if (result.status === 'fulfilled') details[id] = result.value?.resourceDetails?.[resource];
        });
        setUsers(members);
        setEffectiveByUser(effective);
        setDetailsByUser(details);
        setFailedUsers(failed);
        setLoadedContext(contextKey);
      } catch (loadError) {
        if (active) setError(loadError.response?.data?.message || loadError.message || 'Unable to load members.');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; activeContext.current = null; };
  }, [contextKey, resource, retry]);

  const handleToggle = async (member, actionKey, nextValue, viewKey) => {
    if (operation.current || !canManageAccessControl || failedUsers.includes(member._id) || registryError || member.role === 'admin' || isRoleManagedResource(resource, detailsByUser[member._id]) || String(member._id) === String(currentUser?._id || currentUser?.id)) return;
    operation.current = true;
    setSavingUserId(member._id);
    const requestContext = contextKey;
    const current = effectiveByUser[member._id] || {};
    const next = applyViewCascade(current, actionKey, nextValue, viewKey);
    try {
      const changes = actions.filter((action) => Boolean(current[action.key]) !== Boolean(next[action.key])).map((action) => ({ label: `${registry.resources[resource].label} — ${action.label}`, previous: current[action.key] === true, next: next[action.key] === true }));
      const confirmed = await confirmChange({ targetUserName: member.name, targetUserRole: member.role, actionVerb: verbForToggle(actionKey, nextValue, viewKey), changes });
      if (!confirmed || activeContext.current !== requestContext) return;
      const result = await accessControlApi.putUserResourceOverride(member._id, resource, { actions: next, effect: 'grant' });
      if (activeContext.current !== requestContext) return;
      if (!result?.effective?.actions) throw new Error('Unable to verify the saved permissions. Reload before editing.');
      setEffectiveByUser((previous) => ({ ...previous, [member._id]: result.effective.actions }));
      setDetailsByUser((previous) => ({ ...previous, [member._id]: { source: result.effective.source, scope: result.effective.scope } }));
      toast.success('Permissions saved');
    } catch (saveError) {
      if (activeContext.current === requestContext) {
        toast.error(saveError.response?.data?.message || saveError.message || 'Failed to update permissions');
        setRetry((value) => value + 1);
      }
    } finally { operation.current = false; setSavingUserId(null); }
  };

  const filtered = users.filter((member) => `${member.name || ''} ${member.email || ''}`.toLowerCase().includes(search.toLowerCase()));
  const retryLoad = () => { if (registryError) refresh().catch(() => {}); setRetry((value) => value + 1); };
  return <div className="space-y-5">
    <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${accentColor}18`, color: accentColor }}><Icon className="w-5 h-5" /></div>
      <div><h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>{title}</h2>{description && <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>{description}</p>}<p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>Each checkbox change is saved after confirmation.</p></div>
    </div>
    <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4" style={{ color: 'var(--color-text-muted)' }} /><input type="search" aria-label="Search workspace members" placeholder="Search members…" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-form-type="other" value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-lg border py-2.5 pl-10 pr-4 text-sm" style={{ backgroundColor: 'var(--color-bg-base)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' }} /></div>
    {error || registryError ? <div role="alert" className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--color-border-default)' }}><p>{error || 'The permission catalog could not be loaded.'}</p><button type="button" onClick={retryLoad} className="text-purple-600 underline mt-2">Retry</button></div> :
      loading || loadedContext !== contextKey || !registry ? <div role="status" className="flex items-center justify-center gap-3 py-12 text-sm"><Loader2 className="w-5 h-5 animate-spin" />Loading member permissions…</div> : <>
        {failedUsers.length > 0 && <div role="alert" className="text-sm"><p>Some members’ permissions could not be loaded. Their checkboxes are read-only.</p><button type="button" onClick={retryLoad} disabled={Boolean(savingUserId)} className="text-purple-600 underline mt-2">Retry failed loads</button></div>}
        {!filtered.length ? <div className="py-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}><Users className="mx-auto mb-3 h-8 w-8" />No matching members</div> :
          <div className="space-y-3">{filtered.map((member) => {
            const effective = effectiveByUser[member._id];
            const isSelf = String(member._id) === String(currentUser?._id || currentUser?.id);
            const roleManaged = isRoleManagedResource(resource, detailsByUser[member._id]);
            const readOnly = isSelf || !canManageAccessControl || member.role === 'admin' || roleManaged;
            return <section key={member._id} className="rounded-xl border p-4 sm:p-5" style={{ backgroundColor: 'var(--color-bg-subtle)', borderColor: 'var(--color-border-default)' }}>
              <div className="flex items-start gap-3"><Avatar src={member.avatar} name={member.name} role={member.role} size="md" /><div className="min-w-0 flex-1"><h3 className="font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{member.name}</h3><p className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>{member.email}</p><span className="mt-1 inline-block text-xs capitalize" style={{ color: 'var(--color-text-secondary)' }}>{member.role}</span></div>
                <span className="shrink-0 text-xs" style={{ color: 'var(--color-text-secondary)' }}>{effective ? `${actions.filter((action) => effective[action.key] === true).length}/${actions.length} selected` : 'Unavailable'}</span>
              </div>
              {readOnly && <p className="flex items-center gap-2 text-xs mt-3" style={{ color: 'var(--color-text-secondary)' }}><Ban className="w-4 h-4" />{isSelf ? 'Your own permissions are read-only.' : roleManaged ? 'Included in this workspace role. Individual grants cannot restrict this module.' : 'Permissions are read-only for this account.'}</p>}
              {savingUserId === member._id && <p role="status" className="text-xs mt-3">Permission change in progress…</p>}
              <div className="mt-4"><ResourceActionToggleGrid actions={actions} effective={effective} accentColor={accentColor} disabled={readOnly || Boolean(savingUserId) || !effective} onToggle={(action, value, view) => handleToggle(member, action, value, view)} /></div>
            </section>;
          })}</div>}
      </>}
  </div>;
};
export default ResourceAccessPanel;
