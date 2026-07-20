import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Calendar, Plus, Trash2 } from 'lucide-react';
import { createEmptyMilestone, moneyToCents } from '../utils/milestones';
import DatePickerModal from './DatePickerModal';

const formatCurrency = (cents) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2
}).format((cents || 0) / 100);

const isMoneyDraft = (value) => /^\d*(?:\.\d{0,2})?$/.test(value);

const formatDisplayDate = (value) => {
  if (!value) return 'Select date';
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const MilestoneScheduleEditor = ({
  totalProjectBudget,
  milestoneWorkflow = 'sequential',
  milestones = [],
  onBudgetChange,
  onWorkflowChange,
  onMilestonesChange,
  error
}) => {
  const [datePickerIndex, setDatePickerIndex] = useState(null);
  const totals = useMemo(() => {
    const budgetCents = moneyToCents(totalProjectBudget) || 0;
    const milestoneCents = milestones.reduce((sum, milestone) => sum + (moneyToCents(milestone.amount) || 0), 0);
    return { budgetCents, milestoneCents, matches: budgetCents > 0 && budgetCents === milestoneCents };
  }, [totalProjectBudget, milestones]);
  const todayDate = useMemo(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);
  const hasApprovals = milestones.some((milestone) => Number(milestone.approvedAmount || 0) > 0);

  const updateMilestone = (index, changes) => {
    onMilestonesChange(milestones.map((milestone, milestoneIndex) => (
      milestoneIndex === index ? { ...milestone, ...changes } : milestone
    )));
  };

  const moveMilestone = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= milestones.length) return;
    if (Number(milestones[index].approvedAmount || 0) > 0 || Number(milestones[target].approvedAmount || 0) > 0) return;
    const next = [...milestones];
    [next[index], next[target]] = [next[target], next[index]];
    onMilestonesChange(next.map((milestone, order) => ({ ...milestone, order })));
  };

  return (
    <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/50 p-4 md:col-span-2 lg:col-span-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="space-y-1">
          <span className="text-xs font-semibold text-gray-700">Total Project Budget</span>
          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9]+([.][0-9]{1,2})?"
            value={totalProjectBudget}
            onChange={(event) => {
              if (isMoneyDraft(event.target.value)) onBudgetChange(event.target.value);
            }}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            placeholder="12000.00"
            aria-label="Total project budget"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold text-gray-700">Milestone Workflow</span>
          <select
            value={milestoneWorkflow}
            onChange={(event) => onWorkflowChange(event.target.value)}
            disabled={hasApprovals}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-gray-100"
          >
            <option value="sequential">Sequential</option>
            <option value="parallel">Parallel</option>
          </select>
        </label>
      </div>

      <div className="space-y-2">
        <div className="hidden grid-cols-[minmax(12rem,2fr)_minmax(8rem,1fr)_minmax(10rem,1fr)_auto] gap-3 px-3 text-xs font-semibold uppercase tracking-wide text-gray-500 md:grid">
          <span>Milestone Name</span>
          <span>Amount</span>
          <span>Due Date (Optional)</span>
          <span className="text-center">Actions</span>
        </div>
        {milestones.map((milestone, index) => {
          const financiallyLocked = Number(milestone.approvedAmount || 0) > 0;
          const previousLocked = index > 0 && Number(milestones[index - 1]?.approvedAmount || 0) > 0;
          const nextLocked = index < milestones.length - 1 && Number(milestones[index + 1]?.approvedAmount || 0) > 0;
          return (
            <div key={milestone._id || milestone.clientId || index} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(12rem,2fr)_minmax(8rem,1fr)_minmax(10rem,1fr)_auto] md:items-end">
                <label className="min-w-0 space-y-1">
                  <span className="flex items-center gap-2 text-xs font-semibold text-gray-600 md:sr-only">
                    Milestone Name
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
                      {index + 1}
                    </span>
                    <input
                      value={milestone.title}
                      onChange={(event) => updateMilestone(index, { title: event.target.value })}
                      className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                      placeholder="Milestone name"
                    />
                  </div>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-gray-600 md:sr-only">Amount</span>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9]+([.][0-9]{1,2})?"
                      value={milestone.amount}
                      onChange={(event) => {
                        if (isMoneyDraft(event.target.value)) updateMilestone(index, { amount: event.target.value });
                      }}
                      disabled={financiallyLocked}
                      className="w-full rounded-lg border border-gray-300 py-2 pl-7 pr-3 text-sm focus:border-amber-500 focus:outline-none disabled:bg-gray-100"
                      placeholder="0.00"
                      aria-label={`Milestone ${index + 1} amount`}
                    />
                  </div>
                </label>
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-gray-600 md:sr-only">Due Date (Optional)</span>
                  <button
                    type="button"
                    onClick={() => setDatePickerIndex(index)}
                    className="flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm transition-colors hover:border-amber-400 focus:border-amber-500 focus:outline-none"
                    aria-label={`Select milestone ${index + 1} due date`}
                  >
                    <span className={milestone.dueDate ? 'text-gray-900' : 'text-gray-400'}>
                      {formatDisplayDate(milestone.dueDate)}
                    </span>
                    <Calendar size={16} className="shrink-0 text-gray-400" />
                  </button>
                </div>
                <div className="flex items-center justify-end gap-1 md:self-center" aria-label={`Milestone ${index + 1} actions`}>
                  <button
                    type="button"
                    onClick={() => moveMilestone(index, -1)}
                    disabled={index === 0 || financiallyLocked || previousLocked}
                    className="rounded-md border border-gray-200 p-2 text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
                    title="Move milestone up"
                    aria-label={`Move milestone ${index + 1} up`}
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveMilestone(index, 1)}
                    disabled={index === milestones.length - 1 || financiallyLocked || nextLocked}
                    className="rounded-md border border-gray-200 p-2 text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
                    title="Move milestone down"
                    aria-label={`Move milestone ${index + 1} down`}
                  >
                    <ArrowDown size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMilestonesChange(milestones.filter((_, itemIndex) => itemIndex !== index).map((item, order) => ({ ...item, order })))}
                    disabled={financiallyLocked || milestones.length === 1}
                    className="rounded-md border border-red-100 p-2 text-red-500 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
                    title={financiallyLocked ? 'Milestones with approvals cannot be deleted' : 'Delete milestone'}
                    aria-label={`Delete milestone ${index + 1}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              {financiallyLocked && (
                <p className="mt-2 text-xs text-gray-500">
                  Approved: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(milestone.approvedAmount || 0)}. Amount and order are locked.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => onMilestonesChange([...milestones, { ...createEmptyMilestone(), order: milestones.length }])}
        className="flex items-center gap-2 rounded-lg border border-dashed border-amber-400 px-3 py-2 text-sm font-medium text-amber-700"
      >
        <Plus size={15} /> Add Milestone
      </button>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-gray-600">Milestones: {formatCurrency(totals.milestoneCents)} / Budget: {formatCurrency(totals.budgetCents)}</span>
        <span className={totals.matches ? 'font-semibold text-emerald-600' : 'font-semibold text-indigo-600'}>
          {totals.matches ? 'Budget balanced' : 'Amounts must match'}
        </span>
      </div>
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}

      <DatePickerModal
        isOpen={datePickerIndex !== null}
        onClose={() => setDatePickerIndex(null)}
        onSelectDate={(date) => {
          if (datePickerIndex !== null) updateMilestone(datePickerIndex, { dueDate: date || '' });
        }}
        selectedDate={datePickerIndex !== null ? milestones[datePickerIndex]?.dueDate : null}
        title="Select Milestone Due Date"
        minDate={todayDate}
      />
    </div>
  );
};

export default MilestoneScheduleEditor;
