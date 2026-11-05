const header = (headers, name) => headers?.get?.(name) ?? headers?.[name.toLowerCase()];
export const responseStatus = error => Number(error?.status || error?.statusCode || error?.response?.status) || 0;
export function retryDelay(error, fallback = 5000, now = Date.now()) {
  if (Number.isFinite(error?.retryAfterMs)) return Math.max(1000, error.retryAfterMs);
  const value = header(error?.response?.headers || error?.headers, 'Retry-After');
  if (value !== undefined && value !== null && value !== '') {
    const seconds = Number(value), delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
    if (Number.isFinite(delay)) return Math.max(1000, delay);
  }
  return fallback;
}
export const temporaryReadFailure = error => {
  const status = responseStatus(error);
  return [408,429].includes(status) || status >= 500 || !status && (error instanceof TypeError || ['ERR_NETWORK','NETWORK_OFFLINE','ECONNABORTED','ETIMEDOUT'].includes(error?.code));
};
export async function readResponseError(response, fallback) {
  const body = await response.json().catch(() => ({}));
  const error = Object.assign(new Error(body.message || fallback || `HTTP error! status: ${response.status}`), { status: response.status, headers: response.headers });
  error.retryAfterMs = retryDelay(error);
  return error;
}
