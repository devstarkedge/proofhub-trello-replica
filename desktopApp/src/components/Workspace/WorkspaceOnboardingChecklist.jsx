import React, { useState, useEffect, useCallback, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Circle, Loader, PartyPopper } from 'lucide-react';
import { toast } from 'react-toastify';
import WorkspaceContext from '../../context/WorkspaceContext';
import { getWorkspaceSetupStatus, inviteWorkspaceMembers } from '../../services/workspaceSetupApi';
import QuickCreateDepartmentForm from './QuickCreateDepartmentForm';
import EmailInviteInput from './EmailInviteInput';

/**
 * Post-creation onboarding checklist — also reachable later from Workspace
 * Settings via WorkspaceSetupBanner (variant="full"). Every item's
 * completed state comes live from GET /api/workspaces/:id/setup-status (no
 * persisted onboarding-state blob to drift out of sync), so re-opening this
 * always reflects real, current workspace state.
 */
const WorkspaceOnboardingChecklist = ({ isOpen, onClose, onUpdate }) => {
  const navigate = useNavigate();
  const { currentWorkspace } = useContext(WorkspaceContext);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [inviteEmails, setInviteEmails] = useState([]);
  const [invitingBusy, setInvitingBusy] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);

  const refresh = useCallback(async () => {
    if (!currentWorkspace?._id) return;
    setLoading(true);
    try {
      const data = await getWorkspaceSetupStatus(currentWorkspace._id);
      setStatus(data);
      onUpdate?.(data);
    } catch (err) {
      console.error('Failed to load workspace setup status:', err);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace?._id, onUpdate]);

  useEffect(() => {
    if (isOpen) refresh();
  }, [isOpen, refresh]);

  const handleInvite = async () => {
    if (inviteEmails.length === 0 || !currentWorkspace?._id || invitingBusy) return;
    setInvitingBusy(true);
    try {
      await inviteWorkspaceMembers(currentWorkspace._id, inviteEmails);
      toast.success('Invites sent');
      setInviteEmails([]);
      setShowInviteForm(false);
      await refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send invites');
    } finally {
      setInvitingBusy(false);
    }
  };

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
          className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
          style={{ backgroundColor: 'var(--color-card-bg)' }}
        >
          <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
                <PartyPopper size={18} className="text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-white">Let&apos;s get set up</h2>
                {currentWorkspace?.name && <p className="text-xs text-white/80 truncate">{currentWorkspace.name}</p>}
              </div>
            </div>
            <button type="button" onClick={onClose} className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors flex-shrink-0">
              <X size={20} />
            </button>
          </div>

          <div className="p-6 overflow-y-auto flex-1 space-y-4">
            {loading && !status ? (
              <div className="flex justify-center py-8">
                <Loader size={22} className="animate-spin" style={{ color: 'var(--color-text-muted)' }} />
              </div>
            ) : status ? (
              <>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Progress</span>
                    <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>{status.completionPercent}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-bg-muted)' }}>
                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${status.completionPercent}%` }} />
                  </div>
                </div>

                <div className="space-y-2">
                  {status.checklist.map((item) => (
                    <div key={item.key} className="flex items-start gap-3 p-3 rounded-xl" style={{ backgroundColor: 'var(--color-bg-muted)' }}>
                      {item.completed ? (
                        <Check size={16} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                      ) : (
                        <Circle size={16} style={{ color: 'var(--color-text-muted)' }} className="flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-medium"
                          style={{
                            color: item.completed ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                            textDecoration: item.completed ? 'line-through' : 'none',
                          }}
                        >
                          {item.label}
                        </p>

                        {!item.completed && item.key === 'department' && (
                          <div className="mt-2">
                            <QuickCreateDepartmentForm onCreated={refresh} />
                          </div>
                        )}

                        {!item.completed && item.key === 'invite' && (
                          <div className="mt-2">
                            {showInviteForm ? (
                              <div className="space-y-2">
                                <EmailInviteInput emails={inviteEmails} onChange={setInviteEmails} disabled={invitingBusy} />
                                <button
                                  type="button"
                                  onClick={handleInvite}
                                  disabled={invitingBusy || inviteEmails.length === 0}
                                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                                >
                                  {invitingBusy ? 'Sending...' : 'Send invites'}
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setShowInviteForm(true)}
                                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                              >
                                Invite people →
                              </button>
                            )}
                          </div>
                        )}

                        {!item.completed && item.key === 'project' && (
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                navigate('/?openModal=add-project');
                              }}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                            >
                              Create project
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>

          <div className="px-6 py-4 border-t flex-shrink-0" style={{ borderColor: 'var(--color-border-subtle)' }}>
            <button
              type="button"
              onClick={onClose}
              className="w-full px-4 py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700 transition-all"
            >
              Done for now
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};

export default WorkspaceOnboardingChecklist;
