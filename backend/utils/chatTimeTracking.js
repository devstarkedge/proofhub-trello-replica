import { chatHooks } from './chatHooks.js';

export const CHAT_TIME_ENTRY_TYPES = Object.freeze({
  LOGGED: 'logged',
  ESTIMATION: 'estimation',
});

function toEntryId(entry) {
  return (entry?._id || entry?.id)?.toString() || null;
}

function toInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toComparableDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function normalizeEntry(entry, entryType) {
  if (!entry) return null;

  return {
    id: toEntryId(entry),
    hours: toInteger(entry.hours),
    minutes: toInteger(entry.minutes),
    description: entryType === CHAT_TIME_ENTRY_TYPES.LOGGED ? entry.description || '' : '',
    reason: entryType === CHAT_TIME_ENTRY_TYPES.ESTIMATION ? entry.reason || '' : '',
    date: toComparableDate(entry.date),
  };
}

function entriesEqual(previousEntry, currentEntry, entryType) {
  const previous = normalizeEntry(previousEntry, entryType);
  const current = normalizeEntry(currentEntry, entryType);

  if (!previous && !current) return true;
  if (!previous || !current) return false;

  return previous.hours === current.hours
    && previous.minutes === current.minutes
    && previous.description === current.description
    && previous.reason === current.reason
    && previous.date === current.date;
}

function buildEntryMap(entries) {
  const map = new Map();

  for (const entry of entries || []) {
    const entryId = toEntryId(entry);
    if (entryId) {
      map.set(entryId, entry);
    }
  }

  return map;
}

export function diffTimeEntryChanges(previousEntries = [], currentEntries = [], entryType) {
  if (!Object.values(CHAT_TIME_ENTRY_TYPES).includes(entryType)) {
    return [];
  }

  const changes = [];
  const previousMap = buildEntryMap(previousEntries);
  const currentMap = buildEntryMap(currentEntries);

  for (const currentEntry of currentEntries || []) {
    const entryId = toEntryId(currentEntry);

    if (!entryId) {
      changes.push({
        operation: 'added',
        previousEntry: null,
        currentEntry,
      });
      continue;
    }

    const previousEntry = previousMap.get(entryId);

    if (!previousEntry) {
      changes.push({
        operation: 'added',
        previousEntry: null,
        currentEntry,
      });
      continue;
    }

    if (!entriesEqual(previousEntry, currentEntry, entryType)) {
      changes.push({
        operation: 'updated',
        previousEntry,
        currentEntry,
      });
    }
  }

  for (const previousEntry of previousEntries || []) {
    const entryId = toEntryId(previousEntry);

    if (!entryId || currentMap.has(entryId)) {
      continue;
    }

    changes.push({
      operation: 'deleted',
      previousEntry,
      currentEntry: null,
    });
  }

  return changes;
}

export async function emitTimeEntryWebhook({ operation, entryType, ...context }) {
  if (!Object.values(CHAT_TIME_ENTRY_TYPES).includes(entryType)) {
    return;
  }

  const payload = {
    ...context,
    entryType,
    operation,
  };

  if (operation === 'added') {
    await chatHooks.onTimeEntryAdded(payload);
    return;
  }

  if (operation === 'updated') {
    await chatHooks.onTimeEntryUpdated(payload);
    return;
  }

  if (operation === 'deleted') {
    await chatHooks.onTimeEntryDeleted(payload);
  }
}

export async function emitTimeEntryDiffs({ previousEntries = [], currentEntries = [], ...context }) {
  const changes = diffTimeEntryChanges(previousEntries, currentEntries, context.entryType);

  for (const change of changes) {
    await emitTimeEntryWebhook({
      ...context,
      ...change,
    });
  }

  return changes;
}