import React, { createContext, useState, useEffect, useContext } from 'react';
import { toast } from 'react-toastify';
import AuthContext from './AuthContext';
import Database from '../services/database';
import socketService from '../services/socket';
import { Bell } from 'lucide-react';

const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
  const { user } = useContext(AuthContext);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [verificationModal, setVerificationModal] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (user) {
      loadNotifications();
      setupRealtimeListeners();
    }

    return () => {
      cleanupListeners();
    };
  }, [user]);

  const loadNotifications = async () => {
    try {
      const response = await Database.getNotifications();
      const notificationData = response.data || response || [];
      setNotifications(notificationData);
      const unread = notificationData.filter(n => !n.isRead).length;
      setUnreadCount(unread);
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };

  const setupRealtimeListeners = () => {
    // Listen for socket notifications
    window.addEventListener('socket-notification', handleNewNotification);
    window.addEventListener('socket-task-assigned', handleTaskAssigned);
  };

  const cleanupListeners = () => {
    window.removeEventListener('socket-notification', handleNewNotification);
    window.removeEventListener('socket-task-assigned', handleTaskAssigned);
  };

  const handleNewNotification = (event) => {
    const notification = event.detail;
    addNotification(notification);
  };

  const handleTaskAssigned = (event) => {
    const data = event.detail;
    const notification = {
      _id: Date.now().toString(),
      type: 'task_assigned',
      title: 'New Task Assigned',
      message: data.message || 'You have been assigned to a new task',
      createdAt: new Date().toISOString(),
      isRead: false,
      ...data
    };
    addNotification(notification);
  };

  const addNotification = (notification) => {
    // Add to list
    setNotifications(prev => [notification, ...prev]);
    setUnreadCount(prev => prev + 1);

    // Show toast notification
    showToast(notification);
  };

  const showToast = (notification) => {
    const toastContent = (
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
          <Bell size={18} className="text-white" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-gray-900 text-sm mb-1">
            {notification.title || 'New Notification'}
          </p>
          <p className="text-gray-600 text-xs">
            {notification.message}
          </p>
        </div>
      </div>
    );

    toast.info(toastContent, {
      position: 'top-right',
      autoClose: 5000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      className: 'bg-white shadow-lg rounded-lg border border-gray-200',
      bodyClassName: 'p-0',
      style: { padding: '12px' }
    });
  };

  const markAsRead = async (notificationId) => {
    try {
      await Database.markNotificationAsRead(notificationId);
      setNotifications(prev =>
        prev.map(n =>
          n._id === notificationId ? { ...n, isRead: true } : n
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const unreadNotifications = notifications.filter(n => !n.isRead);
      await Promise.all(
        unreadNotifications.map(n => Database.markNotificationAsRead(n._id))
      );
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
      toast.success('All notifications marked as read');
    } catch (error) {
      console.error('Error marking all as read:', error);
      toast.error('Failed to mark all as read');
    }
  };

  const deleteNotification = async (notificationId) => {
    try {
      await Database.deleteNotification(notificationId);
      const deleted = notifications.find(n => n._id === notificationId);
      setNotifications(prev => prev.filter(n => n._id !== notificationId));
      if (deleted && !deleted.isRead) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
      toast.success('Notification deleted');
    } catch (error) {
      console.error('Error deleting notification:', error);
      toast.error('Failed to delete notification');
    }
  };

  const clearAll = async () => {
    try {
      await Promise.all(notifications.map(n => Database.deleteNotification(n._id)));
      setNotifications([]);
      setUnreadCount(0);
      toast.success('All notifications cleared');
    } catch (error) {
      console.error('Error clearing notifications:', error);
      toast.error('Failed to clear notifications');
    }
  };

  const togglePanel = () => {
    setIsOpen(prev => !prev);
  };

  const handleNotificationClick = (notification) => {
    if (notification.type === 'user_registered' && user?.role === 'admin') {
      setVerificationModal(notification);
      markAsRead(notification._id);
    } else {
      if (!notification.isRead) {
        markAsRead(notification._id);
      }
    }
  };

  const handleVerificationAction = async (action, userData) => {
    try {
      if (action === 'verify') {
        await Database.verifyUser(userData.userId, userData.role, userData.department);
        toast.success('User verified successfully');
      } else if (action === 'decline') {
        await Database.declineUser(userData.userId);
        toast.success('User declined');
      }

      // Remove notification
      setNotifications(prev => prev.filter(n => n._id !== verificationModal._id));
      setUnreadCount(prev => Math.max(0, prev - 1));
      setVerificationModal(null);

      // Reload notifications
      loadNotifications();
    } catch (error) {
      console.error('Error handling verification action:', error);
      toast.error('Failed to process verification');
    }
  };

  const closeVerificationModal = () => {
    setVerificationModal(null);
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isOpen,
        togglePanel,
        loadNotifications,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAll,
        handleNotificationClick,
        verificationModal,
        handleVerificationAction,
        closeVerificationModal,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export default NotificationContext;