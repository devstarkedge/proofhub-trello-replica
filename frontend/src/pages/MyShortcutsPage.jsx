import React, { useEffect, useCallback, memo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckSquare, Clock, Activity, FolderKanban, Megaphone,
  ChevronRight, RefreshCw, AlertCircle, TrendingUp
} from 'lucide-react';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import useMyShortcutsStore from '../store/myShortcutsStore';
import socketService from '../services/socket';

// Lazy load modals
const ActivityModal = lazy(() => import('../components/MyShortcuts/ActivityModal'));
const AnnouncementDetailModal = lazy(() => import('../components/AnnouncementDetailModal'));

// Import components
import ShortcutCard from '../components/MyShortcuts/ShortcutCard';
import MyProjectsSection from '../components/MyShortcuts/MyProjectsSection';
import AnnouncementsSection from '../components/MyShortcuts/AnnouncementsSection';
import MyTasksSection from '../components/MyShortcuts/MyTasksSection';
import MyShortcutsSkeleton from '../components/MyShortcuts/MyShortcutsSkeleton';

const MyShortcutsPage = () => {
  const navigate = useNavigate();
  
  // Store state
  const {
    taskCount,
    loggedTime,
    activityCount,
    projectCount,
    announcementCount,
    loading,
    errors,
    fetchDashboardSummary,
    fetchActivities,
    fetchTasksGrouped,
    fetchProjects,
    fetchAnnouncements,
    updateTaskCount,
    updateLoggedTime,
    addNewActivity,
    addNewAnnouncement
  } = useMyShortcutsStore();

  // Activity modal state
  const [activityModalOpen, setActivityModalOpen] = React.useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = React.useState(null);

  // Fetch initial data
  useEffect(() => {
    fetchDashboardSummary();
    fetchProjects();
    fetchAnnouncements();
    fetchTasksGrouped();
    
    // Join socket room for real-time updates
    socketService.joinMyShortcuts();

    return () => {
      socketService.leaveMyShortcuts();
    };
  }, [fetchDashboardSummary, fetchProjects, fetchAnnouncements, fetchTasksGrouped]);

  // Socket event listeners for real-time updates
  useEffect(() => {
    const handleSummaryUpdate = (e) => {
      const data = e.detail;
      if (data.taskCount !== undefined) updateTaskCount(data.taskCount - useMyShortcutsStore.getState().taskCount);
      if (data.loggedTime) updateLoggedTime(data.loggedTime);
    };

    const handleNewActivity = (e) => {
      addNewActivity(e.detail);
    };

    const handleTaskCountChange = (e) => {
      updateTaskCount(e.detail.delta || 0);
    };

    const handleTimeLogged = (e) => {
      updateLoggedTime(e.detail);
    };

    const handleNewAnnouncement = (e) => {
      addNewAnnouncement(e.detail);
    };

    window.addEventListener('socket-my-shortcuts-summary', handleSummaryUpdate);
    window.addEventListener('socket-my-shortcuts-activity', handleNewActivity);
    window.addEventListener('socket-my-shortcuts-task-count', handleTaskCountChange);
    window.addEventListener('socket-my-shortcuts-time', handleTimeLogged);
    window.addEventListener('socket-my-shortcuts-announcement', handleNewAnnouncement);

    return () => {
      window.removeEventListener('socket-my-shortcuts-summary', handleSummaryUpdate);
      window.removeEventListener('socket-my-shortcuts-activity', handleNewActivity);
      window.removeEventListener('socket-my-shortcuts-task-count', handleTaskCountChange);
      window.removeEventListener('socket-my-shortcuts-time', handleTimeLogged);
      window.removeEventListener('socket-my-shortcuts-announcement', handleNewAnnouncement);
    };
  }, [updateTaskCount, updateLoggedTime, addNewActivity, addNewAnnouncement]);

  // Navigation handlers
  const handleMyTasksClick = useCallback(() => {
    // Navigate to list view with My Tasks preset
    navigate('/list-view', { state: { preset: 'My Tasks' } });
  }, [navigate]);

  const handleLoggedTimeClick = useCallback(() => {
    navigate('/list-view/teams');
  }, [navigate]);

  const handleActivityClick = useCallback(() => {
    fetchActivities();
    setActivityModalOpen(true);
  }, [fetchActivities]);

  const handleRefresh = useCallback(() => {
    fetchDashboardSummary();
    fetchProjects();
    fetchAnnouncements();
    fetchTasksGrouped();
  }, [fetchDashboardSummary, fetchProjects, fetchAnnouncements, fetchTasksGrouped]);

  // Show skeleton while loading summary
  if (loading.summary && !taskCount && !loggedTime.totalMinutes) {
    return <MyShortcutsSkeleton />;
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50">
      <Sidebar />
      <div className="flex-1 lg:ml-64">
        <Header />
        <main className="p-6 space-y-6">
          {/* Page Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                  <TrendingUp className="text-white" size={22} />
                </div>
                My Shortcuts
              </h1>
              <p className="text-gray-600 mt-1">Your personal command center</p>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleRefresh}
              disabled={loading.summary}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 transition-all shadow-sm"
            >
              <RefreshCw size={18} className={loading.summary ? 'animate-spin' : ''} />
              Refresh
            </motion.button>
          </div>

          {/* Shortcut Cards Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ShortcutCard
              title="My Tasks"
              count={taskCount}
              icon={CheckSquare}
              color="blue"
              loading={loading.summary}
              error={errors.summary}
              onClick={handleMyTasksClick}
              subtitle="Assigned to you"
            />
            <ShortcutCard
              title="Logged Time"
              count={loggedTime.formatted || `${loggedTime.hours}h ${loggedTime.minutes}m`}
              icon={Clock}
              color="green"
              loading={loading.summary}
              error={errors.summary}
              onClick={handleLoggedTimeClick}
              subtitle="Total time logged"
              isTime
            />
            <ShortcutCard
              title="My Activity"
              count={activityCount}
              icon={Activity}
              color="purple"
              loading={loading.summary}
              error={errors.summary}
              onClick={handleActivityClick}
              subtitle="Recent actions"
              badge={activityCount > 0 ? 'New' : null}
            />
          </div>

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* My Projects Section */}
            <MyProjectsSection />
            
            {/* Announcements Section */}
            <AnnouncementsSection 
              onAnnouncementClick={(announcement) => setSelectedAnnouncement(announcement)}
            />
          </div>

          {/* My Tasks Section */}
          <MyTasksSection />
        </main>
      </div>

      {/* Activity Modal */}
      <AnimatePresence>
        {activityModalOpen && (
          <Suspense fallback={
            <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
              <div className="bg-white rounded-xl p-6 shadow-xl">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              </div>
            </div>
          }>
            <ActivityModal
              isOpen={activityModalOpen}
              onClose={() => setActivityModalOpen(false)}
            />
          </Suspense>
        )}
      </AnimatePresence>

      {/* Announcement Detail Modal */}
      {selectedAnnouncement && (
        <Suspense fallback={null}>
          <AnnouncementDetailModal
            isOpen={!!selectedAnnouncement}
            onClose={() => setSelectedAnnouncement(null)}
            announcement={selectedAnnouncement}
          />
        </Suspense>
      )}
    </div>
  );
};

export default memo(MyShortcutsPage);
