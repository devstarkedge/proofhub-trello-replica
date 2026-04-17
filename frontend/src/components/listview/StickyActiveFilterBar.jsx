import React, { memo } from 'react';
import { X, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useSmartSearchStore from '../../store/smartSearchStore';
import { CHIP_STYLES, FIELD_LABELS } from './InlineFilterChips';

const StickyActiveFilterBar = () => {
  const chips = useSmartSearchStore(s => s.chips);
  const searchText = useSmartSearchStore(s => s.searchText);
  const activeField = useSmartSearchStore(s => s.activeField);
  const removeChip = useSmartSearchStore(s => s.removeChip);
  const clearAllChips = useSmartSearchStore(s => s.clearAllChips);

  const hasActiveSearch = searchText && activeField === 'all';
  const hasChips = chips.length > 0;

  if (!hasChips && !hasActiveSearch) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="sticky top-0 z-[50] bg-white/90 backdrop-blur-xl border-b border-gray-200/60 px-5 py-2.5 rounded-xl shadow-sm"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-gray-500 mr-1">
          <Filter className="w-3.5 h-3.5" />
          <span className="text-xs font-semibold uppercase tracking-wide">Active:</span>
        </div>

        <AnimatePresence mode="popLayout">
          {chips.map(chip => {
            const style = CHIP_STYLES[chip.field] || CHIP_STYLES.task;
            const Icon = style.icon;

            return (
              <motion.span
                key={chip.id}
                layout
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.15 }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${style.bg} ${style.text} ${style.border} transition-colors`}
              >
                <Icon className="w-3 h-3" />
                <span>{FIELD_LABELS[chip.field]}: {chip.label}</span>
                <button
                  onClick={() => removeChip(chip.id)}
                  className={`ml-0.5 p-0.5 rounded-md ${style.hoverBg} transition-colors`}
                  aria-label={`Remove ${FIELD_LABELS[chip.field]}: ${chip.label}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </motion.span>
            );
          })}

          {hasActiveSearch && (
            <motion.span
              key="search-text"
              layout
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.15 }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold bg-amber-50 text-amber-700 border-amber-200"
            >
              Search: &ldquo;{searchText}&rdquo;
            </motion.span>
          )}
        </AnimatePresence>

        {(hasChips || hasActiveSearch) && (
          <button
            onClick={clearAllChips}
            className="ml-2 text-xs text-red-500 hover:text-red-700 font-semibold transition-colors hover:bg-red-50 px-2 py-1 rounded-lg"
          >
            Clear all
          </button>
        )}
      </div>
    </motion.div>
  );
};

export default memo(StickyActiveFilterBar);
