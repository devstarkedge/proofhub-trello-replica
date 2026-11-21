import { useEffect, useRef, useState } from 'react';
import { Download, Upload, Loader2, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '../../services/api';
import useWorkflowStore from '../../store/workflowStore';

const active = job => ['QUEUED', 'PROCESSING'].includes(job?.status);
const terminal = job => ['COMPLETED', 'PARTIAL', 'FAILED'].includes(job?.status);
const labels = { READY: 'Ready to import', QUEUED: 'Queued — waiting for processing', PROCESSING: 'Importing tasks…', COMPLETED: 'Completed', PARTIAL: 'Partially completed', FAILED: 'Failed' };

export default function TaskImportModal({ board, departmentId, onClose }) {
  const dialog = useRef(null), busy = useRef(false), mounted = useRef(false), current = useRef(null), announced = useRef(null), selectionVersion = useRef(0);
  const [job, setJob] = useState(null), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const base = `/api/departments/${departmentId}/projects/${board._id}/task-imports`;
  const workspaceId = localStorage.getItem('workspaceId');
  const update = value => {
    const previous = current.current;
    if (previous && value && previous.id === value.id && (previous.processed > value.processed || terminal(previous) && !terminal(value))) return;
    if (previous?.id !== value?.id) selectionVersion.current++;
    current.current = value; setJob(value);
  };

  useEffect(() => {
    mounted.current = true;
    const element = dialog.current;
    element.showModal();
    const controller = new AbortController();
    let timer, lastEvent = 0, failures = 0, pendingRead;
    const accept = data => {
      if (!mounted.current || controller.signal.aborted) return;
      const previous = current.current;
      if (previous?.id === data?.id && data && (previous.processed > data.processed || terminal(previous) && !terminal(data))) return;
      current.current = data; setJob(data);
      if (terminal(data) && announced.current !== data.id) {
        announced.current = data.id;
        const store = useWorkflowStore.getState();
        store.invalidateProjectCache(board._id);
        if (store.currentProjectId === board._id) void store.initializeWorkflow(board._id);
        if (active(previous)) toast[data.failed ? 'warning' : 'success'](`${data.successful} tasks imported; ${data.failed} failed`);
      }
    };
    const read = () => {
      if (pendingRead) return pendingRead;
      const version = selectionVersion.current;
      const jobId = current.current?.id;
      pendingRead = api.get(jobId ? `${base}/${jobId}` : `${base}/latest`, { signal: controller.signal })
        .then(({ data }) => {
          if (version !== selectionVersion.current) return;
          // Reopening starts a fresh upload after success. A job already open
          // here still shows its completion, and unfinished/error recovery stays available.
          accept(!jobId && data.data?.status === 'COMPLETED' ? null : data.data);
          failures = 0; setError('');
        })
        .catch(reason => {
          if (controller.signal.aborted || version !== selectionVersion.current) return;
          failures++;
          if ([401, 403, 404].includes(reason.response?.status)) { current.current = null; setJob(null); }
          setError(reason.response?.data?.message || 'Connection interrupted. Progress will recover when the connection returns.');
        })
        .finally(() => { pendingRead = null; if (!controller.signal.aborted) setLoading(false); });
      return pendingRead;
    };
    const progress = event => {
      const data = event.detail;
      if (String(data.workspaceId) !== String(workspaceId) || data.board !== board._id || data.id !== current.current?.id) return;
      lastEvent = Date.now();
      // Events carry actual committed counts, never task text or row errors.
      const merged = { ...current.current, ...data, errors: current.current.errors, invalid: current.current.invalid };
      accept(merged);
      if (terminal(data)) void read();
    };
    const reconnect = () => { if (!current.current || active(current.current)) void read(); };
    // Bounded reconciliation only while this modal has an active job. Socket
    // traffic suppresses polling; no page-level polling or progress simulation.
    const reconcile = async () => {
      if (active(current.current) && Date.now() - lastEvent > 5000) await read();
      if (!controller.signal.aborted) timer = setTimeout(reconcile, Math.min(30000, 5000 * 2 ** Math.min(failures, 3)));
    };
    void read();
    timer = setTimeout(reconcile, 5000);
    window.addEventListener('socket-task-import-progress', progress);
    window.addEventListener('socket-connected', reconnect);
    window.addEventListener('online', reconnect);
    return () => {
      mounted.current = false; controller.abort(); clearTimeout(timer); element.close();
      window.removeEventListener('socket-task-import-progress', progress);
      window.removeEventListener('socket-connected', reconnect);
      window.removeEventListener('online', reconnect);
    };
  }, [base, board._id, workspaceId]);

  const selectFile = async file => {
    if (!file || busy.current || active(current.current) || loading) return;
    if (!/\.xlsx$/i.test(file.name) || file.size > 2 * 1024 * 1024) { setError('Select an .xlsx file no larger than 2 MB.'); return; }
    busy.current = true; setSaving(true); setError('');
    try {
      const body = new FormData(); body.append('file', file);
      const { data } = await api.post(`${base}/validate`, body, { headers: { 'Content-Type': 'multipart/form-data' }, skipOfflineQueue: true });
      if (mounted.current) update(data.data);
    } catch (reason) { if (mounted.current) { update(null); setError(reason.response?.data?.message || 'Unable to validate the workbook.'); } }
    finally { busy.current = false; if (mounted.current) setSaving(false); }
  };
  const start = async () => {
    if (busy.current || !current.current || current.current.status !== 'READY') return;
    busy.current = true; setSaving(true); setError('');
    try {
      const { data } = await api.post(`${base}/${current.current.id}/start`, {}, { skipOfflineQueue: true });
      if (mounted.current) update(data.data);
    } catch (reason) { if (mounted.current) setError(reason.response?.data?.message || 'Unable to confirm submission. Reopen this modal to recover its current status.'); }
    finally { busy.current = false; if (mounted.current) setSaving(false); }
  };
  const retryFailed = async () => {
    if (busy.current || !terminal(current.current) || !current.current.failed) return;
    busy.current = true; setSaving(true); setError('');
    try {
      const { data } = await api.post(`${base}/${current.current.id}/retry-failed`, {}, { skipOfflineQueue: true });
      if (mounted.current) update(data.data);
    } catch (reason) { if (mounted.current) setError(reason.response?.data?.message || 'Unable to prepare failed rows for retry.'); }
    finally { busy.current = false; if (mounted.current) setSaving(false); }
  };
  const download = async (path, name) => {
    try {
      const response = await api.get(`${base}/${path}`, { responseType: 'blob' });
      if (!mounted.current) return;
      const url = URL.createObjectURL(response.data), link = document.createElement('a');
      link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { if (mounted.current) setError('Unable to download. Check your connection and project access.'); }
  };
  const running = active(job), percent = job?.total ? Math.floor(job.processed * 100 / job.total) : 0;
  const button = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed';
  return (
    <dialog ref={dialog} onCancel={onClose} aria-labelledby="task-import-title" className="m-auto w-[min(94vw,720px)] max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 text-gray-900 shadow-2xl backdrop:bg-black/50 dark:bg-gray-900 dark:text-gray-100">
      <div className="flex items-start justify-between gap-4">
        <div><h2 id="task-import-title" className="text-xl font-bold">Task Import</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{board.name}</p></div>
        <button aria-label="Close task import" onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={20} /></button>
      </div>
      <p className="my-4 text-sm">Download this project’s template, fill in your tasks, then upload it. Up to 500 tasks and 2 MB per workbook. Dates use YYYY-MM-DD.</p>
      <button className={`${button} border border-purple-300 text-purple-700 dark:text-purple-300`} onClick={() => download('template', 'flowtask-task-template.xlsx')}><Download size={16} />Download Sample Excel</button>
      <label tabIndex={saving || running || loading ? -1 : 0} onKeyDown={event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); event.currentTarget.querySelector('input').click(); } }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void selectFile(event.dataTransfer.files[0]); }} className="my-5 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-purple-300 p-6 text-center focus-visible:outline-purple-600 dark:border-purple-700">
        <Upload className="text-purple-500" /><span className="font-medium">Browse or drop an Excel file</span><span className="text-xs text-gray-500">.xlsx · maximum 2 MB · 500 task rows</span>
        <input aria-label="Select task workbook" type="file" accept=".xlsx" className="sr-only" disabled={saving || running || loading} onChange={event => { void selectFile(event.target.files[0]); event.target.value = ''; }} />
      </label>
      {(loading || saving) && <p className="flex items-center gap-2 text-sm"><Loader2 size={16} className="animate-spin" />{loading ? 'Recovering recent import…' : 'Validating or submitting…'}</p>}
      {error && <p role="alert" className="my-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>}
      {job && <section aria-live="polite" className="my-4 space-y-3">
        <p className="break-all text-sm font-medium">{job.fileName} · {job.total} task rows</p>
        <div className="flex items-center gap-2 font-semibold">{running && <Loader2 size={16} className="animate-spin" />}{labels[job.status]}</div>
        {job.status === 'READY' ? <p className="text-sm">{job.invalid} rows need correction. Valid rows can still be imported; invalid rows will be reported individually.</p> : <>
          <div className="flex justify-between text-sm"><span>{job.processed} / {job.total} tasks processed</span><span>{percent}%</span></div>
          <progress aria-label="Task import progress" className="h-3 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-gray-100 [&::-webkit-progress-value]:bg-purple-600 dark:[&::-webkit-progress-bar]:bg-gray-800 [&::-moz-progress-bar]:bg-purple-600" value={job.processed} max={job.total} />
          <div className="grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-4">{[['Total', job.total], ['Successful', job.successful], ['Failed', job.failed], ['Pending', job.pending]].map(([label, value]) => <div key={label} className="rounded-lg bg-gray-100 p-2 dark:bg-gray-800"><strong className="block">{value}</strong>{label}</div>)}</div>
        </>}
          {job.errors?.length > 0 && <>
          <div className="max-h-48 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700"><table className="w-full text-left text-xs"><thead><tr>{['Row', 'Task', 'Field', 'Error'].map(label => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>{job.errors.map(row => <tr key={row.rowNumber} className="border-t border-gray-200 dark:border-gray-700"><td className="p-2">{row.rowNumber}</td><td className="p-2">{row.title || '—'}</td><td className="p-2">{row.field}</td><td className="p-2">{row.error}</td></tr>)}</tbody></table></div>
          <button className={`${button} border border-gray-300 dark:border-gray-600`} onClick={() => download(`${job.id}/failed-rows`, 'flowtask-failed-tasks.xlsx')}><Download size={16} />Download Failed Rows</button>
        </>}
        {running && <p className="text-xs text-gray-500">You can close this dialog. Reopen Task Import to recover progress.</p>}
        {terminal(job) && job.failed > 0 && <button className={`${button} border border-purple-300 text-purple-700 dark:text-purple-300`} disabled={saving} onClick={retryFailed}>Retry Failed Rows</button>}
        {job.warnings?.map(row => <p key={row.rowNumber} className="text-sm text-amber-700 dark:text-amber-300">Row {row.rowNumber}: {row.warning}</p>)}
      </section>}
      <div className="mt-5 flex justify-end gap-3"><button className={`${button} border border-gray-300 dark:border-gray-600`} onClick={onClose}>Close</button><button className={`${button} bg-purple-600 text-white hover:bg-purple-700`} disabled={loading || saving || job?.status !== 'READY' || job.total === job.invalid} onClick={start}>Import Tasks</button></div>
    </dialog>
  );
}
