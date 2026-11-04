export const newestProjects = projects => [...(projects || [])].sort((a, b) =>
  (+new Date(b.createdAt || 0) || 0) - (+new Date(a.createdAt || 0) || 0) || String(b._id || '').localeCompare(String(a._id || '')));

export function rememberWorkflow(cache, projectId, entry) {
  // Retain at most four small visited projects in memory. Never persist them.
  const entries = Object.entries(cache).filter(([key]) => key !== projectId);
  if (new TextEncoder().encode(JSON.stringify(entry.data)).byteLength <= 1024 * 1024) entries.push([projectId, entry]);
  return Object.fromEntries(entries.slice(-4));
}
