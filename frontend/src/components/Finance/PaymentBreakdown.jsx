import React, { useMemo } from 'react';
import { 
  Calendar,
  CalendarDays,
  CalendarRange,
  CalendarCheck
} from 'lucide-react';

/**
 * PaymentBreakdown - Shows payment breakdown by Day/Week/Month/Year
 * Displays in a compact hover card or inline format
 */
const PaymentBreakdown = ({ 
  timeEntries = [], 
  billingType = 'hourly',
  hourlyRate = 0,
  fixedAmount = 0,
  compact = true 
}) => {
  const breakdown = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    let dayMinutes = 0, weekMinutes = 0, monthMinutes = 0, yearMinutes = 0;

    timeEntries.forEach(entry => {
      if (!entry.date) return;
      const entryDate = new Date(entry.date);
      const minutes = (entry.hours || 0) * 60 + (entry.minutes || 0);

      // Check each period
      if (entryDate >= today) {
        dayMinutes += minutes;
      }
      if (entryDate >= startOfWeek) {
        weekMinutes += minutes;
      }
      if (entryDate >= startOfMonth) {
        monthMinutes += minutes;
      }
      if (entryDate >= startOfYear) {
        yearMinutes += minutes;
      }
    });

    // Calculate payments
    const calculatePayment = (minutes) => {
      if (billingType === 'fixed') {
        return null; // Fixed doesn't break down by time
      }
      return (minutes / 60) * hourlyRate;
    };

    return {
      day: { minutes: dayMinutes, payment: calculatePayment(dayMinutes) },
      week: { minutes: weekMinutes, payment: calculatePayment(weekMinutes) },
      month: { minutes: monthMinutes, payment: calculatePayment(monthMinutes) },
      year: { minutes: yearMinutes, payment: calculatePayment(yearMinutes) }
    };
  }, [timeEntries, billingType, hourlyRate]);

  const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatTime = (minutes) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  };

  const periods = [
    { key: 'day', label: 'Today', icon: Calendar, color: '#10b981' },
    { key: 'week', label: 'This Week', icon: CalendarDays, color: '#3b82f6' },
    { key: 'month', label: 'This Month', icon: CalendarRange, color: '#8b5cf6' },
    { key: 'year', label: 'This Year', icon: CalendarCheck, color: '#f59e0b' }
  ];

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {periods.map(({ key, label, icon: Icon, color }) => (
          <div 
            key={key}
            className="flex flex-col items-center px-2 py-1 rounded-lg"
            style={{ backgroundColor: `${color}10` }}
            title={`${label}: ${formatTime(breakdown[key].minutes)}`}
          >
            <Icon className="w-3 h-3 mb-0.5" style={{ color }} />
            <span className="text-xs font-semibold" style={{ color }}>
              {billingType === 'hourly' 
                ? formatCurrency(breakdown[key].payment)
                : formatTime(breakdown[key].minutes)
              }
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div 
      className="grid grid-cols-4 gap-3 p-3 rounded-xl border"
      style={{ 
        backgroundColor: 'var(--color-bg-secondary)',
        borderColor: 'var(--color-border-subtle)'
      }}
    >
      {periods.map(({ key, label, icon: Icon, color }) => (
        <div 
          key={key}
          className="flex flex-col items-center p-3 rounded-lg"
          style={{ backgroundColor: `${color}10` }}
        >
          <Icon className="w-5 h-5 mb-2" style={{ color }} />
          <span className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
            {label}
          </span>
          <span className="text-sm font-bold" style={{ color }}>
            {billingType === 'hourly' 
              ? formatCurrency(breakdown[key].payment)
              : formatTime(breakdown[key].minutes)
            }
          </span>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {formatTime(breakdown[key].minutes)}
          </span>
        </div>
      ))}
    </div>
  );
};

/**
 * PaymentBreakdownCell - Inline cell for table display
 */
export const PaymentBreakdownCell = ({ 
  billedMinutes = { day: 0, week: 0, month: 0, year: 0 },
  hourlyRate = 0,
  billingType = 'hourly'
}) => {
  const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  if (billingType === 'fixed') {
    return <span style={{ color: 'var(--color-text-muted)' }}>-</span>;
  }

  const payments = {
    day: (billedMinutes.day / 60) * hourlyRate,
    week: (billedMinutes.week / 60) * hourlyRate,
    month: (billedMinutes.month / 60) * hourlyRate,
    year: (billedMinutes.year / 60) * hourlyRate
  };

  return (
    <div className="flex gap-1 text-xs">
      <span className="px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }} title="Today">
        D:{formatCurrency(payments.day)}
      </span>
      <span className="px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }} title="This Week">
        W:{formatCurrency(payments.week)}
      </span>
      <span className="px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }} title="This Month">
        M:{formatCurrency(payments.month)}
      </span>
      <span className="px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }} title="This Year">
        Y:{formatCurrency(payments.year)}
      </span>
    </div>
  );
};

export default PaymentBreakdown;
