import { memo, useEffect, useState, useId, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Popover } from 'radix-ui';
import {
  Clock3,
  FolderKanban,
  ArrowLeftRight,
  Coffee,
  Play,
  MoreHorizontal,
  CloudUpload,
  TriangleAlert,
  Settings,
  Link2,
  Monitor,
  ArrowLeft,
  RefreshCw,
  HardDrive,
  AlertCircle,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { toast } from 'react-toastify';
import useSessionAction from '../../hooks/useSessionAction';
import useWorkTracking from '../../hooks/useWorkTracking';
import { normalizeDesktopTrackingStatus, DESKTOP_RESTART_MESSAGE } from '../../services/desktopTracking';
import { changeWork, errorMessage } from '../../services/trackingApi';
import { Button } from '../ui/button';
import WorkSelectionModal from './WorkSelectionModal';
import { formatTrackingClock as duration } from '../../utils/duration';
import useSessionClock from '../../hooks/useSessionClock';
import { monitoringAttention } from '../../../../shared/trackingAttention.mjs';

const TrackingClock = memo(function TrackingClock({ state, kind }) {
  const now = useSessionClock();
  const clock = state.unconfirmedAt ?? now;
  const delta = Math.max(
    0,
    Math.min(
      (clock - state.receivedAt) / 1000,
      state.attendance?.cutoffAt
        ? (+new Date(state.attendance.cutoffAt) - +new Date(state.serverNow)) / 1000
        : Infinity
    )
  );
  const session = state.session;
  const value =
    kind === 'office'
      ? state.attendance
        ? Math.max(
            0,
            (Math.min(
              +new Date(state.serverNow) + delta * 1000,
              state.attendance.cutoffAt ? +new Date(state.attendance.cutoffAt) : Infinity
            ) -
              +new Date(state.attendance.checkInAt)) /
              1000
          )
        : 0
      : kind === 'assigned'
      ? (session?.totals.assignedSeconds || 0) +
        (session?.status === 'RUNNING' && session.segments.at(-1)?.kind === 'TASK' ? delta : 0)
      : (session?.totals.workSeconds || 0) + (session?.status === 'RUNNING' ? delta : 0);
  return <span>{duration(value)}</span>;
});

function MonitoringStatusDetails({
  capture = '',
  scopedNative = null,
  isDesktop = false,
  retrying = false,
  onRetryUploads,
  expired = false,
  nativeError = '',
  hasAttention = false,
  error = null,
  onBack,
  hasBackButton = true,
  backTitle = 'Back'
}) {
  return (
    <div className="space-y-2.5 text-left">
      {/* Header with back button & status pill */}
      <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-1.5">
          {hasBackButton && (
            <button
              type="button"
              onClick={onBack}
              className="p-1 -ml-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
              title={backTitle}
              aria-label={backTitle}
            >
              <ArrowLeft size={15} />
            </button>
          )}
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Monitoring Status</h2>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
            hasAttention
              ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800'
              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              hasAttention ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
            }`}
          />
          <span className="capitalize">{capture.replaceAll('-', ' ')}</span>
        </span>
      </div>

      {/* Expired warning */}
      {expired && (
        <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <AlertCircle size={13} className="shrink-0 text-amber-600 dark:text-amber-400" />
          <span>Attendance cutoff reached. Revalidating session.</span>
        </div>
      )}

      {/* Screenshots Buffer & Storage Card */}
      {isDesktop && scopedNative && (
        <div className="p-2.5 rounded-xl bg-gray-50/80 dark:bg-gray-800/40 border border-gray-200/80 dark:border-gray-800 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-medium text-gray-700 dark:text-gray-300">
              <HardDrive size={13} className="text-gray-400 shrink-0" />
              Screenshot Buffer
            </span>
            {scopedNative.queueCapacityBytes > 0 && (
              <span className="text-[11px] font-mono text-gray-500 dark:text-gray-400">
                {(scopedNative.queueBytes / 1048576).toFixed(1)} / {Math.round(scopedNative.queueCapacityBytes / 1048576)} MiB
              </span>
            )}
          </div>

          {scopedNative.queueCapacityBytes > 0 && (
            <div className="w-full h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  scopedNative.queueBytes / scopedNative.queueCapacityBytes > 0.85
                    ? 'bg-amber-500'
                    : 'bg-blue-500'
                }`}
                style={{
                  width: `${Math.min(100, Math.max(3, (scopedNative.queueBytes / scopedNative.queueCapacityBytes) * 100))}%`
                }}
              />
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 pt-0.5">
            <span className="flex items-center gap-1">
              Sync: <strong className="font-medium text-gray-700 dark:text-gray-200 capitalize">{scopedNative.syncStatus?.replaceAll('-', ' ') || 'Connected'}</strong>
            </span>
            {scopedNative.pending > 0 ? (
              <span className="font-medium text-amber-600 dark:text-amber-400">
                {scopedNative.pending} pending upload{scopedNative.pending === 1 ? '' : 's'}
              </span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                <CheckCircle2 size={11} className="text-emerald-500" /> All synced
              </span>
            )}
          </div>
        </div>
      )}

      {!isDesktop && (
        <div className="p-2.5 rounded-xl bg-gray-50/80 dark:bg-gray-800/40 border border-gray-200/80 dark:border-gray-800 text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-medium text-gray-700 dark:text-gray-300">
            <Monitor size={13} className="text-gray-400" />
            <span>Web Interface</span>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Desktop application is required for automated activity tracking and screenshot capture.
          </p>
        </div>
      )}

      {/* Upload Waiting Error / Notice Card */}
      {isDesktop && scopedNative?.uploadError && (
        <div className="p-2.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 space-y-1.5 text-xs">
          <div className="flex items-start gap-2">
            <AlertCircle size={14} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-amber-900 dark:text-amber-200 text-[10px] uppercase tracking-wider">
                Upload Waiting
              </div>
              <p className="text-[11px] text-amber-800 dark:text-amber-300/90 leading-relaxed mt-0.5">
                {scopedNative.uploadError}
              </p>
            </div>
          </div>
          {scopedNative.nextUploadRetryAt && (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 pl-5 font-medium">
              <Clock size={11} />
              <span>Next retry at {new Date(scopedNative.nextUploadRetryAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            </div>
          )}
        </div>
      )}

      {/* Pending uploads automatic retry notice */}
      {isDesktop && scopedNative?.pending > 0 && !scopedNative?.uploadError && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 text-[11px] text-blue-700 dark:text-blue-300">
          <CloudUpload size={13} className="shrink-0" />
          <span>Pending screenshots retry automatically once connected.</span>
        </div>
      )}

      {/* Protected copies notice */}
      {isDesktop && scopedNative?.protectedCopies > 0 && (
        <div className="p-2 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/50 text-[11px] text-amber-800 dark:text-amber-300">
          {scopedNative.protectedCopies} damaged local copies retained for inspection. Activity remains recorded.
        </div>
      )}

      {/* Permission notice / Review notice */}
      {isDesktop && scopedNative?.noticeRequired && (
        <button
          type="button"
          className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors cursor-pointer"
          onClick={() => window.dispatchEvent(new Event('flowtask:monitoring-notice'))}
        >
          Review monitoring notice
        </button>
      )}

      {/* Permission required / Denied */}
      {isDesktop &&
        !scopedNative?.noticeRequired &&
        (scopedNative?.state === 'permission-required' ||
          scopedNative?.state === 'permission-denied' ||
          scopedNative?.permission === 'denied') && (
          <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-xs space-y-2">
            <p className="text-[11px] text-amber-800 dark:text-amber-300">
              Screen recording permission is required on this desktop. Review system preferences to continue tracking.
            </p>
            {typeof window.flowtaskDesktop?.tracking?.recoverPermissions === 'function' && (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                onClick={() => window.flowtaskDesktop.tracking.recoverPermissions().catch(e => toast.error(e.message))}
              >
                Review desktop permissions
              </button>
            )}
          </div>
        )}

      {/* Generic error alerts */}
      {(nativeError || error) && (
        <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-medium text-rose-700 dark:text-rose-400">
            <AlertCircle size={13} className="shrink-0" />
            <span>Monitoring Issue</span>
          </div>
          <p className="text-[11px] text-rose-600 dark:text-rose-300 pl-4.5">
            {nativeError || error || 'Restart the FlowTask desktop app if this persists.'}
          </p>
        </div>
      )}

      {/* Footer Actions (Only shown if retry uploads is possible) */}
      {isDesktop && scopedNative?.pending > 0 && typeof window.flowtaskDesktop?.tracking?.retryUploads === 'function' && (
        <div className="pt-2 mt-2 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end">
          <button
            type="button"
            disabled={retrying||scopedNative.syncStatus==='uploading'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-sm disabled:opacity-50 cursor-pointer transition-colors"
            onClick={onRetryUploads}
          >
            <RefreshCw size={12} className={retrying||scopedNative.syncStatus==='uploading' ? 'animate-spin' : ''} />
            <span>{retrying ? 'Retrying…' : scopedNative.syncStatus==='uploading' ? 'Uploading…' : 'Retry uploads now'}</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default function TrackingPanel({
  compact = false,
  attendanceHeader,
  attendanceActions,
  attendanceDetails,
  attendanceWarning = false
}) {
  const { state, error, reload, expired } = useWorkTracking();
  const sessionAction = useSessionAction(),
    busy = sessionAction.busy || Boolean(error) || expired;
  const [detailsOpen, setDetailsOpen] = useState(false),
    [detailsView, setDetailsView] = useState('actions'),
    [entrySource, setEntrySource] = useState(null),
    detailsId = useId(),
    detailsFocus = useRef(null);

  const handleOpenChange = open => {
    setDetailsOpen(open);
    if (!open) {
      setDetailsView('actions');
      setEntrySource(null);
    }
  };

  const handleMonitoringBack = () => {
    if (entrySource === 'trackingActions') {
      setDetailsView('actions');
    } else {
      setDetailsOpen(false);
      setDetailsView('actions');
      setEntrySource(null);
    }
  };

  useEffect(() => {
    setDetailsOpen(false);
    setDetailsView('actions');
    setEntrySource(null);
  }, [state?.workspaceId]);
  const [selecting, setSelecting] = useState(() =>
    new URLSearchParams(window.location.search).get('start') === '1' ? 'work' : false
  );
  const isDesktop = window.flowtaskDesktop?.isDesktop === true;
  const nativeRevision = useRef(0);
  const [native, setNative] = useState(null),
    [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const tracking = window.flowtaskDesktop?.tracking;
    if (!isDesktop || !tracking) return;
    let active = true;
    let receivedEvent = false;
    const changed = value => {
      receivedEvent = true;
      nativeRevision.current += 1;
      if (active) setNative(normalizeDesktopTrackingStatus(value));
    };
    const outdated = () => changed(null);
    const unsubscribe = tracking.onStatus(changed);
    tracking.getStatus().then(value => {
      if (active && !receivedEvent) setNative(normalizeDesktopTrackingStatus(value));
    }).catch(() => {
      if (active && !receivedEvent) outdated();
    });
    window.addEventListener('flowtask:desktop-update-required', outdated);
    return () => {
      active = false;
      unsubscribe?.();
      window.removeEventListener('flowtask:desktop-update-required', outdated);
    };
  }, [isDesktop]);

  if (!state)
    return compact ? (
      <div className="welcome-controls welcome-tracking-panel">
        <div className="welcome-tracking-header">
          <span>Time Tracking</span>
          {attendanceHeader}
        </div>
        <p role={error ? 'alert' : 'status'} className="py-3 text-sm">
          {error || 'Loading work tracking…'}
        </p>
        {error && (
          <button className="welcome-action" onClick={reload}>
            Retry tracking
          </button>
        )}
        <div className="welcome-actions">{attendanceActions}</div>
        {attendanceDetails && (
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer">
              Attendance details{attendanceWarning ? ' · Needs attention' : ''}
            </summary>
            <div className="mt-2">{attendanceDetails}</div>
          </details>
        )}
      </div>
    ) : (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 text-sm text-gray-500 dark:text-gray-400">
        <p role="status">{error || 'Loading work tracking…'}</p>
      </div>
    );

  const session = state.session,
    open = session?.segments.find(s => !s.endedAt),
    latest = open || session?.segments.at(-1);
  const device =
    state.devices.find(d => d.connected && d.activeSession === session?._id) ||
    state.devices.find(d => d.connected);
  const scopedNative = native?.updateRequired
    ? native
    : native?.workspaceId === String(state.workspaceId) && native?.userId === state.userId
    ? native
    : null;
  const capture = isDesktop
    ? scopedNative?.state || device?.state || 'unavailable'
    : device
    ? `Connected desktop · ${device.state}`
    : 'Capture unavailable · desktop app required';

  const action = async (name, selection = null, operationId = crypto.randomUUID()) => {
    if (busy) return false;
    const payload = { selection, operationId, expectedRevision: session?.revision ?? null };
    try {
      const result = await sessionAction.run(
        { kind: 'work', action: name, operationId, sessionId: session?._id, payload },
        () => changeWork(name, payload)
      );
      const tracking = window.flowtaskDesktop?.tracking;
      if (tracking?.transitionSession)
        tracking
          .transitionSession({
            ...result.session,
            workspaceId: state.workspaceId,
            userId: state.userId
          })
          .catch(() => {
            window.dispatchEvent(new Event('flowtask:desktop-update-required'));
            toast.warning(DESKTOP_RESTART_MESSAGE);
          });
      else {
        if (name === 'pause' && isDesktop) toast.warning(DESKTOP_RESTART_MESSAGE);
        tracking?.refresh?.()?.catch(() => {});
      }
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      reload();
      return false;
    }
  };

  const transitionLabel =
    sessionAction.phase === 'PENDING'
      ? {
          pause: 'Pausing...',
          resume: 'Resuming...',
          switch: 'Switching...',
          link: 'Linking...',
          start: 'Starting...'
        }[sessionAction.action]
      : null;
  const attention = monitoringAttention({
    native: scopedNative,
    device,
    sessionStatus: session?.status,
    enabled: state.policy.enabled,
    monitoringEnabled: state.policy.monitoringEnabled,
    expired,
    error
  });
  const nativeError = attention.monitoringError;

  const handleRetryUploads = async () => {
    if (typeof window.flowtaskDesktop?.tracking?.retryUploads !== 'function') return;
    setRetrying(true);
    const revision = nativeRevision.current;
    try {
      const result = await window.flowtaskDesktop.tracking.retryUploads();
      if (revision === nativeRevision.current) setNative(normalizeDesktopTrackingStatus(result));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setRetrying(false);
    }
  };

  const diagnostics = (
    <MonitoringStatusDetails
      capture={capture}
      scopedNative={scopedNative}
      isDesktop={isDesktop}
      retrying={retrying}
      onRetryUploads={handleRetryUploads}
      expired={expired}
      nativeError={nativeError}
      hasAttention={attention.needsAttention}
      error={error}
      hasBackButton={false}
    />
  );

  const recovery = sessionAction.phase === 'RECONCILIATION_REQUIRED' && (
    <p role="alert" className="mt-2 text-xs text-amber-600 dark:text-amber-400">
      {sessionAction.error}{' '}
      <button type="button" className="underline cursor-pointer" onClick={() => sessionAction.recover()}>
        Verify status
      </button>{' '}
      <button
        type="button"
        className="underline cursor-pointer"
        onClick={() => sessionAction.retry().catch(e => toast.error(errorMessage(e)))}
      >
        Retry safely
      </button>
    </p>
  );

  const workModal = selecting && state.canTrack && (
    <WorkSelectionModal
      currentSession={session}
      linking={selecting === 'link'}
      onClose={() => setSelecting(false)}
      onConfirm={(selection, operationId) =>
        action(selecting === 'link' ? 'link' : session ? 'switch' : 'start', selection, operationId)
      }
    />
  );

  if (compact) {
    const running = state.policy.enabled && session?.status === 'RUNNING',
      paused = session?.status === 'PAUSED';
    const label = !state.policy.enabled ? 'Disabled' : running ? 'Running' : paused ? 'Paused' : 'Enabled';
    const project = latest
      ? latest.attributedProjectName ||
        (latest.agenda ? `${latest.agendaTitle} — ${latest.description}` : latest.projectName)
      : 'No work selected';
    const task = latest
      ? latest.attributedTaskTitle || (latest.kind === 'TASK' ? latest.taskTitle : 'Individual agenda work')
      : 'Start work after checking in';
    const warning = attention.needsAttention;
    const showDetails = event => {
      detailsFocus.current = event.currentTarget;
      setEntrySource('needsAttention');
      setDetailsView('monitoring');
      setDetailsOpen(true);
    };

    return (
      <div className="welcome-controls welcome-tracking-panel">
        <Popover.Root open={detailsOpen} onOpenChange={handleOpenChange}>
          <div className="welcome-tracking-header">
            <div className="welcome-tracking-state">
              <span className={`welcome-status-dot ${running ? 'is-running' : paused ? 'is-paused' : ''}`} aria-hidden="true" />
              <span>Time Tracking</span>
              <span className={`welcome-state-badge ${running ? 'is-running' : ''}`}>{label}</span>
            </div>
            <div className="welcome-header-actions">
              {attendanceHeader}
              <Popover.Trigger asChild>
                <button
                  type="button"
                  className="welcome-more"
                  aria-label="More tracking actions"
                  onClick={event => {
                    detailsFocus.current = event.currentTarget;
                    setDetailsView('actions');
                  }}
                >
                  <MoreHorizontal size={19} />
                </button>
              </Popover.Trigger>
            </div>
          </div>
          <div className="welcome-tracking-context">
            <div className="welcome-project">
              <span className="welcome-project-icon">
                <FolderKanban size={20} />
              </span>
              <div className="min-w-0">
                <p title={project} className="welcome-project-name">
                  {project}
                </p>
                <p title={task} className="welcome-task-name">
                  {task}
                </p>
              </div>
            </div>
            <div className="welcome-timer">
              <span>Work</span>
              <strong>
                <Clock3 size={14} />
                <span>
                  <TrackingClock state={state} kind="work" />
                </span>
              </strong>
            </div>
            <div className="welcome-timer">
              <span>Office</span>
              <strong>
                <Clock3 size={14} />
                <span>
                  <TrackingClock state={state} kind="office" />
                </span>
              </strong>
            </div>
          </div>
          <div className="welcome-actions">
            {state.attendance && state.canTrack && (
              <>
                <button
                  type="button"
                  className="welcome-action welcome-action-primary"
                  disabled={busy}
                  onClick={() => setSelecting('work')}
                >
                  <ArrowLeftRight size={15} />
                  {(['switch', 'start', 'link'].includes(sessionAction.action) && transitionLabel) ||
                    (session ? 'Switch Work' : 'Start Work')}
                </button>
                {session && session.status !== 'CLOSED' && (paused || state.policy.personalPauseEnabled !== false) && (
                  <button
                    type="button"
                    className="welcome-action"
                    disabled={busy}
                    aria-busy={busy}
                    style={{ minWidth: 114 }}
                    onClick={() => action(running ? 'pause' : 'resume')}
                  >
                    {running ? <Coffee size={15} /> : <Play size={15} />}
                    <span>
                      {(['pause', 'resume'].includes(sessionAction.action) && transitionLabel) ||
                        (running ? 'Take Break' : 'Resume Work')}
                    </span>
                  </button>
                )}
              </>
            )}
            {attendanceActions}
          </div>
          {transitionLabel && (
            <p role="status" className="text-xs">
              {sessionAction.action === 'pause'
                ? 'Resume Work will be available once the pause is confirmed.'
                : 'Waiting for the server to confirm this change.'}
            </p>
          )}
          {recovery}
          {attendanceDetails && <div className="welcome-attendance-info">{attendanceDetails}</div>}
          {latest?.agenda && latest.attributedTask && (
            <p className="welcome-work-provenance">
              Origin: {latest.agendaTitle} — {latest.description} · Task attribution: {latest.attributionIncluded ? 'Yes' : 'No'}
            </p>
          )}
          {latest?.assignedAt && (
            <p className="welcome-work-provenance">
              Assigned {new Date(latest.assignedAt).toLocaleString()} · pre-assignment {duration(session.totals.preAssignmentSeconds)} · assigned <TrackingClock state={state} kind="assigned" />
            </p>
          )}
          {(scopedNative?.pending > 0 || warning) && (
            <div className="welcome-monitoring-summary" role="status">
              {scopedNative?.pending > 0 && (
                <button
                  type="button"
                  className="welcome-status-chip"
                  onClick={showDetails}
                  aria-expanded={detailsOpen}
                  aria-controls={detailsId}
                  aria-haspopup="dialog"
                >
                  <CloudUpload size={13} />
                  {scopedNative.pending} uploads pending
                </button>
              )}
              {warning && (
                <button
                  type="button"
                  className="welcome-status-chip welcome-warning-chip"
                  onClick={showDetails}
                  aria-expanded={detailsOpen}
                  aria-controls={detailsId}
                  aria-haspopup="dialog"
                >
                  <TriangleAlert size={13} />
                  Needs attention
                </button>
              )}
            </div>
          )}
          <Popover.Portal>
            <Popover.Content
              id={detailsId}
              sideOffset={10}
              collisionPadding={12}
              align="end"
              className="welcome-details-popover"
              aria-label={detailsView === 'actions' ? 'More tracking actions' : 'Monitoring status'}
              onCloseAutoFocus={event => {
                if (detailsFocus.current?.isConnected) {
                  event.preventDefault();
                  detailsFocus.current.focus();
                }
              }}
            >
              {detailsView === 'actions' ? (
                <div>
                  <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-gray-100 dark:border-gray-800">
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Tracking Actions</h2>
                  </div>
                  <nav aria-label="Tracking actions" className="welcome-secondary-actions">
                    <Link to="/time-tracking" className="flex items-center gap-2.5">
                      <Clock3 size={14} className="text-gray-400 shrink-0" />
                      <span>Timesheets and screenshots</span>
                    </Link>
                    {state.canManagePolicy && (
                      <Link to="/workspace-settings" className="flex items-center gap-2.5">
                        <Settings size={14} className="text-gray-400 shrink-0" />
                        <span>Workspace tracking configuration</span>
                      </Link>
                    )}
                    {latest?.kind === 'INDIVIDUAL' && session?.status !== 'CLOSED' && state.attendance && state.canTrack && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setDetailsOpen(false);
                          setDetailsView('actions');
                          setEntrySource(null);
                          setSelecting('link');
                        }}
                        className="flex items-center gap-2.5 w-full text-left cursor-pointer"
                      >
                        <Link2 size={14} className="text-gray-400 shrink-0" />
                        <span>Link assigned task</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setEntrySource('trackingActions');
                        setDetailsView('monitoring');
                      }}
                      className="flex items-center justify-between gap-2 w-full text-left cursor-pointer"
                    >
                      <span className="flex items-center gap-2.5">
                        <Monitor size={14} className="text-gray-400 shrink-0" />
                        <span>Monitoring status & recovery</span>
                      </span>
                      {scopedNative?.pending > 0 && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                          {scopedNative.pending}
                        </span>
                      )}
                    </button>
                  </nav>
                </div>
              ) : (
                <MonitoringStatusDetails
                  capture={capture}
                  scopedNative={scopedNative}
                  isDesktop={isDesktop}
                  retrying={retrying}
                  onRetryUploads={handleRetryUploads}
                  expired={expired}
                  nativeError={nativeError}
                  hasAttention={attention.needsAttention}
                  error={error}
                  onBack={handleMonitoringBack}
                  hasBackButton={true}
                  backTitle={entrySource === 'trackingActions' ? 'Back to actions' : 'Close'}
                />
              )}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        {workModal}
      </div>
    );
  }

  const isRunning = session?.status === 'RUNNING';
  const isPaused = session?.status === 'PAUSED';

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-5 md:p-6 text-left transition-all">
      {/* Header status bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-gray-100 dark:border-gray-800 text-xs">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
              isRunning
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                : isPaused
                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isRunning ? 'bg-emerald-500 animate-pulse' : isPaused ? 'bg-amber-500' : 'bg-gray-400'
              }`}
            />
            {isRunning ? 'Tracking Active' : isPaused ? 'Tracking Paused' : 'Time Tracking'}
          </span>
          <span className="text-gray-300 dark:text-gray-600">·</span>
          <span className="text-gray-500 dark:text-gray-400 capitalize">
            {state.policy.activationState?.replaceAll('_', ' ').toLowerCase()}
          </span>
        </div>

        {state.canManagePolicy && (
          <Link
            to="/workspace-settings"
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors"
          >
            <Settings size={13} />
            <span>Workspace configuration</span>
          </Link>
        )}
      </div>

      {/* Main Row: Context & Clocks */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
        {/* Left: Agenda/Project info */}
        <div className="md:col-span-7 space-y-1.5 min-w-0">
          {latest ? (
            <>
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 shrink-0">
                  <FolderKanban size={20} />
                </div>
                <div className="min-w-0">
                  <h3
                    className="font-bold text-base md:text-lg text-gray-900 dark:text-gray-100 truncate"
                    title={latest.agenda ? `${latest.agendaTitle} — ${latest.description}` : latest.projectName}
                  >
                    {latest.agenda ? `${latest.agendaTitle} — ${latest.description}` : latest.projectName}
                  </h3>
                  <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5 mt-0.5">
                    <span>{latest.kind === 'TASK' ? latest.taskTitle : 'Individual agenda work'}</span>
                    <span>·</span>
                    <span className="capitalize font-medium text-gray-700 dark:text-gray-300">
                      {session?.status?.toLowerCase() || 'running'}
                    </span>
                  </p>
                </div>
              </div>
              {latest?.assignedAt && (
                <p className="text-[11px] text-gray-400 dark:text-gray-500 pl-11">
                  Assigned {new Date(latest.assignedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · Pre-assignment {duration(session.totals.preAssignmentSeconds)}
                </p>
              )}
            </>
          ) : (
            <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400 py-1">
              <FolderKanban size={20} className="text-gray-400" />
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">No work active</p>
                <p className="text-xs">Start or switch work to begin tracking time.</p>
              </div>
            </div>
          )}
        </div>

        {/* Right: Timer counters */}
        <div className="md:col-span-5 flex items-center justify-start md:justify-end gap-3">
          <div className="flex-1 md:flex-initial min-w-[125px] p-3 rounded-xl border border-blue-100 dark:border-blue-950/80 bg-blue-50/50 dark:bg-blue-950/30">
            <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 text-[11px] font-semibold uppercase tracking-wider mb-0.5">
              <Clock3 size={12} />
              <span>Work Time</span>
            </div>
            <div className="text-xl md:text-2xl font-bold font-mono tracking-tight text-gray-900 dark:text-white tabular-nums">
              <TrackingClock state={state} kind="work" />
            </div>
          </div>

          <div className="flex-1 md:flex-initial min-w-[125px] p-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-850/60">
            <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 text-[11px] font-semibold uppercase tracking-wider mb-0.5">
              <Clock3 size={12} />
              <span>Office Time</span>
            </div>
            <div className="text-xl md:text-2xl font-bold font-mono tracking-tight text-gray-700 dark:text-gray-300 tabular-nums">
              <TrackingClock state={state} kind="office" />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar: Action buttons & Device connection */}
      <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {state.attendance && state.canTrack ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setSelecting('work')}
              className="gap-1.5 text-xs font-medium cursor-pointer"
            >
              <ArrowLeftRight size={13} />
              <span>{session ? 'Switch work' : 'Start work'}</span>
            </Button>

            {latest?.kind === 'INDIVIDUAL' && session?.status !== 'CLOSED' && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => setSelecting('link')}
                className="gap-1.5 text-xs font-medium cursor-pointer"
              >
                <Link2 size={13} />
                <span>Link assigned task</span>
              </Button>
            )}

            {session && session.status !== 'CLOSED' && (session.status === 'PAUSED' || state.policy.personalPauseEnabled !== false) && (
              <Button
                size="sm"
                variant={isRunning ? 'secondary' : 'default'}
                disabled={busy}
                aria-busy={busy}
                onClick={() => action(isRunning ? 'pause' : 'resume')}
                className="gap-1.5 text-xs font-medium min-w-[110px] cursor-pointer"
              >
                {isRunning ? <Coffee size={13} /> : <Play size={13} />}
                <span>
                  {(['pause', 'resume'].includes(sessionAction.action) && transitionLabel) ||
                    (isRunning ? 'Take Break' : 'Resume Work')}
                </span>
              </Button>
            )}
          </div>
        ) : (
          <div className="text-xs text-gray-400">
            {state.attendance ? 'Tracking not permitted' : 'Check in to start tracking'}
          </div>
        )}

        {/* Connected desktop monitoring status */}
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <Monitor size={14} className="text-gray-400" />
          <span className="capitalize">{capture.replaceAll('-', ' ')}</span>
          {scopedNative?.pending > 0 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium">
              {scopedNative.pending} pending
            </span>
          )}
        </div>
      </div>

      {/* Recovery / Diagnostics notices */}
      {(recovery || attention.needsAttention) && (
        <div className="mt-3 pt-2 text-xs border-t border-gray-100 dark:border-gray-800">
          {recovery}
          {diagnostics}
        </div>
      )}

      {workModal}
    </div>
  );
}
