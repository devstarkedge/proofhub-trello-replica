import React from 'react';
import { DollarSign } from 'lucide-react';

/**
 * WeekWiseColumns - Utility components for rendering week-wise payment columns
 * Used to dynamically extend existing tables with week breakdown columns
 */

// Month names for display
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Calculate week date ranges for a given month
 * @param {number} year - Year
 * @param {number} month - Month (0-indexed)
 * @returns {Array} Array of week objects with start and end dates
 */
export const getWeeksOfMonth = (year, month) => {
  const weeks = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  
  let weekStart = new Date(firstDay);
  let weekNum = 1;
  
  while (weekStart <= lastDay && weekNum <= 5) {
    // Find the end of the week (Saturday) or end of month
    let weekEnd = new Date(weekStart);
    const daysUntilSaturday = 6 - weekStart.getDay();
    weekEnd.setDate(weekStart.getDate() + daysUntilSaturday);
    
    // If week end goes beyond month, cap it at last day of month
    if (weekEnd > lastDay) {
      weekEnd = new Date(lastDay);
    }
    
    weeks.push({
      week: weekNum,
      start: new Date(weekStart),
      end: new Date(weekEnd),
      label: `Week ${weekNum}`
    });
    
    // Move to next week (Sunday)
    weekStart = new Date(weekEnd);
    weekStart.setDate(weekEnd.getDate() + 1);
    weekNum++;
  }
  
  // Ensure we always have 5 week slots for consistent columns
  while (weeks.length < 5) {
    weeks.push({
      week: weeks.length + 1,
      start: null,
      end: null,
      label: `Week ${weeks.length + 1}`
    });
  }
  
  return weeks;
};

/**
 * Get all weeks for a year (by month)
 * @param {number} year - Year
 * @returns {Array} Array of month objects with their weeks
 */
export const getYearWeeks = (year) => {
  const months = [];
  
  for (let month = 0; month < 12; month++) {
    months.push({
      month,
      monthName: MONTH_NAMES[month],
      weeks: getWeeksOfMonth(year, month)
    });
  }
  
  return months;
};

/**
 * Format week value for display
 * @param {number|null} value - Payment value
 * @param {function} formatCurrency - Currency formatter function
 * @returns {string} Formatted value or dash for empty
 */
export const formatWeekValue = (value, formatCurrency) => {
  if (value === null || value === undefined || value === 0) {
    return '—';
  }
  return formatCurrency ? formatCurrency(value) : `$${value.toFixed(0)}`;
};

/**
 * WeekWiseHeaders - Renders week column headers (Week 1-5)
 * Used to extend existing table headers when week-wise mode is enabled
 * @param {Object} props
 * @param {number} props.year - Year for the report
 * @param {boolean} props.showMonthColumn - Whether to show separate month column
 * @param {number} props.currentMonth - Current month to display date ranges (0-indexed)
 * @param {Object} props.headerStyle - Additional styles for headers
 */
export const WeekWiseHeaders = ({ 
  year, 
  showMonthColumn = true,
  currentMonth,
  headerStyle = {}
}) => {
  // Get weeks with date ranges for current month if provided
  const weeks = currentMonth !== undefined && currentMonth !== null 
    ? getWeeksOfMonth(year, currentMonth)
    : [];
  
  // Get month name
  const monthName = currentMonth !== undefined && currentMonth !== null 
    ? MONTH_NAMES[currentMonth] 
    : '';

  // Helper to format date range for a week
  const formatWeekDateRange = (weekIndex) => {
    if (weeks[weekIndex] && weeks[weekIndex].start && weeks[weekIndex].end) {
      const startDay = weeks[weekIndex].start.getDate();
      const endDay = weeks[weekIndex].end.getDate();
      return `${startDay}-${endDay} ${monthName}`;
    }
    return '';
  };

  return (
    <>
      {showMonthColumn && (
        <th 
          className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider"
          style={{ 
            color: 'var(--color-text-secondary)',
            minWidth: '80px',
            ...headerStyle
          }}
        >
          Month
        </th>
      )}
      <th 
        className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider"
        style={{ 
          color: 'var(--color-text-secondary)',
          minWidth: '95px',
          ...headerStyle
        }}
      >
        <div>Week 1</div>
        {formatWeekDateRange(0) && (
          <div className="text-[10px] font-normal normal-case" style={{ color: 'var(--color-text-muted)' }}>
            {formatWeekDateRange(0)}
          </div>
        )}
      </th>
      <th 
        className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider"
        style={{ 
          color: 'var(--color-text-secondary)',
          minWidth: '95px',
          ...headerStyle
        }}
      >
        <div>Week 2</div>
        {formatWeekDateRange(1) && (
          <div className="text-[10px] font-normal normal-case" style={{ color: 'var(--color-text-muted)' }}>
            {formatWeekDateRange(1)}
          </div>
        )}
      </th>
      <th 
        className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider"
        style={{ 
          color: 'var(--color-text-secondary)',
          minWidth: '95px',
          ...headerStyle
        }}
      >
        <div>Week 3</div>
        {formatWeekDateRange(2) && (
          <div className="text-[10px] font-normal normal-case" style={{ color: 'var(--color-text-muted)' }}>
            {formatWeekDateRange(2)}
          </div>
        )}
      </th>
      <th 
        className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider"
        style={{ 
          color: 'var(--color-text-secondary)',
          minWidth: '95px',
          ...headerStyle
        }}
      >
        <div>Week 4</div>
        {formatWeekDateRange(3) && (
          <div className="text-[10px] font-normal normal-case" style={{ color: 'var(--color-text-muted)' }}>
            {formatWeekDateRange(3)}
          </div>
        )}
      </th>
      <th 
        className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider"
        style={{ 
          color: 'var(--color-text-secondary)',
          minWidth: '95px',
          ...headerStyle
        }}
      >
        <div>Week 5</div>
        {formatWeekDateRange(4) && (
          <div className="text-[10px] font-normal normal-case" style={{ color: 'var(--color-text-muted)' }}>
            {formatWeekDateRange(4)}
          </div>
        )}
      </th>
    </>
  );
};

