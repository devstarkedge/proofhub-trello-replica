import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserPlus } from 'lucide-react';
import StepMethodChoice from './StepMethodChoice';
import StepDirectAdd from './StepDirectAdd';
import StepRegistrationInvite from './StepRegistrationInvite';

/**
 * The one centralized "Invite Member" entry point — reused verbatim from
 * HR Panel, Workspace Settings, and Employee Management (see the
 * canInviteMembers-gated buttons in each). Two steps: choose a method, then
 * fill in that method's fields. See backend/controllers/
 * memberInvitationController.js for the two methods' exact backend logic.
 */
const InviteMemberModal = ({
  isOpen, onClose, workspaceId, departmentOptions = [], roleOptions = [], defaultDepartmentId, onInvited, onBulkInvite,
}) => {
  const [step, setStep] = useState(1);
  const [method, setMethod] = useState('direct');

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setMethod('direct');
    }
  }, [isOpen]);

  const handleClose = () => onClose();
  const handleMethodChosen = (chosen) => {
    // Bulk invite is a separate, dedicated UI (per spec: don't overload this
    // modal with bulk functionality) — close this one and let the parent
    // open BulkInviteModal instead of advancing to a step-2 form here.
    if (chosen === 'bulk') {
      handleClose();
      onBulkInvite?.();
      return;
    }
    setMethod(chosen);
    setStep(2);
  };
  const handleSuccess = () => {
    onInvited?.();
    onClose();
  };

  if (!isOpen) return null;

  const stepProps = {
    workspaceId,
    departmentOptions,
    roleOptions,
    defaultDepartmentId,
    onBack: () => setStep(1),
    onSuccess: handleSuccess,
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          style={{ backgroundColor: 'var(--color-card-bg)' }}
        >
          <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                <UserPlus size={18} className="text-white" />
              </div>
              <h2 className="text-lg font-bold text-white">Invite Member</h2>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {step === 1 ? (
              <StepMethodChoice onChoose={handleMethodChosen} />
            ) : method === 'direct' ? (
              <StepDirectAdd {...stepProps} />
            ) : (
              <StepRegistrationInvite {...stepProps} />
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};

export default InviteMemberModal;
