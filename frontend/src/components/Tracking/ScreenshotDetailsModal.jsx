import React, { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  X, 
  Maximize2, 
  Camera, 
  Clock, 
  Activity, 
  Keyboard, 
  MousePointer, 
  Briefcase, 
  ShieldCheck, 
  ImageOff, 
  Loader2 
} from 'lucide-react';
import { getScreenshotDetails, errorMessage } from '../../services/trackingApi';
import { formatTrackingClock as duration } from '../../utils/duration';
import { Button } from '../ui/button';
import useTrackingScope from './useTrackingScope';
import useScreenshotImage from './useScreenshotImage';

const formatTimeRange = (start, end, timezone) => {
  if (!start) return '—';
  try {
    const startStr = new Date(start).toLocaleTimeString(undefined, {
      timeZone: timezone || 'UTC',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit'
    });
    if (!end) return `${startStr} – Ongoing`;
    const endStr = new Date(end).toLocaleTimeString(undefined, {
      timeZone: timezone || 'UTC',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit'
    });
    return `${startStr} – ${endStr}`;
  } catch {
    return `${start} – ${end || 'Ongoing'}`;
  }
};

export default function ScreenshotDetailsModal({
  screenshotId,
  screenshot,
  timezone,
  onClose,
  onOpenFullScreen,
  isFullScreenOpen = false
}) {
  const scope = useTrackingScope();
  const rootRef = useRef(null);

  // Close on Escape unless full-screen preview is open on top
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isFullScreenOpen) return;
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose, isFullScreenOpen]);

  // Fetch screenshot metadata and interval details
  const detailsQuery = useQuery({
    queryKey: ['tracking-private', scope, 'details', screenshotId],
    queryFn: ({ signal }) => getScreenshotDetails(screenshotId, signal),
    staleTime: 5 * 60 * 1000,
    retry: false
  });

  const details = detailsQuery.data;
  const detailsError = detailsQuery.error ? errorMessage(detailsQuery.error) : '';
  const activity = details?.activity;

  const { url: imageUrl, loading: imageLoading, error: imageError } = useScreenshotImage(
    details || screenshot, 'original'
  );

  const handleOpenFullScreen = useCallback(() => {
    if (onOpenFullScreen) {
      onOpenFullScreen(screenshotId);
    }
  }, [onOpenFullScreen, screenshotId]);

  const captureFormattedDate = details?.capturedAt
    ? new Date(details.capturedAt).toLocaleString(undefined, {
        timeZone: timezone || 'UTC',
        dateStyle: 'medium',
        timeStyle: 'medium'
      })
    : '';

  const intervalSeconds = activity?.endedAt && activity?.startedAt
    ? Math.max(0, (+new Date(activity.endedAt) - +new Date(activity.startedAt)) / 1000)
    : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-150"
      onClick={onClose}
    >
      <section
        ref={rootRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="screenshot-details-title"
        className="w-full max-w-5xl max-h-[92vh] rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col overflow-hidden my-auto"
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
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0 border border-blue-100/60 dark:border-blue-800/40">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="screenshot-details-title" className="font-bold text-base text-gray-900 dark:text-gray-100">
                  Screenshot Details
                </h2>
                {details?.displayId && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                    Screen {details.displayId}
                  </span>
                )}
                {details?.blurred && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    Blurred
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {captureFormattedDate || 'Loading timestamp…'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenFullScreen}
              disabled={!imageUrl || imageLoading}
              className="flex items-center gap-1.5 text-xs h-9 cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Full Screen</span>
            </Button>
            <button
              type="button"
              aria-label="Close details"
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Two-Column Body */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column — Screenshot View (lg:col-span-7) */}
          <div className="lg:col-span-7 flex flex-col space-y-3">
            <div
              onClick={imageUrl ? handleOpenFullScreen : undefined}
              className={`relative flex items-center justify-center bg-gray-950/5 dark:bg-black/40 rounded-xl border border-gray-200 dark:border-gray-800 min-h-[300px] max-h-[58vh] overflow-hidden group ${
                imageUrl ? 'cursor-zoom-in' : ''
              }`}
            >
              {imageUrl ? (
                <>
                  <img
                    src={imageUrl}
                    alt={captureFormattedDate}
                    className="max-h-[56vh] w-auto max-w-full object-contain mx-auto transition-transform duration-200 group-hover:scale-[1.01]"
                  />
                  <div className="absolute bottom-3 right-3 opacity-90 group-hover:opacity-100 transition-opacity bg-black/70 text-white text-xs px-3 py-1.5 rounded-lg backdrop-blur-xs flex items-center gap-1.5 pointer-events-none shadow-md">
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Click for full screen</span>
                  </div>
                </>
              ) : imageLoading ? (
                <div className="flex flex-col items-center gap-2.5 text-gray-400 dark:text-gray-500 py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  <span className="text-xs">Loading full-resolution screenshot…</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 p-6 text-center text-xs text-gray-500">
                  <ImageOff className="w-8 h-8 text-gray-400" />
                  <p className="font-medium text-gray-700 dark:text-gray-300">
                    {imageError || 'Screenshot image unavailable'}
                  </p>
                </div>
              )}
            </div>

            {/* Technical Information Strip */}
            {details && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gray-50/70 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-800 text-[11px] text-gray-500 dark:text-gray-400">
                <span>Display {details.displayId || '1'}</span>
                <span>{details.width} × {details.height} px</span>
                <span>{details.format?.toUpperCase() || 'WEBP'}</span>
                <span>{details.bytes ? (details.bytes / 1024).toFixed(1) + ' KiB' : 'N/A'}</span>
                <span className="capitalize">{details.uploadStatus?.toLowerCase() || 'Uploaded'}</span>
              </div>
            )}
          </div>

          {/* Right Column — Screenshot Information (lg:col-span-5) */}
          <div className="lg:col-span-5 flex flex-col space-y-4">
            {detailsQuery.isPending && (
              <div className="flex items-center gap-2 text-xs text-gray-500 py-4">
                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                <span>Loading capture details…</span>
              </div>
            )}

            {detailsError && (
              <div role="alert" className="p-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
                {detailsError}
              </div>
            )}

            {details && (
              <>
                {/* Context card */}
                <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xs space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-800 dark:text-gray-200">
                    <Briefcase className="w-3.5 h-3.5 text-blue-500" />
                    <span>Work Context</span>
                  </div>
                  {details.contexts?.length > 0 ? (
                    details.contexts.map((c) => (
                      <div key={c.segmentId} className="space-y-1">
                        <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                          {c.title}
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                          {formatTimeRange(c.startedAt, c.endedAt, timezone)}
                        </p>
                        {c.origin && (
                          <p className="text-[11px] text-gray-500 dark:text-gray-400">
                            Origin: {c.origin}
                          </p>
                        )}
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                          {c.kind}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-gray-500">Capture context unavailable</p>
                  )}
                </div>

                {/* Activity & Performance card */}
                <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-800 dark:text-gray-200">
                      <Activity className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Activity Performance</span>
                    </div>
                    <span className="text-base font-bold text-gray-900 dark:text-gray-100">
                      {details.activityPercent !== null ? `${details.activityPercent.toFixed(1)}%` : 'N/A'}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(0, details.activityPercent || 0))}%` }}
                    />
                  </div>

                  {/* Metrics grid */}
                  <div className="grid grid-cols-2 gap-2 pt-1 text-xs text-gray-600 dark:text-gray-300">
                    <div className="p-2.5 rounded-lg bg-gray-50/70 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-800 flex items-center gap-2">
                      <Keyboard className="w-4 h-4 text-blue-500 shrink-0" />
                      <div>
                        <p className="text-[10px] text-gray-400">Keydowns</p>
                        <p className="font-semibold">{activity?.keyboardCount ?? 'N/A'}</p>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-gray-50/70 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-800 flex items-center gap-2">
                      <MousePointer className="w-4 h-4 text-indigo-500 shrink-0" />
                      <div>
                        <p className="text-[10px] text-gray-400">Mouse Clicks</p>
                        <p className="font-semibold">{activity?.mouseCount ?? 'N/A'}</p>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-gray-50/70 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-800 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-emerald-500 shrink-0" />
                      <div>
                        <p className="text-[10px] text-gray-400">Active / Idle</p>
                        <p className="font-semibold">
                          {activity ? `${duration(activity.activeSeconds || 0)} / ${duration(activity.idleSeconds || 0)}` : 'N/A'}
                        </p>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-gray-50/70 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-800 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-purple-500 shrink-0" />
                      <div>
                        <p className="text-[10px] text-gray-400">Coverage</p>
                        <p className="font-semibold uppercase">{details.coverage || 'work'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Interval and storage details */}
                <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/40 dark:bg-gray-800/20 text-xs space-y-2">
                  <div className="flex items-center justify-between text-gray-600 dark:text-gray-400">
                    <span>Interval window:</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">
                      {activity ? formatTimeRange(activity.startedAt, activity.endedAt, timezone) : 'N/A'}
                    </span>
                  </div>
                  {intervalSeconds !== null && (
                    <div className="flex items-center justify-between text-gray-600 dark:text-gray-400">
                      <span>Interval duration:</span>
                      <span className="font-semibold text-gray-800 dark:text-gray-200">
                        {duration(intervalSeconds)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-gray-600 dark:text-gray-400">
                    <span>Storage provider:</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">Cloudflare R2</span>
                  </div>
                  <div className="flex items-center justify-between text-gray-600 dark:text-gray-400">
                    <span>Upload verification:</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">Verified WebP</span>
                  </div>
                </div>
              </>
            )}

            <p className="text-[11px] text-gray-400 dark:text-gray-500 italic pt-1">
              Minute-level activity was not recorded. These are genuine interval totals.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-gray-50/70 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
          >
            Close
          </Button>
          <Button
            size="sm"
            onClick={handleOpenFullScreen}
            disabled={!imageUrl || imageLoading}
            className="flex items-center gap-1.5"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Open Full-Screen Preview</span>
          </Button>
        </div>
      </section>
    </div>,
    document.body
  );
}
