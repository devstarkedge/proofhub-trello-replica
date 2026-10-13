import React, { memo } from 'react';

export const StatusBadge = memo(({ status }) => {
  const statusConfig = {
    planning: { color: 'bg-gray-100 text-gray-700 border-gray-300', label: 'Planning' },
    'in-progress': { color: 'bg-blue-100 text-blue-700 border-blue-300', label: 'In Progress' },
    completed: { color: 'bg-green-100 text-green-700 border-green-300', label: 'Completed' },
    'on-hold': { color: 'bg-yellow-100 text-yellow-700 border-yellow-300', label: 'On Hold' }
  };
  const config = statusConfig[status] || statusConfig.planning;
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${config.color}`}>
      {config.label}
    </span>
  );
});

StatusBadge.displayName = 'StatusBadge';

export const PriorityBadge = memo(({ priority }) => {
  const priorityConfig = {
    low: { color: 'bg-emerald-100 text-emerald-700', label: 'Low' },
    medium: { color: 'bg-amber-100 text-amber-700', label: 'Medium' },
    high: { color: 'bg-orange-100 text-orange-700', label: 'High' },
    urgent: { color: 'bg-red-100 text-red-700', label: 'Urgent' }
  };
  const config = priorityConfig[priority] || priorityConfig.medium;
  return (
    <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
});

PriorityBadge.displayName = 'PriorityBadge';
