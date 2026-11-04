// Consume the server's bounded pages without silently discarding later records.
// A caller may cancel when its view/scope changes; no later page is requested then.
export async function collectPagedRead(loadPage, { signal } = {}) {
  const rows = [], seen = new Set();
  let page = 1;
  for (;;) {
    signal?.throwIfAborted();
    const response = await loadPage(page);
    signal?.throwIfAborted();
    if (!Array.isArray(response?.data)) throw new Error('Invalid task page');
    for (const row of response.data) {
      const id = row._id || row.id;
      if (!id || !seen.has(String(id))) rows.push(row);
      if (id) seen.add(String(id));
    }
    if (!response.pagination?.hasNext) return { ...response, data: rows, count: rows.length };
    if (!response.data.length || response.pagination.currentPage && response.pagination.currentPage !== page) throw new Error('Task pagination did not advance');
    page++;
  }
}
