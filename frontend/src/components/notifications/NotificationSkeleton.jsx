import React from 'react';

const NotificationSkeleton = () => {
  return (
    <div className="p-4 animate-pulse">
      <div className="flex items-start gap-3">
        {/* Icon skeleton */}
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gray-200 dark:bg-gray-700" />

        {/* Content skeleton */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32" />
            <div className="w-2.5 h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full" />
          </div>
          
          <div className="space-y-2">
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full" />
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
          </div>

          <div className="flex items-center gap-2 mt-2">
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationSkeleton;
