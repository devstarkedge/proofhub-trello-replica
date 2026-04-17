import React, { memo, useRef, useEffect, useCallback, useState } from 'react';
import { Search, X, Command } from 'lucide-react';
import useSmartSearchStore from '../../store/smartSearchStore';
import SearchFieldDropdown from './SearchFieldDropdown';
import InlineFilterChips from './InlineFilterChips';
import SearchSuggestionDropdown from './SearchSuggestionDropdown';

const PLACEHOLDER_MAP = {
  all: 'Search tasks, projects, assignees...',
  task: 'Search task names...',
  project: 'Search project names...',
  assignee: 'Search assignees...',
  priority: 'Filter by priority...',
  status: 'Filter by status...',
};

const SmartSearchBar = () => {
  const {
    activeField,
    searchText,
    setSearchText,
    chips,
    addChip,
    removeLastChip,
    showSuggestions,
    setShowSuggestions,
    suggestions,
    highlightedSuggestionIndex,
    setHighlightedSuggestionIndex,
    addRecentSearch,
    recentSearches,
  } = useSmartSearchStore();

  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const isMac = typeof navigator !== 'undefined' && /(Mac|iPhone|iPad|iPod)/i.test(navigator.platform);

  // Total items for keyboard nav
  const showRecent = !searchText && recentSearches.length > 0 && isDropdownOpen;
  const navItems = showSuggestions ? suggestions : (showRecent ? recentSearches : []);
  const navCount = navItems.length;

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowSuggestions(false);
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [setShowSuggestions]);

  // Global keyboard shortcuts: / and Ctrl+K to focus search
  useEffect(() => {
    const handler = (e) => {
      // Don't intercept if user is typing in another input/textarea
      const tag = document.activeElement?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable;

      if ((e.key === '/' && !isInput) || (e.key === 'k' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleSuggestionSelect = useCallback((item) => {
    if (activeField === 'all') {
      // For 'all' mode: add a chip with the suggestion's type
      addChip(item.type, item.value, item.label);
    } else {
      addChip(activeField, item.value, item.label);
    }
    addRecentSearch(item.value);
    inputRef.current?.focus();
  }, [activeField, addChip, addRecentSearch]);

  const handleRecentSelect = useCallback((text) => {
    setSearchText(text);
    setShowSuggestions(false);
    inputRef.current?.focus();
  }, [setSearchText, setShowSuggestions]);

  const handleInputChange = (e) => {
    setSearchText(e.target.value);
  };

  const handleKeyDown = (e) => {
    const dropdownVisible = showSuggestions || showRecent;

    switch (e.key) {
      case 'ArrowDown':
        if (dropdownVisible && navCount > 0) {
          e.preventDefault();
          setHighlightedSuggestionIndex(
            highlightedSuggestionIndex < navCount - 1 ? highlightedSuggestionIndex + 1 : 0
          );
        }
        break;

      case 'ArrowUp':
        if (dropdownVisible && navCount > 0) {
          e.preventDefault();
          setHighlightedSuggestionIndex(
            highlightedSuggestionIndex > 0 ? highlightedSuggestionIndex - 1 : navCount - 1
          );
        }
        break;

      case 'Enter':
        e.preventDefault();
        if (dropdownVisible && highlightedSuggestionIndex >= 0 && highlightedSuggestionIndex < navCount) {
          if (showRecent && !showSuggestions) {
            handleRecentSelect(recentSearches[highlightedSuggestionIndex]);
          } else if (suggestions[highlightedSuggestionIndex]) {
            handleSuggestionSelect(suggestions[highlightedSuggestionIndex]);
          }
        } else if (searchText.trim() && activeField !== 'all') {
          // If user typed free text in a specific field, create a chip
          addChip(activeField, searchText.trim(), searchText.trim());
          addRecentSearch(searchText.trim());
        } else if (searchText.trim()) {
          // In 'all' mode, keep as free text search; just save to history
          addRecentSearch(searchText.trim());
          setShowSuggestions(false);
        }
        break;

      case 'Backspace':
        if (searchText === '' && chips.length > 0) {
          removeLastChip();
        }
        break;

      case 'Escape':
        setShowSuggestions(false);
        setHighlightedSuggestionIndex(-1);
        setIsDropdownOpen(false);
        inputRef.current?.blur();
        break;

      case 'Tab':
        if (dropdownVisible && highlightedSuggestionIndex >= 0) {
          e.preventDefault();
          if (showRecent && !showSuggestions) {
            handleRecentSelect(recentSearches[highlightedSuggestionIndex]);
          } else if (suggestions[highlightedSuggestionIndex]) {
            handleSuggestionSelect(suggestions[highlightedSuggestionIndex]);
          }
        }
        break;

      default:
        break;
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
    setIsDropdownOpen(true);
    if (searchText.length >= 1 && suggestions.length > 0) {
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
  };

  const handleClear = () => {
    setSearchText('');
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative flex-1 min-w-[200px] sm:min-w-[320px] max-w-none z-[9999]">
      <div
        className={`flex items-stretch gap-0 border-2 rounded-xl transition-all duration-300 bg-white/80 backdrop-blur-sm
          ${isFocused || showSuggestions || showRecent
            ? 'border-blue-400 ring-2 ring-blue-100/80 shadow-lg shadow-blue-100/50'
            : 'border-gray-200 hover:border-blue-300 hover:shadow-md hover:shadow-blue-50'}
          focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100/80 focus-within:shadow-lg focus-within:shadow-blue-100/50`}
      >
        {/* Field selector pill (attached) */}
        <div className="flex items-center">
          <SearchFieldDropdown onOpen={() => setIsDropdownOpen(false)} attached />
        </div>

        {/* Divider between dropdown and input */}
        <div className="w-px h-6 bg-gray-200 my-auto" />

        {/* Chips + Input area (right, attached) */}
        <div className="flex-1 flex flex-wrap items-center gap-1 py-1.5 pr-1 pl-2 min-h-[42px]">
          <InlineFilterChips />

          <div className="flex items-center gap-2 flex-1 min-w-[120px]">
            <Search className={`w-4 h-4 flex-shrink-0 transition-colors duration-200 ${isFocused ? 'text-blue-500' : 'text-gray-400'}`} />
            <input
              ref={inputRef}
              type="text"
              value={searchText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholder={chips.length > 0 ? 'Add more filters...' : PLACEHOLDER_MAP[activeField]}
              className="flex-1 bg-transparent border-none outline-none text-sm text-gray-900 placeholder:text-gray-400 min-w-[100px]"
              role="combobox"
              aria-expanded={showSuggestions}
              aria-controls="smart-search-suggestions"
              aria-activedescendant={highlightedSuggestionIndex >= 0 ? `suggestion-${highlightedSuggestionIndex}` : undefined}
              aria-label="Search tasks"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>

        {/* Right actions: clear + keyboard hint */}
        <div className="flex items-center gap-1 pr-2 flex-shrink-0">
          {(searchText || chips.length > 0) && (
            <button
              onClick={handleClear}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all duration-150"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {!isFocused && !searchText && chips.length === 0 && (
            <kbd className="hidden sm:inline-flex px-1.5 py-0.5 bg-gray-100 text-gray-400 text-[10px] font-semibold rounded-md border border-gray-200 select-none">
              {isMac ? '⌘K' : 'Ctrl+K'}
            </kbd>
          )}
        </div>
      </div>

      {/* Suggestion dropdown */}
      <SearchSuggestionDropdown
        onSelect={handleSuggestionSelect}
        onSelectRecent={handleRecentSelect}
        inputRef={inputRef}
        isDropdownOpen={isDropdownOpen}
      />
    </div>
  );
};

export default memo(SmartSearchBar);
