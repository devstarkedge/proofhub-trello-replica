import React, { createContext, useState, useEffect, useContext } from 'react';
import { toast } from 'react-toastify';
import AuthContext from './AuthContext';
import Database from '../services/database';
import socketService from '../services/socket';
import { Bell } from 'lucide-react';
import api from '../services/api';

const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
  const { user } = useContext(AuthContext);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [verificationModal, setVerificationModal] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);

  useEffect(() => {
    if (user) {
      loadNotifications();
      setupRealtimeListeners();
      checkPushSupport();
    }

    return () => {
      cleanupListeners();
    };
  }, [user]);

  const loadNotifications = async () => {
    try {
      const response = await Database.getNotifications();
      const notificationData = response.data || response || [];
      // Deduplicate notifications by _id
      const uniqueNotifications = notificationData.filter((notification, index, self) =>
        index === self.findIndex(n => n._id === notification._id)
      );
      setNotifications(uniqueNotifications);
      const unread = uniqueNotifications.filter(n => !n.isRead).length;
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
    // Add to list, avoiding duplicates
    setNotifications(prev => {
      // Check if notification already exists by _id
      const exists = prev.some(n => n._id === notification._id);
      if (exists) {
        return prev;
      }
      // Increment unread count for new notifications
      setUnreadCount(count => count + 1);
      return [notification, ...prev];
    });

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
    if (notification.type === 'user_registered' && (user?.role === 'admin' || user?.role === 'manager')) {
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

  const checkPushSupport = () => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setPushSupported(true);
      // Check if already subscribed
      navigator.serviceWorker.ready.then(registration => {
        registration.pushManager.getSubscription().then(subscription => {
          setPushEnabled(!!subscription);
        });
      });
    }
  };

  const enablePushNotifications = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const response = await api.get('/api/users/push-key');
      const vapidKey = response.data.vapidPublicKey;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey
      });

      // Send subscription to backend
      await api.post('/api/users/push-subscription', { subscription });
      setPushEnabled(true);
      toast.success('Push notifications enabled');
    } catch (error) {
      console.error('Error enabling push notifications:', error);
      toast.error('Failed to enable push notifications');
    }
  };

  const disablePushNotifications = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        await api.delete('/api/users/push-subscription');
        setPushEnabled(false);
        toast.success('Push notifications disabled');
      }
    } catch (error) {
      console.error('Error disabling push notifications:', error);
      toast.error('Failed to disable push notifications');
    }
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
        pushSupported,
        pushEnabled,
        enablePushNotifications,
        disablePushNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export default NotificationContext;