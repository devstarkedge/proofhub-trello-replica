import React, { forwardRef, useCallback, useEffect, useRef, useMemo, useState } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';

/**
 * Enterprise-grade Select with full keyboard-first navigation.
 * - Tab/focus on trigger → auto-opens dropdown (when autoOpenOnFocus)
 * - ArrowDown/ArrowUp → navigate items
 * - Enter/Space → select highlighted item
 * - Escape → close dropdown
 * - Tab (while open) → select highlighted & advance focus
 */
const Select = ({ children, value, onValueChange, disabled = false, onOpenChange, clearable = false, autoOpenOnFocus = false, ...props }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState(value);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const selectRef = useRef(null);
  const triggerRef = useRef(null);
  const itemsRef = useRef([]);

  useEffect(() => { setSelectedValue(value); }, [value]);

  const resolvedValue = value !== undefined ? value : selectedValue;

  // Collect selectable item values from children
  const selectableItems = useMemo(() => {
    const items = [];
    const collect = (nodes) => {
      React.Children.forEach(nodes, (child) => {
        if (!child) return;
        if (child.type === SelectItem) items.push({ value: child.props.value, label: child.props.label ?? child.props.children });
        if (child.type === SelectContent || child.type === React.Fragment) collect(child.props.children);
      });
    };
    collect(children);
    return items;
  }, [children]);

  // Reset highlight when dropdown opens/closes
  useEffect(() => {
    if (isOpen) {
      const idx = selectableItems.findIndex(i => i.value === resolvedValue);
      setHighlightedIndex(idx >= 0 ? idx : 0);
    } else {
      setHighlightedIndex(-1);
    }
  }, [isOpen, selectableItems, resolvedValue]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (selectRef.current && !selectRef.current.contains(e.target)) {
        setIsOpen(false);
        onOpenChange?.(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onOpenChange]);

  const openDropdown = useCallback(() => {
    if (!disabled && !isOpen) { setIsOpen(true); onOpenChange?.(true); }
  }, [disabled, isOpen, onOpenChange]);

  const closeDropdown = useCallback(() => {
    setIsOpen(false); onOpenChange?.(false);
  }, [onOpenChange]);

  const handleSelect = useCallback((newValue) => {
    setSelectedValue(newValue);
    onValueChange?.(newValue);
    setIsOpen(false);
    onOpenChange?.(false);
    // Return focus to trigger for natural Tab flow to next field
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, [onValueChange, onOpenChange]);

  const handleClear = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedValue('');
    onValueChange?.('');
    setIsOpen(false);
    onOpenChange?.(false);
  }, [onValueChange, onOpenChange]);

  const toggleOpen = useCallback(() => {
    if (!disabled) {
      setIsOpen(prev => { const next = !prev; onOpenChange?.(next); return next; });
    }
  }, [disabled, onOpenChange]);

  // Auto-open on focus for keyboard-first workflow
  const handleTriggerFocus = useCallback(() => {
    if (autoOpenOnFocus && !disabled) openDropdown();
  }, [autoOpenOnFocus, disabled, openDropdown]);

  // Full keyboard navigation
  const handleTriggerKeyDown = useCallback((e) => {
    if (disabled) return;
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (isOpen) {
          if (highlightedIndex >= 0 && highlightedIndex < selectableItems.length) {
            handleSelect(selectableItems[highlightedIndex].value);
          } else { closeDropdown(); }
        } else { openDropdown(); }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) { openDropdown(); }
        else { setHighlightedIndex(prev => prev < selectableItems.length - 1 ? prev + 1 : 0); }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!isOpen) { openDropdown(); }
        else { setHighlightedIndex(prev => prev > 0 ? prev - 1 : selectableItems.length - 1); }
        break;
      case 'Escape':
        if (isOpen) { e.preventDefault(); e.stopPropagation(); closeDropdown(); triggerRef.current?.focus(); }
        break;
      case 'Tab':
        if (isOpen) {
          // Select highlighted & let Tab advance focus naturally
          if (highlightedIndex >= 0 && highlightedIndex < selectableItems.length) {
            const item = selectableItems[highlightedIndex];
            setSelectedValue(item.value);
            onValueChange?.(item.value);
          }
          setIsOpen(false);
          onOpenChange?.(false);
        }
        break;
      default: break;
    }
  }, [disabled, isOpen, highlightedIndex, selectableItems, handleSelect, closeDropdown, openDropdown, onValueChange, onOpenChange]);

  const { placeholder, displayValue } = useMemo(() => {
    let placeholderText = 'Select...';
    let selectedLabel = null;
    const find = (nodes) => {
      React.Children.forEach(nodes, (child) => {
        if (!child || selectedLabel) return;
        if (child.type === SelectValue) placeholderText = child.props.placeholder || placeholderText;
        if (child.type === SelectItem && child.props.value === resolvedValue) { selectedLabel = child.props.label ?? child.props.children; return; }
        if (child.type === SelectContent || child.type === React.Fragment) find(child.props.children);
      });
    };
    find(children);
    return { placeholder: placeholderText, displayValue: selectedLabel || placeholderText };
  }, [children, resolvedValue]);

  const hasValue = resolvedValue !== undefined && resolvedValue !== null && resolvedValue !== '';
  const showClear = clearable && hasValue && !disabled;

  return (
    <div className="relative" ref={selectRef} {...props}>
      {React.Children.map(children, (child) => {
        if (child?.type === SelectTrigger) {
          return React.cloneElement(child, {
            ref: triggerRef,
            onClick: toggleOpen,
            onFocus: handleTriggerFocus,
            onKeyDown: handleTriggerKeyDown,
            isOpen, selectedValue: resolvedValue, displayValue, disabled, showClear, onClear: handleClear,
          });
        }
        if (child?.type === SelectContent) {
          return isOpen ? React.cloneElement(child, {
            onSelect: handleSelect, selectedValue: resolvedValue, onClose: closeDropdown,
            highlightedIndex, onHighlightChange: setHighlightedIndex, itemsRef,
          }) : null;
        }
        return child;
      })}
    </div>
  );
};

