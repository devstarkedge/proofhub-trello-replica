import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Users,
  FolderKanban,
  Building2,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import api from '../../services/api';

/**
 * WeekWiseTableExtension - Renders week-wise payment breakdown table
 * Shows data as: Month -> Week 1-5 -> Total Payment
 * Supports both users and projects view types
 */
const WeekWiseTableExtension = ({ 
  type = 'users', 
  year,
  departmentId,
  onDataLoaded,
  formatCurrency
}) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedMonths, setExpandedMonths] = useState({});

  // Default currency formatter
  const defaultFormatCurrency = (amount) => {
    if (amount === null || amount === undefined) return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const currencyFormatter = formatCurrency || defaultFormatCurrency;

  // Fetch week-wise data
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams({
        year: year.toString(),
        viewType: type
      });
      
      if (departmentId) {
        params.append('departmentId', departmentId);
      }
      
      const response = await api.get(`/api/finance/weekly-report/year?${params.toString()}`);
      
      if (response.data.success) {
        setData(response.data.data);
        
        // Auto-expand all months with data
        const expanded = {};
        (response.data.data.months || []).forEach(m => {
          expanded[m.month] = true;
        });
        setExpandedMonths(expanded);
        
        // Callback for parent component
        if (onDataLoaded) {
          onDataLoaded(response.data.data);
        }
      }
    } catch (err) {
      console.error('Error fetching week-wise data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [year, type, departmentId]);

  // Toggle month expansion
  const toggleMonth = (month) => {
    setExpandedMonths(prev => ({
      ...prev,
      [month]: !prev[month]
    }));
  };

  // Format week value
  const formatWeekValue = (value) => {
    if (value === null || value === undefined || value === 0) return '—';
    return currencyFormatter(value);
  };

  if (loading) {
    return (
      <div 
        className="p-6 rounded-xl border text-center"
        style={{ 
          backgroundColor: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border-subtle)'
        }}
      >
        <div className="flex items-center justify-center gap-3">
          <RefreshCw className="w-5 h-5 animate-spin" style={{ color: '#10b981' }} />
          <span style={{ color: 'var(--color-text-muted)' }}>
            Loading week-wise data for {year}...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div 
        className="p-4 rounded-xl border text-center"
        style={{ 
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          borderColor: 'rgba(239, 68, 68, 0.3)',
          color: '#ef4444'
        }}
      >
        <AlertCircle className="w-5 h-5 mx-auto mb-2" />
        <p className="text-sm">Failed to load week-wise data: {error}</p>
        <button 
          onClick={fetchData}
          className="mt-2 text-xs flex items-center gap-1 mx-auto hover:underline"
        >
          <RefreshCw className="w-3 h-3" /> Retry
        </button>
      </div>
    );
  }

  if (!data || !data.months || data.months.length === 0) {
    return (
      <div 
        className="p-8 rounded-xl border text-center"
        style={{ 
          backgroundColor: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border-subtle)'
        }}
      >
        <Calendar className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--color-text-muted)' }} />
        <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          No data for {year}
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          No payment entries found for the selected year
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div 
        className="flex items-center justify-between p-3 rounded-lg"
        style={{ backgroundColor: 'var(--color-bg-muted)' }}
      >
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5" style={{ color: '#10b981' }} />
          <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Week-Wise Report - {year}
          </span>
        </div>
        <span className="text-lg font-bold" style={{ color: '#10b981' }}>
          {currencyFormatter(data.yearTotal)}
        </span>
      </div>

      {/* Months Table */}
      <div 
        className="rounded-xl border overflow-hidden"
        style={{ 
          backgroundColor: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border-subtle)'
        }}
      >
        {/* Table Header */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: 'var(--color-bg-muted)' }}>
                <th 
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider sticky left-0"
                  style={{ 
                    color: 'var(--color-text-secondary)',
                    backgroundColor: 'var(--color-bg-muted)',
                    minWidth: '120px'
                  }}
                >
                  Month
                </th>
                <th 
                  className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text-secondary)', minWidth: '100px' }}
                >
                  Week 1
                </th>
                <th 
                  className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text-secondary)', minWidth: '100px' }}
                >
                  Week 2
                </th>
                <th 
                  className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text-secondary)', minWidth: '100px' }}
                >
                  Week 3
                </th>
                <th 
                  className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text-secondary)', minWidth: '100px' }}
                >
                  Week 4
                </th>
                <th 
                  className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text-secondary)', minWidth: '100px' }}
                >
                  Week 5
                </th>
                <th 
                  className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text-secondary)', minWidth: '120px' }}
                >
                  <div className="flex items-center justify-end gap-1">
                    <DollarSign className="w-4 h-4" />
                    Payment
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.months.map((monthData) => (
                <React.Fragment key={monthData.month}>
                  {/* Month Row */}
                  <tr 
                    className="cursor-pointer transition-colors duration-150"
                    style={{ borderTop: '1px solid var(--color-border-subtle)' }}
                    onClick={() => toggleMonth(monthData.month)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--color-bg-muted)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <td 
                      className="px-4 py-3 sticky left-0 font-medium"
                      style={{ 
                        color: 'var(--color-text-primary)',
                        backgroundColor: 'var(--color-bg-secondary)'
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {expandedMonths[monthData.month] ? (
                          <ChevronDown className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
                        ) : (
                          <ChevronRight className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
                        )}
                        {monthData.monthName}
                      </div>
                    </td>
                    {monthData.weeks.map((week, idx) => (
                      <td 
                        key={idx}
                        className="px-4 py-3 text-center text-sm"
                        style={{ 
                          color: week.payment ? 'var(--color-text-secondary)' : 'var(--color-text-muted)' 
                        }}
                      >
                        {formatWeekValue(week.payment)}
                      </td>
                    ))}
                    <td 
                      className="px-4 py-3 text-right text-sm font-semibold"
                      style={{ color: '#10b981' }}
                    >
                      {currencyFormatter(monthData.totalPayment)}
                    </td>
                  </tr>

                  {/* Expanded Items */}
                  {expandedMonths[monthData.month] && monthData.items?.length > 0 && (
                    monthData.items.map((item, itemIdx) => (
                      <tr 
                        key={`${monthData.month}-${itemIdx}`}
                        className="text-sm"
                        style={{ 
                          backgroundColor: 'var(--color-bg-primary)',
                          borderTop: '1px solid var(--color-border-subtle)'
                        }}
                      >
                        <td 
                          className="px-4 py-2 pl-10 sticky left-0"
                          style={{ 
                            backgroundColor: 'var(--color-bg-primary)',
                            color: 'var(--color-text-secondary)'
                          }}
                        >
                          <div className="flex items-center gap-2">
                            {type === 'users' ? (
                              <Users className="w-3.5 h-3.5" style={{ color: '#3b82f6' }} />
                            ) : (
                              <FolderKanban className="w-3.5 h-3.5" style={{ color: '#8b5cf6' }} />
                            )}
                            <span className="truncate max-w-32">
                              {type === 'users' ? item.userName : item.projectName}
                            </span>
                          </div>
                        </td>
                        {item.weeks.map((weekPayment, weekIdx) => (
                          <td 
                            key={weekIdx}
                            className="px-4 py-2 text-center"
                            style={{ 
                              color: weekPayment ? 'var(--color-text-muted)' : 'var(--color-text-muted)' 
                            }}
                          >
                            {formatWeekValue(weekPayment)}
                          </td>
                        ))}
                        <td 
                          className="px-4 py-2 text-right"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          {currencyFormatter(item.totalPayment)}
                        </td>
                      </tr>
                    ))
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Year Total */}
      <div 
        className="p-4 rounded-xl border flex items-center justify-between"
        style={{ 
          backgroundColor: 'rgba(16, 185, 129, 0.08)',
          borderColor: 'rgba(16, 185, 129, 0.3)'
        }}
      >
        <span 
          className="font-semibold"
          style={{ color: 'var(--color-text-primary)' }}
        >
          Year Total ({year})
        </span>
        <span 
          className="text-lg font-bold"
          style={{ color: '#10b981' }}
        >
          {currencyFormatter(data.yearTotal)}
        </span>
      </div>
    </div>
  );
};

export default WeekWiseTableExtension;
