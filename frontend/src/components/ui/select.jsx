import React, { forwardRef, useCallback, useEffect, useRef, useMemo } from 'react';
import { ChevronDown, Check } from 'lucide-react';

const Select = ({ children, value, onValueChange, disabled = false, ...props }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [selectedValue, setSelectedValue] = React.useState(value);
  const selectRef = useRef(null);

  useEffect(() => {
    setSelectedValue(value);
  }, [value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (selectRef.current && !selectRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleSelect = useCallback((newValue) => {
    setSelectedValue(newValue);
    onValueChange?.(newValue);
    setIsOpen(false);
  }, [onValueChange]);

  const toggleOpen = useCallback(() => {
    if (!disabled) {
      setIsOpen(prev => !prev);
    }
  }, [disabled]);

  const { placeholder, displayValue } = useMemo(() => {
    let placeholderText = 'Select...';
    let selectedLabel = null;

    const findSelectedLabel = (nodes) => {
      React.Children.forEach(nodes, (child) => {
        if (!child) return;
        
        // If we already found the label, stop looking (optimization)
        if (selectedLabel) return;

        // Check for SelectValue to update placeholder
        if (child.type === SelectValue) {
          placeholderText = child.props.placeholder || placeholderText;
        }

        // Check for SelectItem matching the value
        if (child.type === SelectItem && child.props.value === selectedValue) {
          selectedLabel = child.props.label ?? child.props.children;
          return;
        }

        // Recurse into SelectContent or Fragments or Arrays
        // Note: React.Children.forEach automatically flattens arrays, so we just check for containers
        if (child.type === SelectContent || child.type === React.Fragment) {
          findSelectedLabel(child.props.children);
        }
        
        // Also handle the case where children is just an array/fragment implied
        if (child.props && child.props.children && typeof child.type !== 'string') {
             // We generally don't want to dive into ALL components, potentially expensive or wrong.
             // But for SelectContent specifically it's needed.
             // The logic above handles SelectContent.
        }
      });
    };

    findSelectedLabel(children);
    
    return { placeholder: placeholderText, displayValue: selectedLabel || placeholderText };
  }, [children, selectedValue]);

  return (
    <div className="relative" ref={selectRef} {...props}>
      {React.Children.map(children, (child) => {
        if (child?.type === SelectTrigger) {
          return React.cloneElement(child, {
            onClick: toggleOpen,
            isOpen,
            selectedValue,
            displayValue,
            disabled
          });
        }
        if (child?.type === SelectContent) {
          return isOpen ? React.cloneElement(child, {
            onSelect: handleSelect,
            selectedValue,
            onClose: () => setIsOpen(false)
          }) : null;
        }
        return child;
      })}
    </div>
  );
};

const SelectTrigger = forwardRef(({ className = '', children, onClick, isOpen, selectedValue, displayValue, disabled, ...props }, ref) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-10 w-full items-center justify-between rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white ring-offset-white dark:ring-offset-gray-900 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer transition-all duration-200 hover:border-blue-400 dark:hover:border-blue-500 active:scale-[0.99] ${className}`}
      ref={ref}
      {...props}
    >
      <span className="truncate text-gray-900 dark:text-white">{displayValue}</span>
      <ChevronDown className={`h-4 w-4 opacity-50 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
    </button>
  );
});

const SelectValue = ({ placeholder }) => {
  return <span className="text-gray-500 dark:text-gray-400">{placeholder}</span>;
};

const SelectContent = forwardRef(({ className = '', children, onSelect, selectedValue, onClose, ...props }, ref) => {
  return (
    <div
      className={`absolute top-full left-0 right-0 z-50 min-w-[8rem] rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-950 dark:text-gray-100 shadow-lg mt-1 animate-in fade-in-0 zoom-in-95 duration-150 ${className}`}
      ref={ref}
      {...props}
    >
      <div className="p-1 max-h-64 overflow-y-auto select-dropdown-scroll">
        {React.Children.map(children, (child) => {
          if (child?.type === SelectItem) {
            return React.cloneElement(child, {
              onSelect,
              selectedValue
            });
          }
          return child;
        })}
      </div>
    </div>
  );
});

const SelectItem = forwardRef(({ className = '', children, value, label, onSelect, selectedValue, ...props }, ref) => {
  const isSelected = selectedValue === value;

  const handleClick = useCallback(() => {
    onSelect?.(value);
  }, [onSelect, value]);

  return (
    <div
      className={`relative flex w-full cursor-pointer select-none items-center rounded-sm py-2 pl-8 pr-2 text-sm outline-none transition-colors duration-150 text-gray-900 dark:text-gray-100 hover:bg-blue-50 dark:hover:bg-blue-900/30 focus:bg-blue-50 dark:focus:bg-blue-900/30 ${isSelected ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : ''} ${className}`}
      onClick={handleClick}
      ref={ref}
      {...props}
    >
      {isSelected && (
        <Check className="absolute left-2 h-4 w-4 text-blue-600 dark:text-blue-400" />
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
