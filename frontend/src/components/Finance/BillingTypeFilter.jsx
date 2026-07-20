import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  CreditCard
} from 'lucide-react';

const BILLING_OPTIONS = [
  { value: 'all', label: 'All Billing' },
  { value: 'fixed', label: 'Fixed' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'milestone', label: 'Milestone' }
];

const BillingTypeFilter = ({ value = 'all', onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const selectedValue = value === 'hr' ? 'hourly' : (value || 'all');
  const selectedOption = BILLING_OPTIONS.find(option => option.value === selectedValue) || BILLING_OPTIONS[0];

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all duration-200"
        style={{
          backgroundColor: selectedValue !== 'all'
            ? 'rgba(16, 185, 129, 0.1)'
            : 'var(--color-bg-secondary)',
          borderColor: selectedValue !== 'all' || isOpen
            ? '#10b981'
            : 'var(--color-border-subtle)',
          color: selectedValue !== 'all'
            ? '#10b981'
            : 'var(--color-text-secondary)'
        }}
      >
        <CreditCard className="w-4 h-4" />
        <span className="font-medium">{selectedOption.label}</span>
        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          className="absolute top-full left-0 mt-2 py-2 rounded-xl border z-[100] min-w-40"
          style={{
            backgroundColor: '#ffffff',
            borderColor: '#e5e7eb',
            boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.2), 0 4px 20px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.05)'
          }}
        >
          {BILLING_OPTIONS.map((option) => {
            const isSelected = option.value === selectedValue;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange?.(option.value);
                  setIsOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 mx-1.5 rounded-lg text-sm transition-all duration-150"
                style={{
                  color: isSelected ? '#10b981' : 'var(--color-text-primary)',
                  backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                  width: 'calc(100% - 12px)'
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = '#f3f4f6';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span>{option.label}</span>
                {isSelected && <Check className="w-4 h-4" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BillingTypeFilter;