const SelectTrigger = forwardRef(({ className = '', children, onClick, onFocus, onKeyDown, isOpen, selectedValue, displayValue, disabled, showClear, onClear, ...props }, ref) => {
  return (
    <button
      type="button"
      onClick={onClick}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      disabled={disabled}
      role="combobox"
      aria-expanded={isOpen}
      aria-haspopup="listbox"
      className={`flex h-11 w-full items-center justify-between rounded-xl border bg-white dark:bg-gray-900/80 px-3.5 py-2.5 text-sm ring-offset-white dark:ring-offset-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer transition-all duration-200 ${isOpen ? 'border-blue-500 ring-2 ring-blue-500/20 dark:border-blue-400' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-500'} ${className}`}
      ref={ref}
      {...props}
    >
      <span className={`truncate ${selectedValue ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-400 dark:text-gray-500'}`}>{displayValue}</span>
      <div className="flex items-center gap-1 shrink-0 ml-1">
        {showClear && (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear selection"
            onClick={onClear}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClear?.(e); } }}
            className="p-0.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
        <ChevronDown className={`h-4 w-4 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </div>
    </button>
  );
});

const SelectValue = ({ placeholder }) => {
  return <span className="text-gray-400 dark:text-gray-500">{placeholder}</span>;
};

const SelectContent = forwardRef(({ className = '', children, onSelect, selectedValue, onClose, highlightedIndex = -1, onHighlightChange, itemsRef, ...props }, ref) => {
  const contentRef = useRef(null);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && itemsRef?.current[highlightedIndex]) {
      itemsRef.current[highlightedIndex].scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, itemsRef]);

  let itemIndex = -1;

  return (
    <div
      className={`absolute top-full left-0 right-0 z-[100] min-w-[8rem] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-xl shadow-black/8 dark:shadow-black/25 mt-1.5 animate-in fade-in-0 zoom-in-95 duration-150 overflow-hidden ${className}`}
      ref={ref || contentRef}
      role="listbox"
      {...props}
    >
      <div className="p-1 max-h-64 overflow-y-auto select-dropdown-scroll">
        {React.Children.map(children, (child) => {
          if (child?.type === SelectItem) {
            itemIndex++;
            const idx = itemIndex;
            return React.cloneElement(child, {
              onSelect, selectedValue,
              isHighlighted: idx === highlightedIndex,
              onMouseEnter: () => onHighlightChange?.(idx),
              ref: (el) => { if (itemsRef) itemsRef.current[idx] = el; },
            });
          }
          return child;
        })}
      </div>
    </div>
  );
});

const SelectItem = forwardRef(({ className = '', children, value, label, onSelect, selectedValue, isHighlighted = false, onMouseEnter, ...props }, ref) => {
  const isSelected = selectedValue === value;

  const handleClick = useCallback(() => { onSelect?.(value); }, [onSelect, value]);

  return (
    <div
      className={`relative flex w-full cursor-pointer select-none items-center rounded-lg py-2.5 pl-9 pr-3 text-sm outline-none transition-colors duration-100 ${isHighlighted ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'} ${isSelected ? 'font-medium text-blue-700 dark:text-blue-300' : ''} ${className}`}
      onClick={handleClick}
      onMouseEnter={onMouseEnter}
      role="option"
      aria-selected={isSelected}
      ref={ref}
      {...props}
    >
      {isSelected && (
        <Check className="absolute left-2.5 h-4 w-4 text-blue-600 dark:text-blue-400" />
      )}
      <span className="truncate">{children}</span>
    </div>
  );
});

SelectTrigger.displayName = 'SelectTrigger';
SelectValue.displayName = 'SelectValue';
SelectContent.displayName = 'SelectContent';
SelectItem.displayName = 'SelectItem';

export {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
};
