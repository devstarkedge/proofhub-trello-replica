import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Generic keyboard navigation hook for listbox/combobox patterns.
 *
 * @param {object} opts
 * @param {number}   opts.itemCount       - Total visible items
 * @param {boolean}  opts.isOpen          - Whether the list is currently open
 * @param {function} opts.onSelect        - Called with index when item is confirmed (Enter/Space)
 * @param {function} opts.onClose         - Called when Escape is pressed
 * @param {boolean}  [opts.loop=true]     - Wrap around at edges
 * @param {number}   [opts.initialIndex=0]- Starting highlight when list opens
 *
 * @returns {{ highlightedIndex, setHighlightedIndex, resetHighlight, getKeyHandler, itemRefs }}
 */
export default function useKeyboardNavigation({
  itemCount,
  isOpen,
  onSelect,
  onClose,
  loop = true,
  initialIndex = 0,
}) {
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const itemRefs = useRef([]);

  // Reset highlight when list opens / closes
  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(itemCount > 0 ? Math.min(initialIndex, itemCount - 1) : -1);
    } else {
      setHighlightedIndex(-1);
    }
  }, [isOpen, itemCount, initialIndex]);

  // Auto-scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && itemRefs.current[highlightedIndex]) {
      itemRefs.current[highlightedIndex].scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  const resetHighlight = useCallback(() => {
    setHighlightedIndex(itemCount > 0 ? 0 : -1);
  }, [itemCount]);

  const moveUp = useCallback(() => {
    setHighlightedIndex((prev) => {
      if (prev <= 0) return loop ? itemCount - 1 : 0;
      return prev - 1;
    });
  }, [itemCount, loop]);

  const moveDown = useCallback(() => {
    setHighlightedIndex((prev) => {
      if (prev >= itemCount - 1) return loop ? 0 : itemCount - 1;
      return prev + 1;
    });
  }, [itemCount, loop]);

  /**
   * Returns a keyDown handler. Attach this to any element that should
   * drive list navigation (trigger button, search input, etc.).
   *
   * @param {object} [overrides]
   * @param {function} [overrides.onTab]   - Custom Tab handler. Receives (highlightedIndex, e).
   *                                          Return `true` to prevent default Tab behavior.
   * @param {function} [overrides.onEnter] - Custom Enter handler. Receives (highlightedIndex, e).
   */
  const getKeyHandler = useCallback(
    (overrides = {}) =>
      (e) => {
        if (!isOpen) return;

        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault();
            moveDown();
            break;

          case 'ArrowUp':
            e.preventDefault();
            moveUp();
            break;

          case 'Home':
            e.preventDefault();
            setHighlightedIndex(0);
            break;

          case 'End':
            e.preventDefault();
            setHighlightedIndex(Math.max(itemCount - 1, 0));
            break;

          case 'Enter':
          case ' ':
            if (overrides.onEnter) {
              overrides.onEnter(highlightedIndex, e);
            } else if (highlightedIndex >= 0) {
              e.preventDefault();
              onSelect?.(highlightedIndex);
            }
            break;

          case 'Escape':
            e.preventDefault();
            e.stopPropagation();
            onClose?.();
            break;

          case 'Tab':
            if (overrides.onTab) {
              const handled = overrides.onTab(highlightedIndex, e);
              if (handled) return;
            }
            // Default: select highlighted and let Tab advance focus naturally
            if (highlightedIndex >= 0) {
              onSelect?.(highlightedIndex);
            }
            // Don't preventDefault — let the browser move focus
            break;

          default:
            break;
        }
      },
    [isOpen, highlightedIndex, itemCount, moveDown, moveUp, onSelect, onClose],
  );

  return {
    highlightedIndex,
    setHighlightedIndex,
    resetHighlight,
    getKeyHandler,
    itemRefs,
  };
}
