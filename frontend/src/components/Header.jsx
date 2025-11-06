import React, { useContext, useState, useRef, useEffect, lazy, Suspense } from 'react';
import {
  Bell, Menu, Settings, LogOut, User,
  ChevronDown, Kanban, List, Calendar, BarChart3,
  Users, Building2
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import AuthContext from '../context/AuthContext';
import TeamContext from '../context/TeamContext';
import NotificationContext from '../context/NotificationContext';

const UserVerificationModal = lazy(() => import('./UserVerificationModal'));

const Header = ({ boardName }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logoutUser } = useContext(AuthContext);
  const { currentTeam, currentDepartment, teams, departments, setCurrentTeam, setCurrentDepartment } = useContext(TeamContext);
  const { notifications, unreadCount, markAsRead, deleteNotification, handleNotificationClick, verificationModal, handleVerificationAction, closeVerificationModal } = useContext(NotificationContext);
  
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showTeamSelector, setShowTeamSelector] = useState(false);
  const [showDepartmentSelector, setShowDepartmentSelector] = useState(false);

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



  const navItems = [
    { path: '/', icon: Kanban, label: 'Board' },
    { path: '/list-view', icon: List, label: 'List' },
    { path: '/calendar', icon: Calendar, label: 'Calendar' },
    { path: '/analytics', icon: BarChart3, label: 'Analytics' },
  ];

  const isActive = (path) => location.pathname === path;
  const isAdminOrManager = user && (user.role === 'admin' || user.role === 'manager');

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
      <div className="px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Left Section */}
          <div className="flex items-center gap-4 flex-1">
            {/* Department & Team Selectors */}
            <div className="flex items-center gap-2">
              {departments.length > 0 && (
                <div ref={deptRef} className="relative">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowDepartmentSelector(!showDepartmentSelector)}
                    className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 rounded-lg text-sm font-medium transition-all border border-blue-200"
                  >
                    <Building2 size={16} className="text-blue-600" />
                    <span className="text-gray-700">{currentDepartment?.name || 'Department'}</span>
                    <ChevronDown size={14} className="text-gray-500" />
                  </motion.button>
                  
                  <AnimatePresence>
                    {showDepartmentSelector && (
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
              )}

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
                        <div className="p-2 bg-gray-50 border-b border-gray-200">
                          <p className="text-xs font-semibold text-gray-600 px-2">SELECT TEAM</p>
                        </div>
                        <div className="max-h-64 overflow-y-auto">
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
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>

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
                    className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold"
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </motion.span>
                )}
              </motion.button>
              
              <AnimatePresence>
                {showNotifications && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    className="absolute right-0 top-full mt-2 w-96 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 overflow-hidden"
                  >
                    <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-gray-900">Notifications</h3>
                        {unreadCount > 0 && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                            {unreadCount} new
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                          <Bell size={48} className="mx-auto mb-3 text-gray-300" />
                          <p>No notifications</p>
                        </div>
                      ) : (
                        notifications.slice(0, 5).map(notification => (
                          <motion.div
                            key={notification._id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className={`p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${
                              !notification.isRead ? 'bg-blue-50' : ''
                            }`}
                            onClick={() => handleNotificationClick(notification)}
                          >
                            <p className="text-sm text-gray-900">{notification.message}</p>
                            <div className="flex items-center justify-between mt-2">
                              <p className="text-xs text-gray-500">
                                {new Date(notification.createdAt).toLocaleString()}
                              </p>
                              <div className="flex gap-2">
                                {!notification.isRead && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      markAsRead(notification._id);
                                    }}
                                    className="text-xs text-blue-600 hover:text-blue-800"
                                  >
                                    Mark read
                                  </button>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteNotification(notification._id);
                                  }}
                                  className="text-xs text-red-600 hover:text-red-800"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        ))
                      )}
                    </div>
                    {notifications.length > 5 && (
                      <div className="p-3 text-center border-t border-gray-200">
                        <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                          View all notifications
                        </button>
                      </div>
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
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-bold">
                    {user?.name?.[0]?.toUpperCase() || 'U'}
                  </span>
                </div>
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
                          navigate('/settings');
                          setShowUserMenu(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3 text-gray-700"
                      >
                        <Settings size={16} />
                        Settings
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
      {verificationModal && (
        <Suspense fallback={<div>Loading...</div>}>
          <UserVerificationModal
            notification={verificationModal}
            onClose={closeVerificationModal}
            onAction={handleVerificationAction}
          />
        </Suspense>
      )}
    </header>
  );
};

export default Header;