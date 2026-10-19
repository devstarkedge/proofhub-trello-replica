import { lazy, Suspense, memo, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Info, ImageOff, Loader2 } from 'lucide-react';
import { getScreenshotGallery, errorMessage } from '../../services/trackingApi';
import useTrackingScope from './useTrackingScope';
import { Button } from '../ui/button';
import ScreenshotDetailsModal from './ScreenshotDetailsModal';
import ScreenshotImagePreview from './ScreenshotImagePreview';
import useScreenshotImage from './useScreenshotImage';

const DocumentViewerModal = lazy(() => import('../DocumentViewerModal'));

const time = (value, zone) => (value ? new Date(value).toLocaleString(undefined, { timeZone: zone || 'UTC' }) : '—');
const cardStyle = { backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border-default)' };

const CaptureCard = memo(function CaptureCard({ capture, timezone, onSelect }) {
  const { node, url, error, retry } = useScreenshotImage(capture, 'thumbnail', true);

  const rate = capture.activityPercent;
  const timeStr = new Date(capture.capturedAt).toLocaleTimeString(undefined, {
    timeZone: timezone || 'UTC',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <article
      ref={node}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(capture._id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(capture._id);
        }
      }}
      className="group overflow-hidden rounded-xl border shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-500 hover:border-blue-400 dark:hover:border-blue-600 select-none flex flex-col"
      style={cardStyle}
      aria-label={`Screenshot ${timeStr}, monitor ${capture.displayId}`}
    >
      <div className="relative flex aspect-video w-full items-center justify-center bg-slate-500/10 overflow-hidden">
        {url ? (
          <img
            src={url}
            alt={`Monitor ${capture.displayId}`}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-105"
          />
        ) : error || capture.status !== 'READY' ? (
          <span className="flex flex-col items-center gap-1.5 px-3 text-xs text-gray-500">
            <ImageOff size={20} />
            <span className="text-[11px] truncate max-w-full">
              {error || capture.compressionException || capture.uploadStatus || 'Thumbnail unavailable'}
            </span>
          </span>
        ) : (
          <Loader2 className="animate-spin opacity-40 text-blue-500" size={20} />
        )}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white p-1 rounded-md">
          <Info size={13} />
        </div>
      </div>
      <div className="space-y-2 p-3 flex-1 flex flex-col justify-between">
        <div>
          {error && capture.status === 'READY' && (
            <button
              type="button"
              className="text-xs text-blue-500 underline mb-1"
              onClick={(e) => {
                e.stopPropagation();
                retry();
              }}
            >
              Retry thumbnail
            </button>
          )}
          <div
            className="h-2 overflow-hidden rounded-sm bg-slate-400/20 mb-2"
            role="meter"
            aria-label="Recorded input activity"
            aria-valuemin={0}
            aria-valuemax={100}
            {...(rate !== null ? { 'aria-valuenow': Math.round(rate) } : { 'aria-valuetext': 'Unavailable' })}
          >
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{
                width: rate === null ? '0%' : `${rate}%`,
                backgroundImage:
                  'repeating-linear-gradient(90deg,transparent 0,transparent 10px,var(--color-card-bg) 10px,var(--color-card-bg) 12px)'
              }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
            <span className="font-medium">{timeStr}</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              {rate === null ? 'Activity N/A' : `${Math.round(rate)}% activity`}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 text-xs pt-2 text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-800/60">
          <span className="min-w-0 truncate text-[11px]">
            Screen {capture.displayId} · {capture.status === 'READY' ? 'Uploaded' : capture.uploadStatus}
            {capture.blurred ? ' · blurred' : ''}
          </span>
          <Info size={13} className="shrink-0 text-gray-400 group-hover:text-blue-500 transition-colors" />
        </div>
      </div>
    </article>
  );
});

