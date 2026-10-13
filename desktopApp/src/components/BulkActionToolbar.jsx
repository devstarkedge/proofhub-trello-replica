import React, { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, CheckSquare, X, Minus } from 'lucide-react';

const BulkActionToolbar = memo(({
  isVisible,
  selectedCount,
  totalCount,
  onDelete,
  onSelectAll,
  onCancel,
  isDeleting = false
}) => {
  const allSelected = selectedCount === totalCount && totalCount > 0;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 60, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 60, scale: 0.95 }}
          transition={{ 
            type: 'spring', 
            stiffness: 400, 
            damping: 30,
            mass: 0.8
          }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
        >
          <div className="flex items-center gap-3 bg-white/95 backdrop-blur-xl shadow-2xl rounded-2xl px-5 py-3 border border-gray-200/80 ring-1 ring-black/5">
            {/* Selected Count */}
            <div className="flex items-center gap-2 pr-3 border-r border-gray-200">
              <motion.div
                key={selectedCount}
                initial={{ scale: 1.4 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500 }}
                className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-blue-200"
              >
                {selectedCount}
              </motion.div>
              <span className="text-sm font-semibold text-gray-700 whitespace-nowrap">
                Selected
              </span>
            </div>

            {/* Select All / Deselect All */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onSelectAll}
              disabled={isDeleting}
              className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-xl transition-all duration-200 border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {allSelected ? (
                <>
                  <Minus size={16} />
                  <span>Deselect All</span>
                </>
              ) : (
                <>
                  <CheckSquare size={16} />
                  <span>Select All</span>
                </>
              )}
            </motion.button>

            {/* Delete Button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onDelete}
              disabled={isDeleting}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 rounded-xl shadow-lg shadow-red-200 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              <Trash2 size={16} />
              <span>Delete{selectedCount > 1 ? ` (${selectedCount})` : ''}</span>
            </motion.button>

            {/* Cancel Button */}
            <motion.button
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              onClick={onCancel}
              disabled={isDeleting}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Cancel selection"
            >
              <X size={18} />
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

BulkActionToolbar.displayName = 'BulkActionToolbar';

export default BulkActionToolbar;
