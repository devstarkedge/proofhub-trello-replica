import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Globe, Bell, AlertTriangle, Check,
  CheckCircle2, XCircle, Clock, User,
} from 'lucide-react';
import useSalesStore from '../../store/salesStore';

const formatTimeAgo = (date) => {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(diff / 86400000);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
};

/**
 * TabApprovalModal
 *
 * Opens when an admin clicks a 'sales_tab_approval' notification.
 * Shows the tab details and lets the admin Approve or Ignore with a
 * two-step confirmation flow.
 * If the tab is already actioned it shows a friendly status message.
 */
const TabApprovalModal = ({ notification, onClose }) => {
  const { savedTabs, approveSavedTab, ignoreSavedTab } = useSalesStore();
  const [processing, setProcessing] = useState(false);
  // { action: 'approve' | 'ignore' }
  const [confirmAction, setConfirmAction] = useState(null);
  const [done, setDone] = useState(null); // 'approved' | 'ignored'

  const tabId = notification?.metadata?.tabId || notification?.entityId;
  const meta = notification?.metadata || {};

  // Try to get live tab from store; fall back to notification metadata
  const liveTab = savedTabs.find((t) => t._id === tabId || t._id?.toString() === tabId?.toString());

  const tabName = liveTab?.name || meta.tabName || 'Unknown Tab';
  const ownerName = liveTab?.ownerName || meta.ownerName || 'Unknown User';
  const isWatchTab = liveTab?.isWatchTab ?? meta.isWatchTab ?? false;
  const approvalStatus = liveTab?.approvalStatus || null; // null if not in store
  const approvedByName = liveTab?.approvedBy?.name || meta.adminName || null;
  const actionTimestamp = liveTab?.updatedAt || null;

  const handleApprove = async () => {
    if (!tabId) return;
    setProcessing(true);
    try {
      await approveSavedTab(tabId);
      setDone('approved');
      setConfirmAction(null);
    } catch (_) { /* error handled in store */ }
    setProcessing(false);
  };

  const handleIgnore = async () => {
    if (!tabId) return;
    setProcessing(true);
    try {
      await ignoreSavedTab(tabId);
      setDone('ignored');
      setConfirmAction(null);
    } catch (_) { /* error handled in store */ }
    setProcessing(false);
  };

  // Determine effective status (local done > live > unknown)
  const effectiveStatus = done || approvalStatus;

  const isAlreadyActioned =
    effectiveStatus === 'approved' || effectiveStatus === 'ignored';

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          key="panel"
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ type: 'spring', stiffness: 340, damping: 28 }}
          className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md shadow-amber-500/25">
                <Clock className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  Tab Approval Request
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Review and take action
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4">
            {/* Tab info card */}
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/50 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <Globe className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {tabName}
                    </p>
                    {isWatchTab && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-medium">
                        <Bell className="w-3 h-3" /> Watch Tab
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium">
                      Public
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <User className="w-3 h-3 text-gray-400 flex-shrink-0" />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Requested by <span className="font-medium text-gray-700 dark:text-gray-300">{ownerName}</span>
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                This user wants to share their saved view with the entire sales team.
                {isWatchTab && ' This is a Watch Tab — it will monitor matches and send alerts to all viewers.'}
              </p>
            </div>

            {/* Action area */}
            <AnimatePresence mode="wait">
              {/* ── Already actioned ── */}
              {isAlreadyActioned ? (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 ${
                    effectiveStatus === 'approved'
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/30'
                      : 'bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/50'
                  }`}
                >
                  {effectiveStatus === 'approved' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  )}
                  <div>
                    <p className={`text-sm font-semibold ${
                      effectiveStatus === 'approved'
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : 'text-gray-600 dark:text-gray-400'
                    }`}>
                      {effectiveStatus === 'approved'
                        ? 'Tab has been approved'
                        : 'Tab has been ignored'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {effectiveStatus === 'approved'
                        ? `"${tabName}" is now visible to the sales team.`
                        : `"${tabName}" will not be shared with the team.`}
                    </p>
                    {approvedByName && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {effectiveStatus === 'approved' ? 'Approved' : 'Handled'} by{' '}
                        <span className="font-medium text-gray-500 dark:text-gray-400">{approvedByName}</span>
                        {actionTimestamp && ` · ${formatTimeAgo(actionTimestamp)}`}
                      </p>
                    )}
                  </div>
                </motion.div>

              /* ── Confirmation step ── */
              ) : confirmAction ? (
                <motion.div
                  key="confirm"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30 p-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                      Confirm {confirmAction.action === 'approve' ? 'Approval' : 'Ignore'}
                    </p>
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mb-4 leading-relaxed">
                    {confirmAction.action === 'approve'
                      ? `Approving will make "${tabName}" visible to all sales team members.`
                      : `Ignoring will keep "${tabName}" private. The owner will be notified.`}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={confirmAction.action === 'approve' ? handleApprove : handleIgnore}
                      disabled={processing}
                      className={`flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
                        confirmAction.action === 'approve'
                          ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                          : 'bg-red-500 hover:bg-red-600 text-white'
                      }`}
                    >
                      {processing ? (
                        <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      ) : confirmAction.action === 'approve' ? (
                        <><Check className="w-4 h-4" /> Yes, Approve</>
                      ) : (
                        <><X className="w-4 h-4" /> Yes, Ignore</>
                      )}
                    </button>
                    <button
                      onClick={() => setConfirmAction(null)}
                      disabled={processing}
                      className="flex-1 inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-semibold
                        bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600
                        text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>

              /* ── Default action buttons ── */
              ) : (
                <motion.div
                  key="actions"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="flex items-center gap-3"
                >
                  <button
                    onClick={() => setConfirmAction({ action: 'approve' })}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                      bg-emerald-500 hover:bg-emerald-600 text-white transition-colors shadow-sm shadow-emerald-500/20"
                  >
                    <Check className="w-4 h-4" /> Approve
                  </button>
                  <button
                    onClick={() => setConfirmAction({ action: 'ignore' })}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                      bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600
                      text-gray-700 dark:text-gray-300 transition-colors"
                  >
                    <X className="w-4 h-4" /> Ignore
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          {!isAlreadyActioned && (
            <div className="px-6 pb-5">
              <p className="text-center text-xs text-gray-400 dark:text-gray-500">
                The tab owner will be notified of your decision.
              </p>
            </div>
          )}
          {isAlreadyActioned && (
            <div className="px-6 pb-5">
              <button
                onClick={onClose}
                className="w-full py-2 rounded-xl text-sm font-semibold
                  bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700
                  text-gray-700 dark:text-gray-300 transition-colors"
              >
                Close
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};

export default TabApprovalModal;
