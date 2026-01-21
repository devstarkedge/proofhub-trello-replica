import React, { useState, useRef, useEffect } from 'react';
import { 
  Calendar,
  ChevronDown,
  X,
  CalendarDays,
  CalendarRange,
  Bookmark,
  Plus,
  Trash2,
  CheckCircle2,
  Circle
} from 'lucide-react';

/**
 * DateFilters - Smart date filter component for Finance module
 * Features: Quick presets (Today, Yesterday, This Week, Last Week, etc.)
 * Custom date range picker
 * Saved filter presets
 * Week-wise reporting mode toggle (optional)
 */
const DateFilters = ({ 
  filters, 
  setFilters, 
  onClear, 
  showSavedPresets = false,
  // Week-wise mode props
  showWeekWiseToggle = false,
  weekWiseMode = false,
  onWeekWiseModeChange,
  selectedYear,
  onYearChange
}) => {
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [activePreset, setActivePreset] = useState(null);
  const [savedPresets, setSavedPresets] = useState([]);
  const [presetName, setPresetName] = useState('');
  const dropdownRef = useRef(null);
  const saveModalRef = useRef(null);


  // Load saved presets from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('financeFilterPresets');
    if (saved) {
      try {
        setSavedPresets(JSON.parse(saved));
      } catch (e) {
        console.error('Error loading saved presets:', e);
      }
    }
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowCustomPicker(false);
      }
      if (saveModalRef.current && !saveModalRef.current.contains(event.target)) {
        setShowSaveModal(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get date helpers
  const getToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  };

  const getYesterday = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    return yesterday;
  };

  const getStartOfWeek = () => {
    const today = getToday();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(today.setDate(diff));
  };

  const getStartOfLastWeek = () => {
    const startOfThisWeek = getStartOfWeek();
    return new Date(startOfThisWeek.setDate(startOfThisWeek.getDate() - 7));
  };

  const getEndOfLastWeek = () => {
    const startOfThisWeek = getStartOfWeek();
    const end = new Date(startOfThisWeek);
    end.setDate(end.getDate() - 1);
    end.setHours(23, 59, 59, 999);
    return end;
  };

  const getStartOfMonth = () => {
    const today = getToday();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  };

  const getStartOfLastMonth = () => {
    const today = getToday();
    return new Date(today.getFullYear(), today.getMonth() - 1, 1);
  };

  const getEndOfLastMonth = () => {
    const today = getToday();
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    end.setHours(23, 59, 59, 999);
    return end;
  };

  const getStartOfYear = () => {
    const today = getToday();
    return new Date(today.getFullYear(), 0, 1);
  };

  const getEndOfDay = (date) => {
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return end;
  };

  const getStartOfLastYear = () => {
    const today = getToday();
    return new Date(today.getFullYear() - 1, 0, 1);
  };

  const getEndOfLastYear = () => {
    const today = getToday();
    const end = new Date(today.getFullYear() - 1, 11, 31);
    end.setHours(23, 59, 59, 999);
    return end;
  };

  // Date presets
  const presets = [
    {
      id: 'today',
      label: 'Today',
      getRange: () => ({
        startDate: getToday().toISOString(),
        endDate: getEndOfDay(getToday()).toISOString()
      })
    },
    {
      id: 'yesterday',
      label: 'Yesterday',
      getRange: () => ({
        startDate: getYesterday().toISOString(),
        endDate: getEndOfDay(getYesterday()).toISOString()
      })
    },
    {
      id: 'thisWeek',
      label: 'This Week',
      getRange: () => ({
        startDate: getStartOfWeek().toISOString(),
        endDate: getEndOfDay(new Date()).toISOString()
      })
    },
    {
      id: 'lastWeek',
      label: 'Last Week',
      getRange: () => ({
        startDate: getStartOfLastWeek().toISOString(),
        endDate: getEndOfLastWeek().toISOString()
      })
    },
    {
      id: 'thisMonth',
      label: 'This Month',
      getRange: () => ({
        startDate: getStartOfMonth().toISOString(),
        endDate: getEndOfDay(new Date()).toISOString()
      })
    },
    {
      id: 'lastMonth',
      label: 'Last Month',
      getRange: () => ({
        startDate: getStartOfLastMonth().toISOString(),
        endDate: getEndOfLastMonth().toISOString()
      })
    },
    {
      id: 'thisYear',
      label: 'This Year',
      getRange: () => ({
        startDate: getStartOfYear().toISOString(),
        endDate: getEndOfDay(new Date()).toISOString()
      })
    },
    {
      id: 'lastYear',
      label: 'Last Year',
      getRange: () => ({
        startDate: getStartOfLastYear().toISOString(),
        endDate: getEndOfLastYear().toISOString()
      })
    }
  ];

  // Apply preset
  const applyPreset = (preset) => {
    const range = preset.getRange();
    setFilters(prev => ({
      ...prev,
      startDate: range.startDate,
      endDate: range.endDate
    }));
    setActivePreset(preset.id);
  };

  // Apply saved preset
  const applySavedPreset = (preset) => {
    setFilters(prev => ({
      ...prev,
      startDate: preset.startDate,
      endDate: preset.endDate,
      departmentId: preset.departmentId || prev.departmentId
    }));
    setActivePreset(`saved-${preset.id}`);
  };

  // Save current filters as preset
  const saveCurrentPreset = () => {
    if (!presetName.trim()) return;
    
    const newPreset = {
      id: Date.now(),
      name: presetName,
      startDate: filters.startDate,
      endDate: filters.endDate,
      departmentId: filters.departmentId
    };
    
    const updated = [...savedPresets, newPreset];
    setSavedPresets(updated);
    localStorage.setItem('financeFilterPresets', JSON.stringify(updated));
    setPresetName('');
    setShowSaveModal(false);
  };

  // Delete saved preset
  const deleteSavedPreset = (presetId) => {
    const updated = savedPresets.filter(p => p.id !== presetId);
    setSavedPresets(updated);
    localStorage.setItem('financeFilterPresets', JSON.stringify(updated));
  };

  // Apply custom range
  const applyCustomRange = (startDate, endDate) => {
    setFilters(prev => ({
      ...prev,
      startDate: new Date(startDate).toISOString(),
      endDate: getEndOfDay(new Date(endDate)).toISOString()
    }));
    setActivePreset('custom');
    setShowCustomPicker(false);
  };

  // Clear filters
  const handleClear = () => {
    setFilters(prev => ({
      ...prev,
      startDate: null,
      endDate: null
    }));
    setActivePreset(null);
    onClear?.();
  };

  // Format date for display
  const formatDisplayDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  // Check if any filter is active
  const hasActiveFilter = filters.startDate || filters.endDate;

  // Show first 4 presets, rest in dropdown
  const visiblePresets = presets.slice(0, 4);
  const morePresets = presets.slice(4);

  // Generate years for dropdown (last 3 years + current + next)
  const years = [];
  const currentYear = new Date().getFullYear();
  for (let y = currentYear - 3; y <= currentYear + 1; y++) {
    years.push(y);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Week-Wise Mode Toggle */}
      {showWeekWiseToggle && (
        <div className="flex items-center gap-4 mr-4">
          <button
            onClick={() => onWeekWiseModeChange?.(!weekWiseMode)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
            style={{
              backgroundColor: weekWiseMode 
                ? 'rgba(16, 185, 129, 0.15)' 
                : 'var(--color-bg-secondary)',
              color: weekWiseMode 
                ? '#10b981' 
                : 'var(--color-text-secondary)',
              border: `1px solid ${weekWiseMode ? '#10b981' : 'var(--color-border-subtle)'}`
            }}
          >
            {weekWiseMode ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Circle className="w-4 h-4" />
            )}
            Check week wise reports
          </button>

          {/* Year Selector - Only visible when week-wise mode is enabled */}
          {weekWiseMode && (
            <select
              value={selectedYear || currentYear}
              onChange={(e) => onYearChange?.(parseInt(e.target.value))}
              className="px-3 py-1.5 rounded-lg border text-xs font-medium"
              style={{
                backgroundColor: 'var(--color-bg-primary)',
                borderColor: '#10b981',
                color: 'var(--color-text-primary)'
              }}
            >
              {years.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Date Filters - Hidden when week-wise mode is enabled */}
      {!weekWiseMode && (
        <>
          {/* Quick Preset Buttons - First 4 visible */}
          {visiblePresets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
              style={{
                backgroundColor: activePreset === preset.id 
                  ? 'rgba(16, 185, 129, 0.15)' 
                  : 'var(--color-bg-secondary)',
                color: activePreset === preset.id 
                  ? '#10b981' 
                  : 'var(--color-text-secondary)',
                border: `1px solid ${activePreset === preset.id ? '#10b981' : 'var(--color-border-subtle)'}`
              }}
            >
              {preset.label}
            </button>
          ))}
        </>
      )}


      {/* More Presets Dropdown - Hidden when week-wise mode is enabled */}
      {!weekWiseMode && morePresets.length > 0 && (
        <div className="relative group">
          <button
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
            style={{
              backgroundColor: morePresets.some(p => activePreset === p.id)
                ? 'rgba(16, 185, 129, 0.15)' 
                : 'var(--color-bg-secondary)',
              color: morePresets.some(p => activePreset === p.id)
                ? '#10b981' 
                : 'var(--color-text-secondary)',
              border: `1px solid ${morePresets.some(p => activePreset === p.id) ? '#10b981' : 'var(--color-border-subtle)'}`
            }}
          >
            More
            <ChevronDown className="w-3 h-3 transition-transform duration-200 group-hover:rotate-180" />
          </button>
          <div 
            className="absolute top-full left-0 mt-1.5 py-1.5 rounded-xl border z-[100] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200"
            style={{
              backgroundColor: '#ffffff',
              borderColor: '#e5e7eb',
              minWidth: '140px',
              boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.2), 0 4px 20px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.05)'
            }}
          >
            {morePresets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset)}
                className="w-full px-3 py-2 text-left text-xs font-medium transition-all duration-150 rounded-lg mx-auto"
                style={{
                  color: activePreset === preset.id ? '#10b981' : 'var(--color-text-secondary)',
                  backgroundColor: activePreset === preset.id ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                  width: 'calc(100% - 8px)',
                  marginLeft: '4px'
                }}
                onMouseEnter={(e) => {
                  if (activePreset !== preset.id) e.currentTarget.style.backgroundColor = '#f3f4f6';
                }}
                onMouseLeave={(e) => {
                  if (activePreset !== preset.id) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}


      {/* Custom Range Button - Hidden when week-wise mode is enabled */}
      {!weekWiseMode && (
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowCustomPicker(!showCustomPicker)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
            style={{
              backgroundColor: activePreset === 'custom' 
                ? 'rgba(16, 185, 129, 0.15)' 
                : 'var(--color-bg-secondary)',
              color: activePreset === 'custom' 
                ? '#10b981' 
                : 'var(--color-text-secondary)',
              border: `1px solid ${activePreset === 'custom' || showCustomPicker ? '#10b981' : 'var(--color-border-subtle)'}`
            }}
          >
            <CalendarRange className="w-3.5 h-3.5" />
            {activePreset === 'custom' && filters.startDate ? (
              <span>
                {formatDisplayDate(filters.startDate)} - {formatDisplayDate(filters.endDate)}
              </span>
            ) : (
              <span>Custom Range</span>
            )}
            <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showCustomPicker ? 'rotate-180' : ''}`} />
          </button>

          {/* Custom Date Picker Dropdown */}
          {showCustomPicker && (
            <div 
              className="absolute top-full left-0 mt-2 p-4 rounded-xl border z-[100]"
              style={{
                backgroundColor: '#ffffff',
                borderColor: '#e5e7eb',
                minWidth: '280px',
                boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.2), 0 4px 20px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.05)'
              }}
            >
              <div className="space-y-4">
                <div>
                  <label 
                    className="text-xs font-medium mb-1 block"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    Start Date
                  </label>
                  <input
                    type="date"
                    id="customStartDate"
                    className="w-full px-3 py-2 rounded-lg border text-sm"
                    style={{
                      backgroundColor: 'var(--color-bg-primary)',
                      borderColor: 'var(--color-border-subtle)',
                      color: 'var(--color-text-primary)'
                    }}
                    defaultValue={filters.startDate ? new Date(filters.startDate).toISOString().split('T')[0] : ''}
                  />
                </div>
                <div>
                  <label 
                    className="text-xs font-medium mb-1 block"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    End Date
                  </label>
                  <input
                    type="date"
                    id="customEndDate"
                    className="w-full px-3 py-2 rounded-lg border text-sm"
                    style={{
                      backgroundColor: 'var(--color-bg-primary)',
                      borderColor: 'var(--color-border-subtle)',
                      color: 'var(--color-text-primary)'
                    }}
                    defaultValue={filters.endDate ? new Date(filters.endDate).toISOString().split('T')[0] : ''}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const start = document.getElementById('customStartDate').value;
                      const end = document.getElementById('customEndDate').value;
                      if (start && end) {
                        applyCustomRange(start, end);
                      }
                    }}
                    className="flex-1 px-3 py-2 rounded-lg text-sm font-medium text-white transition-all duration-200"
                    style={{ backgroundColor: '#10b981' }}
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => setShowCustomPicker(false)}
                    className="px-3 py-2 rounded-lg text-sm font-medium border transition-all duration-200"
                    style={{
                      backgroundColor: 'var(--color-bg-primary)',
                      borderColor: 'var(--color-border-subtle)',
                      color: 'var(--color-text-secondary)'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}


      {/* Clear Filter Button - Hidden when week-wise mode is enabled */}
      {!weekWiseMode && hasActiveFilter && (
        <button
          onClick={handleClear}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            color: '#ef4444'
          }}
        >
          <X className="w-3 h-3" />
          Clear
        </button>
      )}

      {/* Save Current Filter as Preset - Hidden when week-wise mode is enabled */}
      {!weekWiseMode && showSavedPresets && hasActiveFilter && (

        <div className="relative" ref={saveModalRef}>
          <button
            onClick={() => setShowSaveModal(!showSaveModal)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
            style={{
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              color: '#3b82f6'
            }}
          >
            <Bookmark className="w-3 h-3" />
            Save
          </button>

          {showSaveModal && (
            <div 
              className="absolute top-full right-0 mt-2 p-3 rounded-xl border z-50"
              style={{
                backgroundColor: '#ffffff',
                borderColor: '#e5e7eb',
                minWidth: '200px',
                boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.2), 0 4px 20px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.05)'
              }}
            >
              <label 
                className="text-xs font-medium mb-1 block"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Preset Name
              </label>
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="e.g., My Weekly Billing"
                className="w-full px-3 py-2 rounded-lg border text-sm mb-2"
                style={{
                  backgroundColor: 'var(--color-bg-primary)',
                  borderColor: 'var(--color-border-subtle)',
                  color: 'var(--color-text-primary)'
                }}
              />
              <button
                onClick={saveCurrentPreset}
                disabled={!presetName.trim()}
                className="w-full px-3 py-2 rounded-lg text-sm font-medium text-white transition-all duration-200 disabled:opacity-50"
                style={{ backgroundColor: '#3b82f6' }}
              >
                Save Preset
              </button>
            </div>
          )}
        </div>
      )}

      {/* Saved Presets Chips - Hidden when week-wise mode is enabled */}
      {!weekWiseMode && showSavedPresets && savedPresets.length > 0 && (

        <div className="flex items-center gap-2 ml-2 pl-2 border-l" style={{ borderColor: 'var(--color-border-subtle)' }}>
          {savedPresets.map((preset) => (
            <div
              key={preset.id}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium cursor-pointer group"
              style={{
                backgroundColor: activePreset === `saved-${preset.id}`
                  ? 'rgba(59, 130, 246, 0.15)' 
                  : 'var(--color-bg-muted)',
                color: activePreset === `saved-${preset.id}`
                  ? '#3b82f6' 
                  : 'var(--color-text-secondary)',
                border: `1px solid ${activePreset === `saved-${preset.id}` ? '#3b82f6' : 'transparent'}`
              }}
            >
              <Bookmark className="w-3 h-3" />
              <span onClick={() => applySavedPreset(preset)}>{preset.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSavedPreset(preset.id);
                }}
                className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: '#ef4444' }}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DateFilters;
