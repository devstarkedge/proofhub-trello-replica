import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import Database from '../../services/database';
import { formatLoggedMinutes } from '../../../../shared/loggedTimeCell.mjs';

export default function LoggedTimeReviews({ cardId }) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(null);
  const [partial, setPartial] = useState(null);
  const [extra, setExtra] = useState('');
  const [revision, refresh] = useState(0);
  useEffect(() => {
    if (!cardId) return;
    let active = true;
    Database.getLoggedTimeReviews(cardId).then(data => {
      if (active) setRows(data);
    }).catch(() => {});
    return () => { active = false; };
  }, [cardId, revision]);
  useEffect(() => {
    const changed = event => {
      if (String(event.detail?.cardId) === String(cardId) && event.detail.reloadLoggedTime) refresh(value => value + 1);
    };
    window.addEventListener('socket-card-updated', changed);
    return () => window.removeEventListener('socket-card-updated', changed);
  }, [cardId]);

  const resolve = useCallback(async (row, decision) => {
    setBusy(row._id);
    try {
      await Database.resolveLoggedTimeReview(cardId, row._id, decision, decision === 'partial' ? Number(extra) : undefined);
      setRows(previous => previous.filter(item => item._id !== row._id));
      setPartial(null);
      setExtra('');
      window.dispatchEvent(new CustomEvent('socket-card-updated', { detail: { cardId, reloadLoggedTime: true } }));
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(null);
    }
  }, [cardId, extra]);

  if (!rows.length) return null;
  return <div className="space-y-2 rounded-lg border border-amber-200 p-2 text-xs">
    <p className="font-semibold">Tracked time needs review</p>
    <p>A manual entry already exists for these dates. Confirm how much tracked time is additional.</p>
    {rows.map(row => <div key={row._id} className="space-y-1">
      <p>{row.dateKey} · {formatLoggedMinutes(row.durationMs / 60000)} Auto-tracked</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="underline" disabled={Boolean(busy)} onClick={() => resolve(row, 'same')}>Same work</button>
        <button type="button" className="underline" disabled={Boolean(busy)} onClick={() => resolve(row, 'separate')}>Separate work</button>
        <button type="button" className="underline" disabled={Boolean(busy)} onClick={() => { setPartial(row._id); setExtra(''); }}>Partial overlap</button>
      </div>
      {partial === row._id && <div className="flex gap-2">
        <label>Additional minutes <input type="number" min="0" step="any" max={row.durationMs / 60000} value={extra}
          onChange={event => setExtra(event.target.value)} className="w-20 rounded border px-1" /></label>
        <button type="button" className="underline" disabled={Boolean(busy) || extra === '' || Number(extra) < 0 || Number(extra) > row.durationMs / 60000}
          onClick={() => resolve(row, 'partial')}>Save</button>
      </div>}
    </div>)}
  </div>;
}
