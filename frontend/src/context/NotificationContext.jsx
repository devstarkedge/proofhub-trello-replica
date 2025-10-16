import React, { createContext, useState, useEffect, useContext } from 'react';
import AuthContext from './AuthContext';
import Database from '../services/database';
import socketService from '../services/socket';

const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
  const { user } = useContext(AuthContext);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [verificationModal, setVerificationModal] = useState(null);

  useEffect(() => {
    if (user) {
      loadNotifications();
      socketService.connect(user.id);

      // Listen for real-time notifications
      const handleSocketNotification = (event) => {
        const newNotification = event.detail;
        setNotifications(prev => [newNotification, ...prev]);
        if (!newNotification.isRead) {
          setUnreadCount(prev => prev + 1);
        }
      };

      window.addEventListener('socket-notification', handleSocketNotification);

      return () => {
        window.removeEventListener('socket-notification', handleSocketNotification);
        socketService.disconnect();
      };
    }
  }, [user]);

  const loadNotifications = async () => {
    try {
      const userNotifications = await Database.getNotifications();
      setNotifications(userNotifications);
      setUnreadCount(userNotifications.filter(n => !n.isRead).length);
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };

  const markAsRead = async (id) => {
    try {
      await Database.markNotificationAsRead(id);
      setNotifications(prev =>
        prev.map(n => n._id === id ? { ...n, isRead: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const deleteNotification = async (id) => {
    try {
      await Database.deleteNotification(id);
      const wasUnread = notifications.find(n => n._id === id)?.isRead === false;
      setNotifications(prev => prev.filter(n => n._id !== id));
      if (wasUnread) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const handleNotificationClick = (notification) => {
    if (notification.type === 'user_registered' && user?.role === 'admin') {
      setVerificationModal(notification);
      markAsRead(notification._id);
    }
  };

  const handleVerificationAction = async (action, userData) => {
    try {
      if (action === 'verify') {
        await Database.verifyUser(userData.userId, userData.role, userData.department);
      } else if (action === 'decline') {
        await Database.declineUser(userData.userId);
      }

      // Remove the notification after action
      setNotifications(prev => prev.filter(n => n._id !== verificationModal._id));
      setUnreadCount(prev => Math.max(0, prev - 1));
      setVerificationModal(null);

      // Reload notifications to get updated list
      loadNotifications();
    } catch (error) {
      console.error('Error handling verification action:', error);
    }
  };

  const closeVerificationModal = () => {
    setVerificationModal(null);
  };

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      loadNotifications,
      markAsRead,
      deleteNotification,
      handleNotificationClick,
      verificationModal,
      handleVerificationAction,
      closeVerificationModal
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

export default NotificationContext;