export default function ScreenshotGallery({ sessionId, timezone, filters = {}, hideDateHeader = false }) {
  const scope = useTrackingScope();
  const client = useQueryClient();
  const filterKey = JSON.stringify(filters);
  const sentinel = useRef(null);

  const [selectedScreenshotId, setSelectedScreenshotId] = useState(null);
  const [fullScreenScreenshotId, setFullScreenScreenshotId] = useState(null);

  const key = useMemo(() => ['tracking-private', scope, 'gallery', sessionId, filterKey], [scope, sessionId, filterKey]);

  const query = useInfiniteQuery({
    queryKey: key,
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) =>
      getScreenshotGallery({ ...JSON.parse(filterKey), sessionId, cursor: pageParam || undefined }, signal),
    getNextPageParam: (last) => last.nextCursor || undefined,
    staleTime: 30000,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: false,
    retry: false
  });

  useEffect(() => {
    setSelectedScreenshotId(null);
    setFullScreenScreenshotId(null);
  }, [scope, sessionId, filterKey]);

  const { hasNextPage, isFetchingNextPage, isError, fetchNextPage } = query;

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || isError) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) fetchNextPage();
      },
      { rootMargin: '100px' }
    );
    if (sentinel.current) observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage]);

  useEffect(() => {
    const poll = setInterval(() => client.invalidateQueries({ queryKey: key }), 60000);
    return () => clearInterval(poll);
  }, [client, key]);

  const captures = useMemo(
    () => [...new Map((query.data?.pages || []).flatMap((p) => p.screenshots).map((s) => [s._id, s])).values()],
    [query.data]
  );

  const available = useMemo(
    () =>
      captures
        .filter((s) => s.status === 'READY')
        .map((s) => ({
          ...s,
          fileType: 'image',
          originalName: `${s.contexts.map((c) => c.title).join(' • ')} · ${time(s.capturedAt, timezone)}`
        })),
    [captures, timezone]
  );


  const groups = useMemo(() => {
    const result = new Map();
    for (const s of captures) {
      const date = new Date(s.capturedAt).toLocaleDateString(undefined, {
        timeZone: timezone || 'UTC',
        weekday: 'long',
        month: 'long',
        day: 'numeric'
      });
      const title = s.contexts.map((c) => c.title).join(' • ') || 'Capture context unavailable';
      const groupKey = `${date}:${s.contexts.map((c) => c.segmentId).join(',')}`;
      if (!result.has(groupKey)) result.set(groupKey, { date, title, records: [] });
      result.get(groupKey).records.push(s);
    }
    return [...result.entries()];
  }, [captures, timezone]);

  const hasMultipleDates = useMemo(() => new Set(groups.map(([, g]) => g.date)).size > 1, [groups]);

  return (
    <section className="space-y-5" aria-label="Screenshot timeline">
      <header className="flex items-center gap-2">
        <Camera size={18} />
        <h3 className="font-semibold">Screenshot timeline</h3>
        <span className="text-xs opacity-60">{captures.length} loaded</span>
      </header>

      {query.isPending && (
        <div role="status" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((n) => (
            <div key={n} className="aspect-video animate-pulse rounded-xl bg-slate-400/15" />
          ))}
        </div>
      )}

      {query.error && (
        <div role="alert" className="text-sm">
          {errorMessage(query.error)}{' '}
          <Button variant="outline" onClick={() => query.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {!query.isPending && !captures.length && !query.error && (
        <p className="rounded-xl border border-dashed p-6 text-sm opacity-70">
          No screenshot captures in this session and filter. Attendance and work time remain recorded.
        </p>
      )}

      {groups.map(([id, group]) => (
        <section key={id} className="space-y-3">
          <div>
            {(!hideDateHeader || hasMultipleDates) && <p className="text-sm font-semibold">{group.date}</p>}
            <p className={!hideDateHeader || hasMultipleDates ? 'mt-1 text-xs opacity-70' : 'text-xs font-semibold opacity-70'}>
              {group.title}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {group.records.map((s) => (
              <CaptureCard
                key={`${scope}:${s._id}`}
                capture={s}
                timezone={timezone}
                onSelect={(id) => setSelectedScreenshotId(id)}
              />
            ))}
          </div>
        </section>
      ))}

      <div ref={sentinel} className="flex min-h-8 justify-center">
        {query.isFetchingNextPage ? (
          <p role="status" className="text-xs">
            Loading earlier captures…
          </p>
        ) : (
          query.hasNextPage && (
            <Button variant="outline" onClick={() => query.fetchNextPage()}>
              Load 20 earlier captures
            </Button>
          )
        )}
      </div>

      {/* Unified Screenshot Details Modal (z-[130]) */}
      {selectedScreenshotId && (
        <ScreenshotDetailsModal
          screenshotId={selectedScreenshotId}
          screenshot={captures.find(s => s._id === selectedScreenshotId)}
          timezone={timezone}
          isFullScreenOpen={Boolean(fullScreenScreenshotId)}
          onClose={() => setSelectedScreenshotId(null)}
          onOpenFullScreen={(id) => setFullScreenScreenshotId(id)}
        />
      )}

      {/* Full-Screen Image Preview Modal (z-[140]) */}
      {fullScreenScreenshotId && available.some((s) => s._id === fullScreenScreenshotId) && (
        <Suspense fallback={<p role="status">Opening image viewer…</p>}>
          <DocumentViewerModal
            key={`${scope}:${fullScreenScreenshotId}`}
            attachments={available}
            initialIndex={Math.max(0, available.findIndex((s) => s._id === fullScreenScreenshotId))}
            ImagePreview={ScreenshotImagePreview}
            privateContent
            onClose={() => setFullScreenScreenshotId(null)}
          />
        </Suspense>
      )}
    </section>
  );
}
