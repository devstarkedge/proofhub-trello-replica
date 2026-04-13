import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, Eye, Volume2, VolumeX } from 'lucide-react';
import useSalesStore from '../../store/salesStore';

const ALERT_SOUND_KEY = 'flowtask_sales_alert_sound';
const AUTO_DISMISS_MS = 10000;

/**
 * Generates a short notification beep using Web Audio API.
 */
const playAlertSound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (err) {
    // Silently fail if audio context isn't available
  }
};

const WatchAlertToast = () => {
  const { activateTab, savedTabs } = useSalesStore();
  const [alerts, setAlerts] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem(ALERT_SOUND_KEY) !== 'false'; } catch { return true; }
  });
  const timerRefs = useRef({});

  // Toggle sound preference
  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem(ALERT_SOUND_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  // Listen for watch tab alerts
  useEffect(() => {
    const handler = (e) => {
      const data = e.detail;
      if (!data) return;

      const alertObj = {
        id: `${data.tabId}-${Date.now()}`,
        tabId: data.tabId,
        tabName: data.tabName || 'Watch Tab',
        message: data.message || 'New matching record',
        ruleType: data.ruleType,
        timestamp: Date.now(),
      };

      setAlerts((prev) => {
        // Limit to 5 visible toasts
        const next = [alertObj, ...prev].slice(0, 5);
        return next;
      });

      if (soundEnabled) playAlertSound();
    };

    window.addEventListener('socket-sales-tab-alert', handler);
    return () => window.removeEventListener('socket-sales-tab-alert', handler);
  }, [soundEnabled]);

  // Auto-dismiss timers
  useEffect(() => {
    alerts.forEach((a) => {
      if (!timerRefs.current[a.id]) {
        timerRefs.current[a.id] = setTimeout(() => {
          setAlerts((prev) => prev.filter((x) => x.id !== a.id));
          delete timerRefs.current[a.id];
        }, AUTO_DISMISS_MS);
      }
    });

    return () => {
      Object.values(timerRefs.current).forEach(clearTimeout);
    };
  }, [alerts]);

  const dismiss = (id) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    if (timerRefs.current[id]) {
      clearTimeout(timerRefs.current[id]);
      delete timerRefs.current[id];
    }
  };

  const navigateToTab = (tabId) => {
    const tab = savedTabs.find((t) => t._id === tabId);
    if (tab) activateTab(tab);
  };

  if (alerts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col-reverse gap-2 max-w-sm">
      {/* Sound toggle */}
      <div className="flex justify-end mb-1">
        <button
          onClick={toggleSound}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm transition-colors"
          title={soundEnabled ? 'Mute alert sounds' : 'Enable alert sounds'}
        >
          {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
        </button>
      </div>

      <AnimatePresence>
        {alerts.map((alert) => (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            layout
            className="bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-700/50 rounded-xl shadow-lg shadow-amber-500/10 p-3.5 cursor-pointer hover:border-amber-300 dark:hover:border-amber-600 transition-colors"
            onClick={() => { navigateToTab(alert.tabId); dismiss(alert.id); }}
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center animate-pulse">
                <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                    Watch Alert
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5 truncate">
                  {alert.tabName}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                  {alert.message}
                </p>
                <p className="text-[10px] text-blue-500 mt-1 flex items-center gap-1">
                  <Eye className="w-3 h-3" /> Click to view
                </p>
              </div>

              <button
                onClick={(e) => { e.stopPropagation(); dismiss(alert.id); }}
                className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Progress bar */}
            <div className="mt-2 h-0.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: AUTO_DISMISS_MS / 1000, ease: 'linear' }}
                className="h-full bg-amber-400 rounded-full"
              />
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default WatchAlertToast;
