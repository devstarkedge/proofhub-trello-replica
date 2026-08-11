import React, { useState, useEffect, useCallback, useContext, lazy, Suspense } from 'react';
import { AlertTriangle, ListChecks, ChevronRight } from 'lucide-react';
import WorkspaceContext from '../../context/WorkspaceContext';
import { getWorkspaceSetupStatus } from '../../services/workspaceSetupApi';
import QuickCreateDepartmentForm from './QuickCreateDepartmentForm';

// Lazy, matching WorkspaceSwitcher's own lazy import of this same component
// — a static import here would pull it into this banner's chunk and defeat
// the code-splitting either place is trying to get.
const WorkspaceOnboardingChecklist = lazy(() => import('./WorkspaceOnboardingChecklist'));

/**
 * Surfaces this workspace's live setup status (GET /setup-status), computed
 * fresh every time — never a persisted/stale flag. `variant="urgent"` only
 * renders when the CURRENT workspace has zero departments (the case that
 * matters for workspaces created before this feature shipped — Board.department
 * is a hard schema requirement, so nothing else works until this is fixed).
 * `variant="full"` is a lower-key, always-visible progress summary for
 * Workspace Settings.
 */
const WorkspaceSetupBanner = ({ variant = 'full' }) => {
  const { currentWorkspace } = useContext(WorkspaceContext);
  const [status, setStatus] = useState(null);
  const [showChecklist, setShowChecklist] = useState(false);

  const refresh = useCallback(async () => {
    if (!currentWorkspace?._id) return;
    try {
      const data = await getWorkspaceSetupStatus(currentWorkspace._id);
      setStatus(data);
    } catch (err) {
      console.error('Failed to load workspace setup status:', err);
    }
  }, [currentWorkspace?._id]);

  useEffect(() => {
    setStatus(null);
    refresh();
  }, [refresh]);

  if (!status) return null;

  if (variant === 'urgent') {
    if (!status.needsSetup) return null;
    return (
      <div className="rounded-2xl border-2 p-4 mb-4" style={{ borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.08)' }}>
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              This workspace needs a department
            </p>
            <p className="text-xs mt-0.5 mb-3" style={{ color: 'var(--color-text-secondary)' }}>
              Projects can&apos;t be created until at least one department exists.
            </p>
            <QuickCreateDepartmentForm onCreated={refresh} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowChecklist(true)}
        className="w-full flex items-center gap-3 rounded-2xl border p-4 mb-4 text-left transition-colors hover:bg-gray-500/5"
        style={{ borderColor: 'var(--color-border-default)', backgroundColor: 'var(--color-card-bg)' }}
      >
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
          <ListChecks size={18} className="text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Workspace setup</p>
          <div className="w-full h-1.5 rounded-full mt-1.5 overflow-hidden" style={{ backgroundColor: 'var(--color-bg-muted)' }}>
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${status.completionPercent}%` }} />
          </div>
        </div>
        <span className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>{status.completionPercent}%</span>
        <ChevronRight size={16} style={{ color: 'var(--color-text-muted)' }} />
      </button>

      <Suspense fallback={null}>
        <WorkspaceOnboardingChecklist
          isOpen={showChecklist}
          onClose={() => setShowChecklist(false)}
          onUpdate={setStatus}
        />
      </Suspense>
    </>
  );
};

export default WorkspaceSetupBanner;
