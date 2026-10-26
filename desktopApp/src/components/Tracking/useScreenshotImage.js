import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { screenshotCache } from '../../services/screenshotCache';
import { transientScreenshotError } from '../../../../shared/screenshotCache.mjs';
import useTrackingScope from './useTrackingScope';

export default function useScreenshotImage(record, _variant, lazy = false) {
  const scope = useTrackingScope(), client = useQueryClient();
  const manager = screenshotCache(client);
  const node = useRef(null);
  const [visible, setVisible] = useState(!lazy);
  const [expired, setExpired] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!lazy) return;
    const observer = new IntersectionObserver(entries => {
      setVisible(entries.some(e => e.isIntersecting));
    }, { rootMargin: '150px' });
    if (node.current) observer.observe(node.current);
    return () => observer.disconnect();
  }, [lazy]);
  useEffect(() => {
    setExpired(false);
    if (!record?.expiresAt) return;
    let timer;
    const check = () => {
      const remaining = +new Date(record.expiresAt) - Date.now();
      if (remaining > 0) timer = setTimeout(check, Math.min(2147483647, remaining));
      else { setExpired(true); manager.images.invalidate(record._id); }
    };
    check();
    return () => clearTimeout(timer);
  }, [manager, record?._id, record?.expiresAt]);
  const query = useQuery({
    ...manager.images.options(scope, record),
    enabled: cached => Boolean(record?._id && record.status === 'READY' && visible && !expired && !manager.blocked && cached.state.status !== 'error')
  });
  const { refetch } = query;
  useEffect(() => {
    if (!query.data?.authorizedUntil || !visible || expired || manager.blocked || query.isError) return;
    let timer;
    const validate = () => {
      const remaining = query.data.authorizedUntil - Date.now();
      if (remaining > 0) timer = setTimeout(validate, Math.min(remaining, 2147483647));
      else { tick(n => n + 1); void refetch({ cancelRefetch: false }); }
    };
    validate();
    return () => clearTimeout(timer);
  }, [query.data?.authorizedUntil, query.isError, visible, expired, manager.blocked, refetch]);
  const error = manager.blocked ? 'Screenshot access changed. Reconnect or sign in again.'
    : expired ? 'Screenshot expired' : record && record.status !== 'READY' ? record.uploadStatus || 'Screenshot unavailable'
    : query.error?.response?.status === 410 ? 'Deleted from storage' : query.error?.message || '';
  // Visibility gates new requests, never an already decoded cache hit. Disabled
  // offscreen consumers remain eligible for the cache's memory eviction.
  const authorized = query.data?.authorizedUntil > Date.now();
  const denied = manager.blocked || expired || [401, 403, 404, 410].includes(query.error?.response?.status);
  return { node, url: denied || record?.status !== 'READY' || !authorized ? '' : query.data?.url || '',
    loading: query.isFetching || query.fetchStatus === 'paused', error,
    canRetry: Boolean(query.error && transientScreenshotError(query.error) && !manager.blocked && !expired), retry: query.refetch };
}
