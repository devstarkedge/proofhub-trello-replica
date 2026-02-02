import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar, X, Search, Filter, ChevronDown, ChevronUp, 
  Star, DollarSign, MapPin, Zap
} from 'lucide-react';
import useSalesStore from '../../store/salesStore';
import DatePickerModal from '../DatePickerModal';
import { formatSalesDate } from '../../utils/dateUtils';

const SalesFilters = () => {
  const { rows, filters, setFilters, clearFilters, dropdownOptions, fetchDropdownOptions } = useSalesStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchInput, setSearchInput] = useState(filters.search || '');

  // Date Picker State
  const [datePickerState, setDatePickerState] = useState({
    isOpen: false,
    target: null, // 'dateFrom' | 'dateTo'
    title: '',
    minDate: null
  });

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

  const openDatePicker = (target, title, minDate = null) => {
    setDatePickerState({ isOpen: true, target, title, minDate });
  };

  const handleDateSelect = (dateString) => {
    if (datePickerState.target) {
      handleFilterChange(datePickerState.target, dateString);
    }
  };

  // Date Presets Logic
  const [datePreset, setDatePreset] = useState('');

  const calculateDateRange = (preset) => {
    const today = new Date();
    today.setHours(23, 59, 59, 999); // Include full today
    
    let from = new Date();
    from.setHours(0, 0, 0, 0);

    switch (preset) {
      case 'thisWeek':
        // Start of week (assuming Monday)
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
        from.setDate(diff);
        return { from, to: today };
      case 'thisMonth':
        from.setDate(1);
        return { from, to: today };
      case 'thisYear':
        from.setMonth(0, 1);
        return { from, to: today };
      default:
        return null;
    }
  };

  const handlePresetChange = (preset) => {
    setDatePreset(preset);

    if (preset === 'custom') {
      // Don't clear dates, just let user pick
      return;
    }

    if (preset === 'all') {
      setFilters({ dateFrom: null, dateTo: null });
      return;
    }

    const range = calculateDateRange(preset);
    if (range) {
      setFilters({
        dateFrom: range.from.toISOString(),
        dateTo: range.to.toISOString()
      });
    }
  };

  // Determine preset on mount/update based on filters
  useEffect(() => {
    // If we want to sync the dropdown with external changes to filters, we can add logic here.
    // However, checking if a specific range matches "This Week" exactly is tricky and maybe unnecessary.
    // For now, if dateFrom/dateTo are empty, we can set preset to 'all'.
    if (!filters.dateFrom && !filters.dateTo) {
      setDatePreset('all');
    } else if (datePreset !== 'custom' && datePreset !== 'thisWeek' && datePreset !== 'thisMonth' && datePreset !== 'thisYear') {
       // If filters exist but preset is 'all' or empty, and it doesn't match a calculated preset likely, maybe default to custom?
       // Let's keep it simple: if user sets date manually via custom view, it stays custom. 
       // If standard filters are loaded (e.g. from URL or persisted state), we might want to default to Custom if they don't match presets.
       // For this iteration, we'll start with 'all' if empty, or 'custom' if has values and preset is unset.
       if (!datePreset) setDatePreset('custom');
    }
  }, [filters.dateFrom, filters.dateTo]);


  const activeFilterCount = Object.values(filters).filter(v => v !== '' && v !== null && v !== undefined).length;

  const selectClass = "w-full px-4 py-3 text-sm border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all appearance-none cursor-pointer hover:border-blue-300 dark:hover:border-blue-600 shadow-sm hover:shadow-md font-medium";
  const inputClass = "w-full px-4 py-3 text-sm border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all cursor-pointer shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 font-medium";
  const labelClass = "block text-xs font-bold text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wider";

  return (
    <div className="bg-gradient-to-r from-white via-blue-50/20 to-white dark:from-gray-800 dark:via-blue-900/10 dark:to-gray-800 border-b border-gray-200/80 dark:border-gray-700/80 shadow-sm backdrop-blur-sm">
      {/* Search Bar and Toggle */}
      <div className="px-6 py-4 flex items-center gap-4">
        {/* Global Search */}
        <div className="flex-1 max-w-2xl relative group">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 group-hover:text-blue-500 transition-colors w-5 h-5" />
          <input
            type="text"
            placeholder="Search bid links, comments, technology, profile..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-12 pr-12 py-3 text-sm border-2 border-gray-200 dark:border-gray-600 rounded-2xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full p-1.5 transition-all hover:scale-110"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Toggle Button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsExpanded(!isExpanded)}
          className={`flex items-center gap-2.5 px-6 py-3 rounded-2xl font-semibold text-sm transition-all shadow-md hover:shadow-lg ${
            isExpanded || activeFilterCount > 0
              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-blue-500/30'
              : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 border-2 border-gray-200 dark:border-gray-600'
          }`}
        >
          <Filter className="w-5 h-5" />
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-bold bg-white/25 rounded-full min-w-[24px] text-center animate-pulse">
              {activeFilterCount}
            </span>
          )}
          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </motion.button>

        {/* Clear All */}
        {activeFilterCount > 0 && (
          <motion.button
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              clearFilters();
              setDatePreset('all'); 
            }}
            className="flex items-center gap-2 px-5 py-3 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-2xl transition-all border-2 border-red-200 dark:border-red-800 hover:border-red-300 dark:hover:border-red-700 shadow-sm hover:shadow-md"
          >
            <X className="w-5 h-5" />
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
            <div className="px-6 pb-5 pt-3 border-t border-gray-100/60 dark:border-gray-700/60 bg-gradient-to-b from-blue-50/30 to-transparent dark:from-blue-900/5 dark:to-transparent">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-5">
                
                {/* Date Presets Dropdown */}
                <div className={`col-span-2 xl:col-span-2 grid ${datePreset === 'custom' ? 'grid-cols-3' : 'grid-cols-2'} gap-3`}>
                    <div className={datePreset === 'custom' ? "col-span-1" : "col-span-2"}>
                      <label className={labelClass}>
                        <Calendar className="w-3 h-3 inline mr-1" />
                        Date Filter
                      </label>
                      <select
                        value={datePreset}
                        onChange={(e) => handlePresetChange(e.target.value)}
                        className={selectClass}
                      >
                         <option value="all">All Time (Default)</option>
                         <option value="thisWeek">This Week</option>
                         <option value="thisMonth">This Month</option>
                         <option value="thisYear">This Year</option>
                         <option value="custom">Custom Range</option>
                      </select>
                    </div>

                    {/* Show Date Inputs ONLY if Custom is selected */}
                    {datePreset === 'custom' && (
                      <>
                        <div>
                          <label className={labelClass}>
                             Date From
                          </label>
                          <div className="relative group">
                            <input
                              type="text"
                              readOnly
                              value={formatSalesDate(filters.dateFrom)}
                              onClick={() => openDatePicker('dateFrom', 'Select Start Date')}
                              className={inputClass}
                              placeholder="dd-mm-yyyy"
                            />
                            <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors pointer-events-none" />
                          </div>
                        </div>
                        <div>
                          <label className={labelClass}>
                             Date To
                          </label>
                          <div className="relative group">
                            <input
                              type="text"
                              readOnly
                              value={formatSalesDate(filters.dateTo)}
                              onClick={() => openDatePicker('dateTo', 'Select End Date', filters.dateFrom)}
                              className={inputClass}
                              placeholder="dd-mm-yyyy"
                            />
                            <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors pointer-events-none" />
                          </div>
                        </div>
                      </>
                    )}
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
      <DatePickerModal
        isOpen={datePickerState.isOpen}
        onClose={() => setDatePickerState(prev => ({ ...prev, isOpen: false }))}
        onSelectDate={handleDateSelect}
        selectedDate={datePickerState.target ? filters[datePickerState.target] : null}
        title={datePickerState.title}
        minDate={datePickerState.minDate}
      />
    </div>
  );
};

export default SalesFilters;
