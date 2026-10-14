import React, { createContext, useState, useEffect, useContext, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import WorkspaceContext from './WorkspaceContext';
import { notificationBelongsTo, notificationMatches, mergeNotifications } from '../utils/notificationState';
import AuthContext from './AuthContext';
import Database from '../services/database';
import { Bell } from 'lucide-react';
import api from '../services/api';
import { resolveNotificationRoute } from '../utils/notificationRouteResolver';

const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
  const { user, setUser } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const { currentWorkspace } = useContext(WorkspaceContext);
  const userId = user?._id || user?.id;
  const workspaceId = currentWorkspace?._id;
  const scope = String(userId || '') + ':' + String(workspaceId || '');
  const scopeRef = useRef(scope); scopeRef.current = scope;
  const seenRef = useRef(new Set());
  const syncTimerRef = useRef(null);
  const filterRef = useRef('all');
  const clickRef = useRef(null);
  const toastRef = useRef(null);
  const inboxRequestRef = useRef(0);
  const arrivalsRef = useRef(0);
  const liveRef = useRef(new Map());
  const countTimerRef = useRef(null);
  
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
  const [tabApprovalModal, setTabApprovalModal] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushPrompt, setPushPrompt] = useState({ isOpen: false, mode: 'default', isBusy: false });
  
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
    inboxRequestRef.current++;
    for (const id of seenRef.current) toast.dismiss(id);
    setNotifications([]); setArchivedNotifications([]); setUnreadCount(0);
    setIsOpen(false); setVerificationModal(null); setTabApprovalModal(null);
    seenRef.current.clear(); liveRef.current.clear(); pendingActionsRef.current = [];
    clearTimeout(countTimerRef.current);
    skipRef.current = 0; archivedSkipRef.current = 0;
    setIsLoading(false);
    setIsLoadingArchived(false);
    if (userId && workspaceId) {
      loadNotifications(true);
      checkPushSupport();
      startBackgroundRefresh();
      
      if (!window.flowtaskDesktop?.isDesktop) checkAndPromptPush();
    }

    return () => {
      stopBackgroundRefresh();
    };
  }, [userId, workspaceId]);

  // Load notifications with pagination
  // filterOverride allows passing the new filter value directly to avoid stale closure issues
  const loadNotifications = async (reset = false, filterOverride = null) => {
    if (!userId || !workspaceId || (!reset && isLoading)) return;
    const requestScope = scope;
    const requestId = ++inboxRequestRef.current;
    const arrival = arrivalsRef.current;
    
    try {
      setIsLoading(true);
      
      if (reset) {
        skipRef.current = 0;
      }
      
      // Use filterOverride if provided, otherwise use current filter state
      const activeFilter = filterOverride !== null ? filterOverride : filter;
      
      const params = {
        limit: LIMIT,
        skip: skipRef.current,
        filter: activeFilter
      };
      
      const response = await Database.getNotifications(params);
      if (scopeRef.current !== requestScope || inboxRequestRef.current !== requestId) return;
      const { notifications: newNotifications, pagination, unreadCount: count } = response;
      for (const item of newNotifications) seenRef.current.add(String(item._id));
      while (seenRef.current.size > 1000) seenRef.current.delete(seenRef.current.values().next().value);
      const duringRead = [...liveRef.current.values()].filter(item => item.sequence > arrival && notificationMatches(item.notification, activeFilter)).map(item => item.notification);
      setNotifications(prev => mergeNotifications(mergeNotifications(reset ? [] : prev, newNotifications), duringRead));
      setUnreadCount(count);
      setHasMore(pagination.hasMore);
      skipRef.current = (reset ? 0 : skipRef.current) + newNotifications.length;
      
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      if (scopeRef.current === requestScope && inboxRequestRef.current === requestId) setIsLoading(false);
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
    if (scopeRef.current !== scope) return;
    const notification = event.detail;
    if (!notificationBelongsTo(notification, userId, workspaceId)) return;
    const id = String(notification._id);
    if (seenRef.current.has(id)) return;
    seenRef.current.add(id);
    liveRef.current.set(id, { notification, sequence: ++arrivalsRef.current });
    if (liveRef.current.size > 500) liveRef.current.delete(liveRef.current.keys().next().value);
    if (seenRef.current.size > 1000) seenRef.current.delete(seenRef.current.values().next().value);
    if (notificationMatches(notification, filterRef.current)) {
      setNotifications(prev => mergeNotifications(prev, [notification]));
      skipRef.current++;
    }
    if (!notification.isRead && !notification.isArchived) setUnreadCount(prev => prev + 1);
    clearTimeout(countTimerRef.current);
    const sequence = arrivalsRef.current;
    countTimerRef.current = setTimeout(() => {
      Database.getUnreadCount().then(({ count }) => {
        if (scopeRef.current === scope && arrivalsRef.current === sequence) setUnreadCount(count);
      }).catch(() => {});
    }, 150);
    toastRef.current?.(notification);
  }, [userId, workspaceId, scope]);

  const handleReconnect = useCallback(() => {
    processPendingActions();
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      if (scopeRef.current === scope && userId && workspaceId) {
        loadNotifications(true, filterRef.current);
        if (archivedSkipRef.current > 0) loadArchivedNotifications(true);
      }
    }, 100);
  }, [scope, userId, workspaceId]);

  useEffect(() => {
    if (!userId || !workspaceId) return;
    const stateChanged = event => {
      if (notificationBelongsTo({ ...event.detail, user: event.detail?.recipientId }, userId, workspaceId)) handleReconnect();
    };
    const recovery = ['socket-connected', 'online', 'focus', 'desktop-resume'];
    window.addEventListener('socket-notification', handleNewNotification);
    window.addEventListener('socket-notification-state-changed', stateChanged);
    recovery.forEach(name => window.addEventListener(name, handleReconnect));
    return () => {
      clearTimeout(syncTimerRef.current);
      clearTimeout(countTimerRef.current);
      window.removeEventListener('socket-notification', handleNewNotification);
      window.removeEventListener('socket-notification-state-changed', stateChanged);
      recovery.forEach(name => window.removeEventListener(name, handleReconnect));
    };
  }, [userId, workspaceId, handleNewNotification, handleReconnect]);

  useEffect(() => { setIsOpen(false); }, [location.key, scope]);
  useEffect(() => {
    const desktop = window.flowtaskDesktop?.notifications;
    if (!desktop) return;
    desktop.setSession(userId && workspaceId ? { userId, workspaceId, enabled: user?.settings?.notifications?.push !== false } : null).catch(() => {});
    const openNotification = async id => {
      const requestScope = scope;
      try {
        await desktop.takePendingClick();
        const response = await api.get('/api/notifications/' + encodeURIComponent(id));
        if (scopeRef.current === requestScope) clickRef.current?.(response.data);
      } catch { if (scopeRef.current === requestScope) toast.info('This notification is no longer available in the current workspace.'); }
    };
    const remove = desktop.onClick(openNotification);
    desktop.takePendingClick().then(id => { if (id && scopeRef.current === scope) openNotification(id); });
    return () => { remove(); desktop.setSession(null).catch(() => {}); };
  }, [scope, user?.settings?.notifications?.push]);

  const addNotification = notification => handleNewNotification({ detail: notification });


  useEffect(() => {
    if (!user) return;
    try {
      const bc = new BroadcastChannel('push_notification_sync');
      bc.onmessage = async (event) => {
        if (event.data?.type === 'SYNC_PUSH') {
          checkPushSupport();
        }
      };
      return () => bc.close();
    } catch (e) {
      console.error('BroadcastChannel error:', e);
    }
  }, [user]);

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

  // Show toast for new notification
  const showToast = (notification) => {
    if (window.flowtaskDesktop?.notifications) {
      window.flowtaskDesktop.notifications.show({ id: String(notification._id), userId: String(userId), workspaceId: String(workspaceId), title: notification.title || 'FlowTask', body: notification.message || '' }).catch(() => {});
      if (!document.hasFocus()) return;
    }
    if (user?.settings?.notifications?.inApp === false) return;
    // sales_tab_approval has its own dedicated TabApprovalToast — skip generic toast.
    // sales_tab_alert has its own dedicated WatchAlertToast (driven by the
    // separate 'sales:tab:alert' socket event) — skip here too, otherwise a
    // tab with both In-app toast and Notification center channels selected
    // would show two different toasts for the same alert.
    if (notification.type === 'sales_tab_approval' || notification.type === 'sales_tab_alert') return;
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
          <p className="font-semibold text-sm mb-1" style={{color:"var(--color-text-primary)"}}>
            {notification.title || 'New Notification'}
          </p>
          <p className="text-xs line-clamp-2" style={{color:"var(--color-text-secondary)"}}>
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
      toastId: String(notification._id), onClick: () => handleNotificationClick(notification),
      className: 'shadow-lg rounded-lg border',
      bodyClassName: 'p-0',
      style: { padding: '12px', background: 'var(--color-card-bg)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' }
    });
  };

  toastRef.current = showToast;

  // Mark single notification as read (optimistic update)
  const markAsRead = async (notificationId) => {
    if (notifications.find(item => item._id === notificationId)?.isRead) return;
    const actionScope = scope;
    // Optimistic update
    setNotifications(prev =>
      prev.map(n =>
        n._id === notificationId ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
      )
    );
    setUnreadCount(prev => Math.max(0, prev - 1));

    try {
      await Database.markNotificationAsRead(notificationId);
      if (scopeRef.current !== actionScope) return;
    } catch (error) {
      if (scopeRef.current !== actionScope) return;
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
    const actionScope = scope;
    const previousNotifications = [...notifications];
    const previousCount = unreadCount;

    // Optimistic update
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true, readAt: new Date().toISOString() })));
    setUnreadCount(0);

    try {
      await Database.markAllNotificationsAsRead();
      if (scopeRef.current !== actionScope) return;
      toast.success('All notifications marked as read');
    } catch (error) {
      if (scopeRef.current !== actionScope) return;
      console.error('Error marking all as read:', error);
      // Rollback
      setNotifications(previousNotifications);
      setUnreadCount(previousCount);
      toast.error('Failed to mark all as read');
    }
  };

  // Archive notification (optimistic)
  const archiveNotification = async (notificationId) => {
    const actionScope = scope;
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
      if (scopeRef.current !== actionScope) return;
    } catch (error) {
      if (scopeRef.current !== actionScope) return;
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
    const actionScope = scope;
    const notification = notifications.find(n => n._id === notificationId);
    
    // Optimistic update
    setNotifications(prev => prev.filter(n => n._id !== notificationId));
    if (notification && !notification.isRead) {
      setUnreadCount(prev => Math.max(0, prev - 1));
    }

    try {
      await Database.deleteNotification(notificationId);
      if (scopeRef.current !== actionScope) return;
      toast.success('Notification deleted');
    } catch (error) {
      if (scopeRef.current !== actionScope) return;
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
    const actionScope = scope;
    const previousNotifications = [...notifications];
    const previousCount = unreadCount;

    // Optimistic update
    setNotifications([]);
    setUnreadCount(0);

    try {
      await Database.clearAllNotifications();
      if (scopeRef.current !== actionScope) return;
      toast.success('All notifications cleared');
    } catch (error) {
      if (scopeRef.current !== actionScope) return;
      console.error('Error clearing notifications:', error);
      // Rollback
      setNotifications(previousNotifications);
      setUnreadCount(previousCount);
      toast.error('Failed to clear notifications');
    }
  };

  // Load archived notifications
  const loadArchivedNotifications = async (reset = false) => {
    const actionScope = scope;
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
      if (scopeRef.current !== actionScope) return;
      const { notifications: archivedItems, pagination } = response;
      
      setArchivedNotifications(prev => reset ? archivedItems : [...prev, ...archivedItems]);
      setHasMoreArchived(pagination.hasMore);
      archivedSkipRef.current = archivedSkipRef.current + archivedItems.length;
      
    } catch (error) {
      if (scopeRef.current !== actionScope) return;
      console.error('Error loading archived notifications:', error);
    } finally {
      if (scopeRef.current === actionScope) setIsLoadingArchived(false);
    }
  };

  // Restore notification from archive
  const restoreNotification = async (notificationId) => {
    const actionScope = scope;
    const notification = archivedNotifications.find(n => n._id === notificationId);
    
    // Optimistic update - remove from archived
    setArchivedNotifications(prev => prev.filter(n => n._id !== notificationId));

    try {
      const response = await Database.restoreNotification(notificationId);
      if (scopeRef.current !== actionScope) return;
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
      if (scopeRef.current !== actionScope) return;
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
    const actionScope = scope;
    const notification = archivedNotifications.find(n => n._id === notificationId);
    
    // Optimistic update
    setArchivedNotifications(prev => prev.filter(n => n._id !== notificationId));

    try {
      await Database.deleteNotification(notificationId);
      if (scopeRef.current !== actionScope) return;
      toast.success('Notification permanently deleted');
    } catch (error) {
      if (scopeRef.current !== actionScope) return;
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
    filterRef.current = newFilter;
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
    if (scopeRef.current !== scope) return;
    setIsOpen(false);
    // Verification flow for admins/managers (special modal, no navigation)
    if (notification.type === 'user_registered' && (user?.role === 'admin' || user?.role === 'manager')) {
      setVerificationModal(notification);
      markAsRead(notification._id);
      return;
    }

    // Sales tab approval flow — open modal for admin to review/approve/ignore
    if (notification.type === 'sales_tab_approval' && user?.role === 'admin') {
      setTabApprovalModal(notification);
      if (!notification.isRead) markAsRead(notification._id);
      setIsOpen(false);
      return;
    }

    // Mark read optimistically
    if (!notification.isRead) markAsRead(notification._id);

    // Use central route resolver
    const resolved = resolveNotificationRoute(notification);

    // Special flows that don't navigate
    if (resolved.isSpecialFlow) {
      return;
    }

    // Show toast if resolver indicated a fallback message
    if (resolved.toastMessage) {
      toast.info(resolved.toastMessage, { autoClose: 3000 });
    }

    // Close the notification panel
    setIsOpen(false);

    // Navigate with optional state for highlighting / deep-linking
    if (resolved.route) {
      // For announcement routes with query params, parse properly
      if (resolved.route.includes('?')) {
        const [path, query] = resolved.route.split('?');
        const params = new URLSearchParams(query);
        navigate(`${path}?${params.toString()}`, {
          state: resolved.navigationState || undefined,
        });
      } else {
        navigate(resolved.route, {
          state: resolved.navigationState || undefined,
        });
      }
    } else {
      navigate(resolved.fallbackRoute || '/');
    }
  };

  clickRef.current = handleNotificationClick;

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
      const requestScope = scope;
      Database.getUnreadCount().then(({ count }) => { if (scopeRef.current === requestScope) setUnreadCount(count); }).catch(() => {});
    }, 5 * 60 * 1000); // 5 minutes
  };

  const stopBackgroundRefresh = () => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
    }
  };

  // Push notification support
  const checkPushSupport = () => {
    if (window.flowtaskDesktop?.notifications) { setPushSupported(true); setPushEnabled(user?.settings?.notifications?.push !== false); return; }
    if (!window.flowtaskDesktop?.isDesktop && 'serviceWorker' in navigator && 'PushManager' in window) {
      setPushSupported(true);
      navigator.serviceWorker.ready.then(registration => {
        registration.pushManager.getSubscription().then(subscription => {
          setPushEnabled(!!subscription && Notification.permission === 'granted');
        });
      });
    }
  };

  const checkAndPromptPush = async () => {
    if (window.flowtaskDesktop?.isDesktop) return;
    if (!('Notification' in window)) return;
    const dismissedThisSession = sessionStorage.getItem('push_modal_dismissed') === 'true';
    if (dismissedThisSession) return;
    
    const permission = Notification.permission;
    
    // Dynamically check subscription to avoid stale state closures
    let hasSubscription = false;
    if (!window.flowtaskDesktop?.isDesktop && 'serviceWorker' in navigator && 'PushManager' in window) {
      try {
        const registration = await navigator.serviceWorker.ready;
        if (registration) {
          const subscription = await registration.pushManager.getSubscription();
          hasSubscription = !!subscription;
        }
      } catch (e) {
        console.error('Failed to check push subscription:', e);
      }
    }

    // In FlowTask, login payload might not deeply populate user.settings.
    // If we have a local subscription AND permission is granted, assume they are enabled to avoid annoying them.
    const userPushEnabled = user?.settings?.notifications?.push;
    const isEffectivelyEnabled = (userPushEnabled !== false) && (hasSubscription && permission === 'granted');

    if (permission !== 'granted' || !isEffectivelyEnabled) {
      setPushPrompt({ isOpen: true, mode: permission === 'denied' ? 'blocked' : 'default', isBusy: false });
    }
  };

  const handlePushLater = () => {
    sessionStorage.setItem('push_modal_dismissed', 'true');
    setPushPrompt(prev => ({ ...prev, isOpen: false }));
  };

  const enablePushNotifications = async (silent = false) => {
    if (window.flowtaskDesktop?.notifications) {
      const notifications = { ...user.settings?.notifications, push: true };
      await api.put('/api/users/settings', { notifications });
      setUser(prev => ({ ...prev, settings: { ...prev.settings, notifications } }));
      setPushEnabled(true); return { success: true };
    }
    try {
      if (Notification.permission === 'denied') {
        setPushPrompt({ isOpen: true, mode: 'blocked', isBusy: false });
        return { success: false };
      }

      setPushPrompt(prev => ({ ...prev, isBusy: true }));
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        if (permission === 'denied') setPushPrompt({ isOpen: true, mode: 'blocked', isBusy: false });
        else setPushPrompt(prev => ({ ...prev, isOpen: false, isBusy: false }));
        return { success: false };
      }

      const registration = await navigator.serviceWorker.ready;
      const response = await api.get('/api/users/push-key');
      const vapidKey = response.data.vapidPublicKey;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey
      });

      await api.post('/api/users/push-subscription', { subscription });

      if (user) {
        const updatedNotifications = { ...(user.settings?.notifications || {}), push: true };
        await api.put('/api/users/settings', { notifications: updatedNotifications });
        setUser(prev => ({ ...prev, settings: { ...prev.settings, notifications: updatedNotifications } }));
      }

      setPushEnabled(true);
      
      if (!silent) toast.success('Push notifications enabled');
      setPushPrompt({ isOpen: false, mode: 'default', isBusy: false });
      sessionStorage.removeItem('push_modal_dismissed');

      try {
        const bc = new BroadcastChannel('push_notification_sync');
        bc.postMessage({ type: 'SYNC_PUSH' });
        bc.close();
      } catch {
        // ignore
      }
      return { success: true };
    } catch (error) {
      console.error('Error enabling push notifications:', error);
      if (!silent) toast.error('Failed to enable push notifications');
      setPushPrompt(prev => ({ ...prev, isBusy: false }));
      return { success: false };
    }
  };

  const disablePushNotifications = async () => {
    if (window.flowtaskDesktop?.notifications) {
      const notifications = { ...user.settings?.notifications, push: false };
      await api.put('/api/users/settings', { notifications });
      setUser(prev => ({ ...prev, settings: { ...prev.settings, notifications } }));
      setPushEnabled(false); return;
    }
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
        addNotification,
        closePanel: () => setIsOpen(false),
        handleNotificationClick,
        
        // Archived actions
        loadArchivedNotifications,
        restoreNotification,
        deletePermanently,
        
        // Verification
        verificationModal,
        handleVerificationAction,
        closeVerificationModal,

        // Sales tab approval modal
        tabApprovalModal,
        closeTabApprovalModal: () => setTabApprovalModal(null),
        openTabApprovalModal: (data) => setTabApprovalModal(data),
        
        // Push notifications
        pushSupported,
        pushEnabled,
        enablePushNotifications,
        disablePushNotifications,
        pushPrompt: {
          ...pushPrompt,
          onEnable: () => enablePushNotifications(false),
          onLater: handlePushLater
        },
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export default NotificationContext;
