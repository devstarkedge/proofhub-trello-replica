/**
 * Enterprise CSV export for workflow boards.
 * Generates a downloadable CSV report from the current (filtered) board data.
 */

const escapeCSV = (value) => {
  if (value == null) return '';
  const str = String(value);
  // If the value contains commas, quotes, or newlines — wrap in quotes and escape inner quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatTimeMinutes = (totalMinutes) => {
  if (!totalMinutes || totalMinutes <= 0) return '0h';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

/**
 * @param {Object} params
 * @param {Object} params.board - Board object with name, etc.
 * @param {Array}  params.lists - Array of list objects
 * @param {Object} params.cardsByList - { listId: Card[] } (already filtered)
 * @param {string} params.userName - Name of user performing the export
 */
export function generateWorkflowCSV({ board, lists, cardsByList, userName }) {
  const rows = [];

  // Master header block
  rows.push([`Project Report: ${board.name || 'Untitled'}`]);
  rows.push([`Exported on: ${new Date().toLocaleString()}`]);
  rows.push([`Exported by: ${userName || 'Unknown'}`]);
  rows.push([]); // blank spacer row

  // Column headers
  const headers = [
    'List / Status',
    'Task Name',
    'Description',
    'Priority',
    'Labels',
    'Assignees',
    'Start Date',
    'Due Date',
    'Subtasks Total',
    'Subtasks Completed',
    'Attachments',
    'Comments',
    'Time Tracked',
    'Created By',
    'Last Updated',
    'Task ID',
  ];
  rows.push(headers);

  // Data rows — iterate lists in order, then cards within each list
  for (const list of lists) {
    const cards = cardsByList[list._id] || [];
    for (const card of cards) {
      const labels = (card.labels || [])
        .map(l => (typeof l === 'object' ? l.name : l))
        .filter(Boolean)
        .join('; ');

      const assignees = (card.assignees || [])
        .map(a => (typeof a === 'object' ? a.name : a))
        .filter(Boolean)
        .join('; ');

      const subtaskStats = card.subtaskStats || {};
      const totalSubtasks = subtaskStats.total ?? (card.subtasks?.length || 0);
      const completedSubtasks = subtaskStats.completed ?? (card.subtasks?.filter(s => s.completed).length || 0);

      const attachmentsCount =
        typeof card.attachmentsCount === 'number'
          ? card.attachmentsCount
          : (card.attachments?.length || 0);

      const commentsCount = card.comments?.length || 0;

      const totalLoggedMinutes = (card.loggedTime || []).reduce(
        (acc, log) => acc + ((log.hours || 0) * 60) + (log.minutes || 0),
        0
      );

      const createdByName =
        typeof card.createdBy === 'object'
          ? card.createdBy?.name || ''
          : '';

      rows.push([
        list.title,
        card.title || '',
        (card.description || '').replace(/\n/g, ' '),
        card.priority || '',
        labels,
        assignees,
        formatDate(card.startDate),
        formatDate(card.dueDate),
        totalSubtasks,
        completedSubtasks,
        attachmentsCount,
        commentsCount,
        formatTimeMinutes(totalLoggedMinutes),
        createdByName,
        formatDate(card.updatedAt),
        card._id || '',
      ]);
    }
  }

  // Build CSV string
  const csv = rows.map(row => row.map(escapeCSV).join(',')).join('\r\n');

  // BOM for proper Unicode display in Excel
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });

  // Trigger download
  const projectName = (board.name || 'project').replace(/[^a-zA-Z0-9_-]/g, '_');
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `${projectName}-workflow-report-${dateStr}.csv`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return filename;
}
