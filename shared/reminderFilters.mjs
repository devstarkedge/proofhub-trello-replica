export function reminderViewQuery(view, now = new Date()) {
  const upcoming = { status: { $nin: ['completed', 'cancelled'] } };
  if (view === 'upcoming') return { ...upcoming, scheduledDate: { $gte: now } };
  if (view === 'dueSoon') return { ...upcoming, scheduledDate: { $gte: now, $lte: new Date(+now + 86400000) } };
  if (view === 'overdue') return { ...upcoming, scheduledDate: { $lt: now } };
  if (view === 'success') return { status: 'completed' };
  if (['pending', 'sent', 'completed', 'missed', 'cancelled'].includes(view)) return { status: view };
  return {};
}
