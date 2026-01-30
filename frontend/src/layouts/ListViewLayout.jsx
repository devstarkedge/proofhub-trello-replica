import React, { useContext, lazy, Suspense } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  ClipboardList,
  FolderKanban,
  Sparkles,
  LayoutList,
  Users2
} from 'lucide-react';
import DepartmentContext from '../context/DepartmentContext';
import { ListViewSkeleton } from '../components/LoadingSkeleton';

/**
 * ListViewLayout - Layout wrapper for all List View pages
 * Provides shared header, tab navigation, and decorative elements
 * Child routes render via <Outlet />
 */
const ListViewLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentDepartment } = useContext(DepartmentContext);

  // Determine active tab based on current route
  const isTeamsActive = location.pathname.includes('/list-view/teams');
  const activeTab = isTeamsActive ? 'team' : 'tasks';

  // Navigation handlers
  const handleTasksClick = () => {
    navigate('/list-view');
  };

  const handleTeamsClick = () => {
    navigate('/list-view/teams');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      
      {/* Decorative Background Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-400/10 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-400/10 rounded-full blur-3xl animate-float-delayed"></div>
        <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-indigo-400/10 rounded-full blur-3xl animate-float-slow"></div>
      </div>

      <main className="max-w-screen-2xl mx-auto py-8 px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header Section */}
        <div className="mb-8 animate-fade-in">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="bg-gradient-to-br from-blue-500 via-indigo-600 to-purple-600 p-4 rounded-2xl shadow-xl shadow-blue-500/30 hover:shadow-2xl hover:shadow-blue-500/40 transition-all duration-300 hover:scale-105 relative overflow-hidden group">
                <ClipboardList className="w-8 h-8 text-white relative z-10" />
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-blue-900 to-purple-900 bg-clip-text text-transparent pb-1">
                  {activeTab === 'tasks' ? 'Task List View' : 'Team Logged Time'}
                </h1>
                <p className="text-gray-600 mt-1.5">
                  {currentDepartment ? (
                    <span className="flex items-center gap-2">
                      <FolderKanban className="w-4 h-4 text-blue-600" />
                      <span className="font-medium text-gray-700">{currentDepartment.name}</span>
                      <span className="ml-2 inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-gradient-to-r from-emerald-50 to-green-50 text-emerald-700 border border-emerald-200/60 shadow-sm hover:scale-105 transition-all duration-200 dark:from-emerald-900/30 dark:to-green-900/30 dark:text-emerald-300 dark:border-emerald-700/50">
                        <Sparkles className="w-3 h-3" />
                        Active
                      </span>
                    </span>
                  ) : (
                    'Select a department to view tasks'
                  )}
                </p>
              </div>
            </div>
            
            {/* Task / Team Toggle Button - Route-based Navigation */}
            <div className="flex items-center gap-2 bg-gray-100 p-1.5 rounded-xl">
              <button
                onClick={handleTasksClick}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-300 ${
                  activeTab === 'tasks'
                    ? 'bg-white text-blue-600 shadow-md'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <LayoutList className="w-4 h-4" />
                Tasks
              </button>
              <button
                onClick={handleTeamsClick}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-300 ${
                  activeTab === 'team'
                    ? 'bg-white text-blue-600 shadow-md'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Users2 className="w-4 h-4" />
                Team
              </button>
            </div>
          </div>
        </div>

        {/* Child Route Content */}
        <Suspense fallback={<ListViewSkeleton />}>
          <Outlet />
        </Suspense>
      </main>

      <style jsx="true">{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(0) translateX(0);
          }
          50% {
            transform: translateY(-20px) translateX(10px);
          }
        }

        @keyframes float-delayed {
          0%, 100% {
            transform: translateY(0) translateX(0);
          }
          50% {
            transform: translateY(20px) translateX(-10px);
          }
        }

        @keyframes float-slow {
          0%, 100% {
            transform: translateY(0) translateX(0);
          }
          50% {
            transform: translateY(-15px) translateX(15px);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.5s ease-out;
        }

        .animate-float {
          animation: float 8s ease-in-out infinite;
        }

        .animate-float-delayed {
          animation: float-delayed 10s ease-in-out infinite;
        }

        .animate-float-slow {
          animation: float-slow 12s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default ListViewLayout;
