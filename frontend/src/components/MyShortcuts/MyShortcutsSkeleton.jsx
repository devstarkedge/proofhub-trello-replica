import React, { memo } from 'react';

const MyShortcutsSkeleton = () => {
  return (
    <div className="bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50 h-full">
      <main className="p-6 space-y-6">
          {/* Page Header Skeleton */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-200 rounded-xl animate-pulse"></div>
              <div>
                <div className="w-40 h-7 bg-gray-200 rounded animate-pulse"></div>
                <div className="w-48 h-4 bg-gray-200 rounded mt-2 animate-pulse"></div>
              </div>
            </div>
            <div className="w-24 h-10 bg-gray-200 rounded-xl animate-pulse"></div>
          </div>

          {/* Shortcut Cards Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 animate-pulse"
              >
                <div className="flex items-start justify-between">
                  <div className="w-12 h-12 bg-gray-200 rounded-xl"></div>
                  <div className="text-right">
                    <div className="w-16 h-8 bg-gray-200 rounded mb-2"></div>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="w-24 h-5 bg-gray-200 rounded mb-2"></div>
                  <div className="w-20 h-3 bg-gray-200 rounded"></div>
                </div>
              </div>
            ))}
          </div>

          {/* Two Column Layout Skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Projects Section Skeleton */}
            <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 animate-pulse">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-gray-200 rounded-lg"></div>
                <div className="w-32 h-5 bg-gray-200 rounded"></div>
              </div>
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-3 p-3">
                    <div className="w-10 h-10 bg-gray-200 rounded-lg"></div>
                    <div className="flex-1">
                      <div className="w-32 h-4 bg-gray-200 rounded mb-2"></div>
                      <div className="w-20 h-3 bg-gray-200 rounded"></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Announcements Section Skeleton */}
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-6 shadow-lg border border-amber-100 animate-pulse">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-amber-200 rounded-lg"></div>
                <div className="w-36 h-5 bg-amber-200 rounded"></div>
              </div>
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white/60 p-4 rounded-xl">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-amber-200 rounded-full"></div>
                      <div className="flex-1">
                        <div className="w-40 h-4 bg-amber-200 rounded mb-2"></div>
                        <div className="w-full h-3 bg-amber-200 rounded mb-1"></div>
                        <div className="w-2/3 h-3 bg-amber-200 rounded"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tasks Section Skeleton */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 animate-pulse">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-gray-200 rounded-lg"></div>
              <div className="w-28 h-5 bg-gray-200 rounded"></div>
            </div>
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div key={i} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-5 h-5 bg-gray-200 rounded"></div>
                    <div className="w-40 h-4 bg-gray-200 rounded"></div>
                    <div className="w-16 h-4 bg-gray-200 rounded-full"></div>
                  </div>
                  <div className="space-y-2 pl-8">
                    {[1, 2, 3].map((j) => (
                      <div key={j} className="flex items-center gap-3 p-2">
                        <div className="w-2 h-2 bg-gray-200 rounded-full"></div>
                        <div className="w-48 h-4 bg-gray-200 rounded"></div>
                        <div className="ml-auto w-16 h-4 bg-gray-200 rounded-full"></div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
      </main>
    </div>
  );
};

export default memo(MyShortcutsSkeleton);
