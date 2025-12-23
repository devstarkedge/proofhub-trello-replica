import React, { useContext, useState, useRef, useEffect, lazy, Suspense } from 'react';
import {
  Bell, Menu, Settings, LogOut, User,
  ChevronDown, Kanban, List, Calendar, BarChart3,
  Users, Building2, CheckCircle, AlertCircle, UserPlus,
  FolderPlus, Folder, ArrowRight, Trash2, ArrowLeft,
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

const Header = ({ boardName }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logoutUser } = useContext(AuthContext);
  const { currentTeam, currentDepartment, teams, departments, hasNoDepartments, setCurrentTeam, setCurrentDepartment } = useContext(DepartmentContext);
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification, clearAll, handleNotificationClick, verificationModal, handleVerificationAction, closeVerificationModal } = useContext(NotificationContext);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showTeamSelector, setShowTeamSelector] = useState(false);
  const [showDepartmentSelector, setShowDepartmentSelector] = useState(false);
  const [showNotificationExpand, setShowNotificationExpand] = useState(false);
  const [visibleNotifications, setVisibleNotifications] = useState(5);
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
                onClick={() => {
                  const nextShow = !showNotifications;
                  setShowNotifications(nextShow);
                  if (!nextShow) {
                    setShowNotificationExpand(false);
                    setVisibleNotifications(5);
                  }
                }}
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
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    className="notification-panel absolute right-0 top-full mt-2 w-[420px] bg-white border border-gray-200 rounded-2xl shadow-2xl z-50 overflow-hidden"
                    layout
                  >
                    {/* Enhanced Header */}
                    <motion.div 
                      layout="position" 
                      className="relative p-4 border-b border-gray-100 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"
                    >
                      {/* Glassmorphism overlay */}
                      <div className="absolute inset-0 bg-white/10 backdrop-blur-sm" />
                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                              <Bell size={18} className="text-white" />
                            </div>
                            <h3 className="font-bold text-white text-lg">Notifications</h3>
                          </div>
                          {unreadCount > 0 && (
                            <span className="px-3 py-1 bg-white/20 backdrop-blur-sm text-white text-sm font-medium rounded-full border border-white/30">
                              {unreadCount} new
                            </span>
                          )}
                        </div>
                        
                        {/* Action Buttons */}
                        {notifications.length > 0 && (
                          <div className="flex items-center gap-2">
                            {unreadCount > 0 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  markAllAsRead();
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white text-xs font-medium rounded-lg transition-all border border-white/20"
                              >
                                <CheckCircle size={14} />
                                Mark all read
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                clearAll();
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-red-500/50 backdrop-blur-sm text-white text-xs font-medium rounded-lg transition-all border border-white/20"
                            >
                              <Trash2 size={14} />
                              Clear all
                            </button>
                          </div>
                        )}
                      </div>
                    </motion.div>

                    {/* Notification List */}
                    <motion.div
                      layout
                      className="max-h-[450px] overflow-y-auto notification-scroll"
                      animate={{ height: 'auto' }}
                      transition={{ type: 'spring', duration: 0.8, bounce: 0.3 }}
                    >
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center">
                          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                            <Bell size={36} className="text-gray-400" />
                          </div>
                          <p className="font-medium text-gray-700 mb-1">All caught up!</p>
                          <p className="text-sm text-gray-500">You have no notifications</p>
                        </div>
                      ) : (
                        <AnimatePresence initial={false}>
                          {(() => {
                            const today = new Date();
                            const yesterday = new Date(today);
                            yesterday.setDate(yesterday.getDate() - 1);
                            
                            const isToday = (date) => {
                              const d = new Date(date);
                              return d.toDateString() === today.toDateString();
                            };
                            const isYesterday = (date) => {
                              const d = new Date(date);
                              return d.toDateString() === yesterday.toDateString();
                            };
                            
                            const visibleItems = notifications.slice(0, visibleNotifications);
                            let lastGroup = null;
                            
                            return visibleItems.map((notification, index) => {
                              const getNotificationIcon = (type) => {
                                switch (type) {
                                  case 'task_created':
                                  case 'project_created':
                                    return { icon: FolderPlus, bg: 'from-green-400 to-emerald-500', color: 'text-white' };
                                  case 'task_deleted':
                                  case 'project_deleted':
                                    return { icon: Trash2, bg: 'from-red-400 to-rose-500', color: 'text-white' };
                                  case 'task_moved':
                                    return { icon: ArrowRight, bg: 'from-blue-400 to-cyan-500', color: 'text-white' };
                                  case 'task_assigned':
                                    return { icon: UserPlus, bg: 'from-purple-400 to-violet-500', color: 'text-white' };
                                  case 'task_updated':
                                    return { icon: CheckCircle, bg: 'from-orange-400 to-amber-500', color: 'text-white' };
                                  case 'comment_added':
                                  case 'comment_mention':
                                    return { icon: AlertCircle, bg: 'from-yellow-400 to-orange-500', color: 'text-white' };
                                  case 'board_shared':
                                    return { icon: Folder, bg: 'from-indigo-400 to-blue-500', color: 'text-white' };
                                  case 'reminder':
                                    return { icon: Bell, bg: 'from-teal-400 to-cyan-500', color: 'text-white' };
                                  default:
                                    return { icon: Bell, bg: 'from-gray-400 to-slate-500', color: 'text-white' };
                                }
                              };

                              const iconData = getNotificationIcon(notification.type);
                              const IconComponent = iconData.icon;
                              
                              // Determine time group
                              let currentGroup = 'earlier';
                              if (isToday(notification.createdAt)) {
                                currentGroup = 'today';
                              } else if (isYesterday(notification.createdAt)) {
                                currentGroup = 'yesterday';
                              }
                              
                              const showGroupHeader = currentGroup !== lastGroup;
                              lastGroup = currentGroup;
                              const groupLabels = {
                                today: 'Today',
                                yesterday: 'Yesterday',
                                earlier: 'Earlier'
                              };

                              return (
                                <React.Fragment key={`${notification._id}-${index}`}>
                                  {showGroupHeader && (
                                    <motion.div
                                      initial={{ opacity: 0 }}
                                      animate={{ opacity: 1 }}
                                      className="px-4 py-2 bg-gray-50 border-b border-gray-100"
                                    >
                                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                        {groupLabels[currentGroup]}
                                      </span>
                                    </motion.div>
                                  )}
                                  <motion.div
                                    layout
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20, transition: { duration: 0.2 } }}
                                    transition={{
                                      type: 'spring',
                                      stiffness: 300,
                                      damping: 30,
                                      delay: index > 4 ? (index - 4) * 0.05 : 0,
                                    }}
                                    className={`group relative p-4 border-b border-gray-50 cursor-pointer transition-all duration-200 ${
                                      !notification.isRead 
                                        ? 'bg-gradient-to-r from-blue-50/80 to-indigo-50/50' 
                                        : 'hover:bg-gray-50'
                                    }`}
                                    onClick={() => handleNotificationClick(notification)}
                                  >
                                    <div className="flex items-start gap-3">
                                      {/* Icon */}
                                      <div className={`flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br ${iconData.bg} flex items-center justify-center shadow-lg shadow-${iconData.bg.split('-')[1]}-200/50`}>
                                        <IconComponent size={18} className={iconData.color} />
                                      </div>
                                      
                                      {/* Content */}
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2">
                                          <p className={`text-sm font-semibold ${!notification.isRead ? 'text-gray-900' : 'text-gray-700'} line-clamp-1`}>
                                            {notification.title}
                                          </p>
                                          {!notification.isRead && (
                                            <span className="flex-shrink-0 w-2.5 h-2.5 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full animate-pulse shadow-lg shadow-blue-500/50" />
                                          )}
                                        </div>
                                        <p className="text-sm text-gray-600 mt-0.5 line-clamp-2 leading-relaxed">
                                          {notification.message}
                                        </p>
                                        <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                                          <span className="w-1 h-1 bg-gray-300 rounded-full" />
                                          {new Date(notification.createdAt).toLocaleString()}
                                        </p>
                                      </div>
                                    </div>
                                    
                                    {/* Hover Actions */}
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      {!notification.isRead && (
                                        <motion.button
                                          whileHover={{ scale: 1.1 }}
                                          whileTap={{ scale: 0.9 }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            markAsRead(notification._id);
                                          }}
                                          className="p-2 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-lg transition-colors"
                                          title="Mark as read"
                                        >
                                          <CheckCircle size={14} />
                                        </motion.button>
                                      )}
                                      <motion.button
                                        whileHover={{ scale: 1.1 }}
                                        whileTap={{ scale: 0.9 }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          deleteNotification(notification._id);
                                        }}
                                        className="p-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg transition-colors"
                                        title="Delete"
                                      >
                                        <Trash2 size={14} />
                                      </motion.button>
                                    </div>
                                  </motion.div>
                                </React.Fragment>
                              );
                            });
                          })()}
                        </AnimatePresence>
                      )}
                    </motion.div>
                    
                    {/* Expand/Collapse Button */}
                    {notifications.length > 5 && (
                      <motion.div layout className="p-3 text-center border-t border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                        <motion.button
                          onClick={() => {
                            setShowNotificationExpand(!showNotificationExpand);
                            setVisibleNotifications(showNotificationExpand ? 5 : notifications.length);
                          }}
                          className="flex items-center justify-center gap-2 w-full py-2 px-4 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
                          whileHover={{ scale: 1.01 }}
                        >
                          <motion.div
                            animate={{ rotate: showNotificationExpand ? 180 : 0 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                          >
                            <ChevronDown size={18} />
                          </motion.div>
                          <span>{showNotificationExpand ? 'Show less' : `Show ${notifications.length - 5} more`}</span>
                        </motion.button>
                      </motion.div>
                    )}
                  </motion.div>
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