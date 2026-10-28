export const SPREADSHEET_LIMITS = Object.freeze({ bytes: 5 * 1024 * 1024, expandedBytes: 25 * 1024 * 1024, entries: 5000, rows: 10000, columns: 256, cells: 250000 });

function checkZipDirectory(data) {
  if (data[0] !== 0x50 || data[1] !== 0x4b) return false;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let end = data.length - 22;
  while (end >= Math.max(0, data.length - 65557) && view.getUint32(end, true) !== 0x06054b50) end -= 1;
  if (end < Math.max(0, data.length - 65557)) throw new Error('Invalid spreadsheet archive');
  const count = view.getUint16(end + 10, true);
  const directorySize = view.getUint32(end + 12, true);
  let offset = view.getUint32(end + 16, true);
  if (count > SPREADSHEET_LIMITS.entries || offset + directorySize > end || count === 65535) throw new Error('Spreadsheet archive exceeds the import limits');
  let expanded = 0;
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) throw new Error('Invalid spreadsheet directory');
    expanded += view.getUint32(offset + 24, true);
    if (expanded > SPREADSHEET_LIMITS.expandedBytes) throw new Error('Spreadsheet expands beyond the import limit');
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    if (offset > end) throw new Error('Invalid spreadsheet directory');
  }
  return true;
}

async function validateExpandedArchive(data, JSZip) {
  const zip = await JSZip.loadAsync(data);
  const files = Object.values(zip.files).filter(file => !file.dir);
  if (files.length > SPREADSHEET_LIMITS.entries) throw new Error('Too many spreadsheet archive entries');
  let expanded = 0;
  for (const file of files) await new Promise((resolve, reject) => {
    const stream = file.internalStream('uint8array');
    stream.on('data', chunk => {
      expanded += chunk.byteLength;
      if (expanded > SPREADSHEET_LIMITS.expandedBytes) { stream.pause(); reject(new Error('Spreadsheet expands beyond the import limit')); }
    }).on('error', reject).on('end', resolve).resume();
  });
}

/** Called inside a terminable worker in the application. Dependencies are
 * injected so the same parser and limits can be verified in Node fixtures. */
export async function parseSpreadsheet(data, { XLSX, JSZip }) {
  if (!(data instanceof Uint8Array) || data.byteLength > SPREADSHEET_LIMITS.bytes) throw new Error('Choose a spreadsheet smaller than 5 MB');
  if (checkZipDirectory(data)) await validateExpandedArchive(data, JSZip);
  const workbook = XLSX.read(data, { type: 'array', cellDates: false, raw: true, cellHTML: false, bookVBA: false, sheets: 0, sheetRows: SPREADSHEET_LIMITS.rows + 2 });
  const first = workbook.SheetNames[0];
  if (!first || !workbook.Sheets[first]) throw new Error('The spreadsheet has no readable worksheet');
  const worksheet = workbook.Sheets[first];
  const range = XLSX.utils.decode_range(worksheet['!fullref'] || worksheet['!ref'] || 'A1');
  if (range.e.r > SPREADSHEET_LIMITS.rows || range.e.c >= SPREADSHEET_LIMITS.columns) throw new Error('Split spreadsheets larger than 10,000 rows or 256 columns before importing');
  if (Object.keys(worksheet).filter(key => !key.startsWith('!')).length > SPREADSHEET_LIMITS.cells) throw new Error('Split spreadsheets with more than 250,000 filled cells before importing');
  return { ...workbook, SheetNames: [first], Sheets: { [first]: worksheet } };
}
