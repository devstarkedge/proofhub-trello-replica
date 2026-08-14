import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, MailCheck } from 'lucide-react';
import InvitationList from './InvitationList';

const TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'expired', label: 'Expired' },
  { key: 'revoked', label: 'Revoked & Cancelled' },
];

/**
 * Separate, responsive UI for viewing/resending/revoking invitations —
 * deliberately split from InviteMemberModal (which stays focused on
 * creating one invitation) rather than overloading it with a management
 * list. Opened by a "Manage Invitations" button placed next to the
 * existing "+ Invite Member" button, inside the same canInviteMembers
 * PermissionGate, at each of its 3 usage sites.
 */
const ManageInvitationsModal = ({ isOpen, onClose, workspaceId }) => {
  const [activeTab, setActiveTab] = useState('pending');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (isOpen) {
      setActiveTab('pending');
      setSearch('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
          style={{ backgroundColor: 'var(--color-card-bg)' }}
        >
          <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                <MailCheck size={18} className="text-white" />
              </div>
              <h2 className="text-lg font-bold text-white">Manage Invitations</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="px-6 pt-4 flex-shrink-0 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-1 p-1 rounded-xl w-full sm:w-auto overflow-x-auto" style={{ backgroundColor: 'var(--color-bg-muted)' }}>
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors"
                  style={activeTab === tab.key
                    ? { backgroundColor: 'var(--color-card-bg)', color: 'var(--color-text-primary)' }
                    : { color: 'var(--color-text-muted)' }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative flex-1 sm:max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by email..."
                className="w-full pl-8 pr-3 py-2 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-emerald-500/30"
                style={{ backgroundColor: 'var(--color-bg-muted)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' }}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 pt-4">
            <InvitationList workspaceId={workspaceId} status={activeTab} search={search} />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};

export default ManageInvitationsModal;
