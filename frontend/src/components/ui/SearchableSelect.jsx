import React, { useState, useMemo, useCallback, useRef, useEffect, forwardRef } from 'react';
import { flushSync } from 'react-dom';
import { ChevronDown, Check, X, Search, Plus, Trash2 } from 'lucide-react';
import useKeyboardNavigation from '../../hooks/useKeyboardNavigation';
import { focusNextTabbable } from '../../utils/focusUtils';
import { registerOpenDropdown, unregisterDropdown } from '../../utils/dropdownManager';

// ────────────────────────────────────────────────────────────
// SearchableSelect — unified dropdown for filters + forms
// ────────────────────────────────────────────────────────────

const SearchableSelect = React.memo(forwardRef(({
  // Core
  value,
  onChange,
  options = [],
  placeholder = 'Select...',
  // Search
  searchable = true,
  searchPlaceholder = 'Type to filter...',
  // Behavior
  autoOpenOnFocus = true,
  autoSelectOnTab = true,
  clearable = false,
  disabled = false,
  error = false,
  // Suggestion priority
  prioritizedValues = [],
  // Add / Delete
  onAddOption,
  onDeleteOption,
  canDeleteOption,
  // Customization
  renderOption,
  maxHeight = 'max-h-64',
  className = '',
  triggerClassName = '',
}, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newOptionValue, setNewOptionValue] = useState('');

  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);
  const suppressFocusOpenRef = useRef(false);
  // Tracks whether the current focus event was triggered by a pointer (mouse/touch)
  // click. When true, handleTriggerFocus skips auto-open because the click event
  // (which fires right after focus) will call toggleDropdown and open it instead.
  const pointerDownRef = useRef(false);

  // Unique instance ID for the global dropdown manager
  const instanceId = useRef(`ss-${Math.random().toString(36).slice(2, 9)}`).current;

  // Expose trigger focus via forwarded ref
  React.useImperativeHandle(ref, () => ({
    focus: () => triggerRef.current?.focus(),
    get element() { return triggerRef.current; },
  }));

  // ── Derived data ───────────────────────────────────────
  const filteredOptions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const base = term
      ? options.filter(o => (o.label || o.value).toLowerCase().includes(term))
      : options;

    // Hoist prioritized values to top (preserving order of priority list)
    if (prioritizedValues.length === 0) return base;
    const prioSet = new Set(prioritizedValues);
    const prioritized = [];
    const rest = [];
    base.forEach(o => {
      if (prioSet.has(o.value)) prioritized.push(o);
      else rest.push(o);
    });
    // Sort prioritized items by their order in prioritizedValues
    prioritized.sort((a, b) => prioritizedValues.indexOf(a.value) - prioritizedValues.indexOf(b.value));
    return [...prioritized, ...rest];
  }, [options, searchTerm, prioritizedValues]);

  const hasPrioritizedSection = useMemo(() => {
    if (!prioritizedValues.length || searchTerm.trim()) return false;
    return filteredOptions.some(o => prioritizedValues.includes(o.value));
  }, [filteredOptions, prioritizedValues, searchTerm]);

  // Index of first non-prioritized option (for separator rendering)
  const prioritizedCount = useMemo(() => {
    if (!hasPrioritizedSection) return 0;
    const prioSet = new Set(prioritizedValues);
    let count = 0;
    for (const o of filteredOptions) {
      if (prioSet.has(o.value)) count++;
      else break;
    }
    return count;
  }, [hasPrioritizedSection, filteredOptions, prioritizedValues]);

  const selectedOption = useMemo(
    () => options.find(o => o.value === value),
    [options, value],
  );

  const selectedIndex = useMemo(
    () => filteredOptions.findIndex(o => o.value === value),
    [filteredOptions, value],
  );

  // ── Keyboard navigation ────────────────────────────────
  const handleItemSelect = useCallback((index) => {
    const item = filteredOptions[index];
    if (item) {
      onChange?.(item.value);

      // Ensure we synchronously remove the dropdown from the DOM before
      // moving focus — this prevents the trigger's onFocus from reopening
      // the dropdown due to React's batched updates.
      unregisterDropdown(instanceId);
      flushSync(() => {
        setSearchTerm('');
        setIsOpen(false);
        setIsAdding(false);
        setNewOptionValue('');
      });

      // After synchronous close, move focus back to trigger to preserve
      // accessibility. Using requestAnimationFrame so browser has applied
      // layout changes.
      suppressFocusOpenRef.current = true;
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, [filteredOptions, onChange, instanceId]);

  // Centralized close — always unregisters from the global manager
  const closeDropdown = useCallback(() => {
    unregisterDropdown(instanceId);
    setSearchTerm('');
    setIsOpen(false);
    setIsAdding(false);
    setNewOptionValue('');
  }, [instanceId]);

  const handleClose = useCallback(() => {
    closeDropdown();
    suppressFocusOpenRef.current = true;
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, [closeDropdown]);

  const {
    highlightedIndex,
    setHighlightedIndex,
    resetHighlight,
    getKeyHandler,
    itemRefs,
  } = useKeyboardNavigation({
    itemCount: filteredOptions.length,
    isOpen,
    onSelect: handleItemSelect,
    onClose: handleClose,
    loop: true,
    initialIndex: selectedIndex >= 0 ? selectedIndex : 0,
  });

  // Reset highlight when search changes
  useEffect(() => {
    if (isOpen) resetHighlight();
  }, [searchTerm, isOpen, resetHighlight]);

  // ── Open / Close ───────────────────────────────────────
  const openDropdown = useCallback(() => {
    if (disabled || isOpen) return;
    // Register with the global manager — auto-closes any other open dropdown
    registerOpenDropdown(instanceId, () => {
      // This callback is invoked by the NEXT dropdown that opens.
      // Use flushSync so the DOM is updated synchronously before
      // the new dropdown renders — prevents dual-dropdown flicker.
      flushSync(() => {
        setSearchTerm('');
        setIsOpen(false);
        setIsAdding(false);
        setNewOptionValue('');
      });
    });
    setIsOpen(true);
    setSearchTerm('');
    setIsAdding(false);
    setNewOptionValue('');
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [disabled, isOpen, instanceId]);

  const toggleDropdown = useCallback(() => {
    if (disabled) return;
    if (isOpen) handleClose();
    else openDropdown();
  }, [disabled, isOpen, handleClose, openDropdown]);

  // Cleanup on unmount — unregister from global manager
  useEffect(() => {
    return () => unregisterDropdown(instanceId);
  }, [instanceId]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, closeDropdown]);

  // Auto-focus search on open
  useEffect(() => {
    if (isOpen && searchable) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [isOpen, searchable]);

  // ── Trigger handlers ───────────────────────────────────
  const handleTriggerFocus = useCallback(() => {
    if (suppressFocusOpenRef.current) {
      suppressFocusOpenRef.current = false;
      return;
    }
    // Focus came from a mouse/touch click — the subsequent click event will
    // call toggleDropdown which opens the dropdown. Skip auto-open here to
    // prevent the focus→open followed by click→toggle-close race condition.
    if (pointerDownRef.current) return;
    if (autoOpenOnFocus && !disabled && !isOpen) openDropdown();
  }, [autoOpenOnFocus, disabled, isOpen, openDropdown]);

  const listKeyHandler = getKeyHandler({
    onTab: (idx, e) => {
      // ── CRITICAL: Enterprise Tab workflow ────────────────────────
      // 1. Prevent browser default (we control focus manually)
      e.preventDefault();

      // 2. Commit selection
      if (autoSelectOnTab) {
        if (idx >= 0 && filteredOptions[idx]) {
          onChange?.(filteredOptions[idx].value);
        } else if (filteredOptions.length > 0) {
          // No highlight — auto-select first visible option
          onChange?.(filteredOptions[0].value);
        }
      }

      // 3. Unregister from global manager immediately
      unregisterDropdown(instanceId);

      // 4. Synchronously close dropdown — removes from DOM before
      //    the next focus event fires, preventing dual-dropdown flicker
      flushSync(() => {
        setSearchTerm('');
        setIsOpen(false);
        setIsAdding(false);
        setNewOptionValue('');
      });

      // 5. Advance focus to next (or previous on Shift+Tab) field
      //    from the trigger button, which is still in the DOM
      focusNextTabbable(triggerRef.current, e.shiftKey);

      return true; // Signal: handled, skip default handler
    },
    onEnter: (idx, e) => {
      e.preventDefault();
      if (idx >= 0) handleItemSelect(idx);
    },
  });

  const handleTriggerKeyDown = useCallback((e) => {
    if (disabled) return;
    if (!isOpen) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openDropdown();
        return;
      }
      // Tab on closed dropdown — normal tab flow
      return;
    }
    listKeyHandler(e);
  }, [disabled, isOpen, openDropdown, listKeyHandler]);

  // ── Search input handler ───────────────────────────────
  const handleSearchKeyDown = useCallback((e) => {
    // Don't let Enter submit the form
    if (e.key === 'Enter') e.preventDefault();
    // Forward navigation keys to list handler
    if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab', 'Home', 'End'].includes(e.key)) {
      listKeyHandler(e);
      return;
    }
    // For Space, only forward if search is empty (so users can type spaces)
    if (e.key === ' ' && !searchTerm) {
      listKeyHandler(e);
    }
  }, [listKeyHandler, searchTerm]);

  // ── Clear ──────────────────────────────────────────────
  const handleClear = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
    onChange?.('');
    closeDropdown();
    suppressFocusOpenRef.current = true;
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, [onChange, closeDropdown]);

  // ── Add option ─────────────────────────────────────────
  const handleAddSubmit = useCallback(async (e) => {
    e?.preventDefault();
    e?.stopPropagation();
    const val = newOptionValue.trim();
    if (!val || !onAddOption) return;
    if (options.some(o => o.value.toLowerCase() === val.toLowerCase())) return;
    try {
      await onAddOption(val);
      onChange?.(val);
      setNewOptionValue('');
      setIsAdding(false);
    } catch { /* error handled by caller */ }
  }, [newOptionValue, onAddOption, options, onChange]);

  const handleAddKeyDown = useCallback((e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); handleAddSubmit(e); }
    if (e.key === 'Escape') { e.stopPropagation(); setIsAdding(false); setNewOptionValue(''); searchRef.current?.focus(); }
    if (e.key === 'Tab') {
      // Close dropdown and advance focus, same as search input Tab
      e.preventDefault();
      unregisterDropdown(instanceId);
      flushSync(() => {
        setSearchTerm('');
        setIsOpen(false);
        setIsAdding(false);
        setNewOptionValue('');
      });
      focusNextTabbable(triggerRef.current, e.shiftKey);
    }
  }, [handleAddSubmit, instanceId]);

  // ── Render ─────────────────────────────────────────────
  const showClear = clearable && value && !disabled;

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-invalid={error || undefined}
        disabled={disabled}
        onMouseDown={() => {
          pointerDownRef.current = true;
          requestAnimationFrame(() => { pointerDownRef.current = false; });
        }}
        onClick={toggleDropdown}
        onFocus={handleTriggerFocus}
        onKeyDown={handleTriggerKeyDown}
        className={`flex h-11 w-full items-center justify-between rounded-xl border bg-white dark:bg-gray-900/80 px-3.5 py-2.5 text-sm ring-offset-white dark:ring-offset-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer transition-all duration-200 ${
          isOpen
            ? 'border-blue-500 ring-2 ring-blue-500/20 dark:border-blue-400'
            : error
              ? 'border-red-400 dark:border-red-500 ring-1 ring-red-400/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-500'
        } ${triggerClassName}`}
      >
        <span className={`truncate ${selectedOption ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-400 dark:text-gray-500'}`}>
          {selectedOption ? (selectedOption.label || selectedOption.value) : placeholder}
        </span>
        <div className="flex items-center gap-1 shrink-0 ml-1">
          {showClear && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear selection"
              onClick={handleClear}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClear(e); } }}
              className="p-0.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          role="listbox"
          className={`absolute top-full left-0 right-0 z-[100] min-w-[8rem] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-2xl shadow-black/12 dark:shadow-black/30 mt-1.5 animate-in fade-in-0 zoom-in-95 duration-150 overflow-hidden`}
        >
          {/* Search */}
          {searchable && (
            <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 p-2 border-b border-gray-100 dark:border-gray-700">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  ref={searchRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={handleSearchKeyDown}
                  placeholder={searchPlaceholder}
                  className="w-full h-9 text-sm border border-gray-200 dark:border-gray-600 rounded-lg pl-8 pr-8 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none transition-colors text-gray-900 dark:text-white placeholder:text-gray-400"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  data-form-type="other"
                  data-lpignore="true"
                  data-1p-ignore="true"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setSearchTerm(''); searchRef.current?.focus(); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Option List */}
          <div ref={listRef} className={`p-1 ${maxHeight} overflow-y-auto select-dropdown-scroll`}>
            {/* Suggested section header */}
            {hasPrioritizedSection && (
              <div className="px-2.5 py-1.5 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider select-none">
                Suggested
              </div>
            )}

            {filteredOptions.length === 0 && (
              <div className="p-4 text-sm text-gray-400 text-center select-none">
                {searchTerm ? `No results for "${searchTerm}"` : 'No options available'}
              </div>
            )}

            {filteredOptions.map((opt, idx) => {
              const isSelected = opt.value === value;
              const isHighlighted = idx === highlightedIndex;
              const showSeparator = hasPrioritizedSection && idx === prioritizedCount && idx > 0;
              const canDelete = onDeleteOption && (canDeleteOption ? canDeleteOption(opt) : true);

              return (
                <React.Fragment key={opt._id || opt.value}>
                  {showSeparator && (
                    <div className="my-1 mx-2 border-t border-gray-100 dark:border-gray-700" />
                  )}
                  <div
                    ref={(el) => { itemRefs.current[idx] = el; }}
                    role="option"
                    aria-selected={isSelected}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleItemSelect(idx);
                    }}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`relative flex items-center gap-2 px-2.5 py-2 text-sm rounded-lg cursor-pointer transition-colors duration-100 group select-none ${
                      isHighlighted
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        : isSelected
                          ? 'bg-gray-50 dark:bg-gray-700/50'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    {/* Check mark */}
                    <span className={`w-4 h-4 flex items-center justify-center shrink-0 ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-transparent'}`}>
                      <Check className="w-3.5 h-3.5" />
                    </span>

                    {/* Option content */}
                    <span className={`truncate flex-1 ${isSelected ? 'font-medium' : ''}`}>
                      {renderOption ? renderOption(opt, { isSelected, isHighlighted }) : (opt.label || opt.value)}
                    </span>

                    {/* Delete button */}
                    {canDelete && opt._id && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onDeleteOption(opt);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500 p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0"
                        title={`Delete ${opt.label}`}
                        aria-label={`Delete ${opt.label}`}
                        tabIndex={-1}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
          </div>

          {/* Add new option footer */}
          {onAddOption && (
            <div className="p-2 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
              {!isAdding ? (
                <button
                  type="button"
                  className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 w-full px-2 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsAdding(true); }}
                  tabIndex={-1}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add new option
                </button>
              ) : (
                <div className="flex items-center gap-2 animate-in fade-in zoom-in duration-200">
                  <input
                    type="text"
                    value={newOptionValue}
                    onChange={(e) => setNewOptionValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={handleAddKeyDown}
                    className="flex-1 h-9 text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none min-w-0 transition-colors text-gray-900 dark:text-white"
                    placeholder="Enter value..."
                    autoFocus
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    data-form-type="other"
                    data-lpignore="true"
                    data-1p-ignore="true"
                  />
                  <button
                    type="button"
                    onClick={handleAddSubmit}
                    disabled={!newOptionValue.trim()}
                    className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 shrink-0 transition-colors"
                    tabIndex={-1}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setIsAdding(false); setNewOptionValue(''); }}
                    className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 shrink-0"
                    tabIndex={-1}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}));

SearchableSelect.displayName = 'SearchableSelect';

export default SearchableSelect;
