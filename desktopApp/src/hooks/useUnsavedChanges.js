import { useMemo } from 'react';

const FIELD_LABELS = {
  title: 'Title',
  description: 'Description',
  priority: 'Priority',
  status: 'Status',
  assignees: 'Assignees',
  dueDate: 'Due Date',
  startDate: 'Start Date',
  labels: 'Labels',
  attachments: 'Attachments',
  tags: 'Tags',
};

/**
 * Serialize a value for deep equality comparison.
 * Arrays are sorted and normalized to handle reordering.
 */
const serialize = (value) => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    const normalized = [...value]
      .map((item) => {
        if (typeof item === 'object' && item !== null) {
          return item._id || item.id || JSON.stringify(item);
        }
        return String(item);
      })
      .sort();
    return JSON.stringify(normalized);
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

/**
 * Detects unsaved changes by comparing an initial snapshot against current values.
 *
 * @param {{ initialValues: object|null, currentValues: object }} options
 * @returns {{ isDirty: boolean, dirtyFields: string[] }}
 */
const useUnsavedChanges = ({ initialValues, currentValues }) => {
  const dirtyFields = useMemo(() => {
    if (!initialValues || !currentValues) return [];
    return Object.keys(FIELD_LABELS)
      .filter((field) => {
        const initial = serialize(initialValues[field]);
        const current = serialize(currentValues[field]);
        return initial !== current;
      })
      .map((field) => FIELD_LABELS[field]);
  }, [initialValues, currentValues]);

  return { isDirty: dirtyFields.length > 0, dirtyFields };
};

export default useUnsavedChanges;
