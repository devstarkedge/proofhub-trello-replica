/**
 * Single source of truth for turning a JS Date into a 'YYYY-MM-DD' key
 * anywhere in the Leave feature's frontend. Never use `date.toISOString()`
 * for this — for a Date built as local midnight (e.g. `new Date(y, m, d)`,
 * which is how every calendar grid in this app builds its cells),
 * `toISOString()` first converts to UTC, and in any timezone AHEAD of UTC
 * (including the Asia/Kolkata default) local midnight is still the
 * PREVIOUS day in UTC — so the derived key silently points one day earlier
 * than the cell it was built from. That was the exact root cause of the
 * Leave Calendar showing Sunday+Monday as Weekly Off instead of
 * Saturday+Sunday: every cell's lookup key was shifted back one day, so
 * each day displayed its predecessor's status. This function instead reads
 * the Date's own local Y/M/D components, which always match the calendar
 * day the cell visually represents, regardless of the browser's UTC offset.
 */
export function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
