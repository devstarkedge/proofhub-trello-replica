import React, { memo } from 'react';
import { X, Tag, FolderKanban, Users, Zap, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useSmartSearchStore from '../../store/smartSearchStore';

const CHIP_STYLES = {
  task:     { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: Tag, hoverBg: 'hover:bg-blue-100' },
  project:  { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', icon: FolderKanban, hoverBg: 'hover:bg-indigo-100' },
  assignee: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', icon: Users, hoverBg: 'hover:bg-green-100' },
  priority: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', icon: Zap, hoverBg: 'hover:bg-orange-100' },
  status:   { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', icon: Target, hoverBg: 'hover:bg-purple-100' },
};

const FIELD_LABELS = {
  task: 'Task',
  project: 'Project',
  assignee: 'Assignee',
  priority: 'Priority',
  status: 'Status',
};

const FilterChip = memo(({ chip, onRemove }) => {
  const style = CHIP_STYLES[chip.field] || CHIP_STYLES.task;
  const Icon = style.icon;

  return (
    <motion.span
      layout
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ duration: 0.15 }}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-semibold ${style.bg} ${style.text} ${style.border} ${style.hoverBg} transition-colors select-none max-w-[200px]`}
      role="button"
      aria-label={`Remove ${FIELD_LABELS[chip.field]}: ${chip.label}`}
    >
      <Icon className="w-3 h-3 flex-shrink-0" />
      <span className="truncate">{FIELD_LABELS[chip.field]}: {chip.label}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(chip.id); }}
        className={`ml-0.5 p-0.5 rounded-md ${style.hoverBg} transition-colors`}
        aria-label={`Remove ${chip.label}`}
      >
        <X className="w-3 h-3" />
      </button>
    </motion.span>
  );
});
FilterChip.displayName = 'FilterChip';

const InlineFilterChips = () => {
  const chips = useSmartSearchStore(s => s.chips);
  const removeChip = useSmartSearchStore(s => s.removeChip);

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 py-0.5 max-w-full overflow-x-auto scrollbar-thin" role="group" aria-label="Active search filters">
      <AnimatePresence mode="popLayout">
        {chips.map(chip => (
          <FilterChip key={chip.id} chip={chip} onRemove={removeChip} />
        ))}
      </AnimatePresence>
    </div>
  );
};

export default memo(InlineFilterChips);
export { FilterChip, CHIP_STYLES, FIELD_LABELS };
