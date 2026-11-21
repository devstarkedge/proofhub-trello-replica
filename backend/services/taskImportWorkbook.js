import ExcelJS from 'exceljs';
import JSZip from 'jszip';

export const IMPORT_HEADERS = ['Task Name', 'Task Description', 'Task Status', 'Start Date', 'End Date'];
export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export async function templateWorkbook(statuses) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Tasks');
  sheet.addRow(IMPORT_HEADERS);
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  [36, 65, 28, 18, 18].forEach((width, i) => { sheet.getColumn(i + 1).width = width; });
  const reference = book.addWorksheet('Project Statuses', { state: 'veryHidden' });
  statuses.forEach(title => reference.addRow([title]));
  if (statuses.length) {
    book.definedNames.add(`'Project Statuses'!$A$1:$A$${statuses.length}`, 'ProjectStatuses');
    sheet.dataValidations.add(`C2:C${MAX_IMPORT_ROWS + 1}`, { type: 'list', allowBlank: false, formulae: ['ProjectStatuses'], showErrorMessage: true, errorTitle: 'Invalid task status', error: 'Choose a status from this project.' });
  }
  sheet.getColumn(4).numFmt = 'yyyy-mm-dd';
  sheet.getColumn(5).numFmt = 'yyyy-mm-dd';
  return book;
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
export function validateImportRow(values, statuses, rowNumber) {
  const [title, description, statusName, start, end] = values;
  const row = { rowNumber, values, title, description, statusName, status: 'PENDING' };
  const fail = (field, error) => ({ ...row, field, error });
  if (!title || title.length > 200) return fail('Task Name', 'Task Name is required and must not exceed 200 characters');
  if (description.length > 5000) return fail('Task Description', 'Description must not exceed 5000 characters');
  if (!statusName || statuses.filter(name => name === statusName).length !== 1) return fail('Task Status', 'Choose an unambiguous current project status');
  try { row.startDate = parseImportDate(start); } catch (error) { return fail('Start Date', error.message); }
  try { row.dueDate = parseImportDate(end); } catch (error) { return fail('End Date', error.message); }
  if (row.startDate && row.dueDate && row.dueDate < row.startDate) return fail('End Date', 'End Date is before Start Date');
  return row;
}

export async function readImportWorkbook(buffer, statuses) {
  if (!buffer.length || buffer.length > MAX_IMPORT_BYTES || buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new Error('Upload an .xlsx file no larger than 2 MB');
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files);
  if (entries.length > 200 || entries.reduce((sum, item) => sum + (item._data?.uncompressedSize || 0), 0) > 12 * 1024 * 1024 || !zip.file('xl/workbook.xml')) throw new Error('Workbook is too large or is not a valid .xlsx file');
  if (entries.some(item => /vbaProject|externalLinks\//i.test(item.name))) throw new Error('Macros and external workbook links are not supported');
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer);
  const sheet = book.getWorksheet('Tasks') || book.worksheets.find(item => item.state === 'visible');
  if (!sheet || sheet.rowCount > MAX_IMPORT_ROWS + 1 || sheet.columnCount > 8) throw new Error(`Use the template with at most ${MAX_IMPORT_ROWS} rows`);
  const headers = Array.from({ length: 5 }, (_, i) => textCell(sheet.getCell(1, i + 1)));
  if (headers.some((value, i) => value !== IMPORT_HEADERS[i])) throw new Error(`Required headers: ${IMPORT_HEADERS.join(', ')}`);
  // The optional trailing columns are emitted by our failed-row export.
  if (sheet.columnCount > 5 && ['Excel Row', 'Failed Field', 'Error'].some((name, i) => textCell(sheet.getCell(1, i + 6)) !== name)) throw new Error('Unexpected columns. Use the project template.');
  const rows = [];
  for (let index = 2; index <= sheet.rowCount; index++) {
    const cells = Array.from({ length: 5 }, (_, i) => sheet.getCell(index, i + 1));
    if (cells.every(cell => cell.value == null || cell.value === '')) continue;
    const values = cells.map(cell => { try { return textCell(cell); } catch { return '[Unsupported cell]'; } });
    if (values.some(value => value.length > 10000)) throw new Error(`Row ${index} contains an oversized cell`);
    let row = validateImportRow(values, statuses, index);
    const invalidCell = cells.findIndex(cell => cell.value != null && typeof cell.value === 'object' && !(cell.value instanceof Date));
    if (invalidCell !== -1) row = { ...row, field: IMPORT_HEADERS[invalidCell], error: 'Use plain text or dates; formulas and embedded objects are not supported' };
    rows.push(row);
  }
  if (!rows.length) throw new Error('The workbook contains no task rows');
  return rows;
}
