import { useEffect, useState } from 'react';
import { deleteMutation, getMutations, processMutations } from '../services/backgroundSync';
import { actorFromToken } from '../../../shared/offlineQueue.mjs';

export default function OfflineEdits() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const refresh = async () => {
    const actor = actorFromToken(localStorage.getItem('token') || '');
    const workspace = localStorage.getItem('workspaceId');
    setItems((await getMutations()).filter(item => item.userId === actor && item.workspaceId === workspace));
  };
  useEffect(() => {
    const reload = () => refresh().catch(() => setItems([]));
    reload();
    const events = ['offline-sync-status', 'session-token-updated', 'workspace-changed', 'storage'];
    for (const event of events) window.addEventListener(event, reload);
    const timer = setInterval(reload, 10000);
    return () => { clearInterval(timer); for (const event of events) window.removeEventListener(event, reload); };
  }, []);
  if (!items.length) return null;
  const download = item => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ savedAt: new Date(item.timestamp).toISOString(), request: item.url, method: item.method, content: JSON.parse(item.body || '{}') }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'saved-edit.json'; link.click(); URL.revokeObjectURL(url);
  };
  return <aside className="fixed bottom-5 right-5 z-[9998] max-w-sm rounded-xl border border-amber-300 bg-white p-4 text-slate-900 shadow-xl dark:bg-slate-900 dark:text-white" aria-live="polite">
    <button type="button" className="font-semibold" onClick={() => setOpen(value => !value)}>{items.length} saved {items.length === 1 ? 'edit' : 'edits'} · Review</button>
    {open && <div className="mt-3 max-h-72 space-y-3 overflow-auto">
      <p className="text-sm">Pending edits sync when connected. Edits needing attention stay saved: download a copy, review the current item, and reapply your changes there.</p>
      <button type="button" className="underline" onClick={async () => { await processMutations(); await refresh(); }}>Sync pending edits</button>
      {items.map(item => <div key={item.id} className="border-t pt-2 text-sm">
        <p>{new Date(item.timestamp).toLocaleString()} · {item.state === 'conflict' ? 'Needs attention' : 'Pending'}</p>
        <div className="mt-1 flex gap-4"><button type="button" className="underline" onClick={() => download(item)}>Download copy</button><button type="button" className="underline" onClick={async () => { await deleteMutation(item.id); await refresh(); }}>Discard saved edit</button></div>
      </div>)}
    </div>}
  </aside>;
}
