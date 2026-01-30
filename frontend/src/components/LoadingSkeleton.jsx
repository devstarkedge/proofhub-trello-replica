import React from 'react';


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
  <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
    {/* Department Header Skeleton */}
    <div className="bg-gradient-to-r from-gray-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 p-6 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl skeleton-loader"></div>
          <div>
            <div className="h-7 rounded w-48 mb-2 skeleton-loader"></div>
            <div className="h-4 rounded w-64 skeleton-loader"></div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="w-8 h-8 rounded-full skeleton-loader"></div>
            ))}
          </div>
          <div className="h-10 rounded-xl w-32 skeleton-loader"></div>
        </div>
      </div>
    </div>

    {/* Projects Grid Skeleton */}
    <div className="p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3, 4, 5, 6].map(i => (
           <div key={i} className="bg-white dark:bg-gray-700 rounded-xl shadow-sm border border-gray-200 dark:border-gray-600 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="h-6 rounded w-3/4 mb-2 skeleton-loader"></div>
                <div className="h-4 rounded w-1/2 skeleton-loader"></div>
              </div>
              <div className="w-10 h-10 rounded-lg skeleton-loader"></div>
            </div>
            <div className="space-y-3">
              <div className="h-4 rounded w-full skeleton-loader"></div>
              <div className="h-4 rounded w-2/3 skeleton-loader"></div>
            </div>
            <div className="flex items-center justify-between mt-6">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 rounded-full skeleton-loader"></div>
                <div className="h-4 rounded w-16 skeleton-loader"></div>
              </div>
              <div className="h-8 rounded w-20 skeleton-loader"></div>
            </div>
          </div>
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
  <div className="bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 h-full">
    <main className="p-6 space-y-6">
      {/* Welcome Header Skeleton */}
      <div className="bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 dark:from-gray-800 dark:via-gray-700 dark:to-gray-800 rounded-2xl p-8">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-full skeleton-loader"></div>
          <div className="h-5 rounded w-20 skeleton-loader"></div>
        </div>
        <div className="h-10 rounded w-64 mb-2 skeleton-loader"></div>
        <div className="h-6 rounded w-96 skeleton-loader"></div>
      </div>

      {/* Controls Bar Skeleton */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-4 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex-1 max-w-md">
            <div className="h-12 rounded-xl skeleton-loader"></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-12 rounded-xl w-32 skeleton-loader"></div>
            <div className="flex bg-gray-200 dark:bg-gray-700 rounded-xl p-1">
              <div className="w-10 h-10 rounded-lg skeleton-loader"></div>
              <div className="w-10 h-10 rounded-lg skeleton-loader ml-1"></div>
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
);

const TeamManagementSkeleton = () => (
  <div className="bg-gradient-to-br from-gray-50 via-blue-50/30 to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 h-full">
    <main className="p-3 sm:p-4 md:p-6 lg:p-8">
      {/* Header Skeleton */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-xl skeleton-loader"></div>
          <div>
            <div className="h-8 rounded w-64 mb-2 skeleton-loader"></div>
            <div className="h-4 rounded w-48 skeleton-loader"></div>
          </div>
        </div>
      </div>

      {/* Stats Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex justify-between items-start">
              <div>
                <div className="h-4 rounded w-24 mb-2 skeleton-loader"></div>
                <div className="h-8 rounded w-16 skeleton-loader"></div>
              </div>
              <div className="w-10 h-10 rounded-lg skeleton-loader"></div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left Column Skeleton */}
          <div className="md:col-span-1 space-y-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border border-gray-100 dark:border-gray-700">
                <div className="h-10 rounded-lg w-full mb-4 skeleton-loader"></div>
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="h-16 rounded-lg w-full mb-2 skeleton-loader"></div>
                  ))}
            </div>
          </div>

          {/* Right Column Skeleton */}
          <div className="md:col-span-2">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-100 dark:border-gray-700">
                <div className="flex justify-between mb-6">
                    <div className="h-10 rounded-lg w-1/3 skeleton-loader"></div>
                    <div className="h-10 rounded-lg w-1/4 skeleton-loader"></div>
                </div>
                <div className="space-y-4">
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="flex items-center justify-between p-4 border border-gray-100 dark:border-gray-700 rounded-lg">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full skeleton-loader"></div>
                                <div>
                                    <div className="h-4 rounded w-32 mb-2 skeleton-loader"></div>
                                    <div className="h-3 rounded w-24 skeleton-loader"></div>
                                </div>
                            </div>
                            <div className="h-8 rounded w-24 skeleton-loader"></div>
                        </div>
                    ))}
                </div>
            </div>
          </div>
      </div>
    </main>
  </div>
);


