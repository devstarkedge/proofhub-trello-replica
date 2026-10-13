import { create } from 'zustand';

const getStorageKey = (projectId, userId) =>
  `workflow_filters_${projectId}_${userId}`;

const getEmptyFilters = () => ({
  status: [],
  priority: [],
  assignees: [],
  labels: [],
  startDate: { type: 'any', value: null },
  dueDate: { type: 'any', value: null },
});

const loadFromStorage = (projectId, userId) => {
  if (!projectId || !userId) return null;
  try {
    const raw = localStorage.getItem(getStorageKey(projectId, userId));
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...getEmptyFilters(), ...parsed };
    }
  } catch { /* ignore */ }
  return null;
};

const saveToStorage = (projectId, userId, filters) => {
  if (!projectId || !userId) return;
  try {
    localStorage.setItem(getStorageKey(projectId, userId), JSON.stringify(filters));
  } catch { /* storage full */ }
};

const filtersEqual = (a, b) => {
  if (!a || !b) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
};

// Date helper: check if a date matches a filter criterion
const matchesDateFilter = (dateStr, filter) => {
  if (!filter || filter.type === 'any') return true;
  if (!dateStr) return false;

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (filter.type) {
    case 'today': {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === today.getTime();
    }
    case 'thisWeek': {
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      return date >= weekStart && date < weekEnd;
    }
    case 'overdue': {
      return date < today;
    }
    case 'before': {
      if (!filter.value) return true;
      return date < new Date(filter.value);
    }
    case 'after': {
      if (!filter.value) return true;
      return date > new Date(filter.value);
    }
    case 'between': {
      if (!filter.value?.start || !filter.value?.end) return true;
      return date >= new Date(filter.value.start) && date <= new Date(filter.value.end);
    }
    case 'exact': {
      if (!filter.value) return true;
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      const target = new Date(filter.value);
      target.setHours(0, 0, 0, 0);
      return d.getTime() === target.getTime();
    }
    default:
      return true;
  }
};

// Reusable: test a single card against a given filter set
const testCardAgainstFilters = (card, listTitle, filterSet) => {
  if (filterSet.status.length > 0) {
    const normalized = (listTitle || '').toLowerCase().trim();
    if (!filterSet.status.some(s => s.toLowerCase().trim() === normalized)) return false;
  }

  if (filterSet.priority.length > 0) {
    const cardPriority = (card.priority || '').toLowerCase();
    if (!filterSet.priority.includes(cardPriority)) return false;
  }

  if (filterSet.assignees.length > 0) {
    const cardAssigneeIds = (card.assignees || []).map(a => typeof a === 'object' ? a._id : a);
    const wantsUnassigned = filterSet.assignees.includes('__unassigned__');
    const selectedUserIds = filterSet.assignees.filter(id => id !== '__unassigned__');
    if (wantsUnassigned && cardAssigneeIds.length === 0) { /* match */ }
    else if (selectedUserIds.length > 0 && cardAssigneeIds.some(id => selectedUserIds.includes(id))) { /* match */ }
    else return false;
  }

  if (filterSet.labels.length > 0) {
    const cardLabelIds = (card.labels || []).map(l => typeof l === 'object' ? l._id : l);
    const wantsUnlabelled = filterSet.labels.includes('__unlabelled__');
    const selectedLabelIds = filterSet.labels.filter(id => id !== '__unlabelled__');
    if (wantsUnlabelled && cardLabelIds.length === 0) { /* match */ }
    else if (selectedLabelIds.length > 0 && cardLabelIds.some(id => selectedLabelIds.includes(id))) { /* match */ }
    else return false;
  }

  if (!matchesDateFilter(card.startDate, filterSet.startDate)) return false;
  if (!matchesDateFilter(card.dueDate, filterSet.dueDate)) return false;

  return true;
};

const countActiveFilters = (f) => {
  let count = 0;
  if (f.status.length > 0) count++;
  if (f.priority.length > 0) count++;
  if (f.assignees.length > 0) count++;
  if (f.labels.length > 0) count++;
  if (f.startDate.type !== 'any') count++;
  if (f.dueDate.type !== 'any') count++;
  return count;
};

