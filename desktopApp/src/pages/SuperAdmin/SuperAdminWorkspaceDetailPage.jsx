import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  Building2, Loader2, AlertCircle, PauseCircle, PlayCircle, Archive, RotateCcw, CreditCard,
  Users, FolderKanban, HardDrive, Clock, LayoutGrid, ArrowLeft
} from 'lucide-react';
import WorkspaceStatusBadge from '../../components/SuperAdmin/WorkspaceStatusBadge';
import WorkspaceStatusConfirmModal from '../../components/SuperAdmin/WorkspaceStatusConfirmModal';
import PlanAssignmentModal from '../../components/SuperAdmin/PlanAssignmentModal';
import {
  useSuperAdminWorkspace, useSuperAdminWorkspaceMembers, useSuperAdminWorkspaceProjects,
  useSuperAdminWorkspaceUsage, useSuperAdminWorkspaceBilling, useSuperAdminWorkspaceActivity,
  useUpdateWorkspaceStatus, useUpdateWorkspaceBilling
} from '../../hooks/useSuperAdminQueries';
import socketService from '../../services/socket';

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutGrid },
  { key: 'members', label: 'Members', icon: Users },
  { key: 'projects', label: 'Projects', icon: FolderKanban },
  { key: 'usage', label: 'Usage', icon: HardDrive },
  { key: 'billing', label: 'Plan & Billing', icon: CreditCard },
  { key: 'activity', label: 'Activity', icon: Clock }
];

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return 'Not available';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

