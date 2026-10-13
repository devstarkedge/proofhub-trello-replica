import React, { useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * TruncatedTaskText
 *
 * Renders text with CSS truncation and a fixed-position portal tooltip on hover.
 * Works safely inside any overflow:auto / overflow:hidden container (modals, drawers).
 *
 * Props:
 *   text        — string to display
 *   className   — additional classes for the tag (color, weight, decoration, etc.)
 *   lines       — 1 (default, single-line) | 2 | 3 (multi-line clamp)
 *   tooltipSide — 'top' (default) | 'bottom'
 *   as          — HTML tag to render, default 'p'
 */
const TruncatedTaskText = ({
  text,
  className = '',
  lines = 1,
  tooltipSide = 'top',
  as: Tag = 'p',
}) => {
  const ref = useRef(null);
  const [tooltip, setTooltip] = useState(null); // null | { x: number, y: number }

  const truncateClass =
    lines === 1 ? 'truncate' :
    lines === 2 ? 'line-clamp-2' :
    'line-clamp-3';

  const isOverflowing = useCallback(
    (el) =>
      lines === 1
        ? el.scrollWidth > el.clientWidth + 1
        : el.scrollHeight > el.clientHeight + 1,
    [lines]
  );

  const handleMouseEnter = useCallback(() => {
    const el = ref.current;
    if (!el || !isOverflowing(el)) return;
    const rect = el.getBoundingClientRect();
    setTooltip({
      x: rect.left + rect.width / 2,
      y: tooltipSide === 'top' ? rect.top : rect.bottom,
    });
  }, [isOverflowing, tooltipSide]);

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  // Dismiss tooltip on scroll or resize so it never stays stale
  useEffect(() => {
    if (!tooltip) return;
    const dismiss = () => setTooltip(null);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [tooltip]);

  return (
    <>
      <Tag
        ref={ref}
        className={`block min-w-0 ${truncateClass} ${className}`}
        title={text}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {text}
      </Tag>

      {tooltip && typeof document !== 'undefined' &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              left: `${tooltip.x}px`,
              top:
                tooltipSide === 'top'
                  ? `${tooltip.y}px`
                  : `${tooltip.y}px`,
              transform:
                tooltipSide === 'top'
                  ? 'translate(-50%, calc(-100% - 8px))'
                  : 'translate(-50%, 8px)',
              zIndex: 9999,
              pointerEvents: 'none',
              maxWidth: '320px',
            }}
            className="px-3 py-2 text-xs leading-relaxed text-white bg-gray-900 rounded-lg shadow-xl break-all"
          >
            {text}
            {/* Arrow */}
            <span
              style={{
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                ...(tooltipSide === 'top'
                  ? {
                      bottom: -5,
                      borderLeft: '5px solid transparent',
                      borderRight: '5px solid transparent',
                      borderTop: '5px solid #111827',
                    }
                  : {
                      top: -5,
                      borderLeft: '5px solid transparent',
                      borderRight: '5px solid transparent',
                      borderBottom: '5px solid #111827',
                    }),
              }}
            />
          </div>,
          document.body
        )
      }
    </>
  );
};

export default TruncatedTaskText;
