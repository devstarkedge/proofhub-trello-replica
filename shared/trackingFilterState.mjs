export async function collectTrackingFilterOptions(load, { projectId, userId, signal } = {}) {
  const projects = new Map(), tasks = new Map(), visited = new Set();
  let cursor, taskCursor;
  for (let page = 0; page < 1000; page++) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const next = await load({ projectId, userId, cursor, taskCursor }, signal);
    for (const row of next.projects || []) projects.set(String(row._id), row);
    for (const row of next.tasks || []) tasks.set(String(row._id), row);
    cursor = projectId ? null : next.nextProjectCursor;
    taskCursor = projectId ? next.nextTaskCursor : null;
    if (!cursor && !taskCursor) return { projects: [...projects.values()], tasks: [...tasks.values()] };
    const key = `${cursor || ''}:${taskCursor || ''}`;
    if (visited.has(key)) throw new Error('Filter options could not finish loading. Please retry.');
    visited.add(key);
  }
  throw new Error('Narrow the filter options before retrying.');
}

export function filterTrackingRows(rows, filters) {
  const search = String(filters.search || '').trim().toLocaleLowerCase();
  return rows.filter(row => (!search || row.name.toLocaleLowerCase().includes(search)) &&
    (!filters.userId || String(row.userId) === filters.userId) &&
    (!filters.status || row.trackingStatus === filters.status) &&
    (!filters.departmentId || row.departments?.some(department => String(department._id) === filters.departmentId)));
}
