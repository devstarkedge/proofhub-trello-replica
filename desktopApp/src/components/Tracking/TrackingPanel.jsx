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
  Monitor
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
    detailsId = useId(),
    detailsFocus = useRef(null);
  useEffect(() => {
    setDetailsOpen(false);
  }, [state?.workspaceId]);
  const [selecting, setSelecting] = useState(() =>
    new URLSearchParams(window.location.search).get('start') === '1' ? 'work' : false
  );
  const isDesktop = window.flowtaskDesktop?.isDesktop === true;
  const [native, setNative] = useState(null),
    [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const tracking = window.flowtaskDesktop?.tracking;
    if (!isDesktop || !tracking) return;
    const changed = value => setNative(normalizeDesktopTrackingStatus(value));
    const outdated = () => changed(null);
    tracking.getStatus().then(changed).catch(outdated);
    const unsubscribe = tracking.onStatus(changed);
    window.addEventListener('flowtask:desktop-update-required', outdated);
    return () => {
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
  const nativeError =
    compact && !scopedNative?.errorCode && session?.status !== 'RUNNING' && scopedNative?.error === 'Work is not running'
      ? ''
      : scopedNative?.error;

  const diagnostics = (
    <>
      {expired && <p role="status" className="text-xs text-amber-600 dark:text-amber-400">Attendance cutoff reached. Revalidating session.</p>}
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400" role="status">
        {capture.replaceAll('-', ' ')}
        {scopedNative?.pending ? ` · ${scopedNative.pending} uploads pending` : ''}
      </p>
      {isDesktop && scopedNative?.syncStatus && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400" role="status">
          Screenshots: {scopedNative.syncStatus.replaceAll('-', ' ')}
          {scopedNative.queueCapacityBytes > 0
            ? ` · ${(scopedNative.queueBytes / 1048576).toFixed(1)} / ${Math.round(
                scopedNative.queueCapacityBytes / 1048576
              )} MiB queued`
            : ''}
        </p>
      )}
      {isDesktop && scopedNative?.pending > 0 && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Pending screenshots retry automatically when connected.</p>
      )}
      {isDesktop && scopedNative?.uploadError && (
        <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">
          Upload waiting: {scopedNative.uploadError}
          {scopedNative.nextUploadRetryAt
            ? ` Next retry ${new Date(scopedNative.nextUploadRetryAt).toLocaleTimeString()}.`
            : ''}
        </p>
      )}
      {isDesktop && scopedNative?.pending > 0 && typeof window.flowtaskDesktop?.tracking?.retryUploads === 'function' && (
        <button
          disabled={retrying}
          className="mt-2 text-xs text-blue-600 dark:text-blue-400 underline cursor-pointer"
          onClick={async () => {
            setRetrying(true);
            try {
              setNative(normalizeDesktopTrackingStatus(await window.flowtaskDesktop.tracking.retryUploads()));
            } catch (e) {
              toast.error(e.message);
            } finally {
              setRetrying(false);
            }
          }}
        >
          {retrying ? 'Retrying uploads…' : 'Retry uploads now'}
        </button>
      )}
      {isDesktop && scopedNative?.protectedCopies > 0 && (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          {scopedNative.protectedCopies} damaged local copies retained for inspection. Activity remains recorded.
        </p>
      )}
      {nativeError && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{nativeError}</p>}
      {device?.lastUploadError && (
        <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">
          Desktop upload: {device.lastUploadError}
        </p>
      )}
      {isDesktop && scopedNative?.noticeRequired && (
        <button
          className="mt-2 text-xs text-blue-600 dark:text-blue-400 underline cursor-pointer"
          onClick={() => window.dispatchEvent(new Event('flowtask:monitoring-notice'))}
        >
          Review monitoring notice
        </button>
      )}
      {isDesktop &&
        !scopedNative?.noticeRequired &&
        (scopedNative?.state === 'permission-required' ||
          (scopedNative?.state === 'monitoring' && scopedNative?.error)) && (
          <button
            className="mt-2 text-xs text-blue-600 dark:text-blue-400 underline cursor-pointer"
            onClick={() => window.flowtaskDesktop.tracking.recoverPermissions().catch(e => toast.error(e.message))}
          >
            Review desktop permissions
          </button>
        )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </>
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
    const warning = Boolean(
      attendanceWarning ||
        error ||
        nativeError ||
        scopedNative?.uploadError ||
        device?.lastUploadError ||
        scopedNative?.protectedCopies
    );
    const showDetails = event => {
      detailsFocus.current = event.currentTarget;
      setDetailsView('monitoring');
      setDetailsOpen(true);
    };

    return (
      <div className="welcome-controls welcome-tracking-panel">
        <Popover.Root open={detailsOpen} onOpenChange={setDetailsOpen}>
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
              <h2 className="mb-3 text-sm font-semibold">{detailsView === 'actions' ? 'More actions' : 'Monitoring status'}</h2>
              {detailsView === 'actions' ? (
                <nav aria-label="Tracking actions" className="welcome-secondary-actions">
                  <Link to="/time-tracking">Timesheets and screenshots</Link>
                  {state.canManagePolicy && <Link to="/workspace-settings">Workspace tracking configuration</Link>}
                  {latest?.kind === 'INDIVIDUAL' && session?.status !== 'CLOSED' && state.attendance && state.canTrack && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setDetailsOpen(false);
                        setSelecting('link');
                      }}
                    >
                      Link assigned task
                    </button>
                  )}
                  <button type="button" onClick={() => setDetailsView('monitoring')}>
                    Monitoring status and recovery
                  </button>
                </nav>
              ) : (
                <>
                  {diagnostics}
                  <button type="button" className="mt-3 text-xs underline cursor-pointer" onClick={() => setDetailsView('actions')}>
                    Back to actions
                  </button>
                </>
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
      {(recovery || nativeError || scopedNative?.uploadError || device?.lastUploadError || error) && (
        <div className="mt-3 pt-2 text-xs border-t border-gray-100 dark:border-gray-800">
          {recovery}
          {diagnostics}
        </div>
      )}

      {workModal}
    </div>
  );
}
