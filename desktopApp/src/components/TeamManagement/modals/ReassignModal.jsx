import React, { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, CheckCircle } from 'lucide-react';

/**
 * ReassignModal Component
 * Modal for confirming reassignment of employee to another department
 * Lazy-loaded and memoized for performance
 */
const ReassignModal = memo(({
  isOpen,
  isLoading,
  reassignData,
  onConfirm,
  onCancel
}) => {
  return (
    <AnimatePresence>
      {isOpen && reassignData && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => !isLoading && onCancel()}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full"
          >
            <div className="p-6">
              <div className="flex items-center gap-4 mb-6">
                <motion.div
                  animate={{
                    scale: [1, 1.1, 1],
                    rotate: [0, -10, 10, -10, 0]
                  }}
                  transition={{
                    duration: 0.5,
                    repeat: Infinity,
                    repeatDelay: 2
                  }}
                  className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center flex-shrink-0"
                >
                  <AlertCircle size={32} className="text-orange-600" />
                </motion.div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-1">Reassign Employee?</h3>
                  <p className="text-sm text-gray-600">This employee is already assigned to other departments</p>
                </div>
              </div>

              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6">
                <p className="text-gray-700 text-sm leading-relaxed mb-3">
                  <span className="font-bold text-orange-700">{reassignData.employee.name}</span> is already assigned in <span className="font-bold text-orange-700">{reassignData.otherDeptNames}</span>.
                </p>
                <p className="text-gray-700 text-sm leading-relaxed">
                  Do you want to re-assign the same user to another department (<span className="font-bold text-orange-700">{reassignData.selectedDepartment}</span>)?
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onCancel}
                  disabled={isLoading}
                  className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-semibold disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={onConfirm}
                  disabled={isLoading}
                  className="flex-1 px-6 py-3 bg-orange-600 text-white rounded-xl hover:bg-orange-700 transition-colors font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                      />
                      Reassigning...
                    </>
                  ) : (
                    <>
                      <CheckCircle size={20} />
                      Confirm Reassign
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

ReassignModal.displayName = 'ReassignModal';

export default ReassignModal;
