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
 * Prioritizes dd-mm-yyyy, then mm-dd-yyyy, then ISO.
 * @param {string|Date} val 
 * @returns {Date|null}
 */
export const parseSalesDate = (val) => {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  
  const s = String(val).trim();
  if (!s) return null;

  // Try ISO / native parse first (if it's a full ISO string from backend)
  // But be careful, NEW Date('13-01-2026') might be invalid in some browsers or locales if not ISO.
  // So we accept ISO if it contains 'T' or looks like YYYY-MM-DD
  if (s.match(/^\d{4}-\d{2}-\d{2}/)) {
    const native = new Date(s);
    return isNaN(native.getTime()) ? null : native;
  }

  // dd/mm/yyyy or d/m/yyyy or dd-mm-yyyy or dd.mm.yyyy
  // prioritized over mm/dd/yyyy
  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10);
    const year = parseInt(dmy[3], 10);
    const dt = new Date(year, month - 1, day);
    return isNaN(dt.getTime()) ? null : dt;
  }

  // mm/dd/yyyy - fallback
  const mdy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (mdy) {
    const p1 = parseInt(mdy[1], 10); // month?
    const p2 = parseInt(mdy[2], 10); // day?
    const y = parseInt(mdy[3], 10);
    const year = y < 100 ? 2000 + y : y;
    
    // Assume Month/Day/Year
    const dt = new Date(year, p1 - 1, p2);
    return isNaN(dt.getTime()) ? null : dt;
  }

  // Fallback to native
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};
