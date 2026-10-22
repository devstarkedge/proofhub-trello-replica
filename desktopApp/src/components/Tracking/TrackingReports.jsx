import {getWorkspaceDateRange,trackingReportOptions} from '../../../../shared/trackingReportQuery.mjs';
import {prefetchScreenshotDetails} from '../../services/trackingReadPrefetch';
import { memo, useContext, useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { CameraOff, ChevronRight, ImageOff, Loader2, RefreshCw } from 'lucide-react';
import WorkspaceContext from '../../context/WorkspaceContext';
import { 
  getReports,
  getReportPreviews,
  getReportMembers, 
  errorMessage 
} from '../../services/trackingApi';
import { formatTrackingClock as duration } from '../../utils/duration';
import { Button } from '../ui/button';
import useTrackingScope from './useTrackingScope';
import DailyTrackingDetailsModal from './DailyTrackingDetailsModal';
import ScreenshotDetailsModal from './ScreenshotDetailsModal';
import ScreenshotImagePreview from './ScreenshotImagePreview';
import useScreenshotImage from './useScreenshotImage';
import { screenshotDisplayName } from '../../../../shared/screenshotIdentity.mjs';

const DocumentViewerModal = lazy(() => import('../DocumentViewerModal'));

const style = { 
  color: 'var(--color-text-primary)', 
  backgroundColor: 'var(--color-card-bg)', 
  borderColor: 'var(--color-border-default)' 
};

const workTitle = s => s.attributedTaskTitle 
  ? `${s.attributedProjectName} / ${s.attributedTaskTitle} (origin: ${s.agendaTitle} — ${s.description})`
  : s.agenda ? `${s.agendaTitle} — ${s.description}` : `${s.projectName || 'Project'} / ${s.taskTitle || 'Individual'}`;

// Single lazy-loaded timeline thumbnail card with compact activity indicator
const TimelineThumbnail = memo(function TimelineThumbnail({ screenshot, timezone, onClick, onPreview }) {
  const { node, url, error } = useScreenshotImage(screenshot, 'thumbnail', true);

  const activityPercent = screenshot.activityPercent;
  const timeFormatted = screenshot.capturedAt
    ? new Date(screenshot.capturedAt).toLocaleTimeString(undefined, { timeZone: timezone || 'UTC', hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div
      ref={node}
      onClick={onClick}
      onPointerEnter={onPreview}
      onFocus={onPreview}
      className="group relative flex-shrink-0 flex flex-col w-28 sm:w-32 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xs hover:border-blue-500 hover:shadow-md transition-all cursor-pointer"
      title={`Captured at ${timeFormatted} · Monitor ${screenshot.displayId || '1'} · Activity: ${activityPercent !== null ? Math.round(activityPercent) + '%' : 'N/A'}`}
    >
      <div className="relative w-full h-16 sm:h-18 bg-gray-100 dark:bg-gray-800 overflow-hidden flex items-center justify-center">
        {url ? (
          <img
            src={url}
            alt={`Screenshot ${timeFormatted}`}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          />
        ) : error || screenshot.status !== 'READY' ? (
          <div className="flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 text-[9px] p-1 text-center">
            <ImageOff size={14} />
            <span className="mt-0.5 truncate max-w-[90px]">{error || screenshot.uploadStatus || 'Unavailable'}</span>
          </div>
        ) : (
          <Loader2 className="animate-spin text-gray-400" size={16} />
        )}

        {/* Capture Time Tag */}
        <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded text-[9px] font-medium bg-black/60 text-white backdrop-blur-xs">
          {timeFormatted}
        </span>
      </div>

      {/* Activity indicator */}
      <div className="px-2 py-1 flex items-center justify-between bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 text-[10px]">
        <span className="text-gray-500 dark:text-gray-400 font-medium">Activity</span>
        {activityPercent !== null ? (
          <span className={`font-semibold ${
            activityPercent >= 70 ? 'text-emerald-600 dark:text-emerald-400' :
            activityPercent >= 30 ? 'text-blue-600 dark:text-blue-400' :
            'text-amber-600 dark:text-amber-400'
          }`}>
            {Math.round(activityPercent)}%
          </span>
        ) : (
          <span className="text-gray-400">N/A</span>
        )}
      </div>
    </div>
  );
});

// Calculate date ranges in effective workspace timezone

export default function TrackingReports({ team = false, initialFilters = {} }) {
  const { currentWorkspace } = useContext(WorkspaceContext) || {};
  const workspaceId = currentWorkspace?._id;
  const effectiveTimezone = currentWorkspace?.timezone || 'UTC';
  const scope = useTrackingScope();
  const client = useQueryClient();

  // Initialize with Last 7 Days by default
  const defaultRange = useMemo(() => getWorkspaceDateRange('last7days', effectiveTimezone), [effectiveTimezone]);
  const [activePreset, setActivePreset] = useState('last7days');
  const [fromDate, setFromDate] = useState(defaultRange.fromDate);
  const [toDate, setToDate] = useState(defaultRange.toDate);
  const [userId, setUserId] = useState(initialFilters.userId || '');
  const [members, setMembers] = useState([]);
  const [selectedSessionForDetails, setSelectedSessionForDetails] = useState(null);
  const [selectedScreenshotId, setSelectedScreenshotId] = useState(null);
  const [fullScreenScreenshotId, setFullScreenScreenshotId] = useState(null);

  const filterKey = JSON.stringify(initialFilters);

  useEffect(() => {
    const controller = new AbortController();
    if (team) getReportMembers(controller.signal).then(setMembers).catch(() => {});
    return () => controller.abort();
  }, [team, scope]);

  const options=useMemo(()=>trackingReportOptions(scope,filterKey,team,fromDate,toDate,userId,getReports),[scope,filterKey,team,fromDate,toDate,userId]);
  const key=options.queryKey;
  const query=useInfiniteQuery({...options,enabled:Boolean(workspaceId)});
  const sessionIds=[...new Set(query.data?.pages.flatMap(page=>page.sessions.map(session=>session._id))||[])];
  const previews=useQuery({
    queryKey:['tracking-private',scope,'report-previews',filterKey,sessionIds],
    enabled:sessionIds.length>0&&query.data.pages.some(page=>page.sessions.some(session=>session.previewsLoaded===false)),
    placeholderData:(previous,previousQuery)=>previousQuery?.queryKey[1]===scope&&previousQuery.queryKey[3]===filterKey?previous:undefined,
    queryFn:async({signal})=>Promise.all(Array.from({length:Math.ceil(sessionIds.length/20)},(_,index)=>getReportPreviews({...JSON.parse(filterKey),sessionIds:sessionIds.slice(index*20,(index+1)*20).join(',')},signal))),
    staleTime:15000,gcTime:5*60*1000,retry:false
  });

  const data = useMemo(
    () =>
      query.data
        ? {
            ...query.data.pages[0],
            sessions: [...new Map(query.data.pages.flatMap(page => page.sessions).map(session => {const enrichment=previews.data?.flatMap(page=>page.sessions||[]).find(row=>row._id===session._id);return [session._id,{...session,...enrichment}];})).values()]
          }
        : null,
    [query.data,previews.data]
  );

  const error = query.error ? errorMessage(query.error) : '';
  const previewScreenshot = data?.sessions.flatMap(s => s.latestScreenshots || []).find(s => s._id === fullScreenScreenshotId);

  // Realtime updates
  useEffect(() => {
    let timer;
    const refresh = e => {
      if (!/^(tracking:|attendance:)/.test(e.detail?.type || '')) return;
      clearTimeout(timer);
      timer = setTimeout(() => {client.invalidateQueries({ queryKey: key }, {cancelRefetch:false});client.invalidateQueries({queryKey:['tracking-private',scope,'report-previews']},{cancelRefetch:false});}, 250);
    };
    window.addEventListener('flowtask:realtime', refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('flowtask:realtime', refresh);
    };
  }, [client, key,scope]);

  const handlePresetClick = (presetId) => {
    setActivePreset(presetId);
    const range = getWorkspaceDateRange(presetId, data?.timezone || effectiveTimezone);
    setFromDate(range.fromDate);
    setToDate(range.toDate);
  };

  return (
    <section className="rounded-2xl border p-5 space-y-4" style={style}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">{team ? 'Team daily timeline' : 'Daily work timeline'}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Click on any date to open the full tracking details and screenshot history.
          </p>
        </div>
        {data?.timezone && (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            Timezone: {data.timezone}
          </span>
        )}
      </div>

      {/* Date Filter Controls with Quick Filters */}
      <div className="p-3 rounded-xl bg-gray-50/70 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-800 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Quick Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Date range quick filters">
            {[
              { id: 'last7days', label: 'Last 7 Days' },
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'month', label: 'This Month' }
            ].map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePresetClick(preset.id)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  activePreset === preset.id
                    ? 'bg-blue-600 text-white shadow-xs font-semibold'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
            className="flex items-center gap-1.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${query.isFetching ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>

        {/* Date Inputs & Member Filter */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5 font-medium text-gray-700 dark:text-gray-300">
            <span>From</span>
            <input
              aria-label="Work reports from"
              type="date"
              value={fromDate}
              onChange={(e) => {
                setActivePreset('custom');
                setFromDate(e.target.value);
              }}
              className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </label>

          <label className="flex items-center gap-1.5 font-medium text-gray-700 dark:text-gray-300">
            <span>To</span>
            <input
              aria-label="Work reports to"
              type="date"
              value={toDate}
              onChange={(e) => {
                setActivePreset('custom');
                setToDate(e.target.value);
              }}
              className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </label>

          {team && (
            <label className="flex items-center gap-1.5 font-medium text-gray-700 dark:text-gray-300">
              <span>Member</span>
              <select
                className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
              >
                <option value="">All authorized members</option>
                {members.map((member) => (
                  <option value={member._id} key={member._id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {query.isPending && <p role="status" className="text-sm text-gray-500 dark:text-gray-400 py-3">Loading work sessions…</p>}
      {data && !data.sessions.length && !query.isPending && (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center border border-dashed rounded-xl border-gray-200 dark:border-gray-800">
          No work sessions in this range.
        </p>
      )}

      {/* Sessions Timeline List */}
      <div className="space-y-3.5">
        {data?.sessions.map((s) => {
          const screenshots = (s.latestScreenshots || []).slice(0, 4);
          const hasScreenshots = screenshots.length > 0;
          const remainingCount = (s.totalScreenshots || 0) - screenshots.length;

          return (
            <article
              key={s._id}
              className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/60 shadow-xs hover:border-gray-300 dark:hover:border-gray-700 transition-all space-y-3"
            >
              {/* Date & Context Header */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-gray-900 dark:text-gray-100">{s.workDateKey}</span>
                  <span className="text-gray-400 dark:text-gray-500">·</span>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    {workTitle(s.segments?.at(-1) || {})} {team ? `· ${s.userName || s.user}` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedSessionForDetails(s)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline cursor-pointer"
                >
                  <span>View Day Details</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Work Summary Details */}
              <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                <p>
                  Work <strong className="text-gray-700 dark:text-gray-200 font-semibold">{duration(s.totals?.workSeconds || 0)}</strong> · 
                  Office <strong className="text-gray-700 dark:text-gray-200 font-semibold">{s.attendance?.measuredOfficeSeconds === null ? 'awaiting attendance resolution' : duration(s.attendance?.measuredOfficeSeconds || 0)}</strong> · 
                  Individual {duration(s.totals?.individualSeconds || 0)} · 
                  Pre-assignment {duration(s.totals?.preAssignmentSeconds || 0)} · 
                  Assigned {duration(s.totals?.assignedSeconds || 0)}
                </p>
                <p className="text-[11px] opacity-85">
                  Attendance <strong className="text-gray-700 dark:text-gray-200 font-semibold">{s.attendance?.day?.attendanceStatus || s.attendance?.day?.presenceState || s.attendance?.status || 'N/A'}</strong> · 
                  Personal Pause {duration(s.totals?.personalPauseSeconds || 0)} · 
                  Agenda attribution follows the recorded Yes/No decision
                </p>
              </div>

              {/* Screenshot Thumbnails Row (Replaces "Timeline and screenshots" button) */}
              <div className="pt-1">
                {s.previewsLoaded===false ? (<div className="text-xs text-gray-500" role="status">{previews.error ? <button type="button" className="underline" onClick={()=>previews.refetch()}>Retry screenshot previews</button> : 'Loading screenshot previews...'} <button type="button" className="ml-2 text-blue-600 underline" onClick={()=>setSelectedSessionForDetails(s)}>View tracking details</button></div>) : hasScreenshots ? (
                  <div className="flex items-center gap-2.5 overflow-x-auto pb-1.5 scrollbar-thin">
                    {screenshots.map((sc) => (
                      <TimelineThumbnail
                        key={sc._id}
                        screenshot={sc}
                        onPreview={()=>prefetchScreenshotDetails(client,scope,sc._id)}
                        timezone={data.timezone}
                        onClick={() => setSelectedScreenshotId(sc._id)}
                      />
                    ))}
                    {remainingCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedSessionForDetails(s)}
                        className="flex-shrink-0 flex flex-col items-center justify-center w-24 h-22 sm:w-28 sm:h-24 rounded-xl border border-dashed border-blue-300 dark:border-blue-800/80 bg-blue-50/50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100/60 dark:hover:bg-blue-900/30 transition-all cursor-pointer p-2 text-center"
                        title="Click to view all screenshots for this date"
                      >
                        <span className="text-sm font-bold">+{remainingCount}</span>
                        <span className="text-[10px] font-medium mt-0.5">more</span>
                        <span className="text-[9px] opacity-75 mt-1 underline">View all →</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div 
                    onClick={() => setSelectedSessionForDetails(s)}
                    className="flex items-center gap-2 py-2.5 px-3 rounded-xl bg-gray-50/70 dark:bg-gray-800/40 text-xs text-gray-500 dark:text-gray-400 border border-dashed border-gray-200 dark:border-gray-800 cursor-pointer hover:bg-gray-100/70 dark:hover:bg-gray-800/60 transition-colors"
                  >
                    <CameraOff className="w-4 h-4 text-gray-400 shrink-0" />
                    <span>No screenshots available for this date</span>
                    <span className="text-[11px] text-blue-600 dark:text-blue-400 ml-auto hover:underline">View tracking details →</span>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {data?.nextCursor && (
        <Button
          variant="outline"
          disabled={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
          className="w-full mt-2"
        >
          {query.isFetchingNextPage ? 'Loading more sessions…' : 'Load more sessions'}
        </Button>
      )}

      {/* Daily Tracking Details Modal */}
      {selectedSessionForDetails && (
        <DailyTrackingDetailsModal
          session={selectedSessionForDetails}
          timezone={data?.timezone || effectiveTimezone}
          filterKey={filterKey}
          onClose={() => setSelectedSessionForDetails(null)}
        />
      )}

      {/* Screenshot Details Modal (opened directly when clicking one of the 4 thumbnails) */}
      {selectedScreenshotId && (
        <ScreenshotDetailsModal
          screenshotId={selectedScreenshotId}
          screenshot={data?.sessions.flatMap(s => s.latestScreenshots || []).find(s => s._id === selectedScreenshotId)}
          timezone={data?.timezone || effectiveTimezone}
          isFullScreenOpen={Boolean(fullScreenScreenshotId)}
          onClose={() => setSelectedScreenshotId(null)}
          onOpenFullScreen={(id) => setFullScreenScreenshotId(id)}
        />
      )}

      {/* Full-Screen Image Preview Modal */}
      {fullScreenScreenshotId && (
        <Suspense fallback={<p role="status">Opening image viewer…</p>}>
          <DocumentViewerModal
            key={`${scope}:${fullScreenScreenshotId}`}
            attachments={[{ ...previewScreenshot, _id: fullScreenScreenshotId, fileType: 'image', originalName: screenshotDisplayName(previewScreenshot || fullScreenScreenshotId) }]}
            initialIndex={0}
            ImagePreview={ScreenshotImagePreview}
            privateContent
            onClose={() => setFullScreenScreenshotId(null)}
          />
        </Suspense>
      )}
    </section>
  );
}