/**
 * WeekWiseCells - Renders week payment cells for a row
 * @param {Object} props 
 * @param {Array} props.weeklyPayments - Array of 5 payment values [week1, week2, week3, week4, week5]
 * @param {string} props.monthName - Optional month name to show in month column
 * @param {function} props.formatCurrency - Currency formatter function
 * @param {boolean} props.showMonthColumn - Whether to show month column
 * @param {boolean} props.isTotal - Whether this is a total row (bold styling)
 */
export const WeekWiseCells = ({ 
  weeklyPayments = [0, 0, 0, 0, 0], 
  monthName,
  formatCurrency,
  showMonthColumn = true,
  isTotal = false,
  cellStyle = {}
}) => {
  // Ensure we have 5 values
  const payments = [...(weeklyPayments || [])];
  while (payments.length < 5) {
    payments.push(0);
  }
  
  const textStyle = {
    color: isTotal ? '#10b981' : 'var(--color-text-secondary)',
    fontWeight: isTotal ? '600' : 'normal',
    ...cellStyle
  };
  
  return (
    <>
      {showMonthColumn && (
        <td 
          className="px-4 py-3 text-sm"
          style={{ 
            color: 'var(--color-text-secondary)',
            ...cellStyle
          }}
        >
          {monthName || '—'}
        </td>
      )}
      {payments.map((payment, idx) => (
        <td 
          key={idx}
          className="px-3 py-3 text-center text-sm"
          style={textStyle}
        >
          {formatWeekValue(payment, formatCurrency)}
        </td>
      ))}
    </>
  );
};

/**
 * Calculate weekly payments from time entries
 * @param {Array} billedTimeEntries - Array of billed time entries
 * @param {number} year - Year to filter by
 * @param {number} month - Month to filter by (0-indexed)
 * @param {Object} project - Project object with billing info
 * @returns {Array} Array of 5 payment values for each week
 */
export const calculateWeeklyPayments = (billedTimeEntries, year, month, project) => {
  const weeks = getWeeksOfMonth(year, month);
  const weeklyPayments = [0, 0, 0, 0, 0];
  
  if (!billedTimeEntries || !Array.isArray(billedTimeEntries)) {
    return weeklyPayments;
  }
  
  for (const entry of billedTimeEntries) {
    const entryDate = new Date(entry.date);
    if (entryDate.getFullYear() !== year || entryDate.getMonth() !== month) {
      continue;
    }
    
    // Find which week this entry belongs to
    for (let i = 0; i < weeks.length; i++) {
      const week = weeks[i];
      if (!week.start || !week.end) continue;
      
      if (entryDate >= week.start && entryDate <= week.end) {
        const minutes = ((entry.hours || 0) * 60) + (entry.minutes || 0);
        
        if (project?.billingCycle === 'hr') {
          weeklyPayments[i] += (minutes / 60) * (project.hourlyPrice || 0);
        }
        break;
      }
    }
  }
  
  return weeklyPayments;
};

/**
 * Aggregate weekly payments from grouped data structure
 * This is used when week-wise data comes from the API
 * @param {Object} weeklyData - Object with week1, week2, etc. keys
 * @returns {Array} Array of 5 payment values
 */
export const aggregateWeeklyPayments = (weeklyData) => {
  if (!weeklyData) return [0, 0, 0, 0, 0];
  
  return [
    weeklyData.week1 || weeklyData[0] || 0,
    weeklyData.week2 || weeklyData[1] || 0,
    weeklyData.week3 || weeklyData[2] || 0,
    weeklyData.week4 || weeklyData[3] || 0,
    weeklyData.week5 || weeklyData[4] || 0
  ];
};

/**
 * Calculate year total from monthly weekly data
 * @param {Array} monthsData - Array of month objects with weeks array
 * @returns {number} Total payment for the year
 */
export const calculateYearTotal = (monthsData) => {
  if (!monthsData || !Array.isArray(monthsData)) return 0;
  
  return monthsData.reduce((yearTotal, month) => {
    const monthTotal = (month.weeks || []).reduce((sum, week) => sum + (week || 0), 0);
    return yearTotal + monthTotal;
  }, 0);
};

export default {
  WeekWiseHeaders,
  WeekWiseCells,
  getWeeksOfMonth,
  getYearWeeks,
  formatWeekValue,
  calculateWeeklyPayments,
  aggregateWeeklyPayments,
  calculateYearTotal
};
