import { useEffect, useRef, useState } from 'react';
import { UserPlus, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '../../services/api';

export default function AddProjectMemberDialog({ projectId, onClose, onAdded }) {
  const dialog = useRef(null);
  const busy = useRef(false);
  const mounted = useRef(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [options, setOptions] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [readError, setReadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const element = dialog.current;
    mounted.current = true;
    element.showModal();
    return () => { mounted.current = false; element.close(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get(`/api/boards/${projectId}/member-options`, {
          params: { q: query.trim(), page }, signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setOptions(data.data);
        setHasMore(data.hasMore);
      } catch (error) {
        if (!controller.signal.aborted) setReadError(error.response?.data?.message || 'Unable to load workspace members.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, query ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [projectId, query, page, attempt]);

  const changeOptions = (change) => {
    setLoading(true);
    setOptions([]);
    setHasMore(false);
    setReadError('');
    change();
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!selected || busy.current) return;
    busy.current = true;
    setSaving(true);
    setSaveError('');
    try {
      const { data } = await api.post(`/api/boards/${projectId}/members`, { userId: selected._id }, { skipOfflineQueue: true });
      if (!mounted.current) return;
      onAdded(data.data);
      toast.success('Project member added');
      onClose();
    } catch (error) {
      if (mounted.current) setSaveError(error.response?.data?.message || 'Unable to add this member. Try again.');
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  return (
    <dialog ref={dialog} aria-labelledby="add-project-member-title"
      onCancel={(event) => { event.preventDefault(); if (!busy.current) onClose(); }}
      className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/55">
      <form onSubmit={submit} className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="add-project-member-title" className="flex items-center gap-2 text-lg font-semibold">
            <UserPlus size={18} className="text-indigo-600" /> Add project member
          </h2>
          <button type="button" disabled={saving} onClick={onClose} aria-label="Close" className="rounded-lg p-2 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-slate-600">Choose someone from this workspace to give them access to this project.</p>
        <input autoFocus aria-label="Search workspace members" placeholder="Search by name or email"
          value={query} onChange={(event) => changeOptions(() => { setQuery(event.target.value); setPage(1); })}
          disabled={saving} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        {readError ? (
          <div className="text-sm" role="alert">
            <p className="text-red-700">{readError}</p>
            <button type="button" className="mt-2 text-indigo-700 underline"
              onClick={() => changeOptions(() => setAttempt(value => value + 1))}>Retry</button>
          </div>
        ) : loading ? <p className="text-sm text-slate-500" role="status">Loading members…</p>
          : options.length === 0 ? <p className="text-sm text-slate-500">No available members found.</p>
          : (
            <fieldset disabled={saving} className="max-h-52 space-y-1 overflow-y-auto">
              <legend className="sr-only">Member to add</legend>
              {options.map(member => (
                <label key={member._id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-2 hover:bg-slate-50">
                  <input type="radio" name="project-member" checked={selected?._id === member._id} onChange={() => { setSelected(member); setSaveError(''); }} />
                  <span className="min-w-0"><span className="block truncate text-sm font-medium">{member.name}</span>
                    <span className="block truncate text-xs text-slate-500">{member.email}</span></span>
                </label>
              ))}
            </fieldset>
          )}
        {!loading && !readError && (page > 1 || hasMore) && (
          <div className="flex items-center justify-between text-sm">
            <button type="button" disabled={page === 1 || saving} onClick={() => changeOptions(() => setPage(value => value - 1))} className="text-indigo-700 disabled:text-slate-400">Previous</button>
            <button type="button" disabled={!hasMore || saving} onClick={() => changeOptions(() => setPage(value => value + 1))} className="text-indigo-700 disabled:text-slate-400">Next</button>
          </div>
        )}
        {saveError && <p role="alert" className="text-sm text-red-700">{saveError}</p>}
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm text-slate-600">{selected?.name}</span>
          <button type="submit" disabled={!selected || saving}
            className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saving ? 'Adding…' : 'Add member'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
