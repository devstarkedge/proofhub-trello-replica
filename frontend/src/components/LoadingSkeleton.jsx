import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

const SkeletonCard = () => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 animate-pulse">
    <div className="flex items-start justify-between mb-4">
      <div className="flex-1">
        <div className="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
      </div>
      <div className="w-10 h-10 bg-gray-200 rounded-lg"></div>
    </div>
    <div className="space-y-3">
      <div className="h-4 bg-gray-200 rounded w-full"></div>
      <div className="h-4 bg-gray-200 rounded w-2/3"></div>
    </div>
    <div className="flex items-center justify-between mt-6">
      <div className="flex items-center space-x-2">
        <div className="w-6 h-6 bg-gray-200 rounded-full"></div>
        <div className="h-4 bg-gray-200 rounded w-16"></div>
      </div>
      <div className="h-8 bg-gray-200 rounded w-20"></div>
    </div>
  </div>
);

const DepartmentSkeleton = () => (
  <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
    {/* Department Header Skeleton */}
    <div className="bg-gradient-to-r from-gray-50 to-blue-50 p-6 border-b border-gray-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gray-200 rounded-xl animate-pulse"></div>
          <div>
            <div className="h-7 bg-gray-200 rounded w-48 mb-2 animate-pulse"></div>
            <div className="h-4 bg-gray-200 rounded w-64 animate-pulse"></div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="w-8 h-8 bg-gray-200 rounded-full animate-pulse"></div>
            ))}
          </div>
          <div className="h-10 bg-gray-200 rounded-xl w-32 animate-pulse"></div>
        </div>
      </div>
    </div>

    {/* Projects Grid Skeleton */}
    <div className="p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  </div>
);

const WorkflowSkeleton = () => (
  <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800">
    {/* Header Skeleton */}
    <header className="bg-white/10 backdrop-blur-lg border-b border-white/20 shadow-lg">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-white/20 rounded-lg animate-pulse"></div>
            <div className="flex-1">
              <div className="h-8 bg-white/20 rounded w-48 mb-2 animate-pulse"></div>
              <div className="h-4 bg-white/30 rounded w-64 animate-pulse"></div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-64 h-10 bg-white/10 rounded-lg animate-pulse"></div>
            <div className="w-24 h-10 bg-white/10 rounded-lg animate-pulse"></div>
            <div className="w-10 h-10 bg-white/10 rounded-full animate-pulse"></div>
            <div className="w-32 h-10 bg-white rounded-lg animate-pulse"></div>
          </div>
        </div>
      </div>
    </header>

    {/* Board Content Skeleton */}
    <div className="p-4">
      <div className="flex gap-3 pb-4 h-full overflow-x-auto">
        {/* List Skeletons */}
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="w-72 flex-shrink-0">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 h-full min-h-[600px]">
              {/* List Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="h-6 bg-white/20 rounded w-24 animate-pulse"></div>
                <div className="w-8 h-8 bg-white/20 rounded animate-pulse"></div>
              </div>

              {/* Cards */}
              <div className="space-y-3">
                {[1, 2, 3].map(j => (
                  <div key={j} className="bg-white/20 backdrop-blur-sm rounded-lg p-3 animate-pulse">
                    <div className="h-4 bg-white/30 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-white/20 rounded w-1/2 mb-3"></div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 bg-white/30 rounded-full"></div>
                        <div className="h-3 bg-white/20 rounded w-12"></div>
                      </div>
                      <div className="h-6 bg-white/30 rounded w-16"></div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Card Button */}
              <div className="mt-3 h-8 bg-white/10 rounded-lg animate-pulse"></div>
            </div>
          </div>
        ))}

        {/* Add List Skeleton */}
        <div className="w-72 flex-shrink-0">
          <div className="h-12 bg-white/10 rounded-xl animate-pulse"></div>
        </div>
      </div>
    </div>
  </div>
);

const HomePageSkeleton = () => (
  <div className="flex min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50">
    <Sidebar />
    <div className="flex-1 lg:ml-64">
      <Header />
      <main className="p-6 space-y-6">
        {/* Welcome Header Skeleton */}
        <div className="bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 rounded-2xl p-8 animate-pulse">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-white/30 rounded-full"></div>
            <div className="h-5 bg-white/30 rounded w-20"></div>
          </div>
          <div className="h-10 bg-white/20 rounded w-64 mb-2"></div>
          <div className="h-6 bg-white/20 rounded w-96"></div>
        </div>

        {/* Controls Bar Skeleton */}
        <div className="bg-white rounded-2xl shadow-lg p-4 border border-gray-200 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex-1 max-w-md">
              <div className="h-12 bg-gray-200 rounded-xl"></div>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-12 bg-gray-200 rounded-xl w-32"></div>
              <div className="flex bg-gray-200 rounded-xl p-1">
                <div className="w-10 h-10 bg-white rounded-lg"></div>
                <div className="w-10 h-10 bg-gray-300 rounded-lg"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Departments Skeleton */}
        <div className="space-y-6">
          {[1, 2].map(i => (
            <DepartmentSkeleton key={i} />
          ))}
        </div>
      </main>
    </div>
  </div>
);

export { HomePageSkeleton, DepartmentSkeleton, SkeletonCard, WorkflowSkeleton };
export default HomePageSkeleton;