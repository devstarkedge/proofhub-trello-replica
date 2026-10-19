import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { screenshotCache } from '../../services/screenshotCache';
import useTrackingScope from './useTrackingScope';

export default function useScreenshotImage(record, variant = 'thumbnail', lazy = false) {
  const scope = useTrackingScope(), client = useQueryClient();
  const manager = screenshotCache(client);
  const node = useRef(null);
  const [visible, setVisible] = useState(!lazy);
  const [expired, setExpired] = useState(false);
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
    ...manager.images.options(scope, record, variant),
    enabled: Boolean(record?._id && record.status === 'READY' && visible && !expired && !manager.blocked)
  });
  const error = manager.blocked ? 'Screenshot access changed. Reconnect or sign in again.'
    : expired ? 'Screenshot expired' : query.error?.response?.status === 410 ? 'Deleted from storage' : query.error?.message || '';
  // Visibility gates new requests, never an already decoded cache hit. Disabled
  // offscreen consumers remain eligible for the cache's memory eviction.
  return { node, url: error || record?.status !== 'READY' ? '' : query.data?.url || '', loading: query.isFetching, error, retry: query.refetch };
}
