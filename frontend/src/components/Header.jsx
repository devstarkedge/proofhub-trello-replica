import React, { useContext, useState, useRef, useEffect, lazy, Suspense } from 'react';
import {
  Bell, Menu, Settings, LogOut, User,
  ChevronDown, Kanban, List, Calendar, BarChart3,
  Users, Building2, ArrowLeft,
  CreditCard, HelpCircle, Palette, Sparkles
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

// Icon color configuration for navigation items
const navIconColors = {
  '/': { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' }, // Blue - Board
  '/list-view': { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)' }, // Purple - List
  '/calendar': { color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' }, // Emerald - Calendar
  '/analytics': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' }, // Amber - Analytics
};

// User menu icon colors
const menuIconColors = {
  profile: { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' },
  appearance: { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)' },
  settings: { color: '#6366f1', bg: 'rgba(99, 102, 241, 0.12)' },
  billing: { color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' },
  help: { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.12)' },
  logout: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)' },
};

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
  const [hoveredNav, setHoveredNav] = useState(null);
  const [hoveredMenuItem, setHoveredMenuItem] = useState(null);

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
    { path: '/list-view', icon: List, label: 'Task-List' },
    { path: '/calendar', icon: Calendar, label: 'Calendar' },
    { path: '/analytics', icon: BarChart3, label: 'Analytics' },
  ];

  const isActive = (path) => location.pathname === path;
  const isAdminOrManager = user && (user.role === 'admin' || user.role === 'manager');

  // Show department selector only on specific pages
  const shouldShowDepartmentSelector = ['/list-view', '/calendar', '/analytics'].includes(location.pathname);

  // Get icon config for nav items
  const getNavIconConfig = (path) => navIconColors[path] || { color: 'var(--color-text-secondary)', bg: 'transparent' };

  return (
    <>
    <header 
      className="sticky top-0 z-40 border-b backdrop-blur-md"
      style={{
        backgroundColor: 'var(--color-header-bg)',
        borderColor: 'var(--color-header-border)',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
      }}
    >
      <div className="px-4 lg:px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Left Section */}
          <div className="flex items-center gap-3 flex-1">
            {/* Mobile menu button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden p-2.5 rounded-xl transition-all duration-200"
              style={{
                backgroundColor: 'var(--color-bg-muted)',
                color: 'var(--color-text-secondary)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--color-primary-subtle)';
                e.currentTarget.style.color = 'var(--color-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--color-bg-muted)';
                e.currentTarget.style.color = 'var(--color-text-secondary)';
              }}
              aria-label="Open menu"
            >
              <Menu size={20} />
            </motion.button>

            {/* Back Button */}
            {['/list-view', '/calendar', '/analytics'].includes(location.pathname) && (
              <motion.button
                whileHover={{ scale: 1.03, x: -2 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate('/')}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200"
                style={{
                  backgroundColor: 'var(--color-bg-muted)',
                  color: 'var(--color-text-secondary)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-primary-subtle)';
                  e.currentTarget.style.color = 'var(--color-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-bg-muted)';
                  e.currentTarget.style.color = 'var(--color-text-secondary)';
                }}
              >
                <ArrowLeft size={16} />
                <span className="hidden sm:inline">Back</span>
              </motion.button>
            )}

            {/* View Navigation - Enhanced with colored icons */}
            <nav 
              className="hidden lg:flex items-center gap-1 p-1.5 rounded-xl"
              style={{ backgroundColor: 'var(--color-bg-muted)' }}
            >
              {navItems.map(({ path, icon: Icon, label }) => {
                const iconConfig = getNavIconConfig(path);
                const active = isActive(path);
                const hovered = hoveredNav === path;
                
                return (
                  <motion.button
                    key={path}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate(path)}
                    onMouseEnter={() => setHoveredNav(path)}
                    onMouseLeave={() => setHoveredNav(null)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 relative overflow-hidden"
                    style={{
                      backgroundColor: active ? 'var(--color-card-bg)' : 'transparent',
                      color: active ? iconConfig.color : hovered ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                      boxShadow: active ? 'var(--shadow-sm)' : 'none',
                    }}
                  >
                    {/* Icon with colored background on active/hover */}
                    <div 
                      className="flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-200"
                      style={{
                        backgroundColor: active || hovered ? iconConfig.bg : 'transparent',
                        transform: hovered && !active ? 'scale(1.1)' : 'scale(1)',
                      }}
                    >
                      <Icon 
                        size={16} 
                        style={{ 
                          color: active || hovered ? iconConfig.color : 'var(--color-text-muted)',
                          strokeWidth: active ? 2.5 : 2,
                        }}
                      />
                    </div>
                    <span className="hidden xl:inline">{label}</span>
                    
                    {/* Active indicator */}
                    {active && (
                      <motion.div
                        layoutId="activeNavIndicator"
                        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full"
                        style={{ backgroundColor: iconConfig.color }}
                      />
                    )}
                  </motion.button>
                );
              })}
            </nav>

            {/* Department Selector - Enhanced */}
            {shouldShowDepartmentSelector && (
              hasNoDepartments ? (
                <div 
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border"
                  style={{
                    backgroundColor: 'var(--color-warning-subtle)',
                    borderColor: 'var(--color-warning)',
                    color: 'var(--color-warning-text)',
                  }}
                >
                  <Building2 size={16} />
                  <span>No departments assigned</span>
                </div>
              ) : departments.length > 0 ? (
              <div ref={deptRef} className="relative">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowDepartmentSelector(!showDepartmentSelector)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 border"
                  style={{
                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(99, 102, 241, 0.08))',
                    borderColor: 'rgba(59, 130, 246, 0.2)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  <div 
                    className="flex items-center justify-center w-7 h-7 rounded-lg"
                    style={{ backgroundColor: 'rgba(59, 130, 246, 0.12)' }}
                  >
                    <Building2 size={15} style={{ color: '#3b82f6' }} />
                  </div>
                  <span>{currentDepartment?.name || 'Select Department'}</span>
                  {departments.length > 1 && (
                    <ChevronDown 
                      size={14} 
                      style={{ 
                        color: 'var(--color-text-muted)',
                        transform: showDepartmentSelector ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 200ms ease',
                      }} 
                    />
                  )}
                </motion.button>

                <AnimatePresence>
                  {showDepartmentSelector && departments.length > 1 && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-full left-0 mt-2 w-72 rounded-2xl shadow-2xl z-50 overflow-hidden border"
                      style={{
                        backgroundColor: 'var(--color-card-bg)',
                        borderColor: 'var(--color-border-default)',
                      }}
                    >
                      <div 
                        className="p-3 border-b"
                        style={{ 
                          borderColor: 'var(--color-border-subtle)',
                          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.05), rgba(99, 102, 241, 0.05))',
                        }}
                      >
                        <p 
                          className="text-xs font-semibold uppercase tracking-wider px-1"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          Select Department
                        </p>
                      </div>
                      <div className="max-h-64 overflow-y-auto p-2">
                        {departments.map(dept => (
                          <button
                            key={dept._id}
                            onClick={() => {
                              setCurrentDepartment(dept);
                              setShowDepartmentSelector(false);
                            }}
                            className="w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all duration-200 flex items-center gap-3"
                            style={{
                              backgroundColor: currentDepartment?._id === dept._id ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                              color: currentDepartment?._id === dept._id ? '#3b82f6' : 'var(--color-text-primary)',
                              fontWeight: currentDepartment?._id === dept._id ? 600 : 400,
                            }}
                            onMouseEnter={(e) => {
                              if (currentDepartment?._id !== dept._id) {
                                e.currentTarget.style.backgroundColor = 'var(--color-bg-muted)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (currentDepartment?._id !== dept._id) {
                                e.currentTarget.style.backgroundColor = 'transparent';
                              }
                            }}
                          >
                            <div 
                              className="flex items-center justify-center w-8 h-8 rounded-lg"
                              style={{ 
                                backgroundColor: currentDepartment?._id === dept._id ? 'rgba(59, 130, 246, 0.15)' : 'var(--color-bg-muted)',
                              }}
                            >
                              <Building2 size={16} style={{ color: currentDepartment?._id === dept._id ? '#3b82f6' : 'var(--color-text-muted)' }} />
                            </div>
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

            {/* Team Selector - Enhanced */}
            {teams.length > 0 && (
              <div ref={teamRef} className="relative">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowTeamSelector(!showTeamSelector)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 border"
                  style={{
                    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08), rgba(236, 72, 153, 0.08))',
                    borderColor: 'rgba(139, 92, 246, 0.2)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  <div 
                    className="flex items-center justify-center w-7 h-7 rounded-lg"
                    style={{ backgroundColor: 'rgba(139, 92, 246, 0.12)' }}
                  >
                    <Users size={15} style={{ color: '#8b5cf6' }} />
                  </div>
                  <span>{currentTeam?.name || 'Team'}</span>
                  <ChevronDown 
                    size={14} 
                    style={{ 
                      color: 'var(--color-text-muted)',
                      transform: showTeamSelector ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 200ms ease',
                    }} 
                  />
                </motion.button>

                <AnimatePresence>
                  {showTeamSelector && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-full left-0 mt-2 w-72 rounded-2xl shadow-2xl z-50 overflow-hidden border"
                      style={{
                        backgroundColor: 'var(--color-card-bg)',
                        borderColor: 'var(--color-border-default)',
                      }}
                    >
                      {/* Team selector content here if needed */}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-2">
            {/* Dashboard Button - Enhanced */}
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200"
              style={{
                backgroundColor: 'transparent',
                color: 'var(--color-text-secondary)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(139, 92, 246, 0.1)';
                e.currentTarget.style.color = '#8b5cf6';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'var(--color-text-secondary)';
              }}
            >
              <div 
                className="flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200"
                style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)' }}
              >
                <BarChart3 size={17} style={{ color: '#8b5cf6' }} />
              </div>
              <span className="hidden sm:inline">Dashboard</span>
            </motion.button>

            {/* Notifications - Enhanced */}
            <div ref={notificationRef} className="relative">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2.5 rounded-xl transition-all duration-200"
                style={{
                  backgroundColor: showNotifications ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
                  color: showNotifications ? '#f59e0b' : 'var(--color-text-secondary)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(245, 158, 11, 0.1)';
                  e.currentTarget.style.color = '#f59e0b';
                }}
                onMouseLeave={(e) => {
                  if (!showNotifications) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = 'var(--color-text-secondary)';
                  }
                }}
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-0.5 -right-0.5 text-white text-xs rounded-full h-5 min-w-[20px] px-1 flex items-center justify-center font-bold shadow-lg"
                    style={{
                      background: 'linear-gradient(135deg, #ef4444, #ec4899)',
                    }}
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </motion.span>
                )}
              </motion.button>
              
              <AnimatePresence>
                {showNotifications && (
                  <Suspense fallback={
                    <motion.div
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      className="absolute right-0 top-full mt-2 w-[420px] rounded-2xl shadow-2xl z-50 p-4 border"
                      style={{
                        backgroundColor: 'var(--color-card-bg)',
                        borderColor: 'var(--color-border-default)',
                      }}
                    >
                      <div className="animate-pulse space-y-4">
                        <div className="h-16 rounded-xl" style={{ background: 'linear-gradient(135deg, var(--color-primary-subtle), rgba(139, 92, 246, 0.1))' }} />
                        <div className="h-20 rounded-lg" style={{ backgroundColor: 'var(--color-bg-muted)' }} />
                        <div className="h-20 rounded-lg" style={{ backgroundColor: 'var(--color-bg-muted)' }} />
                        <div className="h-20 rounded-lg" style={{ backgroundColor: 'var(--color-bg-muted)' }} />
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

            {/* User Menu - Enhanced with colored icons */}
            <div ref={userMenuRef} className="relative">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl transition-all duration-200 border"
                style={{
                  backgroundColor: showUserMenu ? 'var(--color-bg-muted)' : 'transparent',
                  borderColor: showUserMenu ? 'var(--color-border-default)' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-bg-muted)';
                  e.currentTarget.style.borderColor = 'var(--color-border-default)';
                }}
                onMouseLeave={(e) => {
                  if (!showUserMenu) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.borderColor = 'transparent';
                  }
                }}
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
                  <p 
                    className="text-sm font-semibold leading-tight"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {user?.name || 'User'}
                  </p>
                  <p 
                    className="text-xs capitalize"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {user?.role || 'Member'}
                  </p>
                </div>
                <ChevronDown 
                  size={16} 
                  style={{ 
                    color: 'var(--color-text-muted)',
                    transform: showUserMenu ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 200ms ease',
                  }} 
                />
              </motion.button>

              <AnimatePresence>
                {showUserMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-64 rounded-2xl shadow-2xl z-50 overflow-hidden border"
                    style={{
                      backgroundColor: 'var(--color-card-bg)',
                      borderColor: 'var(--color-border-default)',
                    }}
                  >
                    {/* User info header */}
                    <div 
                      className="p-4 border-b"
                      style={{ 
                        borderColor: 'var(--color-border-subtle)',
                        background: 'linear-gradient(135deg, var(--color-bg-subtle), var(--color-bg-muted))',
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar 
                          src={user?.avatar} 
                          name={user?.name} 
                          role={user?.role}
                          isVerified={user?.isVerified}
                          size="md"
                          showBadge={true}
                        />
                        <div>
                          <p 
                            className="text-sm font-semibold"
                            style={{ color: 'var(--color-text-primary)' }}
                          >
                            {user?.name}
                          </p>
                          <p 
                            className="text-xs"
                            style={{ color: 'var(--color-text-muted)' }}
                          >
                            {user?.email}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Menu items with colored icons */}
                    <div className="p-2">
                      {[
                        { key: 'profile', icon: User, label: 'My Profile', path: '/profile', config: menuIconColors.profile },
                        { key: 'appearance', icon: Palette, label: 'Appearance', action: () => setShowAppearanceModal(true), config: menuIconColors.appearance },
                        { key: 'settings', icon: Settings, label: 'Settings', path: '/settings', config: menuIconColors.settings },
                        { key: 'billing', icon: CreditCard, label: 'Billing', path: '/billing', config: menuIconColors.billing },
                        { key: 'help', icon: HelpCircle, label: 'Help Center', path: '/help-center', config: menuIconColors.help },
                      ].map(({ key, icon: Icon, label, path, action, config }) => (
                        <button
                          key={key}
                          onClick={() => {
                            if (action) action();
                            else if (path) navigate(path);
                            setShowUserMenu(false);
                          }}
                          onMouseEnter={() => setHoveredMenuItem(key)}
                          onMouseLeave={() => setHoveredMenuItem(null)}
                          className="w-full px-3 py-2.5 text-left text-sm rounded-xl flex items-center gap-3 transition-all duration-200"
                          style={{
                            backgroundColor: hoveredMenuItem === key ? config.bg : 'transparent',
                            color: hoveredMenuItem === key ? config.color : 'var(--color-text-primary)',
                          }}
                        >
                          <div 
                            className="flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200"
                            style={{
                              backgroundColor: config.bg,
                              transform: hoveredMenuItem === key ? 'scale(1.1)' : 'scale(1)',
                            }}
                          >
                            <Icon size={16} style={{ color: config.color }} />
                          </div>
                          <span style={{ fontWeight: hoveredMenuItem === key ? 500 : 400 }}>{label}</span>
                        </button>
                      ))}
                    </div>
                    
                    {/* Logout button */}
                    <div 
                      className="border-t p-2"
                      style={{ borderColor: 'var(--color-border-subtle)' }}
                    >
                      <button
                        onClick={() => {
                          logoutUser();
                          navigate('/login');
                        }}
                        onMouseEnter={() => setHoveredMenuItem('logout')}
                        onMouseLeave={() => setHoveredMenuItem(null)}
                        className="w-full px-3 py-2.5 text-left text-sm rounded-xl flex items-center gap-3 transition-all duration-200"
                        style={{
                          backgroundColor: hoveredMenuItem === 'logout' ? menuIconColors.logout.bg : 'transparent',
                          color: hoveredMenuItem === 'logout' ? menuIconColors.logout.color : 'var(--color-text-primary)',
                        }}
                      >
                        <div 
                          className="flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200"
                          style={{
                            backgroundColor: menuIconColors.logout.bg,
                            transform: hoveredMenuItem === 'logout' ? 'scale(1.1)' : 'scale(1)',
                          }}
                        >
                          <LogOut size={16} style={{ color: menuIconColors.logout.color }} />
                        </div>
                        <span style={{ fontWeight: hoveredMenuItem === 'logout' ? 600 : 500 }}>Logout</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Sidebar */}
      {mobileSidebarOpen && (
        <Sidebar isMobile={true} onClose={() => setMobileSidebarOpen(false)} />
      )}
      
    </header>
    
    {/* User Verification Modal - Outside header for proper z-index stacking */}
    {verificationModal && (
        <Suspense fallback={<div>Loading...</div>}>
          <UserVerificationModal
            notification={verificationModal}
            onClose={closeVerificationModal}
            onAction={handleVerificationAction}
          />
        </Suspense>
      )}
    
    {/* Appearance Modal - Outside header for proper z-index stacking */}
    <Suspense fallback={null}>
      <AppearanceModal
        isOpen={showAppearanceModal}
        onClose={() => setShowAppearanceModal(false)}
      />
    </Suspense>
    </>
  );
};

export default Header;