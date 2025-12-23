import React, { useContext, useState, useRef, useEffect, lazy, Suspense } from 'react';
import {
  Bell, Menu, Settings, LogOut, User,
  ChevronDown, Kanban, List, Calendar, BarChart3,
  Users, Building2, ArrowLeft,
  CreditCard, HelpCircle, Palette
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import AuthContext from '../context/AuthContext';
import DepartmentContext from '../context/DepartmentContext';
import NotificationContext from '../context/NotificationContext';
import Sidebar from './Sidebar';
import Avatar from './Avatar';

const UserVerificationModal = lazy(() => import('./UserVerificationModal'));
const AppearanceModal = lazy(() => import('./AppearanceModal'));
const NotificationPanel = lazy(() => import('./notifications/NotificationPanel'));

const Header = ({ boardName }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logoutUser } = useContext(AuthContext);
  const { currentTeam, currentDepartment, teams, departments, hasNoDepartments, setCurrentTeam, setCurrentDepartment } = useContext(DepartmentContext);
  const { 
    notifications, 
    unreadCount, 
    isLoading,
    hasMore,
    filter,
    markAsRead, 
    markAllAsRead, 
    archiveNotification, 
    clearAll, 
    loadMore,
    handleFilterChange,
    handleNotificationClick, 
    verificationModal, 
    handleVerificationAction, 
    closeVerificationModal,
    // Archived notifications
    archivedNotifications,
    isLoadingArchived,
    hasMoreArchived,
    loadArchivedNotifications,
    restoreNotification,
    deletePermanently
  } = useContext(NotificationContext);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showTeamSelector, setShowTeamSelector] = useState(false);
  const [showDepartmentSelector, setShowDepartmentSelector] = useState(false);
  const [showAppearanceModal, setShowAppearanceModal] = useState(false);

  const notificationRef = useRef(null);
  const userMenuRef = useRef(null);
  const teamRef = useRef(null);
  const deptRef = useRef(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
      if (teamRef.current && !teamRef.current.contains(event.target)) {
        setShowTeamSelector(false);
      }
      if (deptRef.current && !deptRef.current.contains(event.target)) {
        setShowDepartmentSelector(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileSidebarOpen) {
      document.body.classList.add('overflow-hidden');
    } else {
      document.body.classList.remove('overflow-hidden');
    }
    return () => document.body.classList.remove('overflow-hidden');
  }, [mobileSidebarOpen]);



  const navItems = [
    { path: '/', icon: Kanban, label: 'Board' },
    { path: '/list-view', icon: List, label: 'List' },
    { path: '/calendar', icon: Calendar, label: 'Calendar' },
    { path: '/analytics', icon: BarChart3, label: 'Analytics' },
  ];

  const isActive = (path) => location.pathname === path;
  const isAdminOrManager = user && (user.role === 'admin' || user.role === 'manager');

  // Show department selector only on specific pages
  const shouldShowDepartmentSelector = ['/list-view', '/calendar', '/analytics'].includes(location.pathname);

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
      <div className="px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Left Section */}
          <div className="flex items-center gap-4 flex-1">
            {/* Mobile menu button */}
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden p-2 rounded-md hover:bg-gray-100 text-gray-600"
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>
            {/* Back Button */}
            {['/list-view', '/calendar', '/analytics'].includes(location.pathname) && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate('/')}
                className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft size={16} />
                <span className="hidden sm:inline">Back</span>
              </motion.button>
            )}

            {/* View Navigation */}
            <nav className="hidden lg:flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              {navItems.map(({ path, icon: Icon, label }) => (
                <motion.button
                  key={path}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate(path)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                    isActive(path)
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Icon size={16} />
                  <span className="hidden xl:inline">{label}</span>
                </motion.button>
              ))}
            </nav>

            {/* Department Selector */}
            {shouldShowDepartmentSelector && (
              hasNoDepartments ? (
                // Fallback for users with no departments assigned
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg text-sm font-medium border border-amber-200">
                  <Building2 size={16} className="text-amber-600" />
                  <span className="text-amber-700">No departments assigned</span>
                </div>
              ) : departments.length > 0 ? (
              <div ref={deptRef} className="relative">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowDepartmentSelector(!showDepartmentSelector)}
                  className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 rounded-lg text-sm font-medium transition-all border border-blue-200"
                >
                  <Building2 size={16} className="text-blue-600" />
                  <span className="text-gray-700">{currentDepartment?.name || 'Select Department'}</span>
                  {departments.length > 1 && <ChevronDown size={14} className="text-gray-500" />}
                </motion.button>

                <AnimatePresence>
                  {showDepartmentSelector && departments.length > 1 && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute top-full left-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden"
                    >
                      <div className="p-2 bg-gray-50 border-b border-gray-200">
                        <p className="text-xs font-semibold text-gray-600 px-2">SELECT DEPARTMENT</p>
                      </div>
                      <div className="max-h-64 overflow-y-auto">
                        {departments.map(dept => (
                          <button
                            key={dept._id}
                            onClick={() => {
                              setCurrentDepartment(dept);
                              setShowDepartmentSelector(false);
                            }}
                            className={`w-full text-left px-4 py-3 hover:bg-blue-50 text-sm transition-colors flex items-center gap-2 ${
                              currentDepartment?._id === dept._id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                            }`}
                          >
                            <Building2 size={16} />
                            {dept.name}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              ) : null
            )}

            {/* Team Selector */}
            {teams.length > 0 && (
              <div ref={teamRef} className="relative">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowTeamSelector(!showTeamSelector)}
                  className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-50 to-pink-50 hover:from-purple-100 hover:to-pink-100 rounded-lg text-sm font-medium transition-all border border-purple-200"
                >
                  <Users size={16} className="text-purple-600" />
                  <span className="text-gray-700">{currentTeam?.name || 'Team'}</span>
                  <ChevronDown size={14} className="text-gray-500" />
                </motion.button>

                <AnimatePresence>
                  {showTeamSelector && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute top-full left-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden"
                    >
                      {/* <div className="p-2 bg-gray-50 border-b border-gray-200">
                        <p className="text-xs font-semibold text-gray-600 px-2">SELECT TEAM</p>
                      </div> */}
                      {/* <div className="max-h-64 overflow-y-auto">
                        {teams.map(team => (
                          <button
                            key={team._id}
                            onClick={() => {
                              setCurrentTeam(team);
                              setShowTeamSelector(false);
                            }}
                            className={`w-full text-left px-4 py-3 hover:bg-purple-50 text-sm transition-colors flex items-center gap-2 ${
                              currentTeam?._id === team._id ? 'bg-purple-50 text-purple-700 font-medium' : 'text-gray-700'
                            }`}
                          >
                            <Users size={16} />
                            {team.name}
                          </button>
                        ))}
                        {isAdminOrManager && (
                          <div className="border-t border-gray-200">
                            <button
                              onClick={() => {
                                navigate('/teams');
                                setShowTeamSelector(false);
                              }}
                              className="w-full text-left px-4 py-3 hover:bg-gray-50 text-sm text-blue-600 font-medium"
                            >
                              + Manage Teams
                            </button>
                          </div>
                        )}
                      </div> */}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-2">
            {/* Dashboard Button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
            >
              <BarChart3 size={18} />
              <span className="hidden sm:inline">Dashboard</span>
            </motion.button>

            {/* Notifications */}
            <div ref={notificationRef} className="relative">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold shadow-lg"
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </motion.span>
                )}
              </motion.button>
              
              <AnimatePresence>
                {showNotifications && (
                  <Suspense fallback={
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute right-0 top-full mt-2 w-[420px] bg-white border border-gray-200 rounded-2xl shadow-2xl z-50 p-4"
                    >
                      <div className="animate-pulse space-y-4">
                        <div className="h-16 bg-gradient-to-r from-indigo-200 to-purple-200 rounded-xl" />
                        <div className="h-20 bg-gray-100 rounded-lg" />
                        <div className="h-20 bg-gray-100 rounded-lg" />
                        <div className="h-20 bg-gray-100 rounded-lg" />
                      </div>
                    </motion.div>
                  }>
                    <NotificationPanel
                      notifications={notifications}
                      unreadCount={unreadCount}
                      isLoading={isLoading}
                      hasMore={hasMore}
                      filter={filter}
                      onFilterChange={handleFilterChange}
                      onMarkAsRead={markAsRead}
                      onMarkAllAsRead={markAllAsRead}
                      onArchive={archiveNotification}
                      onClearAll={clearAll}
                      onLoadMore={loadMore}
                      onClose={() => setShowNotifications(false)}
                      onNotificationClick={handleNotificationClick}
                      archivedNotifications={archivedNotifications}
                      isLoadingArchived={isLoadingArchived}
                      hasMoreArchived={hasMoreArchived}
                      onLoadArchived={loadArchivedNotifications}
                      onRestoreNotification={restoreNotification}
                      onDeletePermanently={deletePermanently}
                    />
                  </Suspense>
                )}
              </AnimatePresence>
            </div>

            {/* User Menu */}
            <div ref={userMenuRef} className="relative">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Avatar 
                  src={user?.avatar} 
                  name={user?.name} 
                  role={user?.role}
                  isVerified={user?.isVerified}
                  size="sm"
                  showBadge={true}
                />
                <div className="hidden md:block text-left">
                  <p className="text-sm font-medium text-gray-900">{user?.name || 'User'}</p>
                  <p className="text-xs text-gray-500 capitalize">{user?.role || 'Member'}</p>
                </div>
                <ChevronDown size={16} className="text-gray-500" />
              </motion.button>

              <AnimatePresence>
                {showUserMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute right-0 top-full mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden"
                  >
                    <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                      <p className="text-sm font-semibold text-gray-900">{user?.name}</p>
                      <p className="text-xs text-gray-500">{user?.email}</p>
                    </div>
                    <div className="py-2">
                      <button
                        onClick={() => {
                          navigate('/profile');
                          setShowUserMenu(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3 text-gray-700"
                      >
                        <User size={16} />
                        My Profile
                      </button>
                      <button
                        onClick={() => {
                          setShowAppearanceModal(true);
                          setShowUserMenu(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3 text-gray-700"
                      >
                        <Palette size={16} />
                        Appearance
                      </button>
                      <button
                        onClick={() => {
                          navigate('/settings');
                          setShowUserMenu(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3 text-gray-700"
                      >
                        <Settings size={16} />
                        Settings
                      </button>
                      <button
                        onClick={() => {
                          navigate('/billing');
                          setShowUserMenu(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3 text-gray-700"
                      >
                        <CreditCard size={16} />
                        Billing
                      </button>
                      <button
                        onClick={() => {
                          navigate('/help-center');
                          setShowUserMenu(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3 text-gray-700"
                      >
                        <HelpCircle size={16} />
                        Help Center
                      </button>
                    </div>
                    <div className="border-t border-gray-200">
                      <button
                        onClick={() => {
                          logoutUser();
                          navigate('/login');
                        }}
                        className="w-full px-4 py-3 text-left text-sm hover:bg-red-50 flex items-center gap-3 text-red-600 font-medium"
                      >
                        <LogOut size={16} />
                        Logout
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* User Verification Modal */}
      {mobileSidebarOpen && (
        <Sidebar isMobile={true} onClose={() => setMobileSidebarOpen(false)} />
      )}
      {verificationModal && (
        <Suspense fallback={<div>Loading...</div>}>
          <UserVerificationModal
            notification={verificationModal}
            onClose={closeVerificationModal}
            onAction={handleVerificationAction}
          />
        </Suspense>
      )}
      {/* Appearance Modal */}
      <Suspense fallback={null}>
        <AppearanceModal
          isOpen={showAppearanceModal}
          onClose={() => setShowAppearanceModal(false)}
        />
      </Suspense>
    </header>
  );
};

export default Header;