import React, { useContext, useState } from 'react';
import { Share2, Star, Users, Menu, Search, Bell, Kanban, List, Calendar, BarChart3, Settings, LogOut } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import AuthContext from '../context/AuthContext';
import TeamContext from '../context/TeamContext';
import NotificationContext from '../context/NotificationContext';
import UserVerificationModal from './UserVerificationModal';

const Header = ({ boardName }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useContext(AuthContext);
  const { currentTeam, currentDepartment, teams, departments, setCurrentTeam, setCurrentDepartment } = useContext(TeamContext);
  const { notifications, unreadCount, markAsRead, deleteNotification, handleNotificationClick, verificationModal, handleVerificationAction, closeVerificationModal } = useContext(NotificationContext);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showTeamSelector, setShowTeamSelector] = useState(false);
  const [showDepartmentSelector, setShowDepartmentSelector] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  const navItems = [
    { path: '/', icon: Kanban, label: 'Home' },
    { path: '/list-view', icon: List, label: 'List' },
    { path: '/calendar', icon: Calendar, label: 'Calendar' },
    { path: '/gantt', icon: BarChart3, label: 'Gantt' },
  ];

  const isActive = (path) => location.pathname === path;

  // Check if user is admin or manager
  const isAdminOrManager = user && (user.role === 'admin' || user.role === 'manager');

  return (
    <header className="bg-white border-b border-gray-200 px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between">
        {/* Left Section */}
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-900">FlowTask</h1>

          {/* Department and Team Selectors */}
          <div className="flex items-center gap-2">
            {departments.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowDepartmentSelector(!showDepartmentSelector)}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
                >
                  <Users size={16} />
                  {currentDepartment?.name || 'Select Dept'}
                </button>
                {showDepartmentSelector && (
                  <div className="absolute top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                    {departments.map(dept => (
                      <button
                        key={dept._id}
                        onClick={() => {
                          setCurrentDepartment(dept);
                          setShowDepartmentSelector(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                      >
                        {dept.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {teams.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowTeamSelector(!showTeamSelector)}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
                >
                  <Users size={16} />
                  {currentTeam?.name || 'Select Team'}
                </button>
                {showTeamSelector && (
                  <div className="absolute top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                    {teams.map(team => (
                      <button
                        key={team._id}
                        onClick={() => {
                          setCurrentTeam(team);
                          setShowTeamSelector(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                      >
                        {team.name}
                      </button>
                    ))}
                    {isAdminOrManager && (
                      <div className="border-t border-gray-200">
                        <button
                          onClick={() => navigate('/team-management')}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm text-blue-600"
                        >
                          Manage Teams
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1">
            {navItems.map(({ path, icon: Icon, label }) => (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive(path)
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </nav>
        </div>

        {/* Center Section - Search */}
        <div className="flex-1 max-w-md mx-4">
          <form onSubmit={handleSearch} className="relative">
            <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </form>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2">
          {/* Dashboard Button */}
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
          >
            <BarChart3 size={16} />
            Dashboard
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>
            {showNotifications && (
              <div className="absolute right-0 top-full mt-1 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
                <div className="p-3 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-900">Notifications</h3>
                </div>
                {notifications.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 text-sm">
                    No notifications
                  </div>
                ) : (
                  notifications.slice(0, 5).map(notification => (
                    <div key={notification._id} className="p-3 border-b border-gray-100 hover:bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div className="flex-1 cursor-pointer" onClick={() => handleNotificationClick(notification)}>
                          <p className="text-sm text-gray-900">{notification.message}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(notification.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex gap-1 ml-2">
                          {!notification.isRead && (
                            <button
                              onClick={() => markAsRead(notification._id)}
                              className="text-xs text-blue-600 hover:text-blue-800"
                            >
                              Mark read
                            </button>
                          )}
                          <button
                            onClick={() => deleteNotification(notification._id)}
                            className="text-xs text-red-600 hover:text-red-800"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
                {notifications.length > 5 && (
                  <div className="p-3 text-center">
                    <button className="text-sm text-blue-600 hover:text-blue-800">
                      View all notifications
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* User Menu */}
          <div className="relative">
            <button className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
              <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-semibold">
                {user?.name?.[0]?.toUpperCase() || 'U'}
              </div>
              <span className="text-sm font-medium">{user?.name || 'User'}</span>
            </button>
            {/* User dropdown menu would go here */}
          </div>

          {/* Settings */}
          <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <Settings size={18} />
          </button>

          {/* Logout */}
          <button
            onClick={logout}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Logout"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* User Verification Modal */}
      {verificationModal && (
        <UserVerificationModal
          notification={verificationModal}
          onClose={closeVerificationModal}
          onAction={handleVerificationAction}
        />
      )}
    </header>
  );
};

export default Header;
