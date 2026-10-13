/**
 * Centralized date utility for the Sales module.
 * Ensures consistent dd-mm-yyyy formatting.
 */

/**
 * Formats a date string or object to "dd-mm-yyyy"
 * @param {string|Date} date - The date to format
 * @returns {string} - Formatted date string or "-" if invalid
 */
export const formatSalesDate = (date) => {
  if (!date) return '-';
  
  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';
  
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  
  return `${day}-${month}-${year}`;
};

/**
 * format for input[type="date"] (yyyy-mm-dd)
 * Used when we need to interact with native inputs or backend that expects YYYY-MM-DD
 * @param {string|Date} date 
 * @returns {string}
 */
export const toISOFormat = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

/**
 * Parses a date string to a Date object.
 * ALWAYS treats dd-mm-yyyy as the canonical format.
 * Never relies on new Date(string) for ambiguous formats.
 * @param {string|Date|number} val 
 * @returns {Date|null}
 */
export const parseSalesDate = (val) => {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }

  // Excel serial date numbers (e.g., 45662)
  if (typeof val === 'number' && !isNaN(val)) {
    if (val > 10000) {
      // Likely an Excel serial date
      const excelEpoch = Date.UTC(1899, 11, 30);
      const date = new Date(excelEpoch + val * 24 * 60 * 60 * 1000);
      return isNaN(date.getTime()) ? null : date;
    }
    return null;
  }
  
  const s = String(val).trim();
  if (!s) return null;

  // Numeric strings that represent Excel serial dates
  if (s.match(/^\d+(\.\d+)?$/) && Number(s) > 10000) {
    const num = Number(s);
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + num * 24 * 60 * 60 * 1000);
    return isNaN(date.getTime()) ? null : date;
  }

  // DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY — ALWAYS tried first (canonical format)
  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10);
    const year = parseInt(dmy[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const dt = new Date(year, month - 1, day);
      return isNaN(dt.getTime()) ? null : dt;
    }
  }

  // ISO format YYYY-MM-DD (from backend / database) — safe, unambiguous
  if (s.match(/^\d{4}-\d{2}-\d{2}/)) {
    const native = new Date(s);
    return isNaN(native.getTime()) ? null : native;
  }

  // Short year: dd-mm-yy
  const dmyShort = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})$/);
  if (dmyShort) {
    const day = parseInt(dmyShort[1], 10);
    const month = parseInt(dmyShort[2], 10);
    const year = 2000 + parseInt(dmyShort[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const dt = new Date(year, month - 1, day);
      return isNaN(dt.getTime()) ? null : dt;
    }
  }

  // Fallback to native parsing only for clearly unambiguous formats (e.g., "January 6, 2025")
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};
