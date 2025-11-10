import React, { forwardRef } from 'react';
import { ChevronDown, Check } from 'lucide-react';

const Select = ({ children, value, onValueChange, ...props }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [selectedValue, setSelectedValue] = React.useState(value);

  React.useEffect(() => {
    setSelectedValue(value);
  }, [value]);

  const handleSelect = (newValue) => {
    setSelectedValue(newValue);
    onValueChange?.(newValue);
    setIsOpen(false);
  };

  let placeholder = 'Select...';
  React.Children.forEach(children, (child) => {
    if (child.type === SelectValue) {
      placeholder = child.props.placeholder || placeholder;
    }
  });

  return (
    <div className="relative" {...props}>
      {React.Children.map(children, (child) => {
        if (child.type === SelectTrigger) {
          return React.cloneElement(child, {
            onClick: () => setIsOpen(!isOpen),
            isOpen,
            selectedValue,
            placeholder
          });
        }
        if (child.type === SelectContent) {
          return isOpen ? React.cloneElement(child, {
            onSelect: handleSelect,
            selectedValue
          }) : null;
        }
        return child;
      })}
    </div>
  );
};

const SelectTrigger = forwardRef(({ className = '', children, onClick, isOpen, selectedValue, placeholder, ...props }, ref) => {
  const displayValue = placeholder || 'Select...';

  return (
    <button
      type="button"
      className={`flex h-10 w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      onClick={onClick}
      ref={ref}
      {...props}
    >
      <span className="truncate">{displayValue}</span>
      <ChevronDown className={`h-4 w-4 opacity-50 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
    </button>
  );
});

const SelectValue = ({ placeholder }) => {
  return <span>{placeholder}</span>;
};

const SelectContent = forwardRef(({ className = '', children, onSelect, selectedValue, ...props }, ref) => {
  return (
    <div
      className={`absolute top-full z-50 min-w-[8rem] overflow-hidden rounded-md border border-gray-200 bg-white text-gray-950 shadow-md animate-in fade-in-80 ${className}`}
      ref={ref}
      {...props}
    >
      <div className="p-1">
        {React.Children.map(children, (child) => {
          if (child.type === SelectItem) {
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

const SelectItem = forwardRef(({ className = '', children, value, onSelect, selectedValue, ...props }, ref) => {
  const isSelected = selectedValue === value;

  return (
    <div
      className={`relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-gray-100 focus:bg-gray-100 ${className}`}
      onClick={() => onSelect?.(value)}
      ref={ref}
      {...props}
    >
      {isSelected && (
        <Check className="absolute left-2 h-4 w-4" />
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
