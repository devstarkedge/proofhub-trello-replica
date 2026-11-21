import ExcelJS from 'exceljs';
import JSZip from 'jszip';

export const IMPORT_HEADERS = ['Task Name', 'Task Description', 'Task Status', 'Start Date', 'End Date', 'Priority', 'Assignees'];
const FAILURE_HEADERS = ['Excel Row', 'Failed Field', 'Error'];
export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export async function templateWorkbook(statuses, { priorities = [], assignees = [] } = {}) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Tasks');
  sheet.addRow(IMPORT_HEADERS);
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  [36, 65, 28, 18, 18, 18, 60].forEach((width, i) => { sheet.getColumn(i + 1).width = width; });
  const reference = book.addWorksheet('Project Statuses', { state: 'veryHidden' });
  statuses.forEach(title => reference.addRow([title]));
  if (statuses.length) {
    book.definedNames.add(`'Project Statuses'!$A$1:$A$${statuses.length}`, 'ProjectStatuses');
    sheet.dataValidations.add(`C2:C${MAX_IMPORT_ROWS + 1}`, { type: 'list', allowBlank: false, formulae: ['ProjectStatuses'], showErrorMessage: true, errorTitle: 'Invalid task status', error: 'Choose a status from this project.' });
  }
  sheet.getColumn(4).numFmt = 'yyyy-mm-dd';
  sheet.getColumn(5).numFmt = 'yyyy-mm-dd';
  for (const [name, rangeName, column, values] of [
    ['Task Priorities', 'TaskPriorities', 'F', priorities.map(priority => priority.label)],
    ['Project Assignees', 'ProjectAssignees', 'G', assignees.map(member => member.label)],
  ]) {
    const reference = book.addWorksheet(name, { state: 'veryHidden' });
    values.forEach(value => reference.addRow([value]));
    // An empty named reference still supplies a real dropdown when no eligible
    // members exist; the backend rejects every nonempty assignee in that case.
    book.definedNames.add(`'${name}'!$A$1:$A$${Math.max(1, values.length)}`, rangeName);
    sheet.dataValidations.add(`${column}2:${column}${MAX_IMPORT_ROWS + 1}`, {
      type: 'list', allowBlank: true, formulae: [rangeName], showErrorMessage: true,
      errorStyle: column === 'G' ? 'warning' : 'stop',
      errorTitle: column === 'G' ? 'Multiple assignees' : 'Invalid priority',
      error: column === 'G' ? 'For multiple assignees, enter eligible project emails separated by semicolons and confirm the warning. All entries are checked during import.' : 'Choose a supported task priority.',
    });
  }
  sheet.getCell('F1').note = 'Optional. Choose a supported task priority; leave blank to use the normal task default.';
  sheet.getCell('G1').note = 'Optional. Select one project member from the dropdown, or type multiple eligible project emails separated by semicolons: first@example.com; second@example.com. Confirm the Excel validation warning for multiple emails. Every email is checked during import; duplicate selections are removed.';
  return book;
}

export function assigneeEmails(value = '') {
  return [...new Set(value.split(';').map(token => {
    const text = token.trim();
    return (text.match(/<([^<>]+)>$/)?.[1] || text).trim().toLowerCase();
  }).filter(Boolean))];
}

