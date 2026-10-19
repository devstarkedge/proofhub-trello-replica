import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Calendar, 
  Clock, 
  Briefcase, 
  Activity, 
  MousePointer, 
  Keyboard, 
  ShieldCheck, 
  PauseCircle
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getTimeline, errorMessage } from '../../services/trackingApi';
import { formatTrackingClock as duration } from '../../utils/duration';
import ScreenshotGallery from './ScreenshotGallery';
import useTrackingScope from './useTrackingScope';
import { Button } from '../ui/button';

const formatTime = (value, timezone) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleTimeString(undefined, {
      timeZone: timezone || 'UTC',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return String(value);
  }
};

const formatTimeRange = (start, end, timezone, fallbackEnd = 'Ongoing') => {
  if (!start) return '—';
  const startTime = formatTime(start, timezone);
  if (!end) return `${startTime} – ${fallbackEnd}`;
  const endTime = formatTime(end, timezone);

  try {
    const startDateStr = new Date(start).toLocaleDateString(undefined, { timeZone: timezone || 'UTC' });
    const endDateStr = new Date(end).toLocaleDateString(undefined, { timeZone: timezone || 'UTC' });
    if (startDateStr !== endDateStr) {
      return `${startTime} – ${endTime} (${endDateStr})`;
    }
  } catch {}
  return `${startTime} – ${endTime}`;
};

const workTitle = s => s.attributedTaskTitle 
  ? `${s.attributedProjectName} / ${s.attributedTaskTitle} (origin: ${s.agendaTitle} — ${s.description})`
  : s.agenda ? `${s.agendaTitle} — ${s.description}` : `${s.projectName || 'Project'} / ${s.taskTitle || 'Individual'}`;

export default function DailyTrackingDetailsModal({ session, timezone, filterKey, onClose }) {
  const scope = useTrackingScope();
  const rootRef = useRef(null);

  // Close on Escape only if this is the topmost dialog
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        const openDialogs = document.querySelectorAll('[role="dialog"]');
        if (openDialogs.length > 0 && openDialogs[openDialogs.length - 1] !== rootRef.current) {
          return;
        }
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  // Lock scroll on background while modal is open
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const timelineQuery = useQuery({
    queryKey: ['tracking-private', scope, 'timeline', session._id, session.revision, filterKey],
    queryFn: ({ signal }) => getTimeline(session._id, undefined, { ...(filterKey ? JSON.parse(filterKey) : {}), summaryOnly: false }, signal),
    staleTime: 15000,
    retry: false
  });

  const timelineData = timelineQuery.data;
  const timelineError = timelineQuery.error ? errorMessage(timelineQuery.error) : '';
  const evidence = timelineData?.evidence;

  // Format date display
  const formattedDate = (() => {
    try {
      const d = new Date(session.startedAt || (session.workDateKey + 'T12:00:00Z'));
      return d.toLocaleDateString(undefined, { timeZone: timezone || 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return session.workDateKey;
    }
  })();

  const presenceStatus = session.attendance?.day?.attendanceStatus || 
    session.attendance?.day?.presenceState || 
    session.attendance?.status || 
    'Awaiting Resolution';

  return createPortal(
    <div 
      className="fixed inset-0 z-[120] flex justify-end bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <section
        ref={rootRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-tracking-details-title"
        className="w-full sm:max-w-3xl md:max-w-4xl h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300"
        style={{
          backgroundColor: 'var(--color-card-bg, #ffffff)',
          color: 'var(--color-text-primary, #0f172a)',
          borderColor: 'var(--color-border-default, rgba(0,0,0,0.1))'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/30 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0 border border-blue-100/60 dark:border-blue-800/40">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="daily-tracking-details-title" className="font-bold text-base text-gray-900 dark:text-gray-100">
                  {formattedDate}
                </h2>
                <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                  {session.workDateKey}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {session.userName ? `${session.userName} · ` : ''}{workTitle(session.segments?.at(-1) || {})}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
              <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-1">
                <Clock className="w-3.5 h-3.5 text-blue-500" />
                <span>Work Duration</span>
              </div>
              <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">
                {duration(session.totals?.workSeconds || 0)}
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
              <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-1">
                <Briefcase className="w-3.5 h-3.5 text-indigo-500" />
                <span>Office Time</span>
              </div>
              <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">
                {session.attendance?.measuredOfficeSeconds === null ? 'Pending' : duration(session.attendance?.measuredOfficeSeconds || 0)}
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
              <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>Attendance</span>
              </div>
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate mt-1">
                {presenceStatus}
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
              <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-1">
                <Activity className="w-3.5 h-3.5 text-emerald-500" />
                <span>Activity Rate</span>
              </div>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {evidence?.activityPercent !== null && evidence?.activityPercent !== undefined
                  ? `${evidence.activityPercent.toFixed(1)}%`
                  : 'N/A'}
              </p>
            </div>
          </div>

          {/* Activity Evidence Sub-panel */}
          {evidence && (
            <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-blue-50/30 dark:bg-blue-950/10 text-xs space-y-2">
              <div className="flex items-center justify-between font-semibold text-gray-800 dark:text-gray-200">
                <span>Input Activity & Evidence</span>
                <span className="text-gray-500 dark:text-gray-400 font-normal">
                  Recorded in {timezone || 'UTC'}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-gray-600 dark:text-gray-300">
                <div className="flex items-center gap-1.5">
                  <Keyboard className="w-3.5 h-3.5 text-gray-400" />
                  <span>Keydowns: <strong>{evidence.keyboardCount ?? 'N/A'}</strong></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <MousePointer className="w-3.5 h-3.5 text-gray-400" />
                  <span>Mouse Clicks: <strong>{evidence.mouseCount ?? 'N/A'}</strong></span>
                </div>
                <div>
                  <span>Eligible Coverage: <strong>{duration(evidence.eligibleInputSeconds || 0)}</strong></span>
                </div>
                <div>
                  <span>Captures: <strong>{evidence.capturedWindows ?? 0}/{evidence.eligibleWindows ?? 0}</strong></span>
                </div>
              </div>
            </div>
          )}

          {timelineError && (
            <div role="alert" className="p-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
              {timelineError}
            </div>
          )}

          {/* Work Segments Breakdown */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Work & Break Segments
            </h3>
            <div className="divide-y divide-gray-100 dark:divide-gray-800 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden text-xs">
              {session.segments?.map((seg, idx) => (
                <div key={seg._id || idx} className="p-3 bg-white dark:bg-gray-900 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{workTitle(seg)}</p>
                    <p className="text-gray-500 dark:text-gray-400 text-[11px] mt-0.5">
                      {formatTimeRange(seg.startedAt, seg.endedAt, timezone, 'Currently active')}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 shrink-0">
                    {seg.kind}
                  </span>
                </div>
              ))}
              {(session.pauses || []).map((p, idx) => (
                <div key={`pause-${idx}`} className="p-3 bg-amber-50/40 dark:bg-amber-950/10 flex items-center justify-between gap-3 text-amber-800 dark:text-amber-300">
                  <div className="flex items-center gap-2">
                    <PauseCircle className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>Personal Pause: {formatTimeRange(p.startedAt, p.endedAt, timezone, 'Ongoing')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Full Screenshot Gallery for that selected date */}
          <div className="space-y-3 pt-2">
            <ScreenshotGallery sessionId={session._id} timezone={timezone} filters={filterKey ? JSON.parse(filterKey) : {}} hideDateHeader />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-gray-50/70 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-800 flex justify-end flex-shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </section>
    </div>,
    document.body
  );
}