const HRPanelSkeleton = () => (
  <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 h-full">
    <main className="p-6">
      {/* Header Skeleton */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-14 h-14 rounded-xl skeleton-loader"></div>
          <div>
            <div className="h-8 rounded w-64 mb-2 skeleton-loader"></div>
            <div className="h-4 rounded w-96 skeleton-loader"></div>
          </div>
        </div>
      </div>

      {/* Stats Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="h-4 rounded w-24 mb-2 skeleton-loader"></div>
                <div className="h-8 rounded w-16 skeleton-loader"></div>
              </div>
              <div className="w-12 h-12 rounded-lg skeleton-loader"></div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters Skeleton */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-5 h-5 rounded skeleton-loader"></div>
          <div className="h-6 rounded w-24 skeleton-loader"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i}>
              <div className="h-4 rounded w-24 mb-2 skeleton-loader"></div>
              <div className="h-12 rounded-lg w-full skeleton-loader"></div>
            </div>
          ))}
        </div>
      </div>

      {/* Users Table Skeleton */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <div className="flex items-center justify-between">
            <div className="h-6 rounded w-32 skeleton-loader"></div>
            <div className="h-6 rounded w-20 skeleton-loader"></div>
          </div>
        </div>
        <div className="p-6 space-y-4">
            {/* Table Header */}
          <div className="flex justify-between mb-4 border-b border-gray-100 dark:border-gray-700 pb-2">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-4 rounded w-24 skeleton-loader"></div>
                ))}
          </div>
            {/* Table Rows */}
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
              <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full skeleton-loader"></div>
                  <div>
                        <div className="h-4 rounded w-32 mb-1 skeleton-loader"></div>
                        <div className="h-3 rounded w-48 skeleton-loader"></div>
                  </div>
              </div>
              <div className="h-6 rounded w-24 skeleton-loader"></div>
              <div className="h-6 rounded w-32 skeleton-loader"></div>
              <div className="h-6 rounded w-20 skeleton-loader"></div>
              <div className="h-8 rounded w-48 skeleton-loader"></div>
            </div>
          ))}
        </div>
      </div>
    </main>
  </div>
);

const ClientRemindersSkeleton = () => (
  <div className="bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 h-full p-6">
    <div className="space-y-6">
      {/* Stats Grid Skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border-l-4 border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <div className="h-3 rounded w-16 mb-2 skeleton-loader"></div>
                <div className="h-6 rounded w-10 skeleton-loader"></div>
              </div>
              <div className="w-8 h-8 rounded skeleton-loader"></div>
            </div>
          </div>
        ))}
      </div>

      {/* List Skeleton */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Table Header */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
            <div className="h-5 rounded w-32 skeleton-loader"></div>
        </div>

        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="px-6 py-4">
              <div className="flex items-center justify-between gap-4">
                {/* Project & Client Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                      <div className="h-5 rounded w-40 skeleton-loader"></div>
                      <div className="h-5 rounded w-20 skeleton-loader"></div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                      <div className="h-4 rounded w-24 skeleton-loader"></div>
                      <div className="h-4 rounded w-32 skeleton-loader"></div>
                      <div className="h-4 rounded w-24 skeleton-loader"></div>
                  </div>
                </div>

                {/* Scheduled Date */}
                <div className="text-right">
                  <div className="flex items-center gap-2 justify-end mb-1">
                    <div className="w-4 h-4 rounded skeleton-loader"></div>
                    <div className="h-4 rounded w-24 skeleton-loader"></div>
                  </div>
                  <div className="h-3 rounded w-16 ml-auto skeleton-loader"></div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg skeleton-loader"></div>
                  <div className="w-9 h-9 rounded-lg skeleton-loader"></div>
                  <div className="w-9 h-9 rounded-lg skeleton-loader"></div>
                  <div className="w-9 h-9 rounded-lg skeleton-loader"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);


const AnnouncementsSkeleton = () => (
  <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 h-full">
    <main className="p-6 space-y-6">
       {/* Header Section */}
       <div className="relative overflow-hidden bg-gradient-to-r from-blue-100 to-indigo-100 rounded-2xl p-8 shadow-lg">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
             <div className="flex items-center gap-4">
                <div className="p-3 bg-white/40 rounded-full skeleton-loader w-14 h-14"></div>
                <div>
                   <div className="h-10 rounded w-64 mb-3 skeleton-loader"></div>
                   <div className="h-6 rounded w-96 skeleton-loader"></div>
                </div>
             </div>
             <div className="h-12 w-48 rounded-xl skeleton-loader"></div>
          </div>
       </div>

       {/* Stats Cards */}
       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
             <div key={i} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between">
                   <div>
                      <div className="h-4 rounded w-24 mb-2 skeleton-loader"></div>
                      <div className="h-8 rounded w-16 skeleton-loader"></div>
                   </div>
                   <div className="w-12 h-12 rounded-lg skeleton-loader"></div>
                </div>
             </div>
          ))}
       </div>

       {/* Filters and Search */}
       <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-sm border border-white/20 p-6">
          <div className="space-y-6">
             <div className="h-12 w-full rounded-xl skeleton-loader"></div>
             <div className="flex flex-wrap gap-4 items-center">
                <div className="h-10 w-32 rounded-lg skeleton-loader"></div>
                <div className="h-10 w-40 rounded-lg skeleton-loader"></div>
                <div className="h-10 w-32 rounded-lg skeleton-loader"></div>
             </div>
          </div>
       </div>

       {/* Main Content List */}
       <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 p-6 space-y-4">
          {[1, 2, 3].map((i) => (
             <div key={i} className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
                <div className="flex justify-between items-start mb-4">
                   <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full skeleton-loader"></div>
                      <div>
                         <div className="h-4 w-32 mb-1 skeleton-loader"></div>
                         <div className="h-3 w-24 skeleton-loader"></div>
                      </div>
                   </div>
                   <div className="w-8 h-8 rounded skeleton-loader"></div>
                </div>
                <div className="h-6 w-3/4 mb-3 skeleton-loader"></div>
                <div className="h-4 w-full mb-2 skeleton-loader"></div>
                <div className="h-4 w-2/3 skeleton-loader"></div>
                <div className="mt-4 flex gap-4">
                   <div className="h-8 w-20 rounded-lg skeleton-loader"></div>
                   <div className="h-8 w-20 rounded-lg skeleton-loader"></div>
                </div>
             </div>
          ))}
       </div>
    </main>
  </div>
);