function textCell(cell) {
  const value = cell.value;
  if (value == null) return '';
  if (value instanceof Date) return Number.isFinite(+value) ? value.toISOString().slice(0, 10) : 'Invalid date';
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  // Formula results, hyperlinks and rich text must never become executable data.
  throw new Error('Use plain text or date cells; formulas and embedded objects are not supported');
}
export function parseImportDate(value) {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Use a valid date in YYYY-MM-DD format');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== value) throw new Error('Use a valid date in YYYY-MM-DD format');
  return date;
}
export function validateImportRow(values, statuses, rowNumber, { priorities = [], assignees = [] } = {}) {
  const [title, description, statusName, start, end, priorityInput = '', assigneesInput = ''] = values;
  const row = { rowNumber, values, title, description, statusName, status: 'PENDING' };
  const fail = (field, error) => ({ ...row, field, error });
  if (!title || title.length > 200) return fail('Task Name', 'Task Name is required and must not exceed 200 characters');
  if (description.length > 5000) return fail('Task Description', 'Description must not exceed 5000 characters');
  if (!statusName || statuses.filter(name => name === statusName).length !== 1) return fail('Task Status', 'Choose an unambiguous current project status');
  try { row.startDate = parseImportDate(start); } catch (error) { return fail('Start Date', error.message); }
  try { row.dueDate = parseImportDate(end); } catch (error) { return fail('End Date', error.message); }
  if (row.startDate && row.dueDate && row.dueDate < row.startDate) return fail('End Date', 'End Date is before Start Date');
  if (priorityInput) {
    const priority = priorities.find(option => [option.value.toLowerCase(), option.label.toLowerCase()].includes(priorityInput.toLowerCase()));
    if (!priority) return fail('Priority', 'Choose a supported task priority');
    row.priority = priority.value;
  }
  if (assigneesInput) {
    const emails = assigneeEmails(assigneesInput), byEmail = new Map(assignees.map(member => [member.email.toLowerCase(), member.id]));
    const invalid = emails.find(email => !byEmail.has(email));
    if (!emails.length || invalid) return fail('Assignees', 'Every assignee must be an eligible current member of this project. Use dropdown members or project emails separated by semicolons.');
    row.assignees = [...new Set(emails.map(email => byEmail.get(email)))];
  }
  return row;
}

export async function readImportWorkbook(buffer, statuses, options = {}) {
  if (!buffer.length || buffer.length > MAX_IMPORT_BYTES || buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new Error('Upload an .xlsx file no larger than 2 MB');
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files);
  if (entries.length > 200 || entries.reduce((sum, item) => sum + (item._data?.uncompressedSize || 0), 0) > 12 * 1024 * 1024 || !zip.file('xl/workbook.xml')) throw new Error('Workbook is too large or is not a valid .xlsx file');
  if (entries.some(item => /vbaProject|externalLinks\//i.test(item.name))) throw new Error('Macros and external workbook links are not supported');
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer);
  const sheet = book.getWorksheet('Tasks') || book.worksheets.find(item => item.state === 'visible');
  if (!sheet || sheet.rowCount > MAX_IMPORT_ROWS + 1 || sheet.columnCount > 10) throw new Error(`Use the template with at most ${MAX_IMPORT_ROWS} rows`);
  const columnCount = sheet.columnCount;
  const width = textCell(sheet.getCell(1, 6)) === 'Priority' ? 7 : 5;
  const headers = Array.from({ length: width }, (_, i) => textCell(sheet.getCell(1, i + 1)));
  if (headers.some((value, i) => value !== IMPORT_HEADERS[i])) throw new Error(`Required headers: ${IMPORT_HEADERS.join(', ')}`);
  // The optional trailing columns are emitted by our failed-row export.
  if (columnCount > width && (columnCount > width + 3 || FAILURE_HEADERS.some((name, i) => textCell(sheet.getCell(1, i + width + 1)) !== name))) throw new Error('Unexpected columns. Use the project template.');
  const rows = [];
  for (let index = 2; index <= sheet.rowCount; index++) {
    const cells = Array.from({ length: width }, (_, i) => sheet.getCell(index, i + 1));
    if (cells.every(cell => cell.value == null || cell.value === '')) continue;
    const values = cells.map(cell => { try { return textCell(cell); } catch { return '[Unsupported cell]'; } });
    if (values.some(value => value.length > 10000)) throw new Error(`Row ${index} contains an oversized cell`);
    let row = validateImportRow(values, statuses, index, options);
    const invalidCell = cells.findIndex(cell => cell.value != null && typeof cell.value === 'object' && !(cell.value instanceof Date));
    if (invalidCell !== -1) row = { ...row, field: IMPORT_HEADERS[invalidCell], error: 'Use plain text or dates; formulas and embedded objects are not supported' };
    rows.push(row);
  }
  if (!rows.length) throw new Error('The workbook contains no task rows');
  return rows;
}
