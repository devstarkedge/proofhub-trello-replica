import React, { createContext, useState, useEffect, useCallback, useRef } from 'react';

// Create context
export const NetworkStatusContext = createContext({
  isOnline: true,
  lastOfflineTime: null,
  lastOnlineTime: null,
});

export const NetworkStatusProvider = ({ children }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastOfflineTime, setLastOfflineTime] = useState(null);
  const [lastOnlineTime, setLastOnlineTime] = useState(null);
  const [showOfflineToast, setShowOfflineToast] = useState(false);
  const [showOnlineToast, setShowOnlineToast] = useState(false);
  const onlineToastTimeoutRef = useRef(null);

  const handleOnline = useCallback(() => {
    setIsOnline(true);
    setLastOnlineTime(new Date());
    setShowOfflineToast(false);
    setShowOnlineToast(true);
    
    // Auto-hide online toast after 5 seconds
    if (onlineToastTimeoutRef.current) {
      clearTimeout(onlineToastTimeoutRef.current);
    }
    onlineToastTimeoutRef.current = setTimeout(() => {
      setShowOnlineToast(false);
    }, 5000);
  }, []);

  const handleOffline = useCallback(() => {
    setIsOnline(false);
    setLastOfflineTime(new Date());
    setShowOnlineToast(false);
    setShowOfflineToast(true);
    
    // Clear any pending online toast timeout
    if (onlineToastTimeoutRef.current) {
      clearTimeout(onlineToastTimeoutRef.current);
    }
  }, []);

  const dismissOfflineToast = useCallback(() => {
    setShowOfflineToast(false);
  }, []);

  const dismissOnlineToast = useCallback(() => {
    setShowOnlineToast(false);
    if (onlineToastTimeoutRef.current) {
      clearTimeout(onlineToastTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check initial state
    if (!navigator.onLine) {
      handleOffline();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (onlineToastTimeoutRef.current) {
        clearTimeout(onlineToastTimeoutRef.current);
      }
    };
  }, [handleOnline, handleOffline]);

  const value = {
    isOnline,
    isOffline: !isOnline,
    lastOfflineTime,
    lastOnlineTime,
    showOfflineToast,
    showOnlineToast,
    dismissOfflineToast,
    dismissOnlineToast,
  };

  return (
    <NetworkStatusContext.Provider value={value}>
      {children}
    </NetworkStatusContext.Provider>
  );
};

export default NetworkStatusContext;
