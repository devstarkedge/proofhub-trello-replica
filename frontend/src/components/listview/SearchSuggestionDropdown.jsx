import React, { memo, useEffect, useRef } from 'react';
import { Tag, FolderKanban, Users, Zap, Target, Search, History, Loader2, SearchX, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useSmartSearchStore from '../../store/smartSearchStore';

const TYPE_ICONS = {
  task: Tag,
  project: FolderKanban,
  assignee: Users,
  priority: Zap,
  status: Target,
};

const TYPE_COLORS = {
  task: 'text-blue-500',
  project: 'text-indigo-500',
  assignee: 'text-green-500',
  priority: 'text-orange-500',
  status: 'text-purple-500',
};

const TYPE_LABELS = {
  task: 'Task',
  project: 'Project',
  assignee: 'Assignee',
  priority: 'Priority',
  status: 'Status',
};

const SearchSuggestionDropdown = ({ onSelect, onSelectRecent, inputRef, isDropdownOpen }) => {
  const {
    suggestions,
    suggestionsLoading,
    showSuggestions,
    highlightedSuggestionIndex,
    setHighlightedSuggestionIndex,
    recentSearches,
    searchText,
    activeField,
    clearRecentSearches,
  } = useSmartSearchStore();

  const listRef = useRef(null);
  const itemRefs = useRef([]);

  // Show recent searches only when input is focused (isDropdownOpen) and text is empty
  const showRecent = !searchText && recentSearches.length > 0 && isDropdownOpen;
  const isVisible = showSuggestions || showRecent;

  // Keep highlighted item scrolled into view
  useEffect(() => {
    if (highlightedSuggestionIndex >= 0 && itemRefs.current[highlightedSuggestionIndex]) {
      itemRefs.current[highlightedSuggestionIndex].scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedSuggestionIndex]);

  if (!isVisible && !suggestionsLoading) return null;

  const items = showRecent
    ? recentSearches.map((s, i) => ({ value: s, label: s, type: 'recent', _index: i }))
    : suggestions;

  // Show empty state when searching but no results
  const showEmptyState = !showRecent && searchText && searchText.length >= 1 && !suggestionsLoading && items.length === 0;

  if (!isVisible && !showEmptyState && !suggestionsLoading) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.15 }}
        className="absolute top-full left-0 right-0 mt-1.5 bg-white/95 backdrop-blur-xl border-2 border-gray-200 rounded-xl shadow-2xl z-[9999] max-h-72 overflow-y-auto"
        ref={listRef}
        role="listbox"
        id="smart-search-suggestions"
      >
        {/* Header */}
        {showRecent && (
          <div className="px-3.5 py-2 border-b border-gray-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <History className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recent Searches</span>
            </div>
            <button
              onMouseDown={(e) => { e.preventDefault(); clearRecentSearches(); }}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1"
              title="Clear all recent searches"
            >
              <Trash2 className="w-3 h-3" />
              Clear all
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {suggestionsLoading && items.length === 0 && (
          <div className="p-3 space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-2.5 px-1 py-1.5 animate-pulse">
                <div className="w-4 h-4 bg-gray-200 rounded" />
                <div className="flex-1 h-4 bg-gray-200 rounded" style={{ width: `${60 + i * 10}%` }} />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {showEmptyState && (
          <div className="flex flex-col items-center gap-2 py-6 px-4">
            <SearchX className="w-8 h-8 text-gray-300" />
            <span className="text-sm text-gray-500 font-medium">No results for &ldquo;{searchText}&rdquo;</span>
            <span className="text-xs text-gray-400">Try a different search term or field</span>
          </div>
        )}

        {/* Group by type for 'all' field */}
        {!showRecent && activeField === 'all' && items.length > 0 && (() => {
          const grouped = {};
          items.forEach(item => {
            if (!grouped[item.type]) grouped[item.type] = [];
            grouped[item.type].push(item);
          });

          let globalIdx = 0;
          return Object.entries(grouped).map(([type, typeItems]) => {
            const TypeIcon = TYPE_ICONS[type] || Search;
            return (
              <div key={type}>
                <div className="px-3.5 py-1.5 border-b border-gray-50 bg-gray-50/50">
                  <span className={`text-xs font-semibold uppercase tracking-wide ${TYPE_COLORS[type] || 'text-gray-500'}`}>
                    {TYPE_LABELS[type] || type}
                  </span>
                </div>
                {typeItems.map(item => {
                  const idx = globalIdx++;
                  const isHighlighted = highlightedSuggestionIndex === idx;
                  return (
                    <button
                      key={`${type}-${item.value}-${idx}`}
                      ref={el => (itemRefs.current[idx] = el)}
                      onClick={() => onSelect(item)}
                      onMouseEnter={() => setHighlightedSuggestionIndex(idx)}
                      className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm transition-all duration-100
                        ${isHighlighted ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}
                      role="option"
                      aria-selected={isHighlighted}
                      id={`suggestion-${idx}`}
                    >
                      <TypeIcon className={`w-4 h-4 ${isHighlighted ? 'text-blue-500' : TYPE_COLORS[type] || 'text-gray-400'}`} />
                      <span className="flex-1 text-left truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            );
          });
        })()}

        {/* Simple list for specific field or recent */}
        {(showRecent || activeField !== 'all') && items.map((item, index) => {
          const isHighlighted = highlightedSuggestionIndex === index;
          const TypeIcon = item.type === 'recent' ? History : (TYPE_ICONS[item.type] || Search);
          const color = item.type === 'recent' ? 'text-gray-400' : (TYPE_COLORS[item.type] || 'text-gray-400');

          return (
            <button
              key={`${item.value}-${index}`}
              ref={el => (itemRefs.current[index] = el)}
              onClick={() => item.type === 'recent' ? onSelectRecent(item.value) : onSelect(item)}
              onMouseEnter={() => setHighlightedSuggestionIndex(index)}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm transition-all duration-100
                ${isHighlighted ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}
              role="option"
              aria-selected={isHighlighted}
              id={`suggestion-${index}`}
            >
              <TypeIcon className={`w-4 h-4 ${isHighlighted ? 'text-blue-500' : color}`} />
              <span className="flex-1 text-left truncate">{item.label}</span>
              {item.type && item.type !== 'recent' && activeField === 'all' && (
                <span className={`text-xs ${TYPE_COLORS[item.type] || 'text-gray-400'} opacity-70`}>
                  {TYPE_LABELS[item.type]}
                </span>
              )}
            </button>
          );
        })}
      </motion.div>
    </AnimatePresence>
  );
};

export default memo(SearchSuggestionDropdown);
