import React from 'react';
import { 
  Clock, 
  DollarSign, 
  FolderKanban, 
  Users,
  Settings,
  AlertCircle,
  Search,
  FileQuestion
} from 'lucide-react';

/**
 * EmptyState - Friendly empty state messages for finance module
 * Guides users on what to do when no data is available
 */
const EmptyState = ({ 
  type = 'default', 
  title, 
  description, 
  action,
  icon: CustomIcon 
}) => {
  const presets = {
    noData: {
      icon: Clock,
      title: 'No finance data yet',
      description: 'Start logging time on your tasks to see finance data here.',
      color: '#10b981'
    },
    noTimeEntries: {
      icon: Clock,
      title: 'No time entries found',
      description: 'Time entries will appear here once team members start logging their work.',
      color: '#3b82f6'
    },
    noBillingConfig: {
      icon: Settings,
      title: 'Billing not configured',
      description: 'This project needs billing settings. Configure hourly rate or fixed price to see payment calculations.',
      color: '#f59e0b'
    },
    noProjects: {
      icon: FolderKanban,
      title: 'No projects found',
      description: 'Create projects with billing information to track finance data.',
      color: '#8b5cf6'
    },
    noUsers: {
      icon: Users,
      title: 'No user data found',
      description: 'User finance data will appear once team members log time on billable projects.',
      color: '#06b6d4'
    },
    noSearchResults: {
      icon: Search,
      title: 'No results found',
      description: 'Try adjusting your search or filters to find what you\'re looking for.',
      color: '#ef4444'
    },
    noFilterResults: {
      icon: FileQuestion,
      title: 'No data for selected filters',
      description: 'Try expanding your date range or removing some filters.',
      color: '#f59e0b'
    },
    noDepartment: {
      icon: AlertCircle,
      title: 'Department not assigned',
      description: 'Assign this project to a department to see it in finance reports.',
      color: '#ef4444'
    },
    error: {
      icon: AlertCircle,
      title: 'Something went wrong',
      description: 'We couldn\'t load the data. Please try refreshing the page.',
      color: '#ef4444'
    }
  };

  const preset = presets[type] || presets.noData;
  const IconComponent = CustomIcon || preset.icon;
  const displayTitle = title || preset.title;
  const displayDescription = description || preset.description;

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div 
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
        style={{ backgroundColor: `${preset.color}15` }}
      >
        <IconComponent 
          className="w-8 h-8"
          style={{ color: preset.color }}
        />
      </div>
      
      <h3 
        className="text-lg font-semibold mb-2 text-center"
        style={{ color: 'var(--color-text-primary)' }}
      >
        {displayTitle}
      </h3>
      
      <p 
        className="text-sm text-center max-w-md mb-4"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        {displayDescription}
      </p>
      
      {action && (
        <button
          onClick={action.onClick}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all duration-200 hover:opacity-90"
          style={{ backgroundColor: preset.color }}
        >
          {action.icon && <action.icon className="w-4 h-4" />}
          {action.label}
        </button>
      )}
    </div>
  );
};

/**
 * InlineEmptyState - Compact version for inline use in tables
 */
export const InlineEmptyState = ({ message = 'No data available' }) => (
  <div 
    className="text-center py-8"
    style={{ color: 'var(--color-text-muted)' }}
  >
    <FileQuestion className="w-8 h-8 mx-auto mb-2 opacity-50" />
    <p className="text-sm">{message}</p>
  </div>
);

/**
 * CardEmptyState - For use in dashboard cards
 */
export const CardEmptyState = ({ title, icon: Icon = DollarSign }) => (
  <div className="flex flex-col items-center justify-center py-4">
    <Icon className="w-6 h-6 mb-1 opacity-30" style={{ color: 'var(--color-text-muted)' }} />
    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
      {title || 'No data'}
    </span>
  </div>
);

export default EmptyState;