const useWorkflowFilterStore = create((set, get) => ({
  filters: getEmptyFilters(),
  draftFilters: getEmptyFilters(),
  projectId: null,
  userId: null,

  // ── Lifecycle ──
  initialize: (projectId, userId) => {
    const saved = loadFromStorage(projectId, userId);
    const f = saved || getEmptyFilters();
    set({ filters: f, draftFilters: { ...f }, projectId, userId });
  },

  // ── Draft system (used while drawer is open) ──
  startDraft: () => {
    const { filters } = get();
    set({ draftFilters: JSON.parse(JSON.stringify(filters)) });
  },

  setDraftFilter: (key, value) => {
    const { draftFilters } = get();
    set({ draftFilters: { ...draftFilters, [key]: value } });
  },

  clearDraftFilter: (key) => {
    const { draftFilters } = get();
    const empty = getEmptyFilters();
    set({ draftFilters: { ...draftFilters, [key]: empty[key] } });
  },

  clearAllDrafts: () => {
    set({ draftFilters: getEmptyFilters() });
  },

  applyDrafts: () => {
    const { draftFilters, projectId, userId } = get();
    const applied = JSON.parse(JSON.stringify(draftFilters));
    set({ filters: applied });
    saveToStorage(projectId, userId, applied);
  },

  discardDrafts: () => {
    const { filters } = get();
    set({ draftFilters: JSON.parse(JSON.stringify(filters)) });
  },

  hasDraftChanges: () => {
    const { filters, draftFilters } = get();
    return !filtersEqual(filters, draftFilters);
  },

  getDraftActiveFilterCount: () => countActiveFilters(get().draftFilters),

  // ── Committed filter actions (used by chips bar) ──
  setFilter: (key, value) => {
    const { filters, projectId, userId } = get();
    const updated = { ...filters, [key]: value };
    set({ filters: updated, draftFilters: JSON.parse(JSON.stringify(updated)) });
    saveToStorage(projectId, userId, updated);
  },

  clearFilter: (key) => {
    const { filters, projectId, userId } = get();
    const empty = getEmptyFilters();
    const updated = { ...filters, [key]: empty[key] };
    set({ filters: updated, draftFilters: JSON.parse(JSON.stringify(updated)) });
    saveToStorage(projectId, userId, updated);
  },

  clearAllFilters: () => {
    const { projectId, userId } = get();
    const empty = getEmptyFilters();
    set({ filters: empty, draftFilters: { ...getEmptyFilters() } });
    saveToStorage(projectId, userId, empty);
  },

  removeChipFilter: (key, value) => {
    const { filters, projectId, userId } = get();
    const empty = getEmptyFilters();
    let updated;

    if (key === 'startDate' || key === 'dueDate') {
      updated = { ...filters, [key]: empty[key] };
    } else {
      const arr = filters[key] || [];
      updated = { ...filters, [key]: arr.filter(v => v !== value) };
    }
    set({ filters: updated, draftFilters: JSON.parse(JSON.stringify(updated)) });
    saveToStorage(projectId, userId, updated);
  },

  // ── Queries ──
  getActiveFilterCount: () => countActiveFilters(get().filters),
  hasActiveFilters: () => countActiveFilters(get().filters) > 0,

  matchesFilters: (card, listTitle) => testCardAgainstFilters(card, listTitle, get().filters),

  matchesDraftFilters: (card, listTitle) => testCardAgainstFilters(card, listTitle, get().draftFilters),

  // Preview count: how many cards match draft filters
  getDraftMatchCount: (allCards, lists) => {
    const { draftFilters } = get();
    if (countActiveFilters(draftFilters) === 0) return allCards.length;

    // Build listId → title map
    const listTitleMap = {};
    for (const l of lists) listTitleMap[l._id] = l.title;

    let count = 0;
    for (const card of allCards) {
      const listId = typeof card.list === 'object' ? card.list._id : card.list;
      const listTitle = listTitleMap[listId] || '';
      if (testCardAgainstFilters(card, listTitle, draftFilters)) count++;
    }
    return count;
  },
}));

export { getEmptyFilters };
export default useWorkflowFilterStore;
