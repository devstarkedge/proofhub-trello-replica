import React, { useState, useCallback, useMemo } from 'react';
import { 
  Calendar, 
  User, 
  Building2, 
  FolderOpen, 
  DollarSign, 
  Tag, 
  Users, 
  Filter, 
  X, 
  ChevronDown,
  RefreshCw,
  Search
} from 'lucide-react';
import { usePMSheet } from '../../context/PMSheetContext';

/**
 * PMFilters - Global filters component for PM Sheet pages
 * Supports time presets, custom date range, and various data filters
 */
const PMFilters = ({
  showUserFilter = true,
  showDepartmentFilter = true,
  showProjectFilter = true,
  showBillingTypeFilter = true,
  showCategoryFilter = true,
  showCoordinatorFilter = true,
  showStatusFilter = true,
  showDatePresets = true,
  showCustomDateRange = true,
  onApplyFilters = null,
  compact = false,
  className = ''
}) => {
  const {
    filters,
    filterOptions,
    loading,
    updateFilters,
    resetFilters,
    applyDatePreset,
    datePresets
  } = usePMSheet();

  const [isExpanded, setIsExpanded] = useState(!compact);
  const [activePreset, setActivePreset] = useState('thisMonth');

  // Handle date preset selection
  const handlePresetSelect = useCallback((presetKey) => {
    setActivePreset(presetKey);
    applyDatePreset(presetKey);
    if (onApplyFilters) onApplyFilters();
  }, [applyDatePreset, onApplyFilters]);

  // Handle filter change
  const handleFilterChange = useCallback((key, value) => {
    updateFilters({ [key]: value });
    if (onApplyFilters) onApplyFilters();
  }, [updateFilters, onApplyFilters]);

  // Handle reset
  const handleReset = useCallback(() => {
    resetFilters();
    setActivePreset('thisMonth');
    if (onApplyFilters) onApplyFilters();
  }, [resetFilters, onApplyFilters]);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.userId && filters.userId !== 'all') count++;
    if (filters.departmentId && filters.departmentId !== 'all') count++;
    if (filters.projectId) count++;
    if (filters.billingType) count++;
    if (filters.projectCategory) count++;
    if (filters.coordinatorId) count++;
    if (filters.status) count++;
    return count;
  }, [filters]);

  // Filter dropdown component
  const FilterDropdown = ({ 
    icon: Icon, 
    label, 
    value, 
    options, 
    onChange, 
    placeholder = 'All',
    searchable = false
  }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);

    const filteredOptions = useMemo(() => {
      if (!searchable || !searchQuery) return options;
      return options.filter(opt => 
        opt.label?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        opt.name?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }, [options, searchQuery, searchable]);

    const selectedOption = options.find(opt => (opt.id || opt.value) === value);
    const displayValue = selectedOption?.label || selectedOption?.name || placeholder;

    return (
      <div className="relative">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          {label}
        </label>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
        >
          <Icon className="w-4 h-4 text-gray-400" />
          <span className={`flex-1 text-left truncate ${value && value !== 'all' ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>
            {displayValue}
          </span>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
            <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-hidden">
              {searchable && (
                <div className="p-2 border-b border-gray-200 dark:border-gray-600">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search..."
                      className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>
              )}
              <div className="overflow-auto max-h-48">
                <button
                  onClick={() => {
                    onChange('all');
                    setIsOpen(false);
                    setSearchQuery('');
                  }}
                  className={`w-full px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-600 ${
                    !value || value === 'all' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600' : ''
                  }`}
                >
                  {placeholder}
                </button>
                {filteredOptions.map((option) => (
                  <button
                    key={option.id || option.value}
                    onClick={() => {
                      onChange(option.id || option.value);
                      setIsOpen(false);
                      setSearchQuery('');
                    }}
                    className={`w-full px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center gap-2 ${
                      (option.id || option.value) === value ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600' : ''
                    }`}
                  >
                    {option.avatar && (
                      <img src={option.avatar} alt="" className="w-5 h-5 rounded-full" />
                    )}
                    <span className="truncate">{option.label || option.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-blue-500" />
          <h3 className="font-semibold text-gray-900 dark:text-white">Filters</h3>
          {activeFilterCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-full">
              {activeFilterCount} active
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Reset
          </button>
          {compact && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              <ChevronDown className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Filters content */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Date presets */}
          {showDatePresets && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                Time Period
              </label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(datePresets).map(([key, preset]) => (
                  <button
                    key={key}
                    onClick={() => handlePresetSelect(key)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      activePreset === key
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Custom date range */}
          {showCustomDateRange && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  From Date
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="date"
                    value={filters.startDate || ''}
                    onChange={(e) => {
                      handleFilterChange('startDate', e.target.value);
                      setActivePreset(null);
                    }}
                    className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  To Date
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="date"
                    value={filters.endDate || ''}
                    onChange={(e) => {
                      handleFilterChange('endDate', e.target.value);
                      setActivePreset(null);
                    }}
                    className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Data filters */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {showUserFilter && (
              <FilterDropdown
                icon={User}
                label="User"
                value={filters.userId}
                options={filterOptions.users.map(u => ({ ...u, label: u.name }))}
                onChange={(value) => handleFilterChange('userId', value)}
                placeholder="All Users"
                searchable
              />
            )}

            {showDepartmentFilter && (
              <FilterDropdown
                icon={Building2}
                label="Department"
                value={filters.departmentId}
                options={filterOptions.departments.map(d => ({ ...d, label: d.name }))}
                onChange={(value) => handleFilterChange('departmentId', value)}
                placeholder="All Departments"
              />
            )}

            {showProjectFilter && (
              <FilterDropdown
                icon={FolderOpen}
                label="Project"
                value={filters.projectId}
                options={filterOptions.projects.map(p => ({ ...p, label: p.name }))}
                onChange={(value) => handleFilterChange('projectId', value === 'all' ? null : value)}
                placeholder="All Projects"
                searchable
              />
            )}

            {showBillingTypeFilter && (
              <FilterDropdown
                icon={DollarSign}
                label="Billing Type"
                value={filters.billingType}
                options={filterOptions.billingTypes}
                onChange={(value) => handleFilterChange('billingType', value === 'all' ? null : value)}
                placeholder="All Types"
              />
            )}

            {showCategoryFilter && (
              <FilterDropdown
                icon={Tag}
                label="Category"
                value={filters.projectCategory}
                options={filterOptions.categories.map(c => ({ value: c, label: c }))}
                onChange={(value) => handleFilterChange('projectCategory', value === 'all' ? null : value)}
                placeholder="All Categories"
              />
            )}

            {showCoordinatorFilter && (
              <FilterDropdown
                icon={Users}
                label="Coordinator"
                value={filters.coordinatorId}
                options={filterOptions.coordinators.map(c => ({ ...c, label: c.name }))}
                onChange={(value) => handleFilterChange('coordinatorId', value === 'all' ? null : value)}
                placeholder="All Coordinators"
                searchable
              />
            )}

            {showStatusFilter && (
              <FilterDropdown
                icon={Filter}
                label="Status"
                value={filters.status}
                options={filterOptions.statuses}
                onChange={(value) => handleFilterChange('status', value === 'all' ? null : value)}
                placeholder="All Statuses"
              />
            )}
          </div>

          {/* Active filters tags */}
          {activeFilterCount > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              {filters.userId && filters.userId !== 'all' && (
                <FilterTag
                  label={filterOptions.users.find(u => u.id === filters.userId)?.name || 'User'}
                  onRemove={() => handleFilterChange('userId', 'all')}
                />
              )}
              {filters.departmentId && filters.departmentId !== 'all' && (
                <FilterTag
                  label={filterOptions.departments.find(d => d.id === filters.departmentId)?.name || 'Department'}
                  onRemove={() => handleFilterChange('departmentId', 'all')}
                />
              )}
              {filters.projectId && (
                <FilterTag
                  label={filterOptions.projects.find(p => p.id === filters.projectId)?.name || 'Project'}
                  onRemove={() => handleFilterChange('projectId', null)}
                />
              )}
              {filters.billingType && (
                <FilterTag
                  label={filterOptions.billingTypes.find(b => b.value === filters.billingType)?.label || filters.billingType}
                  onRemove={() => handleFilterChange('billingType', null)}
                />
              )}
              {filters.projectCategory && (
                <FilterTag
                  label={filters.projectCategory}
                  onRemove={() => handleFilterChange('projectCategory', null)}
                />
              )}
              {filters.coordinatorId && (
                <FilterTag
                  label={filterOptions.coordinators.find(c => c.id === filters.coordinatorId)?.name || 'Coordinator'}
                  onRemove={() => handleFilterChange('coordinatorId', null)}
                />
              )}
              {filters.status && (
                <FilterTag
                  label={filterOptions.statuses.find(s => s.value === filters.status)?.label || filters.status}
                  onRemove={() => handleFilterChange('status', null)}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Filter tag component
const FilterTag = ({ label, onRemove }) => (
  <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-full">
    {label}
    <button
      onClick={onRemove}
      className="p-0.5 hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full"
    >
      <X className="w-3 h-3" />
    </button>
  </span>
);

export default PMFilters;
