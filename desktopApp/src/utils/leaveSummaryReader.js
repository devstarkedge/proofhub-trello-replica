const SUMMARY_KEYS = ['pending', 'approved', 'rejected', 'cancelled', 'today'];

export function normalizeLeaveSummaryResponse(payload) {
  const summary = payload?.data?.summary;
  if (!summary || SUMMARY_KEYS.some((key) => !Number.isSafeInteger(summary[key]) || summary[key] < 0)) {
    throw new Error('The leave service returned invalid statistics. Please refresh to retry.');
  }
  return { success: payload.success, data: {
    summary: Object.fromEntries(SUMMARY_KEYS.map((key) => [key, summary[key]])),
    today: payload.data.today, timezone: payload.data.timezone,
  } };
}

// Cache endpoint availability only, never user/workspace totals. Probe again
// after five minutes so a rolling backend upgrade is picked up automatically.
export function createLeaveSummaryReader(get, now = Date.now) {
  let unavailableUntil = 0;
  return async (params = {}, options = {}) => {
    if (now() >= unavailableUntil) {
      try {
        const response = await get('/dashboard/summary', { ...options, params, suppressNotFoundToast: true });
        return normalizeLeaveSummaryResponse(response.data);
      } catch (error) {
        // Only an absent route warrants the compatibility read. Authentication,
        // permission, network and server failures must remain failures.
        if (error.response?.status !== 404 || options.signal?.aborted) throw error;
        unavailableUntil = now() + 5 * 60 * 1000;
      }
    }
    options.signal?.throwIfAborted();
    const response = await get('/dashboard/records', {
      ...options, params: { status: 'all', page: 1, limit: 1, includeSummary: true },
    });
    return normalizeLeaveSummaryResponse(response.data);
  };
}
