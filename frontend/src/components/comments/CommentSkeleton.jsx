import React from 'react';

/**
 * CommentSkeleton - Loading skeleton for comments
 */
const CommentSkeleton = ({ theme = 'light' }) => {
  const isDark = theme === 'dark';
  
  return (
    <div className={`rounded-xl p-4 animate-pulse ${
      isDark ? 'bg-gray-800/50' : 'bg-gray-50'
    }`}>
      <div className="flex items-start gap-3">
        {/* Avatar skeleton */}
        <div className={`w-9 h-9 rounded-full ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
        
        <div className="flex-1">
          {/* Name and time skeleton */}
          <div className="flex items-center gap-2 mb-2">
            <div className={`h-4 w-24 rounded ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
            <div className={`h-3 w-16 rounded ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
          </div>
          
          {/* Content skeleton */}
          <div className="space-y-2">
            <div className={`h-4 w-full rounded ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
            <div className={`h-4 w-3/4 rounded ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
          </div>
          
          {/* Reactions skeleton */}
          <div className="flex gap-2 mt-3">
            <div className={`h-6 w-12 rounded-full ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
            <div className={`h-6 w-12 rounded-full ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommentSkeleton;
