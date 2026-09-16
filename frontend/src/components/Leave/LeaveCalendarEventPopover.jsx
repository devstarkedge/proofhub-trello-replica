import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, X } from 'lucide-react';

const VIEWPORT_MARGIN = 12;
const POPOVER_GAP = 8;

const LeaveCalendarEventPopover = ({ anchor, date, events, onClose, onMouseEnter, onMouseLeave }) => {
  const popoverRef = useRef(null);
  const [position, setPosition] = useState(null);

  const updatePosition = useCallback(() => {
    if (!anchor || !popoverRef.current) return;

    const anchorRect = anchor.getBoundingClientRect();
    const popoverRect = popoverRef.current.getBoundingClientRect();
    const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - popoverRect.width - VIEWPORT_MARGIN);
    const centeredLeft = anchorRect.left + (anchorRect.width / 2) - (popoverRect.width / 2);
    const left = Math.min(Math.max(centeredLeft, VIEWPORT_MARGIN), maxLeft);
    const fitsBelow = anchorRect.bottom + POPOVER_GAP + popoverRect.height <= window.innerHeight - VIEWPORT_MARGIN;
    const preferredTop = fitsBelow
      ? anchorRect.bottom + POPOVER_GAP
      : anchorRect.top - popoverRect.height - POPOVER_GAP;
    const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - popoverRect.height - VIEWPORT_MARGIN);
    const top = Math.min(Math.max(preferredTop, VIEWPORT_MARGIN), maxTop);

    setPosition({ left, top });
  }, [anchor]);

  useLayoutEffect(() => {
    updatePosition();
  }, [date, events, updatePosition]);

  useEffect(() => {
    const handleOutsideInteraction = (event) => {
      if (popoverRef.current?.contains(event.target) || anchor?.contains(event.target)) return;
      onClose();
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('resize', updatePosition);
    document.addEventListener('scroll', updatePosition, true);
    document.addEventListener('pointerdown', handleOutsideInteraction);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('pointerdown', handleOutsideInteraction);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [anchor, onClose, updatePosition]);

  if (!anchor || !events.length) return null;

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={`Calendar details for ${date}`}
      className="fixed z-[1000] w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border p-3 shadow-xl"
      style={{
        left: position?.left ?? VIEWPORT_MARGIN,
        top: position?.top ?? VIEWPORT_MARGIN,
        maxHeight: 'min(26rem, calc(100vh - 1.5rem))',
        visibility: position ? 'visible' : 'hidden',
        backgroundColor: 'var(--color-card-bg)',
        borderColor: 'var(--color-border-default)',
        color: 'var(--color-text-primary)'
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="mb-2 flex items-start justify-between gap-3 border-b pb-2" style={{ borderColor: 'var(--color-border-subtle)' }}>
        <div className="flex min-w-0 items-center gap-2">
          <CalendarDays className="h-4 w-4 flex-none" style={{ color: 'var(--color-primary-600)' }} />
          <p className="truncate text-sm font-semibold">{date}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-mr-1 -mt-1 rounded-md p-1 hover:bg-[var(--color-bg-muted)]"
          aria-label="Close calendar details"
        >
          <X className="h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
        </button>
      </div>

      <div className="space-y-2">
        {events.map((event) => (
          <section
            key={event.id}
            className="rounded-lg border-l-4 px-3 py-2.5"
            style={{ backgroundColor: event.backgroundColor, borderLeftColor: event.color }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: event.color }}>{event.kindLabel}</p>
            <p className="mt-0.5 break-words text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{event.title}</p>
            {event.details.length > 0 && (
              <dl className="mt-2 space-y-1">
                {event.details.map(({ label, value }) => (
                  <div key={`${event.id}-${label}`} className="grid grid-cols-[5.25rem_minmax(0,1fr)] gap-2 text-xs leading-5">
                    <dt style={{ color: 'var(--color-text-muted)' }}>{label}</dt>
                    <dd className="break-words font-medium" style={{ color: 'var(--color-text-secondary)' }}>{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        ))}
      </div>
    </div>,
    document.body
  );
};

export default LeaveCalendarEventPopover;
