import React, { createContext, useState, useEffect, useContext, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import AuthContext from './AuthContext';
import Database from '../services/database';
import socketService from '../services/socket';
import { Bell } from 'lucide-react';
import api from '../services/api';

const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
  const { user } = useContext(AuthContext);
  
  // Core state
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState('all');
  
  // Archived notifications state
  const [archivedNotifications, setArchivedNotifications] = useState([]);
  const [isLoadingArchived, setIsLoadingArchived] = useState(false);
  const [hasMoreArchived, setHasMoreArchived] = useState(true);
  const archivedSkipRef = useRef(0);
  
  // UI state
  const [verificationModal, setVerificationModal] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  
  // Pagination state
  const skipRef = useRef(0);
  const LIMIT = 20;
  
  // Offline queue for sync
  const pendingActionsRef = useRef([]);
  
  // Background refresh interval
  const refreshIntervalRef = useRef(null);

  // Initialize on user login - load notifications and setup background refresh
  // Note: Real-time socket listeners are handled in a separate useEffect below
  useEffect(() => {
    if (user) {
      loadNotifications(true);
      checkPushSupport();
      startBackgroundRefresh();
    }

    return () => {
      stopBackgroundRefresh();
    };
  }, [user]);

  // Load notifications with pagination
  // filterOverride allows passing the new filter value directly to avoid stale closure issues
  const loadNotifications = async (reset = false, filterOverride = null) => {
    if (isLoading) return;
    
    try {
      setIsLoading(true);
      
      if (reset) {
        skipRef.current = 0;
        setNotifications([]);
      }
      
      // Use filterOverride if provided, otherwise use current filter state
      const activeFilter = filterOverride !== null ? filterOverride : filter;
      
      const params = {
        limit: LIMIT,
        skip: skipRef.current,
        filter: activeFilter
      };
      
      const response = await Database.getNotifications(params);
      const { notifications: newNotifications, pagination, unreadCount: count } = response;
      
      setNotifications(prev => reset ? newNotifications : [...prev, ...newNotifications]);
      setUnreadCount(count);
      setHasMore(pagination.hasMore);
      skipRef.current = skipRef.current + newNotifications.length;
      
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Load more for infinite scroll
  const loadMore = useCallback(() => {
    if (hasMore && !isLoading) {
      loadNotifications(false);
    }
  }, [hasMore, isLoading]);

  // Stable handler for new notifications via socket - uses functional updates so no deps needed
  const handleNewNotification = useCallback((event) => {
    const notification = event.detail;
    if (!notification) return;
    
    console.log('[NotificationContext] Received socket notification:', notification?.title || notification?.type);
    
    // Use functional update to avoid stale state
    setNotifications(prev => {
      // Check for duplicates
      const exists = prev.some(n => n._id === notification._id);
      if (exists) return prev;
      return [notification, ...prev];
    });
    
    // Update unread count
    setUnreadCount(prev => prev + 1);
    
    // Show toast (can safely call as it just triggers a toast)
    showToast(notification);
  }, []);

  // Stable handler for task assigned events
  const handleTaskAssigned = useCallback((event) => {
    const data = event.detail;
    if (!data) return;
    
    const notification = {
      _id: data._id || Date.now().toString(),
      type: 'task_assigned',
      title: 'New Task Assigned',
      message: data.message || 'You have been assigned to a new task',
      createdAt: new Date().toISOString(),
      isRead: false,
      priority: 'medium',
      ...data
    };
    
    setNotifications(prev => {
      const exists = prev.some(n => n._id === notification._id);
      if (exists) return prev;
      return [notification, ...prev];
    });
    setUnreadCount(prev => prev + 1);
    showToast(notification);
  }, []);

  // Handle reconnection - sync missed notifications
  const handleReconnect = useCallback(async () => {
    console.log('[NotificationContext] Socket reconnected, syncing notifications...');
    // Reload notifications on reconnect to get any missed ones
    try {
      skipRef.current = 0;
      const response = await Database.getNotifications({ limit: LIMIT, skip: 0 });
      const { notifications: newNotifications, pagination, unreadCount: count } = response;
      setNotifications(newNotifications);
      setUnreadCount(count);
      setHasMore(pagination.hasMore);
      skipRef.current = newNotifications.length;
    } catch (error) {
      console.error('[NotificationContext] Error syncing on reconnect:', error);
    }
  }, []);

  // Setup real-time listeners - stable references ensure listeners work across re-renders
  useEffect(() => {
    if (!user) return;

    console.log('[NotificationContext] Setting up real-time listeners for user:', user._id);
    
    // Add listeners
    window.addEventListener('socket-notification', handleNewNotification);
    window.addEventListener('socket-task-assigned', handleTaskAssigned);
    window.addEventListener('socket-connected', handleReconnect);

    return () => {
      console.log('[NotificationContext] Cleaning up real-time listeners');
      window.removeEventListener('socket-notification', handleNewNotification);
      window.removeEventListener('socket-task-assigned', handleTaskAssigned);
      window.removeEventListener('socket-connected', handleReconnect);
    };
  }, [user, handleNewNotification, handleTaskAssigned, handleReconnect]);

  // Process queued actions when back online
  const processPendingActions = async () => {
    const actions = [...pendingActionsRef.current];
    pendingActionsRef.current = [];
    
    for (const action of actions) {
      try {
        await action();
      } catch (error) {
        console.error('Error processing pending action:', error);
      }
    }
  };

  // Add new notification to list
  const addNotification = (notification) => {
    setNotifications(prev => {
      // Check for duplicates
      const exists = prev.some(n => n._id === notification._id);
      if (exists) return prev;
      
      setUnreadCount(count => count + 1);
      return [notification, ...prev];
    });

    showToast(notification);
  };

  // Show toast for new notification
  const showToast = (notification) => {
    const toastContent = (
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${
          notification.priority === 'critical' ? 'from-red-500 to-rose-600' :
          notification.priority === 'high' ? 'from-orange-500 to-amber-600' :
          'from-blue-500 to-purple-600'
        } flex items-center justify-center flex-shrink-0`}>
          <Bell size={18} className="text-white" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-gray-900 text-sm mb-1">
            {notification.title || 'New Notification'}
          </p>
          <p className="text-gray-600 text-xs line-clamp-2">
            {notification.message}
          </p>
        </div>
      </div>
    );

    toast.info(toastContent, {
      position: 'top-right',
      autoClose: notification.priority === 'critical' ? 10000 : 5000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      className: 'bg-white shadow-lg rounded-lg border border-gray-200',
      bodyClassName: 'p-0',
      style: { padding: '12px' }
    });
  };

  // Mark single notification as read (optimistic update)
  const markAsRead = async (notificationId) => {
    // Optimistic update
    setNotifications(prev =>
      prev.map(n =>
        n._id === notificationId ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
      )
    );
    setUnreadCount(prev => Math.max(0, prev - 1));

    try {
      await Database.markNotificationAsRead(notificationId);
    } catch (error) {
      console.error('Error marking notification as read:', error);
      // Rollback on failure
      setNotifications(prev =>
        prev.map(n =>
          n._id === notificationId ? { ...n, isRead: false, readAt: null } : n
        )
      );
      setUnreadCount(prev => prev + 1);
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    const previousNotifications = [...notifications];
    const previousCount = unreadCount;

    // Optimistic update
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true, readAt: new Date().toISOString() })));
    setUnreadCount(0);

    try {
      await Database.markAllNotificationsAsRead();
      toast.success('All notifications marked as read');
    } catch (error) {
      console.error('Error marking all as read:', error);
      // Rollback
      setNotifications(previousNotifications);
      setUnreadCount(previousCount);
      toast.error('Failed to mark all as read');
    }
  };

  // Archive notification (optimistic)
  const archiveNotification = async (notificationId) => {
    const notification = notifications.find(n => n._id === notificationId);
    
    // Optimistic update - remove from active list
    setNotifications(prev => prev.filter(n => n._id !== notificationId));
    if (notification && !notification.isRead) {
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    
    // Optimistic update - add to archived list with archived metadata
    if (notification) {
      const archivedItem = {
        ...notification,
        isArchived: true,
        archivedAt: new Date().toISOString()
      };
      setArchivedNotifications(prev => [archivedItem, ...prev]);
    }

    try {
      await Database.archiveNotification(notificationId);
    } catch (error) {
      console.error('Error archiving notification:', error);
      // Rollback - add back to active list
      if (notification) {
        setNotifications(prev => [notification, ...prev].sort((a, b) => 
          new Date(b.createdAt) - new Date(a.createdAt)
        ));
        if (!notification.isRead) {
          setUnreadCount(prev => prev + 1);
        }
        // Rollback - remove from archived list
        setArchivedNotifications(prev => prev.filter(n => n._id !== notificationId));
      }
      toast.error('Failed to archive notification');
    }
  };

  // Delete notification
  const deleteNotification = async (notificationId) => {
    const notification = notifications.find(n => n._id === notificationId);
    
    // Optimistic update
    setNotifications(prev => prev.filter(n => n._id !== notificationId));
    if (notification && !notification.isRead) {
      setUnreadCount(prev => Math.max(0, prev - 1));
    }

    try {
      await Database.deleteNotification(notificationId);
      toast.success('Notification deleted');
    } catch (error) {
      console.error('Error deleting notification:', error);
      // Rollback
      if (notification) {
        setNotifications(prev => [notification, ...prev].sort((a, b) => 
          new Date(b.createdAt) - new Date(a.createdAt)
        ));
        if (!notification.isRead) {
          setUnreadCount(prev => prev + 1);
        }
      }
      toast.error('Failed to delete notification');
    }
  };

  // Clear all notifications
  const clearAll = async () => {
    const previousNotifications = [...notifications];
    const previousCount = unreadCount;

    // Optimistic update
    setNotifications([]);
    setUnreadCount(0);

    try {
      await Database.clearAllNotifications();
      toast.success('All notifications cleared');
    } catch (error) {
      console.error('Error clearing notifications:', error);
      // Rollback
      setNotifications(previousNotifications);
      setUnreadCount(previousCount);
      toast.error('Failed to clear notifications');
    }
  };

  // Load archived notifications
  const loadArchivedNotifications = async (reset = false) => {
    if (isLoadingArchived) return;
    
    try {
      setIsLoadingArchived(true);
      
      if (reset) {
        archivedSkipRef.current = 0;
        setArchivedNotifications([]);
      }
      
      const params = {
        limit: 20,
        skip: archivedSkipRef.current
      };
      
      const response = await Database.getArchivedNotifications(params);
      const { notifications: archivedItems, pagination } = response;
      
      setArchivedNotifications(prev => reset ? archivedItems : [...prev, ...archivedItems]);
      setHasMoreArchived(pagination.hasMore);
      archivedSkipRef.current = archivedSkipRef.current + archivedItems.length;
      
    } catch (error) {
      console.error('Error loading archived notifications:', error);
    } finally {
      setIsLoadingArchived(false);
    }
  };

  // Restore notification from archive
  const restoreNotification = async (notificationId) => {
    const notification = archivedNotifications.find(n => n._id === notificationId);
    
    // Optimistic update - remove from archived
    setArchivedNotifications(prev => prev.filter(n => n._id !== notificationId));

    try {
      const response = await Database.restoreNotification(notificationId);
      // Add to active notifications
      if (response.notification) {
        setNotifications(prev => [response.notification, ...prev].sort((a, b) => 
          new Date(b.createdAt) - new Date(a.createdAt)
        ));
        if (!response.notification.isRead) {
          setUnreadCount(prev => prev + 1);
        }
      }
      toast.success('Notification restored');
    } catch (error) {
      console.error('Error restoring notification:', error);
      // Rollback
      if (notification) {
        setArchivedNotifications(prev => [notification, ...prev].sort((a, b) => 
          new Date(b.archivedAt) - new Date(a.archivedAt)
        ));
      }
      toast.error('Failed to restore notification');
    }
  };

  // Delete notification permanently
  const deletePermanently = async (notificationId) => {
    const notification = archivedNotifications.find(n => n._id === notificationId);
    
    // Optimistic update
    setArchivedNotifications(prev => prev.filter(n => n._id !== notificationId));

    try {
      await Database.deleteNotification(notificationId);
      toast.success('Notification permanently deleted');
    } catch (error) {
      console.error('Error deleting notification:', error);
      // Rollback
      if (notification) {
        setArchivedNotifications(prev => [notification, ...prev].sort((a, b) => 
          new Date(b.archivedAt) - new Date(a.archivedAt)
        ));
      }
      toast.error('Failed to delete notification');
    }
  };

  // Filter change handler
  // Pass newFilter directly to loadNotifications to avoid stale state from async setFilter
  const handleFilterChange = (newFilter) => {
    setFilter(newFilter);
    skipRef.current = 0;
    loadNotifications(true, newFilter);  // Pass filter explicitly to avoid closure stale state
  };

  // Toggle panel
  const togglePanel = () => {
    setIsOpen(prev => !prev);
  };

  // Handle notification click
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

  // Handle verification action
  const handleVerificationAction = async (action, userData) => {
    try {
      if (action === 'verify') {
        await Database.verifyUser(userData.userId, userData.role, userData.department);
        toast.success('User verified successfully');
      } else if (action === 'decline') {
        await Database.declineUser(userData.userId);
        toast.success('User declined');
      }

      setNotifications(prev => prev.filter(n => n._id !== verificationModal._id));
      setUnreadCount(prev => Math.max(0, prev - 1));
      setVerificationModal(null);
      loadNotifications(true);
    } catch (error) {
      console.error('Error handling verification action:', error);
      toast.error('Failed to process verification');
    }
  };

  const closeVerificationModal = () => {
    setVerificationModal(null);
  };

  // Background refresh
  const startBackgroundRefresh = () => {
    refreshIntervalRef.current = setInterval(() => {
      loadNotifications(true);
    }, 5 * 60 * 1000); // 5 minutes
  };

  const stopBackgroundRefresh = () => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
    }
  };

  // Push notification support
  const checkPushSupport = () => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setPushSupported(true);
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
        // State
        notifications,
        unreadCount,
        isLoading,
        hasMore,
        filter,
        isOpen,
        
        // Archived state
        archivedNotifications,
        isLoadingArchived,
        hasMoreArchived,
        
        // Actions
        loadNotifications,
        loadMore,
        markAsRead,
        markAllAsRead,
        archiveNotification,
        deleteNotification,
        clearAll,
        handleFilterChange,
        togglePanel,
        handleNotificationClick,
        
        // Archived actions
        loadArchivedNotifications,
        restoreNotification,
        deletePermanently,
        
        // Verification
        verificationModal,
        handleVerificationAction,
        closeVerificationModal,
        
        // Push notifications
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