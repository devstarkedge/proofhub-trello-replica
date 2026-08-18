import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Search, Loader2, AlertCircle, Building2, MoreVertical, PauseCircle, PlayCircle, Archive, RotateCcw, X } from 'lucide-react';
import WorkspaceStatusBadge from './WorkspaceStatusBadge';
import WorkspaceStatusConfirmModal from './WorkspaceStatusConfirmModal';
import { useSuperAdminWorkspaces, useSuperAdminPlans, useUpdateWorkspaceStatus } from '../../hooks/useSuperAdminQueries';

const STATUS_FILTERS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'archived', label: 'Archived' }
];

const TYPE_FILTERS = [
  { value: '', label: 'All types' },
  { value: 'company', label: 'Company' },
  { value: 'team', label: 'Team' }
];

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

const RowActionsMenu = ({ workspace, onTransition }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const options = [];
  if (workspace.status === 'active') {
    options.push({ key: 'suspended', label: 'Suspend', icon: PauseCircle, color: '#f59e0b' });
    options.push({ key: 'archived', label: 'Archive', icon: Archive, color: '#6b7280' });
  } else if (workspace.status === 'suspended') {
    options.push({ key: 'reactivate', label: 'Reactivate', icon: PlayCircle, color: '#10b981' });
    options.push({ key: 'archived', label: 'Archive', icon: Archive, color: '#6b7280' });
  } else if (workspace.status === 'archived') {
    options.push({ key: 'restore', label: 'Restore', icon: RotateCcw, color: '#10b981' });
  }

  return (
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 py-1.5 rounded-xl border z-20 min-w-40 bg-white shadow-lg"
          style={{ borderColor: '#e5e7eb' }}
        >
          {options.map((opt) => (
            <button
              key={opt.key}
              onClick={() => { setOpen(false); onTransition(workspace, opt.key); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors"
              style={{ color: opt.color }}
            >
              <opt.icon className="w-4 h-4" />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const WorkspacesTable = () => {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [plan, setPlan] = useState('');
  const search = useDebouncedValue(searchInput, 350);

  const { data: plans } = useSuperAdminPlans();
  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useSuperAdminWorkspaces({ search, status, type, plan });
  const updateStatus = useUpdateWorkspaceStatus();

  const [confirmState, setConfirmState] = useState(null); // { workspace, transition }

  const rows = useMemo(() => (data?.pages || []).flatMap((p) => p.data), [data]);

  const sentinelRef = useRef(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleTransition = useCallback((workspace, transitionKey) => {
    setConfirmState({ workspace, transition: transitionKey });
  }, []);

  const targetStatusFor = (transition) => (transition === 'reactivate' || transition === 'restore' ? 'active' : transition);

  const handleConfirm = async (reason) => {
    if (!confirmState) return;
    try {
      await updateStatus.mutateAsync({
        workspaceId: confirmState.workspace._id,
        status: targetStatusFor(confirmState.transition),
        reason
      });
      toast.success(`Workspace "${confirmState.workspace.name}" updated.`);
      setConfirmState(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update workspace status.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
          <input
            type="text"
            placeholder="Search by name, slug, owner name or email…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-10 pr-8 py-2.5 rounded-lg border text-sm outline-none"
            style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-subtle)', color: 'var(--color-text-primary)' }}
          />
          {searchInput && (
            <button onClick={() => setSearchInput('')} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }}>
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2.5 rounded-lg border text-sm outline-none bg-white"
          style={{ borderColor: 'var(--color-border-subtle)' }}
        >
          {STATUS_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>

        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="px-3 py-2.5 rounded-lg border text-sm outline-none bg-white"
          style={{ borderColor: 'var(--color-border-subtle)' }}
        >
          {TYPE_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>

        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          className="px-3 py-2.5 rounded-lg border text-sm outline-none bg-white"
          style={{ borderColor: 'var(--color-border-subtle)' }}
        >
          <option value="">All plans</option>
          {plans?.map((p) => <option key={p._id} value={p.slug}>{p.name}</option>)}
        </select>
      </div>

      {isError && (
        <div className="flex items-center gap-2 p-4 rounded-lg border" style={{ borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.08)', color: '#f59e0b' }}>
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="text-sm">{error?.response?.data?.message || 'Failed to load workspaces.'}</span>
          <button onClick={() => refetch()} className="ml-auto text-sm font-medium underline">Retry</button>
        </div>
      )}

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: 'var(--color-border-subtle)' }}>
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
              <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Workspace</th>
              <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Owner</th>
              <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Status</th>
              <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Plan</th>
              <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Members</th>
              <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Projects</th>
              <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Storage</th>
              <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={9} className="px-4 py-10 text-center">
                <div className="flex items-center justify-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
                  <Loader2 className="w-5 h-5 animate-spin" /> Loading workspaces…
                </div>
              </td></tr>
            )}
            {!isLoading && rows.length === 0 && !isError && (
              <tr><td colSpan={9} className="px-4 py-10 text-center" style={{ color: 'var(--color-text-muted)' }}>
                No workspaces match these filters.
              </td></tr>
            )}
            {rows.map((w) => (
              <tr
                key={w._id}
                onClick={() => navigate(`/super-admin/workspaces/${w._id}`)}
                className="border-t cursor-pointer hover:bg-black/[0.02] transition-colors"
                style={{ borderColor: 'var(--color-border-subtle)' }}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(220, 38, 38, 0.1)' }}>
                      {w.icon?.smallUrl ? (
                        <img src={w.icon.smallUrl} alt="" className="w-full h-full rounded-lg object-cover" />
                      ) : (
                        <Building2 className="w-4 h-4" style={{ color: '#dc2626' }} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>{w.name}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>/{w.slug} · {w.type || 'unset'}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 min-w-0">
                  <p className="truncate" style={{ color: 'var(--color-text-primary)' }}>{w.owner?.name || '—'}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{w.owner?.email}</p>
                </td>
                <td className="px-4 py-3"><WorkspaceStatusBadge status={w.status} /></td>
                <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>{w.plan?.name || '—'}</td>
                <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>{w.activeMemberCount} / {w.memberCount}</td>
                <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>{w.projectCount}</td>
                <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 font-medium text-xs">
                    {formatBytes(w.storageBytes)}
                  </span>
                </td>
                <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>
                  {w.createdAt ? new Date(w.createdAt).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3">
                  <RowActionsMenu workspace={w} onTransition={handleTransition} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div ref={sentinelRef} className="h-4" />
        {isFetchingNextPage && (
          <div className="flex items-center justify-center gap-2 py-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            <Loader2 className="w-4 h-4 animate-spin" /> Loading more…
          </div>
        )}
      </div>

      <WorkspaceStatusConfirmModal
        isOpen={!!confirmState}
        workspace={confirmState?.workspace}
        transition={confirmState?.transition}
        isLoading={updateStatus.isPending}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
};

export default WorkspacesTable;
