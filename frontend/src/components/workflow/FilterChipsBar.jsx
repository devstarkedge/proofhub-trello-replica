import React, { memo } from 'react';
import { X, Filter } from 'lucide-react';
import useWorkflowFilterStore from '../../store/workflowFilterStore';

const chipColors = {
  status: 'bg-blue-50 text-blue-700 border-blue-200',
  priority: 'bg-orange-50 text-orange-700 border-orange-200',
  assignees: 'bg-green-50 text-green-700 border-green-200',
  labels: 'bg-purple-50 text-purple-700 border-purple-200',
  startDate: 'bg-teal-50 text-teal-700 border-teal-200',
  dueDate: 'bg-rose-50 text-rose-700 border-rose-200',
};

const chipLabels = {
  status: 'Status',
  priority: 'Priority',
  assignees: 'Assignee',
  labels: 'Label',
  startDate: 'Start Date',
  dueDate: 'Due Date',
};

const priorityNames = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical', '': 'No Priority' };

const FilterChipsBar = memo(({ assigneeMap, labelMap }) => {
  const filters = useWorkflowFilterStore((s) => s.filters);
  const removeChipFilter = useWorkflowFilterStore((s) => s.removeChipFilter);
  const clearAllFilters = useWorkflowFilterStore((s) => s.clearAllFilters);
  const getActiveFilterCount = useWorkflowFilterStore((s) => s.getActiveFilterCount);

  const count = getActiveFilterCount();
  if (count === 0) return null;

  const chips = [];

  filters.status.forEach((v) => chips.push({ key: 'status', value: v, display: v }));
  filters.priority.forEach((v) => chips.push({ key: 'priority', value: v, display: priorityNames[v] || v }));
  filters.assignees.forEach((v) => {
    const name = v === '__unassigned__' ? 'Unassigned' : (assigneeMap?.[v] || v);
    chips.push({ key: 'assignees', value: v, display: name });
  });
  filters.labels.forEach((v) => {
    const name = v === '__unlabelled__' ? 'Unlabelled' : (labelMap?.[v] || v);
    chips.push({ key: 'labels', value: v, display: name });
  });
  if (filters.startDate.type !== 'any') {
    chips.push({ key: 'startDate', value: 'active', display: filters.startDate.type.replace(/_/g, ' ') });
  }
  if (filters.dueDate.type !== 'any') {
    chips.push({ key: 'dueDate', value: 'active', display: filters.dueDate.type.replace(/_/g, ' ') });
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
      <div className="flex items-center gap-1.5 text-gray-400 flex-shrink-0">
        <Filter size={13} />
        <span className="text-[11px] font-semibold uppercase tracking-wider">Filtered</span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {chips.map((chip) => (
          <span
            key={`${chip.key}-${chip.value}`}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border rounded-full whitespace-nowrap ${chipColors[chip.key] || 'bg-gray-50 text-gray-600 border-gray-200'}`}
          >
            <span className="text-[10px] opacity-60">{chipLabels[chip.key]}:</span>
            <span className="capitalize">{chip.display}</span>
            <button
              onClick={() => removeChipFilter(chip.key, chip.value)}
              className="ml-0.5 p-0.5 rounded-full hover:bg-black/10 transition-colors"
            >
              <X size={11} />
            </button>
          </span>
        ))}
      </div>

      <button
        onClick={clearAllFilters}
        className="flex-shrink-0 text-[11px] font-semibold text-red-500 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors whitespace-nowrap"
      >
        Clear all
      </button>
    </div>
  );
});

FilterChipsBar.displayName = 'FilterChipsBar';
export default FilterChipsBar;
