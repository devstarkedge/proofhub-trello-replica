import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Users } from 'lucide-react';
import { createPortal } from 'react-dom';

/**
 * CoordinatorAvatars - Avatar stack component for displaying project coordinators
 * Shows first 2 avatars + overflow count
 * On hover: Shows dropdown with full list
 */
const CoordinatorAvatars = ({ coordinators = [], maxVisible = 2 }) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, placement: 'bottom' });
  const [isPositionReady, setIsPositionReady] = useState(false);
  const triggerRef = useRef(null);
  const cardRef = useRef(null);
  const closeTimerRef = useRef(null);

  if (!coordinators || coordinators.length === 0) {
    return (
      <span 
        className="text-xs"
        style={{ color: 'var(--color-text-muted)' }}
      >
        No coordinators
      </span>
    );
  }

  const visibleCoordinators = coordinators.slice(0, maxVisible);
  const remainingCount = coordinators.length - maxVisible;

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const openDropdown = useCallback(() => {
    clearCloseTimer();
    setShowDropdown(true);
    setIsPositionReady(false);
  }, [clearCloseTimer]);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setShowDropdown(false);
      setIsPositionReady(false);
      closeTimerRef.current = null;
    }, 120);
  }, [clearCloseTimer]);

  // Generate avatar color from name
  const getAvatarColor = (name) => {
    const colors = [
      { bg: 'rgba(239, 68, 68, 0.2)', text: '#ef4444' },
      { bg: 'rgba(59, 130, 246, 0.2)', text: '#3b82f6' },
      { bg: 'rgba(16, 185, 129, 0.2)', text: '#10b981' },
      { bg: 'rgba(139, 92, 246, 0.2)', text: '#8b5cf6' },
      { bg: 'rgba(245, 158, 11, 0.2)', text: '#f59e0b' },
      { bg: 'rgba(236, 72, 153, 0.2)', text: '#ec4899' },
      { bg: 'rgba(6, 182, 212, 0.2)', text: '#06b6d4' }
    ];
    const index = (name || '').charCodeAt(0) % colors.length;
    return colors[index];
  };

  // Get initials from name
  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  useEffect(() => {
    if (!showDropdown || !triggerRef.current) return undefined;

    const updatePosition = () => {
      if (!triggerRef.current) return;

      const anchor = triggerRef.current.getBoundingClientRect();
      const cardRect = cardRef.current?.getBoundingClientRect();
      const cardWidth = cardRect?.width ?? 280;
      const cardHeight = cardRect?.height ?? Math.min(88 + coordinators.length * 48, 260);
      const viewportPadding = 16;
      const gap = 10;

      let left = anchor.left + (anchor.width / 2) - (cardWidth / 2);
      let top = anchor.bottom + gap;
      let placement = 'bottom';

      if (left + cardWidth > window.innerWidth - viewportPadding) {
        left = window.innerWidth - cardWidth - viewportPadding;
      }

      if (left < viewportPadding) {
        left = viewportPadding;
      }

      if (top + cardHeight > window.innerHeight - viewportPadding) {
        const topPlacement = anchor.top - cardHeight - gap;

        if (topPlacement >= viewportPadding) {
          top = topPlacement;
          placement = 'top';
        } else {
          top = Math.max(viewportPadding, window.innerHeight - cardHeight - viewportPadding);
        }
      }

      setPosition({ top, left, placement });
      setIsPositionReady(true);
    };

    updatePosition();
    const frameId = window.requestAnimationFrame(updatePosition);

    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [coordinators.length, showDropdown]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  const hoverCard = showDropdown && coordinators.length > 0 ? createPortal(
    <div
      ref={cardRef}
      className="fixed z-[9999] w-[280px] max-w-[calc(100vw-32px)] rounded-2xl border shadow-2xl overflow-hidden"
      style={{
        top: position.top,
        left: position.left,
        backgroundColor: 'var(--color-bg-base)',
        borderColor: 'var(--color-border-default)',
        boxShadow: '0 20px 45px -18px rgba(15, 23, 42, 0.45), 0 12px 24px -18px rgba(15, 23, 42, 0.35)',
        visibility: isPositionReady ? 'visible' : 'hidden',
        opacity: isPositionReady ? 1 : 0,
        transform: isPositionReady ? 'translateY(0)' : 'translateY(-4px)',
        transition: 'opacity 140ms ease, transform 140ms ease'
      }}
      onMouseEnter={openDropdown}
      onMouseLeave={scheduleClose}
    >
      <div
        className="flex items-center gap-2 px-3 py-2.5 border-b"
        style={{
          backgroundColor: 'var(--color-bg-subtle)',
          borderColor: 'var(--color-border-subtle)'
        }}
      >
        <Users className="w-4 h-4" style={{ color: '#10b981' }} />
        <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Coordinators ({coordinators.length})
        </span>
      </div>

      <div className="max-h-60 overflow-y-auto px-3 py-2.5 space-y-2.5 scrollbar-thin">
        {coordinators.map((coordinator, index) => {
          const color = getAvatarColor(coordinator.name);

          return (
            <div
              key={coordinator._id || index}
              className="flex items-center gap-2.5 rounded-xl px-1 py-0.5"
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
                style={{
                  backgroundColor: color.bg,
                  color: color.text
                }}
              >
                {coordinator.avatar ? (
                  <img
                    src={coordinator.avatar}
                    alt={coordinator.name}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  getInitials(coordinator.name)
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="text-sm font-medium truncate"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  {coordinator.name}
                </p>
                {coordinator.email && (
                  <p
                    className="text-xs truncate"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {coordinator.email}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="absolute left-1/2 w-3 h-3 rotate-45 border"
        style={{
          backgroundColor: 'var(--color-bg-base)',
          borderColor: 'var(--color-border-default)',
          transform: 'translateX(-50%) rotate(45deg)',
          ...(position.placement === 'bottom'
            ? { top: -7, borderRight: 'none', borderBottom: 'none' }
            : { bottom: -7, borderLeft: 'none', borderTop: 'none' })
        }}
      />
    </div>,
    document.body
  ) : null;

  return (
    <div 
      ref={triggerRef}
      className="flex items-center w-fit"
      onMouseEnter={openDropdown}
      onMouseLeave={scheduleClose}
    >
      {/* Avatar Stack */}
      <div className="flex -space-x-2">
        {visibleCoordinators.map((coordinator, index) => {
          const color = getAvatarColor(coordinator.name);
          
          return (
            <div
              key={coordinator._id || index}
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium border-2 transition-transform hover:scale-110 hover:z-10"
              style={{
                backgroundColor: color.bg,
                color: color.text,
                borderColor: 'var(--color-bg-base)',
                zIndex: visibleCoordinators.length - index
              }}
            >
              {coordinator.avatar ? (
                <img 
                  src={coordinator.avatar} 
                  alt={coordinator.name}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                getInitials(coordinator.name)
              )}
            </div>
          );
        })}
        
        {/* Overflow Count */}
        {remainingCount > 0 && (
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium border-2"
            style={{
              backgroundColor: 'var(--color-bg-muted)',
              color: 'var(--color-text-secondary)',
              borderColor: 'var(--color-bg-base)'
            }}
          >
            +{remainingCount}
          </div>
        )}
      </div>

      {hoverCard}
    </div>
  );
};

export default CoordinatorAvatars;
