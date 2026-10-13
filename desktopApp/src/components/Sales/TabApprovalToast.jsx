import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Clock, Globe, Bell, AlertTriangle } from 'lucide-react';
import useSalesStore from '../../store/salesStore';

const TabApprovalToast = () => {
  const { savedTabs, approveSavedTab, ignoreSavedTab, permissions } = useSalesStore();
  const [pendingQueue, setPendingQueue] = useState([]);
  const [processing, setProcessing] = useState(null); // tab id being processed
  // { tabId, action: 'approve' | 'ignore', tabName }
  const [confirmAction, setConfirmAction] = useState(null);

  const isAdmin = permissions?.isAdmin;

  // Listen for new approval-pending events
  useEffect(() => {
    if (!isAdmin) return;

    const handler = (e) => {
      const tab = e.detail?.tab;
      if (tab) {
        setPendingQueue((prev) => {
          if (prev.some((t) => t._id === tab._id)) return prev;
          return [...prev, tab];
        });
      }
    };

    window.addEventListener('socket-sales-tab-approval-pending', handler);
    return () => window.removeEventListener('socket-sales-tab-approval-pending', handler);
  }, [isAdmin]);

  // Auto-dismiss after 15 seconds
  useEffect(() => {
    if (pendingQueue.length === 0) return;
    const timer = setTimeout(() => {
      setPendingQueue((prev) => prev.slice(1));
    }, 15000);
    return () => clearTimeout(timer);
  }, [pendingQueue]);

  const handleApprove = async (tabId) => {
    setProcessing(tabId);
    setConfirmAction(null);
    try {
      await approveSavedTab(tabId);
    } catch (_) { /* handled by store */ }
    setProcessing(null);
    setPendingQueue((prev) => prev.filter((t) => t._id !== tabId));
  };

  const handleIgnore = async (tabId) => {
    setProcessing(tabId);
    setConfirmAction(null);
    try {
      await ignoreSavedTab(tabId);
    } catch (_) { /* handled by store */ }
    setProcessing(null);
    setPendingQueue((prev) => prev.filter((t) => t._id !== tabId));
  };

  const dismiss = (tabId) => {
    setPendingQueue((prev) => prev.filter((t) => t._id !== tabId));
  };

  if (!isAdmin || pendingQueue.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 max-w-sm">
      <AnimatePresence>
        {pendingQueue.slice(0, 3).map((tab) => {
          const isConfirming = confirmAction?.tabId === tab._id;
          return (
            <motion.div
              key={tab._id}
              initial={{ opacity: 0, x: 60, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.95 }}
              className="bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-700/50 rounded-xl shadow-lg shadow-amber-500/10 p-4"
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    Tab Approval Request
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    <strong>{tab.ownerName}</strong> wants to share
                  </p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <Globe className="w-3 h-3 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                      {tab.name}
                    </span>
                    {tab.isWatchTab && <Bell className="w-3 h-3 text-amber-500" />}
                  </div>

                  {/* Confirmation prompt or default actions */}
                  <AnimatePresence mode="wait">
                    {isConfirming ? (
                      <motion.div
                        key="confirm"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 p-2.5"
                      >
                        <div className="flex items-center gap-1.5 mb-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                          <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                            Confirm {confirmAction.action === 'approve' ? 'approval' : 'ignore'} of&nbsp;
                            <span className="font-semibold">"{confirmAction.tabName}"</span>?
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              confirmAction.action === 'approve'
                                ? handleApprove(tab._id)
                                : handleIgnore(tab._id)
                            }
                            disabled={processing === tab._id}
                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                              confirmAction.action === 'approve'
                                ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                                : 'bg-red-500 hover:bg-red-600 text-white'
                            }`}
                          >
                            {confirmAction.action === 'approve'
                              ? <><Check className="w-3 h-3" /> Yes, Approve</>
                              : <><X className="w-3 h-3" /> Yes, Ignore</>
                            }
                          </button>
                          <button
                            onClick={() => setConfirmAction(null)}
                            className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold
                              bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600
                              text-gray-700 dark:text-gray-300 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="actions"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        className="flex items-center gap-2 mt-3"
                      >
                        <button
                          onClick={() => setConfirmAction({ tabId: tab._id, action: 'approve', tabName: tab.name })}
                          disabled={processing === tab._id}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold
                            bg-emerald-500 hover:bg-emerald-600 text-white transition-colors disabled:opacity-50"
                        >
                          <Check className="w-3 h-3" /> Approve
                        </button>
                        <button
                          onClick={() => setConfirmAction({ tabId: tab._id, action: 'ignore', tabName: tab.name })}
                          disabled={processing === tab._id}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold
                            bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600
                            text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-50"
                        >
                          <X className="w-3 h-3" /> Ignore
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Dismiss */}
                <button
                  onClick={() => { dismiss(tab._id); setConfirmAction(null); }}
                  className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export default TabApprovalToast;