const AnnouncementsListSkeleton = () => (
  <div className="space-y-4">
    {[1, 2, 3].map((i) => (
       <div key={i} className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
          <div className="flex justify-between items-start mb-4">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full skeleton-loader"></div>
                <div>
                   <div className="h-4 w-32 mb-1 skeleton-loader"></div>
                   <div className="h-3 w-24 skeleton-loader"></div>
                </div>
             </div>
             <div className="w-8 h-8 rounded skeleton-loader"></div>
          </div>
          <div className="h-6 w-3/4 mb-3 skeleton-loader"></div>
          <div className="h-4 w-full mb-2 skeleton-loader"></div>
          <div className="h-4 w-2/3 skeleton-loader"></div>
          <div className="mt-4 flex gap-4">
             <div className="h-8 w-20 rounded-lg skeleton-loader"></div>
             <div className="h-8 w-20 rounded-lg skeleton-loader"></div>
          </div>
       </div>
    ))}
  </div>
);


const ListViewSkeleton = () => (
  <div className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 h-full">
      <div className="max-w-screen-2xl mx-auto py-8 px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
               <div className="w-16 h-16 rounded-2xl skeleton-loader"></div>
               <div>
                  <div className="h-10 w-64 mb-3 skeleton-loader"></div>
                  <div className="h-6 w-48 skeleton-loader"></div>
               </div>
            </div>
          </div>

          {/* Stats Cards */}
           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              {[1, 2, 3, 4, 5].map((i) => (
                 <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                       <div className="h-4 w-20 mb-2 skeleton-loader"></div>
                       <div className="h-8 w-12 skeleton-loader"></div>
                    </div>
                    <div className="w-10 h-10 rounded-lg skeleton-loader"></div>
                 </div>
              ))}
           </div>

           {/* Filters Bar */}
           <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl border border-white/50 p-5 mb-8">
              <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
                 <div className="flex flex-wrap items-center gap-3 flex-1 w-full">
                    <div className="h-12 flex-1 min-w-[280px] rounded-xl skeleton-loader"></div>
                    <div className="h-10 w-24 rounded-xl skeleton-loader"></div>
                    <div className="h-10 w-24 rounded-xl skeleton-loader"></div>
                    <div className="h-10 w-64 rounded-xl skeleton-loader"></div>
                 </div>
                 <div className="flex items-center gap-2">
                    <div className="h-9 w-24 rounded-xl skeleton-loader"></div>
                    <div className="h-9 w-24 rounded-xl skeleton-loader"></div>
                 </div>
              </div>
           </div>
        </div>

        {/* Enhanced Table Skeleton */}
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/50 overflow-hidden">
           {/* Table Header */}
           <div className="bg-gradient-to-r from-slate-100 via-blue-50 to-indigo-50 border-b-2 border-blue-200/50 p-4 grid grid-cols-7 gap-4">
              {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                 <div key={i} className="h-6 w-full skeleton-loader rounded"></div>
              ))}
           </div>
           
           {/* Table Body */}
           <div className="divide-y divide-gray-100">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                 <div key={i} className="p-4 grid grid-cols-7 gap-4 items-center">
                    <div className="flex items-center gap-3">
                       <div className="w-1 h-10 rounded-full skeleton-loader"></div>
                       <div className="flex-1">
                          <div className="h-5 w-3/4 skeleton-loader rounded"></div>
                       </div>
                    </div>
                    <div className="h-4 w-1/2 skeleton-loader rounded"></div>
                    <div className="h-4 w-2/3 skeleton-loader rounded"></div>
                    <div className="h-6 w-20 rounded-full skeleton-loader"></div>
                    <div className="h-6 w-24 rounded-full skeleton-loader"></div>
                    <div className="h-4 w-32 skeleton-loader rounded"></div>
                    <div className="h-4 w-16 skeleton-loader rounded"></div>
                 </div>
              ))}
           </div>
        </div>
      </div>
  </div>
);

export { HomePageSkeleton, DepartmentSkeleton, SkeletonCard, WorkflowSkeleton, HRPanelSkeleton, TeamManagementSkeleton, ClientRemindersSkeleton, AnnouncementsSkeleton, AnnouncementsListSkeleton, ListViewSkeleton };


export default HomePageSkeleton;