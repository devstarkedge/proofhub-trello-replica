import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar,
  Clock,
  DollarSign,
  ChevronDown,
  ChevronRight,
  Users,
  FolderKanban,
  AlertCircle,
  RefreshCw,
  Building2
} from 'lucide-react';
import api from '../../services/api';

/**
 * WeeklyReport - Week-wise finance report view
 * Shows data grouped by Week 1-5
 * Supports both user-wise and project-wise views
 */
const WeeklyReport = ({ viewType = 'users' }) => {
  const [weeklyData, setWeeklyData] = useState([]);
  const [monthlyTotals, setMonthlyTotals] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [expandedWeeks, setExpandedWeeks] = useState({});
  const [currentViewType, setCurrentViewType] = useState(viewType);

  // Month names
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Fetch data from the new weekly API
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams({
        year: selectedYear.toString(),
        month: selectedMonth.toString(),
        viewType: currentViewType
      });
      
      const response = await api.get(`/api/finance/weekly?${params.toString()}`);
      
      if (response.data.success) {
        setWeeklyData(response.data.data.weeks || []);
        setMonthlyTotals(response.data.data.monthlyTotals || {});
        
        // Auto-expand all weeks
        const expanded = {};
        (response.data.data.weeks || []).forEach(w => { expanded[w.week] = true; });
        setExpandedWeeks(expanded);
      }
    } catch (err) {
      console.error('Error fetching weekly report:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedMonth, selectedYear, currentViewType]);

  // Toggle week expansion
  const toggleWeek = (week) => {
    setExpandedWeeks(prev => ({
      ...prev,
      [week]: !prev[week]
    }));
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount || 0);
  };

  // Format time
  const formatTime = (minutes) => {
    const hrs = Math.floor((minutes || 0) / 60);
    const mins = (minutes || 0) % 60;
    return `${hrs}h ${mins}m`;
  };

  // Format date range
  const formatDateRange = (start, end) => {
    const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${formatDate(start)} - ${formatDate(end)}`;
  };

  // Generate years for dropdown
  const years = [];
  const currentYear = new Date().getFullYear();
  for (let y = currentYear - 2; y <= currentYear + 1; y++) {
    years.push(y);
  }

  return (
    <div>
      {/* Header with Month/Year Selector */}
      <div 
        className="p-4 rounded-xl mb-6 border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        style={{ 
          backgroundColor: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border-subtle)'
        }}
      >
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5" style={{ color: '#10b981' }} />
          <h2 
            className="text-lg font-semibold"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Weekly Report
          </h2>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* View Type Toggle */}
          <div 
            className="flex items-center gap-1 p-1 rounded-lg"
            style={{ backgroundColor: 'var(--color-bg-muted)' }}
          >
            <button
              onClick={() => setCurrentViewType('users')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
              style={{
                backgroundColor: currentViewType === 'users' ? 'var(--color-bg-primary)' : 'transparent',
                color: currentViewType === 'users' ? '#3b82f6' : 'var(--color-text-muted)',
                boxShadow: currentViewType === 'users' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              <Users className="w-3.5 h-3.5" />
              Users
            </button>
            <button
              onClick={() => setCurrentViewType('projects')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
              style={{
                backgroundColor: currentViewType === 'projects' ? 'var(--color-bg-primary)' : 'transparent',
                color: currentViewType === 'projects' ? '#8b5cf6' : 'var(--color-text-muted)',
                boxShadow: currentViewType === 'projects' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              <FolderKanban className="w-3.5 h-3.5" />
              Projects
            </button>
          </div>

          {/* Month Selector */}
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            className="px-3 py-2 rounded-lg border text-sm"
            style={{
              backgroundColor: 'var(--color-bg-primary)',
              borderColor: 'var(--color-border-subtle)',
              color: 'var(--color-text-primary)'
            }}
          >
            {months.map((month, idx) => (
              <option key={month} value={idx}>{month}</option>
            ))}
          </select>
          
          {/* Year Selector */}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="px-3 py-2 rounded-lg border text-sm"
            style={{
              backgroundColor: 'var(--color-bg-primary)',
              borderColor: 'var(--color-border-subtle)',
              color: 'var(--color-text-primary)'
            }}
          >
            {years.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          
          {/* Refresh */}
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all duration-200 hover:border-emerald-500"
            style={{ 
              backgroundColor: 'var(--color-bg-primary)',
              borderColor: 'var(--color-border-subtle)',
              color: 'var(--color-text-secondary)'
            }}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div 
          className="p-4 rounded-xl border text-center mb-6"
          style={{ 
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderColor: 'rgba(239, 68, 68, 0.3)',
            color: '#ef4444'
          }}
        >
          <AlertCircle className="w-5 h-5 mx-auto mb-2" />
          <p className="text-sm">Failed to load data: {error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map(i => (
            <div 
              key={i}
              className="p-4 rounded-xl border animate-pulse"
              style={{ 
                backgroundColor: 'var(--color-bg-secondary)',
                borderColor: 'var(--color-border-subtle)'
              }}
            >
              <div className="flex items-center justify-between">
                <div 
                  className="h-6 w-32 rounded"
                  style={{ backgroundColor: 'var(--color-bg-muted)' }}
                />
                <div 
                  className="h-6 w-24 rounded"
                  style={{ backgroundColor: 'var(--color-bg-muted)' }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {weeklyData.map((week) => (
            <div 
              key={week.week}
              className="rounded-xl border overflow-hidden"
              style={{ 
                backgroundColor: 'var(--color-bg-secondary)',
                borderColor: 'var(--color-border-subtle)'
              }}
            >
              {/* Week Header */}
              <button
                onClick={() => toggleWeek(week.week)}
                className="w-full flex items-center justify-between px-4 py-4 transition-colors duration-150"
                style={{ backgroundColor: 'var(--color-bg-muted)' }}
              >
                <div className="flex items-center gap-4">
                  <div 
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold"
                    style={{ 
                      backgroundColor: 'rgba(16, 185, 129, 0.15)',
                      color: '#10b981'
                    }}
                  >
                    {week.week}
                  </div>
                  <div className="text-left">
                    <p 
                      className="font-semibold"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {week.label}
                    </p>
                    <p 
                      className="text-xs"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      {formatDateRange(week.startDate, week.endDate)}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-6">
                  <div className="text-right hidden sm:block">
                    <p 
                      className="text-sm"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      {formatTime(week.totalBilledMinutes)} billed
                    </p>
                  </div>
                  <div className="text-right">
                    <p 
                      className="text-lg font-bold"
                      style={{ color: '#10b981' }}
                    >
                      {formatCurrency(week.totalPayment)}
                    </p>
                    <p 
                      className="text-xs"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      {week.items?.length || 0} {currentViewType === 'users' ? 'users' : 'projects'}
                    </p>
                  </div>
                  {expandedWeeks[week.week] ? (
                    <ChevronDown className="w-5 h-5" style={{ color: 'var(--color-text-muted)' }} />
                  ) : (
                    <ChevronRight className="w-5 h-5" style={{ color: 'var(--color-text-muted)' }} />
                  )}
                </div>
              </button>

              {/* Week Details */}
              {expandedWeeks[week.week] && week.items?.length > 0 && (
                <div className="p-4">
                  <div className="space-y-2">
                    {week.items.map((item, idx) => (
                      <div 
                        key={idx}
                        className="flex items-center justify-between p-3 rounded-lg"
                        style={{ backgroundColor: 'var(--color-bg-primary)' }}
                      >
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ 
                              backgroundColor: currentViewType === 'users' 
                                ? 'rgba(59, 130, 246, 0.12)' 
                                : 'rgba(139, 92, 246, 0.12)'
                            }}
                          >
                            {currentViewType === 'users' ? (
                              <Users className="w-4 h-4" style={{ color: '#3b82f6' }} />
                            ) : (
                              <FolderKanban className="w-4 h-4" style={{ color: '#8b5cf6' }} />
                            )}
                          </div>
                          <div>
                            <p 
                              className="font-medium text-sm"
                              style={{ color: 'var(--color-text-primary)' }}
                            >
                              {currentViewType === 'users' ? item.userName : item.projectName}
                            </p>
                            <p 
                              className="text-xs"
                              style={{ color: 'var(--color-text-muted)' }}
                            >
                              {currentViewType === 'users' 
                                ? `${item.projectCount || 0} projects` 
                                : item.department}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6 text-sm">
                          <div className="text-right hidden sm:block">
                            <p style={{ color: 'var(--color-text-secondary)' }}>
                              {formatTime(item.billedMinutes)}
                            </p>
                            <p 
                              className="text-xs"
                              style={{ color: 'var(--color-text-muted)' }}
                            >
                              billed
                            </p>
                          </div>
                          <p 
                            className="font-semibold min-w-20 text-right"
                            style={{ color: '#10b981' }}
                          >
                            {formatCurrency(item.payment)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty Week */}
              {expandedWeeks[week.week] && (!week.items || week.items.length === 0) && (
                <div className="p-8 text-center">
                  <p 
                    className="text-sm"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    No data for this week
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Monthly Summary */}
      {!loading && (
        <div 
          className="mt-6 p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
          style={{ 
            backgroundColor: 'rgba(16, 185, 129, 0.08)',
            borderColor: 'rgba(16, 185, 129, 0.3)'
          }}
        >
          <div>
            <span 
              className="font-semibold"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {months[selectedMonth]} {selectedYear} Total
            </span>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              {formatTime(monthlyTotals.totalBilledMinutes || 0)} total billed time
            </p>
          </div>
          <span 
            className="text-xl font-bold"
            style={{ color: '#10b981' }}
          >
            {formatCurrency(monthlyTotals.totalPayment || 0)}
          </span>
        </div>
      )}
    </div>
  );
};

export default WeeklyReport;
