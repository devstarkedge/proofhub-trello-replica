import React, { memo, useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, X, Calendar, User, FileText,
  ChevronDown, Filter, SlidersHorizontal
} from 'lucide-react';

/**
 * CalendarSearch - Global search for reminders with filters
 * Supports search by client, project, and date range
 * Note: Department filter is controlled by the header, not here
 */
const CalendarSearch = memo(({
  onSearch,
  onClear,
  className = ''
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    status: 'all',
    client: '',
    project: ''
  });
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const debounceTimerRef = useRef(null);

  // Debounced search
  const debouncedSearch = useCallback((query, currentFilters) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    debounceTimerRef.current = setTimeout(() => {
      onSearch?.({
        query,
        ...currentFilters
      });
    }, 300);
  }, [onSearch]);

  // Handle search input change
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    debouncedSearch(value, filters);
  };

  // Handle filter changes
  const handleFilterChange = (key, value) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    debouncedSearch(searchQuery, newFilters);
  };

  // Clear all filters
  const handleClear = () => {
    setSearchQuery('');
    setFilters({
      startDate: '',
      endDate: '',
      status: 'all',
      client: '',
      project: ''
    });
    onClear?.();
  };

  // Check if any filter is active
  const hasActiveFilters = searchQuery || 
    filters.startDate || 
    filters.endDate || 
    filters.status !== 'all' ||
    filters.client ||
    filters.project;

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return (
    <div className={`bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/50 shadow-lg overflow-hidden ${className}`}>
      {/* Main Search Bar */}
      <div className="p-4">
        <div className="flex gap-3">
          {/* Search Input */}
          <div className={`
            flex-1 relative transition-all duration-300
            ${isSearchFocused ? 'ring-2 ring-indigo-500 ring-opacity-50' : ''}
            rounded-xl
          `}>
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
              <Search className="h-5 w-5" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              placeholder="Search by project, client, or keyword..."
              className="
                w-full pl-12 pr-10 py-3 
                bg-gray-50/50 border border-gray-200
                rounded-xl text-sm
                focus:outline-none focus:bg-white focus:border-indigo-300
                transition-all duration-200
                placeholder:text-gray-400
              "
            />
            {searchQuery && (
              <motion.button
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                onClick={() => {
                  setSearchQuery('');
                  debouncedSearch('', filters);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 rounded-full transition-colors"
              >
                <X className="h-4 w-4 text-gray-400" />
              </motion.button>
            )}
          </div>

          {/* Advanced Filters Toggle */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
            className={`
              flex items-center gap-2 px-4 py-3
              rounded-xl font-medium text-sm
              transition-all duration-200
              ${isAdvancedOpen 
                ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' 
                : 'bg-gray-50/50 text-gray-700 border border-gray-200 hover:bg-gray-100'
              }
            `}
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span className="hidden sm:inline">Filters</span>
            {hasActiveFilters && (
              <span className="h-2 w-2 bg-indigo-500 rounded-full" />
            )}
          </motion.button>

          {/* Clear All Button */}
          {hasActiveFilters && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleClear}
              className="
                flex items-center gap-2 px-4 py-3
                bg-red-50 text-red-600 border border-red-200
                rounded-xl font-medium text-sm
                hover:bg-red-100 transition-colors
              "
            >
              <X className="h-4 w-4" />
              <span className="hidden sm:inline">Clear</span>
            </motion.button>
          )}
        </div>
      </div>

      {/* Advanced Filters Panel */}
      <AnimatePresence>
        {isAdvancedOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-gray-100 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Date Range - Start */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-2">
                    <Calendar className="h-3.5 w-3.5" />
                    From Date
                  </label>
                  <input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => handleFilterChange('startDate', e.target.value)}
                    className="
                      w-full px-3 py-2.5
                      bg-gray-50 border border-gray-200
                      rounded-xl text-sm
                      focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                    "
                  />
                </div>

                {/* Date Range - End */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-2">
                    <Calendar className="h-3.5 w-3.5" />
                    To Date
                  </label>
                  <input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => handleFilterChange('endDate', e.target.value)}
                    min={filters.startDate}
                    className="
                      w-full px-3 py-2.5
                      bg-gray-50 border border-gray-200
                      rounded-xl text-sm
                      focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                    "
                  />
                </div>

                {/* Status Filter */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-2">
                    <Filter className="h-3.5 w-3.5" />
                    Status
                  </label>
                  <div className="relative">
                    <select
                      value={filters.status}
                      onChange={(e) => handleFilterChange('status', e.target.value)}
                      className="
                        w-full px-3 py-2.5 pr-8
                        bg-gray-50 border border-gray-200
                        rounded-xl text-sm appearance-none cursor-pointer
                        focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                      "
                    >
                      <option value="all">All Status</option>
                      <option value="pending">Pending</option>
                      <option value="sent">Sent</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {/* Client Name Filter */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-2">
                    <User className="h-3.5 w-3.5" />
                    Client Name
                  </label>
                  <input
                    type="text"
                    value={filters.client}
                    onChange={(e) => handleFilterChange('client', e.target.value)}
                    placeholder="Filter by client..."
                    className="
                      w-full px-3 py-2.5
                      bg-gray-50 border border-gray-200
                      rounded-xl text-sm
                      placeholder:text-gray-400
                      focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                    "
                  />
                </div>
              </div>

              {/* Quick Date Filters */}
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="text-xs font-semibold text-gray-500 self-center mr-2">Quick:</span>
                {[
                  { label: 'Today', days: 0 },
                  { label: 'This Week', days: 7 },
                  { label: 'This Month', days: 30 },
                  { label: 'Next 3 Months', days: 90 }
                ].map((option) => (
                  <motion.button
                    key={option.label}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      const today = new Date();
                      const endDate = new Date();
                      endDate.setDate(endDate.getDate() + option.days);
                      
                      handleFilterChange('startDate', today.toISOString().split('T')[0]);
                      handleFilterChange('endDate', endDate.toISOString().split('T')[0]);
                    }}
                    className="
                      px-3 py-1.5
                      bg-gray-100 hover:bg-indigo-100 hover:text-indigo-700
                      text-gray-600 text-xs font-medium
                      rounded-lg transition-colors
                    "
                  >
                    {option.label}
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

CalendarSearch.displayName = 'CalendarSearch';

export default CalendarSearch;
