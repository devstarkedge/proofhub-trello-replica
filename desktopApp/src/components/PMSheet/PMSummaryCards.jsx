import React from 'react';
import { 
  Briefcase, 
  Users, 
  Clock, 
  DollarSign, 
  TrendingUp, 
  Building2,
  CheckCircle,
  PlayCircle
} from 'lucide-react';
import { PMCardSkeleton } from './PMSkeletons';

/**
 * PMSummaryCards - Dashboard summary statistics cards
 */
const PMSummaryCards = ({ stats, loading = false, className = '' }) => {
  if (loading) {
    return (
      <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
        {[1, 2, 3, 4].map(i => (
          <PMCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: 'Total Projects',
      value: stats?.totalProjects || 0,
      icon: Briefcase,
      color: 'blue',
      subtitle: `${stats?.activeProjects || 0} active`,
      trend: null
    },
    {
      title: 'Team Members',
      value: stats?.totalUsers || 0,
      icon: Users,
      color: 'purple',
      subtitle: `${stats?.totalDepartments || 0} departments`,
      trend: null
    },
    {
      title: 'Total Billed Time',
      value: stats?.totalBilledTime?.display || '0h 0m',
      icon: Clock,
      color: 'emerald',
      subtitle: 'This period',
      trend: null
    },
    {
      title: 'Estimated Payment',
      value: new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(stats?.estimatedPayment || 0),
      icon: DollarSign,
      color: 'amber',
      subtitle: 'Based on billed hours',
      trend: null
    }
  ];

  const colorClasses = {
    blue: {
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      icon: 'bg-blue-500',
      text: 'text-blue-600 dark:text-blue-400'
    },
    purple: {
      bg: 'bg-purple-50 dark:bg-purple-900/20',
      icon: 'bg-purple-500',
      text: 'text-purple-600 dark:text-purple-400'
    },
    emerald: {
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      icon: 'bg-emerald-500',
      text: 'text-emerald-600 dark:text-emerald-400'
    },
    amber: {
      bg: 'bg-amber-50 dark:bg-amber-900/20',
      icon: 'bg-amber-500',
      text: 'text-amber-600 dark:text-amber-400'
    }
  };

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
      {cards.map((card, index) => {
        const colors = colorClasses[card.color];
        const Icon = card.icon;

        return (
          <div 
            key={index}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {card.title}
                </p>
                <p className={`text-2xl font-bold mt-1 ${colors.text}`}>
                  {card.value}
                </p>
                {card.subtitle && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {card.subtitle}
                  </p>
                )}
              </div>
              <div className={`p-3 rounded-xl ${colors.icon}`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
            </div>
            {card.trend && (
              <div className="flex items-center gap-1 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                <TrendingUp className={`w-4 h-4 ${card.trend > 0 ? 'text-green-500' : 'text-red-500'}`} />
                <span className={`text-sm font-medium ${card.trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {card.trend > 0 ? '+' : ''}{card.trend}%
                </span>
                <span className="text-xs text-gray-400">vs last period</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

/**
 * PMDepartmentCard - Card for department summary in dashboard
 */
export const PMDepartmentCard = ({ 
  department, 
  expanded = false, 
  onToggle,
  children,
  className = '' 
}) => {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden ${className}`}>
      {/* Department header */}
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between bg-gradient-to-r from-gray-50 to-blue-50 dark:from-gray-800 dark:to-gray-700 hover:from-gray-100 hover:to-blue-100 dark:hover:from-gray-700 dark:hover:to-gray-600 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className="p-2 bg-blue-500 rounded-lg">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div className="text-left">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {department.departmentName}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {department.projectCount} projects • {department.months?.length || 0} months
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Billed</p>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
              {Math.floor(department.totalBilledMinutes / 60)}h {department.totalBilledMinutes % 60}m
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500 dark:text-gray-400">Payment</p>
            <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
              ${department.totalPayment?.toFixed(2) || '0.00'}
            </p>
          </div>
          <svg 
            className={`w-5 h-5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          {children}
        </div>
      )}
    </div>
  );
};

/**
 * PMMonthSection - Month section within department
 */
export const PMMonthSection = ({ month, children, className = '' }) => (
  <div className={`border-b border-gray-100 dark:border-gray-700 last:border-b-0 ${className}`}>
    <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900 flex items-center justify-between">
      <h4 className="font-medium text-gray-700 dark:text-gray-300">
        📅 {month.monthLabel}
      </h4>
      <div className="flex items-center gap-4 text-sm">
        <span className="text-gray-500 dark:text-gray-400">
          Billed: <span className="font-medium text-emerald-600">{Math.floor(month.totalBilledMinutes / 60)}h {month.totalBilledMinutes % 60}m</span>
        </span>
        <span className="text-gray-500 dark:text-gray-400">
          Payment: <span className="font-medium text-amber-600">${month.totalPayment?.toFixed(2)}</span>
        </span>
      </div>
    </div>
    {children}
  </div>
);

/**
 * PMWeekSection - Week section within month
 */
export const PMWeekSection = ({ week, children, className = '' }) => (
  <div className={`${className}`}>
    <div className="px-6 py-2 bg-blue-50/50 dark:bg-blue-900/10 flex items-center justify-between">
      <h5 className="text-sm font-medium text-blue-700 dark:text-blue-400">
        {week.week}
      </h5>
      <div className="flex items-center gap-3 text-xs">
        <span className="text-gray-500">
          Logged: <span className="font-medium">{Math.floor(week.totalLoggedMinutes / 60)}h {week.totalLoggedMinutes % 60}m</span>
        </span>
        <span className="text-gray-500">
          Billed: <span className="font-medium text-emerald-600">{Math.floor(week.totalBilledMinutes / 60)}h {week.totalBilledMinutes % 60}m</span>
        </span>
        <span className="text-gray-500">
          Payment: <span className="font-medium text-amber-600">${week.totalPayment?.toFixed(2)}</span>
        </span>
      </div>
    </div>
    {children}
  </div>
);

/**
 * PMProjectStatusCard - Mini card showing project status counts
 */
export const PMProjectStatusCard = ({ activeCount = 0, completedCount = 0, onHoldCount = 0, className = '' }) => (
  <div className={`flex items-center gap-4 ${className}`}>
    <div className="flex items-center gap-1.5">
      <PlayCircle className="w-4 h-4 text-blue-500" />
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{activeCount}</span>
      <span className="text-xs text-gray-400">Active</span>
    </div>
    <div className="flex items-center gap-1.5">
      <CheckCircle className="w-4 h-4 text-green-500" />
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{completedCount}</span>
      <span className="text-xs text-gray-400">Completed</span>
    </div>
    {onHoldCount > 0 && (
      <div className="flex items-center gap-1.5">
        <div className="w-4 h-4 rounded-full bg-gray-400" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{onHoldCount}</span>
        <span className="text-xs text-gray-400">On Hold</span>
      </div>
    )}
  </div>
);

export default PMSummaryCards;
