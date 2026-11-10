// The area of x + y <= limit on a unit square is limit²/2 up
// to the opposite corners, then 1 - (2 - limit)²/2.
function diagonalPolygon(fraction, reverse = false) {
  if (!fraction) return null;
  const limit = fraction <= 0.5 ? Math.sqrt(2 * fraction) : 2 - Math.sqrt(2 * (1 - fraction));
  const points = limit <= 1
    ? [[0, 0], [limit, 0], [0, limit]]
    : [[0, 0], [1, 0], [1, limit - 1], [limit - 1, 1], [0, 1]];
  return `polygon(${points.map(point => point.map(value => `${(reverse ? 1 - value : value) * 100}%`).join(' ')).join(', ')})`;
}

export function loggedTimeRegions(project, agenda, required) {
  const total = project + agenda;
  if (!(total > 0)) return { project: null, agenda: null };
  const denominator = Math.max(total, required || 0);
  return {
    project: diagonalPolygon(project / denominator),
    agenda: diagonalPolygon(agenda / denominator, true)
  };
}

export function formatLoggedMinutes(value) {
  const minutes = Math.round(value || 0);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export const timeSourceLabel = source => source === 'AUTO_TRACKED' ? 'Auto-tracked' : 'Manual';

export function workspaceDateRange(timezone, preset, now = new Date()) {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const get = type => date.find(part => part.type === type).value;
  const end = `${get('year')}-${get('month')}-${get('day')}`;
  const start = new Date(`${end}T00:00:00Z`);
  if (preset === 'week') start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  else if (preset === 'month') start.setUTCDate(1);
  else start.setUTCDate(start.getUTCDate() - (preset - 1));
  return { start: start.toISOString().slice(0, 10), end };
}
