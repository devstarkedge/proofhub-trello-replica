import React, { memo } from 'react';
import { Search, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useSmartSearchStore from '../../store/smartSearchStore';

const PreviewFooter = ({ totalCount }) => {
  const chips = useSmartSearchStore(s => s.chips);
  const searchText = useSmartSearchStore(s => s.searchText);
  const activeField = useSmartSearchStore(s => s.activeField);
  const previewCount = useSmartSearchStore(s => s.previewCount);
  const clearAllChips = useSmartSearchStore(s => s.clearAllChips);

  const hasActiveFilters = chips.length > 0 || (searchText && activeField === 'all');

  if (!hasActiveFilters) return null;

  const count = previewCount ?? totalCount;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.2 }}
        className="sticky bottom-4 z-[50] mx-auto max-w-xl"
      >
        <div className="bg-white/95 backdrop-blur-xl border-2 border-gray-200 rounded-2xl shadow-2xl px-5 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm">
            <Search className="w-4 h-4 text-blue-500" />
            <span className="text-gray-600">
              <span className="font-bold text-blue-600">{count}</span> matching {count === 1 ? 'task' : 'tasks'}
            </span>
          </div>

          <button
            onClick={clearAllChips}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Clear All
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default memo(PreviewFooter);
