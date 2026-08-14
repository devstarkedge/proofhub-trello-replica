import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Users, UserCheck } from 'lucide-react';
import BulkInviteEmailInput from './BulkInviteEmailInput';
import BulkInvitePreview from './BulkInvitePreview';

const STAT_STYLES = {
  emerald: { box: 'bg-emerald-50', text: 'text-emerald-600' },
  amber: { box: 'bg-amber-50', text: 'text-amber-600' },
  red: { box: 'bg-red-50', text: 'text-red-600' },
};

const ResultStat = ({ label, count, color }) => {
  const styles = STAT_STYLES[color] || STAT_STYLES.emerald;
  return (
    <div className={`rounded-xl border p-3 text-center ${styles.box}`} style={{ borderColor: 'var(--color-border-subtle)' }}>
      <div className={`text-xl font-bold ${styles.text}`}>{count}</div>
      <div className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
    </div>
  );
};

/**
 * Separate, dedicated Bulk Invite UI — reached only via InviteMemberModal's
 * "Bulk Invite" method card (see StepMethodChoice.jsx), never a top-level
 * button of its own. Three views in one modal: collect (paste/CSV) ->
 * preview (validate/dedupe + pick a common role/department) -> results.
 * Submission goes through inviteMemberBulkSimple, the exact same
 * centralized /invite-member endpoint every other entry point uses — this
 * is not a second invitation architecture.
 */
const BulkInviteModal = ({
  isOpen, onClose, workspaceId, departmentOptions = [], roleOptions = [], defaultDepartmentId, onInvited,
}) => {
  const [view, setView] = useState('input'); // 'input' | 'preview' | 'results'
  const [rows, setRows] = useState([]);
  const [results, setResults] = useState([]);

  useEffect(() => {
    if (isOpen) {
      setView('input');
      setRows([]);
      setResults([]);
    }
  }, [isOpen]);

  const handleClose = () => onClose();

  const handleSubmitted = (resultArray) => {
    setResults(resultArray);
    setView('results');
    onInvited?.();
  };

  if (!isOpen) return null;

  const resultCounts = results.reduce((acc, r) => {
    acc[r.outcome] = (acc[r.outcome] || 0) + 1;
    return acc;
  }, {});
  const clientInvalid = rows.filter((r) => r.status === 'invalid').length;
  const clientDuplicate = rows.filter((r) => r.status === 'duplicate').length;

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
                <Users size={18} className="text-white" />
              </div>
              <h2 className="text-lg font-bold text-white">Bulk Invite</h2>
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
            {view === 'input' && (
              <BulkInviteEmailInput
                onCancel={handleClose}
                onContinue={(parsedRows) => { setRows(parsedRows); setView('preview'); }}
              />
            )}

            {view === 'preview' && (
              <BulkInvitePreview
                rows={rows}
                workspaceId={workspaceId}
                departmentOptions={departmentOptions}
                roleOptions={roleOptions}
                defaultDepartmentId={defaultDepartmentId}
                onBack={() => setView('input')}
                onSubmitted={handleSubmitted}
              />
            )}

            {view === 'results' && (
              <div className="p-6 space-y-4">
                <div className="text-center py-2">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500/10 mb-3">
                    <UserCheck size={24} className="text-emerald-600" />
                  </div>
                  <h3 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>Bulk invite complete</h3>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    {rows.length} row{rows.length === 1 ? '' : 's'} processed
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <ResultStat label="Invited" count={resultCounts.invited || 0} color="emerald" />
                  <ResultStat label="Added directly" count={(resultCounts.created || 0) + (resultCounts.restored || 0)} color="emerald" />
                  <ResultStat label="Already members" count={resultCounts.already_member || 0} color="amber" />
                  <ResultStat
                    label="Invalid / duplicate"
                    count={clientInvalid + clientDuplicate + (resultCounts.invalid || 0) + (resultCounts.duplicate || 0)}
                    color="red"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-5 py-2.5 text-sm font-semibold text-white rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 transition-all"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};

export default BulkInviteModal;
