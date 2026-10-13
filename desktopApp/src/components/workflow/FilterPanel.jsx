import React, { memo, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Filter, ChevronDown, Trash2, Check } from 'lucide-react';
import useWorkflowFilterStore from '../../store/workflowFilterStore';
import StatusFilter from './filters/StatusFilter';
import PriorityFilter from './filters/PriorityFilter';
import AssigneeFilter from './filters/AssigneeFilter';
import LabelFilter from './filters/LabelFilter';
import DateFilter from './filters/DateFilter';

// ── Collapsible Section ──
const FilterSection = memo(({ title, count, children, defaultOpen = true }) => {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50/80 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">{title}</span>
          {count > 0 && (
            <span className="min-w-[20px] h-5 px-1.5 text-[10px] font-bold bg-purple-100 text-purple-700 rounded-full flex items-center justify-center">
              {count}
            </span>
          )}
        </div>
        <ChevronDown
          size={14}
          className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-3.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
FilterSection.displayName = 'FilterSection';

// ── Main Filter Drawer ──
const FilterPanel = memo(({ isOpen, onClose, onApply, lists, cardsByList, boardLabels, allCards }) => {
  const draftFilters = useWorkflowFilterStore((s) => s.draftFilters);
  const setDraftFilter = useWorkflowFilterStore((s) => s.setDraftFilter);
  const clearAllDrafts = useWorkflowFilterStore((s) => s.clearAllDrafts);
  const applyDrafts = useWorkflowFilterStore((s) => s.applyDrafts);
  const discardDrafts = useWorkflowFilterStore((s) => s.discardDrafts);
  const hasDraftChanges = useWorkflowFilterStore((s) => s.hasDraftChanges);
  const getDraftActiveFilterCount = useWorkflowFilterStore((s) => s.getDraftActiveFilterCount);
  const getDraftMatchCount = useWorkflowFilterStore((s) => s.getDraftMatchCount);

  const statuses = useMemo(() => {
    if (!lists) return [];
    return [...new Set(lists.map(l => l.title))];
  }, [lists]);

  const assignees = useMemo(() => {
    if (!cardsByList) return [];
    const map = new Map();
    Object.values(cardsByList).filter(Boolean).forEach(cards => {
      cards.forEach(card => {
        (card.assignees || []).forEach(a => {
          const id = typeof a === 'object' ? a._id : a;
          if (id && !map.has(id)) {
            map.set(id, typeof a === 'object' ? a : { _id: id, name: 'Unknown' });
          }
        });
      });
    });
    return Array.from(map.values());
  }, [cardsByList]);

  const labels = useMemo(() => {
    if (boardLabels && boardLabels.length > 0) return boardLabels;
    if (!cardsByList) return [];
    const map = new Map();
    Object.values(cardsByList).filter(Boolean).forEach(cards => {
      cards.forEach(card => {
        (card.labels || []).forEach(l => {
          const id = typeof l === 'object' ? l._id : l;
          if (id && !map.has(id)) {
            map.set(id, typeof l === 'object' ? l : { _id: id, name: String(l) });
          }
        });
      });
    });
    return Array.from(map.values());
  }, [boardLabels, cardsByList]);

  const sectionCounts = useMemo(() => ({
    status: draftFilters.status.length,
    priority: draftFilters.priority.length,
    assignees: draftFilters.assignees.length,
    labels: draftFilters.labels.length,
    startDate: draftFilters.startDate.type !== 'any' ? 1 : 0,
    dueDate: draftFilters.dueDate.type !== 'any' ? 1 : 0,
  }), [draftFilters]);

  const draftCount = getDraftActiveFilterCount();
  const previewCount = useMemo(
    () => getDraftMatchCount(allCards || [], lists || []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draftFilters, allCards, lists]
  );
  const hasChanges = hasDraftChanges();
  const totalCards = allCards?.length || 0;

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e) => { if (e.key === 'Escape') { discardDrafts(); onClose(); } };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose, discardDrafts]);

  const handleApply = useCallback(() => {
    applyDrafts();
    onApply?.();
    onClose();
  }, [applyDrafts, onApply, onClose]);

  const handleCancel = useCallback(() => {
    discardDrafts();
    onClose();
  }, [discardDrafts, onClose]);

  const optionCounts = useMemo(() => {
    const cards = allCards || [];
    const counts = {
      status: {},
      priority: { low: 0, medium: 0, high: 0, critical: 0, '': 0 },
      assignees: { __unassigned__: 0 },
      labels: { __unlabelled__: 0 },
    };
    const listTitleMap = {};
    for (const l of (lists || [])) listTitleMap[l._id] = l.title;

    for (const card of cards) {
      const listId = typeof card.list === 'object' ? card.list._id : card.list;
      const listTitle = listTitleMap[listId] || '';
      counts.status[listTitle] = (counts.status[listTitle] || 0) + 1;

      const p = (card.priority || '').toLowerCase();
      counts.priority[p] = (counts.priority[p] || 0) + 1;

      const al = card.assignees || [];
      if (al.length === 0) counts.assignees.__unassigned__++;
      else al.forEach(a => {
        const id = typeof a === 'object' ? a._id : a;
        counts.assignees[id] = (counts.assignees[id] || 0) + 1;
      });

      const ll = card.labels || [];
      if (ll.length === 0) counts.labels.__unlabelled__++;
      else ll.forEach(l => {
        const id = typeof l === 'object' ? l._id : l;
        counts.labels[id] = (counts.labels[id] || 0) + 1;
      });
    }
    return counts;
  }, [allCards, lists]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-[55]"
            onClick={handleCancel}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-y-0 right-0 z-[56] flex flex-col w-full sm:w-[380px] md:w-[420px] bg-white shadow-2xl"
            role="dialog"
            aria-label="Filter panel"
          >
            <div className="h-1 bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 flex-shrink-0" />

            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                  <Filter size={16} className="text-purple-600" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-900">Filters</h2>
                  <p className="text-[11px] text-gray-400">
                    {draftCount > 0 ? `${draftCount} active` : 'No filters active'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {draftCount > 0 && (
                  <button
                    onClick={clearAllDrafts}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={13} />
                    <span className="hidden sm:inline">Clear</span>
                  </button>
                )}
                <button
                  onClick={handleCancel}
                  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain" style={{ scrollbarWidth: 'thin' }}>
              <FilterSection title="Status" count={sectionCounts.status} defaultOpen>
                <StatusFilter statuses={statuses} selected={draftFilters.status} onChange={(v) => setDraftFilter('status', v)} counts={optionCounts.status} />
              </FilterSection>
              <FilterSection title="Priority" count={sectionCounts.priority} defaultOpen>
                <PriorityFilter selected={draftFilters.priority} onChange={(v) => setDraftFilter('priority', v)} counts={optionCounts.priority} />
              </FilterSection>
              <FilterSection title="Assignees" count={sectionCounts.assignees} defaultOpen>
                <AssigneeFilter assignees={assignees} selected={draftFilters.assignees} onChange={(v) => setDraftFilter('assignees', v)} counts={optionCounts.assignees} />
              </FilterSection>
              <FilterSection title="Labels" count={sectionCounts.labels} defaultOpen>
                <LabelFilter labels={labels} selected={draftFilters.labels} onChange={(v) => setDraftFilter('labels', v)} counts={optionCounts.labels} />
              </FilterSection>
              <FilterSection title="Start Date" count={sectionCounts.startDate} defaultOpen={false}>
                <DateFilter filter={draftFilters.startDate} onChange={(v) => setDraftFilter('startDate', v)} />
              </FilterSection>
              <FilterSection title="Due Date" count={sectionCounts.dueDate} defaultOpen={false}>
                <DateFilter filter={draftFilters.dueDate} onChange={(v) => setDraftFilter('dueDate', v)} />
              </FilterSection>
            </div>

            <div className="flex-shrink-0 border-t border-gray-100 bg-gray-50/80 backdrop-blur-sm px-5 py-3.5 space-y-3">
              <div className="flex items-center justify-center">
                <div className={`text-sm font-semibold ${previewCount === 0 && draftCount > 0 ? 'text-red-500' : 'text-gray-700'}`}>
                  {draftCount > 0 ? (
                    <>
                      <span className="text-lg font-bold">{previewCount}</span>
                      <span className="text-gray-400 font-normal"> / {totalCards}</span>
                      {' '}task{previewCount !== 1 ? 's' : ''} match
                    </>
                  ) : (
                    <span className="text-gray-400 font-normal text-xs">Select filters to narrow results</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <button onClick={handleCancel} className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleApply}
                  disabled={!hasChanges}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all ${hasChanges ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-md shadow-purple-200 active:scale-[0.98]' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                >
                  <Check size={15} />
                  Apply Filters
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

FilterPanel.displayName = 'FilterPanel';
export default FilterPanel;
