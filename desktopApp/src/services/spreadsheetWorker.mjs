import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { parseSpreadsheet } from '../../../shared/spreadsheetParsing.mjs';
self.onmessage = async event => {
  try { self.postMessage({ workbook: await parseSpreadsheet(new Uint8Array(event.data), { XLSX, JSZip }) }); }
  catch (error) { self.postMessage({ error: error.message || 'Could not read spreadsheet' }); }
};
