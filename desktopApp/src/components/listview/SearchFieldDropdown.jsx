import React, { useState, useRef, useEffect, memo } from 'react';
import { Search, Tag, FolderKanban, Users, Zap, Target, ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useSmartSearchStore from '../../store/smartSearchStore';

const FIELD_OPTIONS = [
  { value: 'all', label: 'All', icon: Search },
  { value: 'task', label: 'Task', icon: Tag },
  { value: 'project', label: 'Project', icon: FolderKanban },
  { value: 'assignee', label: 'Assignees', icon: Users },
  { value: 'priority', label: 'Priority', icon: Zap },
  { value: 'status', label: 'Status', icon: Target },
];

const SearchFieldDropdown = ({ onOpen, attached }) => {
  const { activeField, setActiveField } = useSmartSearchStore();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const listRef = useRef(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const current = FIELD_OPTIONS.find(f => f.value === activeField) || FIELD_OPTIONS[0];
  const Icon = current.icon;

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = (value) => {
    setActiveField(value);
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
        setHighlightedIndex(0);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(i => (i + 1) % FIELD_OPTIONS.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(i => (i - 1 + FIELD_OPTIONS.length) % FIELD_OPTIONS.length);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (highlightedIndex >= 0) handleSelect(FIELD_OPTIONS[highlightedIndex].value);
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
      default:
        break;
    }
  };

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => {
          if (!open) onOpen?.();
          setOpen(!open);
        }}
        onKeyDown={handleKeyDown}
        className={attached
          ? `flex items-center gap-1 px-3 py-2.5 rounded-l-xl transition-all duration-200 text-sm font-semibold select-none ${open ? 'bg-blue-50 text-blue-700' : 'bg-transparent text-gray-700 hover:bg-blue-50/50'}`
          : `flex items-center gap-1.5 px-3 py-2.5 rounded-xl border-2 transition-all duration-200 text-sm font-semibold select-none ${open ? 'border-blue-400 bg-blue-50 text-blue-700 shadow-md shadow-blue-100' : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50/50'}`
        }
        
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Select search field"
      >
        <Icon className="w-4 h-4" />
        <span className="hidden sm:inline">{current.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-1.5 w-48 bg-white/95 backdrop-blur-xl border-2 border-gray-200 rounded-xl shadow-2xl z-[9999] overflow-hidden"
            role="listbox"
            ref={listRef}
          >
            {FIELD_OPTIONS.map((option, index) => {
              const OptIcon = option.icon;
              const isActive = activeField === option.value;
              const isHighlighted = highlightedIndex === index;

              return (
                <button
                  key={option.value}
                  onClick={() => handleSelect(option.value)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm transition-all duration-150
                    ${isActive ? 'bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 font-bold' : ''}
                    ${isHighlighted && !isActive ? 'bg-gray-50 text-gray-900' : ''}
                    ${!isActive && !isHighlighted ? 'text-gray-700 hover:bg-gray-50' : ''}`}
                  role="option"
                  aria-selected={isActive}
                >
                  <OptIcon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-gray-500'}`} />
                  <span className="flex-1 text-left">{option.label}</span>
                  {isActive && <Check className="w-4 h-4 text-blue-600" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default memo(SearchFieldDropdown);
export { FIELD_OPTIONS };
