import { useCallback, useEffect, useRef, useState } from 'react';
import Database from '../services/database';

const INITIAL_BATCH_SIZE = 30;
const NEXT_BATCH_SIZE = 20;

const mergeUniqueTasks = (current, incoming) => {
  const tasksById = new Map(current.map((task) => [String(task.id), task]));
  incoming.forEach((task) => tasksById.set(String(task.id), task));
  return [...tasksById.values()];
};

const useInfiniteAnalyticsTasks = ({ employeeId = '', filters }) => {
  const [tasks, setTasks] = useState([]);
  const [total, setTotal] = useState(0);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [revision, setRevision] = useState(0);
  const sentinelRef = useRef(null);
  const requestInFlightRef = useRef(false);
  const activeControllerRef = useRef(null);
  const generationRef = useRef(0);
  const nextOffsetRef = useRef(0);
  const hasMoreRef = useRef(false);

  const requestPage = useCallback(async ({ offset, limit, replace, generation, signal }) => {
    const params = { ...filters, offset, limit };
    const response = employeeId
      ? await Database.getEmployeeAnalyticsTasks(employeeId, params, { signal })
      : await Database.getAnalyticsTasks(params, { signal });
    if (generation !== generationRef.current || signal.aborted) return;

    const nextTasks = response.data?.tasks || [];
    const pagination = response.data?.pagination || {};
    setTasks((current) => replace ? mergeUniqueTasks([], nextTasks) : mergeUniqueTasks(current, nextTasks));
    setTotal(Number(pagination.total) || 0);
    nextOffsetRef.current = Number.isFinite(Number(pagination.nextOffset))
      ? Number(pagination.nextOffset)
      : offset + nextTasks.length;
    hasMoreRef.current = Boolean(pagination.hasMore);
    setHasMore(Boolean(pagination.hasMore));
    setError('');
  }, [employeeId, filters]);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;
    requestInFlightRef.current = true;
    nextOffsetRef.current = 0;
    hasMoreRef.current = false;
    setTasks([]);
    setTotal(0);
    setHasMore(false);
    setError('');
    setLoadingInitial(true);
    setLoadingMore(false);

    requestPage({ offset: 0, limit: INITIAL_BATCH_SIZE, replace: true, generation, signal: controller.signal })
      .catch((requestError) => {
        if (generation === generationRef.current && requestError.name !== 'AbortError') {
          setError(requestError.message || 'Tasks could not be loaded');
        }
      })
      .finally(() => {
        if (generation === generationRef.current) {
          requestInFlightRef.current = false;
          setLoadingInitial(false);
        }
      });

    return () => controller.abort();
  }, [requestPage, revision]);

  const loadMore = useCallback(async () => {
    if (requestInFlightRef.current || !hasMoreRef.current) return;
    const generation = generationRef.current;
    const controller = new AbortController();
    activeControllerRef.current = controller;
    requestInFlightRef.current = true;
    setLoadingMore(true);
    try {
      await requestPage({
        offset: nextOffsetRef.current,
        limit: NEXT_BATCH_SIZE,
        replace: false,
        generation,
        signal: controller.signal,
      });
    } catch (requestError) {
      if (generation === generationRef.current && requestError.name !== 'AbortError') {
        setError(requestError.message || 'More tasks could not be loaded');
      }
    } finally {
      if (generation === generationRef.current) {
        requestInFlightRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [requestPage]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || loadingInitial || !hasMore) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) loadMore();
    }, { root: null, rootMargin: '320px 0px', threshold: 0.01 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore, loadingInitial, tasks.length]);

  useEffect(() => () => activeControllerRef.current?.abort(), []);

  return {
    tasks,
    total,
    loadingInitial,
    loadingMore,
    error,
    hasMore,
    sentinelRef,
    retry: () => setRevision((value) => value + 1),
  };
};

export default useInfiniteAnalyticsTasks;