const SuperAdminWorkspaceDetailPage = () => {
  const { workspaceId } = useParams();
  const [activeTab, setActiveTab] = useState('overview');
  const [confirmState, setConfirmState] = useState(null);
  const [showPlanModal, setShowPlanModal] = useState(false);

  const { data, isLoading, isError, error, refetch } = useSuperAdminWorkspace(workspaceId);
  const updateStatus = useUpdateWorkspaceStatus();

  // Live-update this page if the workspace's status changes from another
  // Super Admin session — "core events" real-time scope.
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.workspaceId === workspaceId) refetch();
    };
    window.addEventListener('socket-super-admin-workspace-status-changed', handler);
    return () => window.removeEventListener('socket-super-admin-workspace-status-changed', handler);
  }, [workspaceId, refetch]);

  useEffect(() => {
    socketService.joinSuperAdmin();
    return () => socketService.leaveSuperAdmin();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--color-text-secondary)' }} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-lg border" style={{ borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.08)', color: '#f59e0b' }}>
        <AlertCircle className="w-5 h-5 shrink-0" />
        <span className="text-sm">{error?.response?.data?.message || 'Workspace not found or unavailable.'}</span>
      </div>
    );
  }

  const { workspace, owner, subscription, memberCount, activeMemberCount, projectCount, statusChangedByUser } = data;

  const targetStatusFor = (transition) => (transition === 'reactivate' || transition === 'restore' ? 'active' : transition);

  const handleConfirm = async (reason) => {
    if (!confirmState) return;
    try {
      await updateStatus.mutateAsync({ workspaceId, status: targetStatusFor(confirmState.transition), reason });
      toast.success(`Workspace "${workspace.name}" updated.`);
      setConfirmState(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update workspace status.');
    }
  };

  const actionButtons = [];
  if (workspace.status === 'active') {
    actionButtons.push({ key: 'suspended', label: 'Suspend', icon: PauseCircle, color: '#f59e0b' });
    actionButtons.push({ key: 'archived', label: 'Archive', icon: Archive, color: '#6b7280' });
  } else if (workspace.status === 'suspended') {
    actionButtons.push({ key: 'reactivate', label: 'Reactivate', icon: PlayCircle, color: '#10b981' });
    actionButtons.push({ key: 'archived', label: 'Archive', icon: Archive, color: '#6b7280' });
  } else if (workspace.status === 'archived') {
    actionButtons.push({ key: 'restore', label: 'Restore', icon: RotateCcw, color: '#10b981' });
  }

  return (
    <div className="space-y-5">
      <Link to="/super-admin/workspaces" className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
        <ArrowLeft className="w-4 h-4" /> All workspaces
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(220, 38, 38, 0.1)' }}>
            {workspace.icon?.mediumUrl ? (
              <img src={workspace.icon.mediumUrl} alt="" className="w-full h-full rounded-xl object-cover" />
            ) : (
              <Building2 className="w-6 h-6" style={{ color: '#dc2626' }} />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{workspace.name}</h2>
              <WorkspaceStatusBadge status={workspace.status} />
            </div>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              /{workspace.slug} · {workspace.type || 'unset'} · Created {new Date(workspace.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {actionButtons.map((btn) => (
            <button
              key={btn.key}
              onClick={() => setConfirmState({ transition: btn.key })}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold border transition-colors"
              style={{ borderColor: btn.color, color: btn.color }}
            >
              <btn.icon className="w-4 h-4" />
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {workspace.statusReason && (
        <div className="text-sm px-4 py-3 rounded-lg border" style={{ borderColor: 'var(--color-border-subtle)', backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)' }}>
          <strong style={{ color: 'var(--color-text-primary)' }}>Status reason:</strong> {workspace.statusReason}
          {statusChangedByUser && (
            <span> — by {statusChangedByUser.name} on {new Date(workspace.statusChangedAt).toLocaleString()}</span>
          )}
        </div>
      )}

      <div className="border-b flex gap-1 overflow-x-auto" style={{ borderColor: 'var(--color-border-subtle)' }}>
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="px-4 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap"
            style={{
              borderColor: activeTab === key ? '#dc2626' : 'transparent',
              color: activeTab === key ? '#dc2626' : 'var(--color-text-secondary)'
            }}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <OverviewTab workspace={workspace} owner={owner} subscription={subscription} memberCount={memberCount} activeMemberCount={activeMemberCount} projectCount={projectCount} />
      )}
      {activeTab === 'members' && <MembersTab workspaceId={workspaceId} active={activeTab === 'members'} />}
      {activeTab === 'projects' && <ProjectsTab workspaceId={workspaceId} active={activeTab === 'projects'} />}
      {activeTab === 'usage' && <UsageTab workspaceId={workspaceId} active={activeTab === 'usage'} />}
      {activeTab === 'billing' && (
        <BillingTab
          workspaceId={workspaceId}
          active={activeTab === 'billing'}
          currentMemberCount={memberCount}
          onChangePlan={() => setShowPlanModal(true)}
        />
      )}
      {activeTab === 'activity' && <ActivityTab workspaceId={workspaceId} active={activeTab === 'activity'} />}

      <WorkspaceStatusConfirmModal
        isOpen={!!confirmState}
        workspace={workspace}
        transition={confirmState?.transition}
        isLoading={updateStatus.isPending}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmState(null)}
      />

      <PlanModalHost
        workspaceId={workspaceId}
        workspace={workspace}
        currentMemberCount={memberCount}
        isOpen={showPlanModal}
        onClose={() => setShowPlanModal(false)}
      />
    </div>
  );
};

// ─── Overview tab ───────────────────────────────────────────────────────────

const StatBlock = ({ label, value }) => (
  <div>
    <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
    <p className="text-base font-semibold mt-0.5" style={{ color: 'var(--color-text-primary)' }}>{value ?? '—'}</p>
  </div>
);

const OverviewTab = ({ workspace, owner, subscription, memberCount, activeMemberCount, projectCount }) => (
  <div className="grid md:grid-cols-2 gap-5">
    <div className="rounded-xl border p-5 space-y-4" style={{ borderColor: 'var(--color-border-subtle)', backgroundColor: 'var(--color-bg-secondary)' }}>
      <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Workspace</h3>
      <div className="grid grid-cols-2 gap-4">
        <StatBlock label="Type" value={workspace.type} />
        <StatBlock label="Industry" value={workspace.industry} />
        <StatBlock label="Company Size" value={workspace.companySize} />
        <StatBlock label="Status" value={<WorkspaceStatusBadge status={workspace.status} />} />
      </div>
    </div>

    <div className="rounded-xl border p-5 space-y-4" style={{ borderColor: 'var(--color-border-subtle)', backgroundColor: 'var(--color-bg-secondary)' }}>
      <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Owner</h3>
      <div className="grid grid-cols-2 gap-4">
        <StatBlock label="Name" value={owner?.name} />
        <StatBlock label="Email" value={owner?.email} />
        <StatBlock label="Account Active" value={owner?.isActive ? 'Yes' : 'No'} />
        <StatBlock label="Last Login" value={owner?.lastLogin ? new Date(owner.lastLogin).toLocaleDateString() : 'Never'} />
      </div>
    </div>

    <div className="rounded-xl border p-5 space-y-4" style={{ borderColor: 'var(--color-border-subtle)', backgroundColor: 'var(--color-bg-secondary)' }}>
      <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Members &amp; Projects</h3>
      <div className="grid grid-cols-2 gap-4">
        <StatBlock label="Total Members" value={memberCount} />
        <StatBlock label="Active Members" value={activeMemberCount} />
        <StatBlock label="Projects" value={projectCount} />
      </div>
    </div>

    <div className="rounded-xl border p-5 space-y-4" style={{ borderColor: 'var(--color-border-subtle)', backgroundColor: 'var(--color-bg-secondary)' }}>
      <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Plan</h3>
      <div className="grid grid-cols-2 gap-4">
        <StatBlock label="Current Plan" value={subscription?.plan?.name || 'Not configured'} />
        <StatBlock label="Subscription Status" value={subscription?.status} />
      </div>
    </div>
  </div>
);

// ─── Members tab ────────────────────────────────────────────────────────────

const MembersTab = ({ workspaceId, active }) => {
  const { data, isLoading, isError } = useSuperAdminWorkspaceMembers(workspaceId, { enabled: active });

  if (isLoading) return <TabLoading label="Loading members…" />;
  if (isError) return <TabError label="Failed to load members." />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total" value={data.stats.total} />
        <StatCard label="Active" value={data.stats.active} />
        <StatCard label="Suspended" value={data.stats.suspended} />
        <StatCard label="Pending Invitations" value={data.stats.pendingInvitations} />
      </div>

      {Object.keys(data.stats.byRole || {}).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(data.stats.byRole).map(([role, count]) => (
            <span key={role} className="px-3 py-1.5 rounded-full text-xs font-medium" style={{ backgroundColor: 'var(--color-bg-muted)', color: 'var(--color-text-secondary)' }}>
              {role}: {count}
            </span>
          ))}
        </div>
      )}

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: 'var(--color-border-subtle)' }}>
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
              <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Member</th>
              <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Role</th>
              <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Status</th>
              <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Joined</th>
            </tr>
          </thead>
          <tbody>
            {data.members.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center" style={{ color: 'var(--color-text-muted)' }}>No members.</td></tr>
            )}
            {data.members.map((m) => (
              <tr key={m._id} className="border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
                <td className="px-4 py-3">
                  <p style={{ color: 'var(--color-text-primary)' }}>{m.user?.name || 'Unknown'}</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{m.user?.email}</p>
                </td>
                <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>{m.roleId?.name || m.role}</td>
                <td className="px-4 py-3">
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{
                      backgroundColor: m.status === 'active' ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                      color: m.status === 'active' ? '#10b981' : '#f59e0b'
                    }}
                  >
                    {m.status}
                  </span>
                </td>
                <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>
                  {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Projects tab ───────────────────────────────────────────────────────────

const ProjectsTab = ({ workspaceId, active }) => {
  const { data, isLoading, isError } = useSuperAdminWorkspaceProjects(workspaceId, { enabled: active });

  if (isLoading) return <TabLoading label="Loading projects…" />;
  if (isError) return <TabError label="Failed to load projects." />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total" value={data.stats.total} />
        <StatCard label="In Progress" value={data.stats['in-progress']} />
        <StatCard label="Completed" value={data.stats.completed} />
        <StatCard label="Overdue" value={data.stats.overdue} />
        <StatCard label="Archived" value={data.stats.archived} />
      </div>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: 'var(--color-border-subtle)' }}>
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
              <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Project</th>
              <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Status</th>
              <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Owner</th>
              <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Due</th>
            </tr>
          </thead>
          <tbody>
            {data.projects.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center" style={{ color: 'var(--color-text-muted)' }}>No projects.</td></tr>
            )}
            {data.projects.map((p) => (
              <tr key={p._id} className="border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
                <td className="px-4 py-3" style={{ color: 'var(--color-text-primary)' }}>{p.name}</td>
                <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>{p.status}{p.isOverdue && <span style={{ color: '#dc2626' }}> · overdue</span>}</td>
                <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>{p.owner?.name || '—'}</td>
                <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>{p.dueDate ? new Date(p.dueDate).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Usage tab ──────────────────────────────────────────────────────────────

const UsageBar = ({ label, current, limit, formatValue = (v) => v }) => {
  const pct = limit ? Math.min(100, Math.round((current / limit) * 100)) : null;
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
        <span style={{ color: 'var(--color-text-primary)' }}>
          {/* Enterprise is the only active plan with limit:null — "Custom"
              (individually configured/negotiated) reads more accurately
              than "unlimited" as a platform-wide claim. */}
          {formatValue(current)} {limit !== null && limit !== undefined ? `/ ${formatValue(limit)}` : '(Custom)'}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-bg-muted)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct ?? 8}%`, backgroundColor: pct !== null && pct >= 90 ? '#dc2626' : '#dc2626aa' }}
        />
      </div>
    </div>
  );
};

const UsageTab = ({ workspaceId, active }) => {
  const { data, isLoading, isError } = useSuperAdminWorkspaceUsage(workspaceId, { enabled: active });

  if (isLoading) return <TabLoading label="Loading usage…" />;
  if (isError) return <TabError label="Failed to load usage." />;

  return (
    <div className="rounded-xl border p-5 space-y-6" style={{ borderColor: 'var(--color-border-subtle)', backgroundColor: 'var(--color-bg-secondary)' }}>
      <UsageBar label="Members" current={data.members.current} limit={data.members.limit} />
      <UsageBar label="Projects" current={data.projects.current} limit={data.projects.limit} />
      <UsageBar label="Storage" current={data.storage.totalBytes} limit={data.storage.limitBytes} formatValue={formatBytes} />
      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{data.storage.note}</p>
    </div>
  );
};

// ─── Billing tab ────────────────────────────────────────────────────────────

const BillingTab = ({ workspaceId, active, currentMemberCount, onChangePlan }) => {
  const { data, isLoading, isError } = useSuperAdminWorkspaceBilling(workspaceId, { enabled: active });

  if (isLoading) return <TabLoading label="Loading plan & billing…" />;
  if (isError) return <TabError label="Failed to load billing." />;

  if (!data) {
    return (
      <div className="rounded-xl border p-5 text-center space-y-3" style={{ borderColor: 'var(--color-border-subtle)', backgroundColor: 'var(--color-bg-secondary)' }}>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>No plan configured for this workspace.</p>
        <button onClick={onChangePlan} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#dc2626' }}>
          Assign a Plan
        </button>
      </div>
    );
  }

  const chatEnabled = data.plan?.slug !== 'free';
  // Enterprise has no shared/global limit — its cap is this specific
  // workspace's own configured customMemberLimit, which may genuinely not
  // be set yet (never displayed as "Unlimited" in that case).
  const isEnterprise = data.plan?.slug === 'enterprise';
  const memberLimit = isEnterprise ? data.customMemberLimit ?? null : data.plan?.memberLimit ?? null;
  const memberLimitLabel = memberLimit ?? (isEnterprise ? 'Not configured' : 'Custom');

  return (
    <div className="rounded-xl border p-5 space-y-4" style={{ borderColor: 'var(--color-border-subtle)', backgroundColor: 'var(--color-bg-secondary)' }}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Plan &amp; Billing</h3>
        <button onClick={onChangePlan} className="px-3.5 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#dc2626' }}>
          Change Plan
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatBlock label="Current Plan" value={data.plan?.name} />
        <StatBlock label="Plan Status" value={data.status} />
        <StatBlock label="Member Usage" value={`${currentMemberCount ?? 0} / ${memberLimitLabel}`} />
        <StatBlock label="Member Limit" value={memberLimitLabel} />
        <StatBlock
          label="ChatApp Access"
          value={<span style={{ color: chatEnabled ? '#10b981' : 'var(--color-text-muted)' }}>{chatEnabled ? 'Enabled' : 'Disabled'}</span>}
        />
        <StatBlock label="Storage Limit" value={data.plan?.storageLimitBytes ? formatBytes(data.plan.storageLimitBytes) : 'Custom'} />
        <StatBlock label="Project Limit" value={data.plan?.projectLimit ?? 'Custom'} />
        <StatBlock label="Plan Started" value={data.startedAt ? new Date(data.startedAt).toLocaleDateString() : '—'} />
        {/* No payment gateway exists in either app (see subscriptionService.js)
            — a real "Renews" date would be fabricated, so this is stated
            plainly rather than showing a fake billing-cycle countdown. */}
        <StatBlock label="Billing Mode" value="Manual / Not configured" />
        <StatBlock label="Last Plan Change" value={data.updatedAt ? new Date(data.updatedAt).toLocaleString() : '—'} />
      </div>
      {data.notes && (
        <div className="text-sm pt-2 border-t" style={{ borderColor: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)' }}>
          <strong style={{ color: 'var(--color-text-primary)' }}>Notes:</strong> {data.notes}
        </div>
      )}
    </div>
  );
};

const PlanModalHost = ({ workspaceId, workspace, currentMemberCount, isOpen, onClose }) => {
  const { data: subscription } = useSuperAdminWorkspaceBilling(workspaceId, { enabled: isOpen });
  const updateBilling = useUpdateWorkspaceBilling();

  const handleConfirm = async (payload) => {
    try {
      await updateBilling.mutateAsync({ workspaceId, ...payload });
      toast.success('Plan updated.');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update plan.');
    }
  };

  return (
    <PlanAssignmentModal
      isOpen={isOpen}
      workspace={workspace}
      currentSubscription={subscription}
      currentMemberCount={currentMemberCount}
      isLoading={updateBilling.isPending}
      onConfirm={handleConfirm}
      onCancel={onClose}
    />
  );
};

// ─── Activity tab ───────────────────────────────────────────────────────────

const ActivityTab = ({ workspaceId, active }) => {
  const { data, isLoading, isError } = useSuperAdminWorkspaceActivity(workspaceId, { enabled: active });

  if (isLoading) return <TabLoading label="Loading activity…" />;
  if (isError) return <TabError label="Failed to load activity." />;

  return (
    <div className="space-y-3">
      {data.note && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{data.note}</p>}
      <div className="rounded-xl border divide-y" style={{ borderColor: 'var(--color-border-subtle)' }}>
        {data.activity.length === 0 && (
          <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>No recent activity.</div>
        )}
        {data.activity.map((a) => (
          <div key={a._id} className="px-4 py-3 flex items-start justify-between gap-3" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
            <div>
              <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>{a.description}</p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{a.user?.name || 'System'}</p>
            </div>
            <span className="text-xs shrink-0" style={{ color: 'var(--color-text-muted)' }}>
              {new Date(a.createdAt).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Shared small pieces ────────────────────────────────────────────────────

const StatCard = ({ label, value }) => (
  <div className="rounded-xl border p-3" style={{ borderColor: 'var(--color-border-subtle)', backgroundColor: 'var(--color-bg-secondary)' }}>
    <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
    <p className="text-lg font-bold mt-0.5" style={{ color: 'var(--color-text-primary)' }}>{value ?? 0}</p>
  </div>
);

const TabLoading = ({ label }) => (
  <div className="flex items-center justify-center gap-2 py-12 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
    <Loader2 className="w-5 h-5 animate-spin" /> {label}
  </div>
);

const TabError = ({ label }) => (
  <div className="flex items-center gap-2 p-4 rounded-lg border" style={{ borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.08)', color: '#f59e0b' }}>
    <AlertCircle className="w-5 h-5 shrink-0" />
    <span className="text-sm">{label}</span>
  </div>
);

export default SuperAdminWorkspaceDetailPage;
