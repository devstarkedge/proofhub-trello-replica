import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeSearch } from '../../../shared/projectView.mjs';
import { createProjectSearchIndex, searchProjectIndex } from '../utils/projectSearch';

export default function useProjectSearch(departments, scopeKey) {
  const engine = useRef(null);
  const intent = useRef('');
  const committed = useRef('');
  const requestId = useRef(0);
  const version = useRef(0);
  const currentData = useRef(departments);
  const [state, setState] = useState({ query: '', result: null, loading: false, error: null });
  const cancelRequest = useCallback(() => { requestId.current++; }, []);
  const execute = useCallback(value => {
    const query = normalizeSearch(value);
    intent.current = query;
    committed.current = query;
    const id = ++requestId.current;
    if (!query) {
      setState({ query: '', result: null, loading: false, error: null });
      return;
    }
    setState({ query, result: null, loading: true, error: null });
    if (engine.current) {
      engine.current.postMessage({ type: 'search', query, id, version: version.current });
    } else {
      // Fallback for browsers that cannot start module workers. Yield before
      // computation and honor the same invalidation contract.
      setTimeout(() => {
        if (id !== requestId.current || query !== intent.current) return;
        try {
          const result = searchProjectIndex(createProjectSearchIndex(currentData.current), query);
          if (id === requestId.current) setState({ query, result, loading: false, error: null });
        } catch (error) {
          console.error('Project search failed:', error);
          setState({ query, result: null, loading: false, error: 'Could not search projects. Please try again.' });
        }
      }, 0);
    }
  }, []);
  // Raw input invalidates obsolete results immediately, before its debounce.
  const invalidate = useCallback(value => {
    const query = normalizeSearch(value);
    if (query === intent.current) return;
    intent.current = query;
    requestId.current++;
    if (!query) execute('');
  }, [execute]);

  useEffect(() => {
    intent.current = '';
    committed.current = '';
    setState({ query: '', result: null, loading: false, error: null });
    let worker;
    try {
      worker = new Worker(new URL('../workers/projectSearch.worker.js', import.meta.url), { type: 'module' });
      engine.current = worker;
      worker.onmessage = ({ data }) => {
        if (data.id !== requestId.current || data.version !== version.current || data.query !== intent.current) return;
        setState({ query: data.query, result: data.result || null, loading: false, error: data.error ? 'Could not search projects. Please try again.' : null });
      };
      worker.onerror = error => {
        console.error('Project search worker failed:', error.message);
        worker.terminate();
        engine.current = null;
        if (intent.current === committed.current) execute(committed.current);
      };
    } catch { engine.current = null; }
    return () => {
      cancelRequest();
      worker?.terminate();
      engine.current = null;
    };
  }, [scopeKey, execute, cancelRequest]);

  useEffect(() => {
    currentData.current = departments;
    version.current++;
    engine.current?.postMessage({ type: 'index', version: version.current, departments: departments.map(department => ({
      _id: department._id, name: department.name,
      projects: department.projects?.map(project => ({ _id: project._id, name: project.name, description: project.description })),
    })) });
    requestId.current++;
    if (intent.current === committed.current) execute(committed.current);
  }, [departments, scopeKey, execute]);

  return { ...state, search: execute, invalidate };
}
