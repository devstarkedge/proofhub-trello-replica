import React from 'react';

/**
 * PMTableSkeleton - Skeleton loader for PM Sheet tables
 * Provides visual feedback during data loading
 */
const PMTableSkeleton = ({
  rows = 10,
  columns = 7,
  showHeader = true,
  showToolbar = true,
  className = ''
}) => {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden ${className}`}>
      {/* Toolbar skeleton */}
      {showToolbar && (
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="w-64 h-9 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
          <div className="w-24 h-9 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
        </div>
      )}

      {/* Table skeleton */}
      <div className="overflow-x-auto">
        <table className="w-full">
          {/* Header skeleton */}
          {showHeader && (
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                {Array.from({ length: columns }).map((_, i) => (
                  <th key={i} className="px-4 py-3">
                    <div 
                      className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"
                      style={{ width: `${Math.random() * 40 + 60}%` }}
                    />
                  </th>
                ))}
              </tr>
            </thead>
          )}

          {/* Body skeleton */}
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <tr key={rowIndex}>
                {Array.from({ length: columns }).map((_, colIndex) => (
                  <td key={colIndex} className="px-4 py-3">
                    <div 
                      className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"
                      style={{ 
                        width: `${Math.random() * 50 + 30}%`,
                        animationDelay: `${(rowIndex * columns + colIndex) * 50}ms`
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer skeleton */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <div className="w-32 h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>
    </div>
  );
};

/**
 * PMCardSkeleton - Skeleton loader for summary cards
 */
export const PMCardSkeleton = ({ className = '' }) => (
  <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 ${className}`}>
    <div className="flex items-start justify-between mb-4">
      <div className="flex-1">
        <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2" />
        <div className="h-8 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>
      <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
    </div>
    <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
  </div>
);

/**
 * PMFiltersSkeleton - Skeleton loader for filters section
 */
export const PMFiltersSkeleton = ({ className = '' }) => (
  <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
    {/* Header */}
    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="w-16 h-5 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>
      <div className="w-16 h-8 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
    </div>

    {/* Content */}
    <div className="p-4 space-y-4">
      {/* Date presets */}
      <div>
        <div className="w-20 h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2" />
        <div className="flex gap-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="w-24 h-8 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>

      {/* Date inputs */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="w-16 h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-1" />
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
        </div>
        <div>
          <div className="w-16 h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-1" />
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
        </div>
      </div>

      {/* Filter dropdowns */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i}>
            <div className="w-16 h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-1" />
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

/**
 * PMDashboardSkeleton - Full dashboard skeleton
 */
export const PMDashboardSkeleton = () => (
  <div className="space-y-6">
    {/* Summary cards */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map(i => (
        <PMCardSkeleton key={i} />
      ))}
    </div>

    {/* Filters */}
    <PMFiltersSkeleton />

    {/* Table */}
    <PMTableSkeleton rows={8} columns={8} />
  </div>
);

/**
 * PMPageSkeleton - Generic page skeleton with title
 */
export const PMPageSkeleton = ({ title = true }) => (
  <div className="space-y-6 animate-pulse">
    {title && (
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-10 w-32 bg-gray-200 dark:bg-gray-700 rounded-lg" />
      </div>
    )}
    <PMFiltersSkeleton />
    <PMTableSkeleton rows={10} columns={7} />
  </div>
);

/**
 * PMGroupedTableSkeleton - Skeleton for grouped/hierarchical tables
 */
export const PMGroupedTableSkeleton = ({ groups = 3, rowsPerGroup = 4, columns = 6 }) => (
  <div className="space-y-6">
    {Array.from({ length: groups }).map((_, groupIndex) => (
      <div 
        key={groupIndex} 
        className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
      >
        {/* Group header */}
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
            <div>
              <div className="h-5 w-40 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-1" />
              <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </div>
          </div>
        </div>

        {/* Group content */}
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              {Array.from({ length: columns }).map((_, i) => (
                <th key={i} className="px-4 py-2">
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" style={{ width: '70%' }} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {Array.from({ length: rowsPerGroup }).map((_, rowIndex) => (
              <tr key={rowIndex}>
                {Array.from({ length: columns }).map((_, colIndex) => (
                  <td key={colIndex} className="px-4 py-3">
                    <div 
                      className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"
                      style={{ width: `${Math.random() * 40 + 40}%` }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ))}
  </div>
);

export default PMTableSkeleton;
