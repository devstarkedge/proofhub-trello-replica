import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar, X, Search, Filter, ChevronDown, ChevronUp, 
  Star, DollarSign, MapPin, Zap
} from 'lucide-react';
import useSalesStore from '../../store/salesStore';

const SalesFilters = () => {
  const { rows, filters, setFilters, clearFilters, dropdownOptions, fetchDropdownOptions } = useSalesStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchInput, setSearchInput] = useState(filters.search || '');

  // Fetch dropdown options on mount
  useEffect(() => {
    const dropdownColumns = ['platform', 'technology', 'status', 'clientLocation', 'clientBudget', 'profile'];
    dropdownColumns.forEach(col => fetchDropdownOptions(col));
  }, [fetchDropdownOptions]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.search) {
        setFilters({ search: searchInput });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput, filters.search, setFilters]);

  const handleFilterChange = useCallback((key, value) => {
    setFilters({ [key]: value });
  }, [setFilters]);

  const activeFilterCount = Object.values(filters).filter(v => v !== '' && v !== null && v !== undefined).length;

  const selectClass = "w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all appearance-none cursor-pointer hover:border-gray-300 dark:hover:border-gray-500";
  const inputClass = "w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all";
  const labelClass = "block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider";

  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
      {/* Search Bar and Toggle */}
      <div className="px-4 py-3 flex items-center gap-4">
        {/* Global Search */}
        <div className="flex-1 max-w-xl relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search bid links, comments, technology, profile..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white dark:focus:bg-gray-700 transition-all"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Toggle Button */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setIsExpanded(!isExpanded)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${
            isExpanded || activeFilterCount > 0
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          <Filter className="w-4 h-4" />
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-bold bg-white/20 rounded-full min-w-[20px] text-center">
              {activeFilterCount}
            </span>
          )}
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </motion.button>

        {/* Clear All */}
        {activeFilterCount > 0 && (
          <motion.button
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            onClick={clearFilters}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
            Clear All
          </motion.button>
        )}
      </div>

      {/* Expanded Filters */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-2 border-t border-gray-100 dark:border-gray-700/50">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                {/* Date Range */}
                <div className="col-span-2 xl:col-span-2 grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>
                      <Calendar className="w-3 h-3 inline mr-1" />
                      Date From
                    </label>
                    <input
                      type="date"
                      value={filters.dateFrom || ''}
                      onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      <Calendar className="w-3 h-3 inline mr-1" />
                      Date To
                    </label>
                    <input
                      type="date"
                      value={filters.dateTo || ''}
                      onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>

                {/* Platform */}
                <div>
                  <label className={labelClass}>
                    <Zap className="w-3 h-3 inline mr-1" />
                    Platform
                  </label>
                  <select
                    value={filters.platform}
                    onChange={(e) => handleFilterChange('platform', e.target.value)}
                    className={selectClass}
                  >
                    <option value="">All Platforms</option>
                    {(dropdownOptions.platform && dropdownOptions.platform.length > 0
                      ? dropdownOptions.platform
                      : Array.from(new Map(rows.map(r => [r.platform, { _id: r.platform || r.platform, value: r.platform, label: r.platform }]).filter(([k]) => k)).values())
                    ).map((option) => (
                      <option key={option._id || option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Technology */}
                <div>
                  <label className={labelClass}>Technology</label>
                  <select
                    value={filters.technology}
                    onChange={(e) => handleFilterChange('technology', e.target.value)}
                    className={selectClass}
                  >
                    <option value="">All Technologies</option>
                    {(dropdownOptions.technology && dropdownOptions.technology.length > 0
                      ? dropdownOptions.technology
                      : Array.from(new Map(rows.map(r => [r.technology, { _id: r.technology, value: r.technology, label: r.technology }]).filter(([k]) => k)).values())
                    ).map((option) => (
                      <option key={option._id || option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status */}
                <div>
                  <label className={labelClass}>Status</label>
                  <select
                    value={filters.status}
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                    className={selectClass}
                  >
                    <option value="">All Statuses</option>
                    {(dropdownOptions.status && dropdownOptions.status.length > 0
                      ? dropdownOptions.status
                      : Array.from(new Map(rows.map(r => [r.status, { _id: r.status, value: r.status, label: r.status }]).filter(([k]) => k)).values())
                    ).map((option) => (
                      <option key={option._id || option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Location */}
                <div>
                  <label className={labelClass}>
                    <MapPin className="w-3 h-3 inline mr-1" />
                    Location
                  </label>
                  <select
                    value={filters.location}
                    onChange={(e) => handleFilterChange('location', e.target.value)}
                    className={selectClass}
                  >
                    <option value="">All Locations</option>
                    {(dropdownOptions.clientLocation && dropdownOptions.clientLocation.length > 0
                      ? dropdownOptions.clientLocation
                      : Array.from(new Map(rows.map(r => [r.clientLocation, { _id: r.clientLocation, value: r.clientLocation, label: r.clientLocation }]).filter(([k]) => k)).values())
                    ).map((option) => (
                      <option key={option._id || option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Min Rating */}
                <div>
                  <label className={labelClass}>
                    <Star className="w-3 h-3 inline mr-1" />
                    Min Rating
                  </label>
                  <select
                    value={filters.minRating || ''}
                    onChange={(e) => handleFilterChange('minRating', e.target.value ? parseInt(e.target.value) : null)}
                    className={selectClass}
                  >
                    <option value="">Any Rating</option>
                    <option value="3">3⭐ and above</option>
                    <option value="4">4⭐ and above</option>
                    <option value="5">5⭐ only</option>
                  </select>
                </div>

                {/* Min Hire Rate */}
                <div>
                  <label className={labelClass}>Min Hire Rate</label>
                  <select
                    value={filters.minHireRate || ''}
                    onChange={(e) => handleFilterChange('minHireRate', e.target.value ? parseInt(e.target.value) : null)}
                    className={selectClass}
                  >
                    <option value="">Any %</option>
                    <option value="30">30%+</option>
                    <option value="50">50%+</option>
                    <option value="75">75%+</option>
                    <option value="90">90%+</option>
                  </select>
                </div>

                {/* Budget */}
                <div>
                  <label className={labelClass}>
                    <DollarSign className="w-3 h-3 inline mr-1" />
                    Budget
                  </label>
                  <select
                    value={filters.budget || ''}
                    onChange={(e) => handleFilterChange('budget', e.target.value)}
                    className={selectClass}
                  >
                    <option value="">All Budgets</option>
                    {(dropdownOptions.clientBudget && dropdownOptions.clientBudget.length > 0
                      ? dropdownOptions.clientBudget
                      : Array.from(new Map(rows.map(r => [r.clientBudget, { _id: r.clientBudget, value: r.clientBudget, label: r.clientBudget }]).filter(([k]) => k)).values())
                    ).map((option) => (
                      <option key={option._id || option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Profile */}
                <div>
                  <label className={labelClass}>Profile</label>
                  <select
                    value={filters.profile || ''}
                    onChange={(e) => handleFilterChange('profile', e.target.value)}
                    className={selectClass}
                  >
                    <option value="">All Profiles</option>
                    {(dropdownOptions.profile && dropdownOptions.profile.length > 0
                      ? dropdownOptions.profile
                      : Array.from(new Map(rows.map(r => [r.profile, { _id: r.profile, value: r.profile, label: r.profile }]).filter(([k]) => k)).values())
                    ).map((option) => (
                      <option key={option._id || option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SalesFilters;
