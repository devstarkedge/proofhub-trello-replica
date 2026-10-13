import { create } from 'zustand';

// All available card fields with defaults
const FIELD_DEFINITIONS = [
  { key: 'assignees', label: 'Assignees', defaultVisible: true },
  { key: 'subtaskCount', label: 'Subtask Count', defaultVisible: true },
  { key: 'labels', label: 'Labels', defaultVisible: true },
  { key: 'dueDate', label: 'Due Date', defaultVisible: true },
  { key: 'startDate', label: 'Start Date', defaultVisible: false },
  { key: 'priority', label: 'Priority', defaultVisible: false },
  { key: 'attachments', label: 'Attachments', defaultVisible: false },
  { key: 'commentsCount', label: 'Comments Count', defaultVisible: false },
  { key: 'timeTracked', label: 'Time Tracked', defaultVisible: false },
  { key: 'taskId', label: 'Task ID', defaultVisible: false },
  { key: 'createdBy', label: 'Created By', defaultVisible: false },
  { key: 'lastUpdated', label: 'Last Updated', defaultVisible: false },
  { key: 'progress', label: 'Progress %', defaultVisible: false },
];

const getDefaults = () => {
  const fields = {};
  FIELD_DEFINITIONS.forEach(f => { fields[f.key] = f.defaultVisible; });
  return fields;
};

const getStorageKey = (projectId, userId) =>
  `workflow_fields_${projectId}_${userId}`;

const loadFromStorage = (projectId, userId) => {
  if (!projectId || !userId) return null;
  try {
    const raw = localStorage.getItem(getStorageKey(projectId, userId));
    if (raw) return JSON.parse(raw);
  } catch { /* ignore corrupt data */ }
  return null;
};

const saveToStorage = (projectId, userId, fields) => {
  if (!projectId || !userId) return;
  try {
    localStorage.setItem(getStorageKey(projectId, userId), JSON.stringify(fields));
  } catch { /* storage full — silently fail */ }
};

const useFieldVisibilityStore = create((set, get) => ({
  visibleFields: getDefaults(),
  projectId: null,
  userId: null,

  // Initialize for a specific project+user. Call when board loads.
  initialize: (projectId, userId) => {
    const saved = loadFromStorage(projectId, userId);
    set({
      visibleFields: saved || getDefaults(),
      projectId,
      userId,
    });
  },

  toggleField: (key) => {
    const { visibleFields, projectId, userId } = get();
    const updated = { ...visibleFields, [key]: !visibleFields[key] };
    set({ visibleFields: updated });
    saveToStorage(projectId, userId, updated);
  },

  setFields: (fields) => {
    const { projectId, userId } = get();
    set({ visibleFields: fields });
    saveToStorage(projectId, userId, fields);
  },

  resetDefaults: () => {
    const { projectId, userId } = get();
    const defaults = getDefaults();
    set({ visibleFields: defaults });
    saveToStorage(projectId, userId, defaults);
  },

  isFieldVisible: (key) => get().visibleFields[key] ?? false,
}));

export { FIELD_DEFINITIONS };
export default useFieldVisibilityStore;
