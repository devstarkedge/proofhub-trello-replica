import { Loader2 } from 'lucide-react';
import { pendingSessionPresentation } from '../../../../shared/sessionActionPresentation.mjs';

export default function SessionActionFeedback({ action }) {
  const pending = pendingSessionPresentation(action);
  if (!pending) return null;
  return <div role="status" aria-live="polite" className="mt-3 flex items-start gap-2 rounded-lg border border-blue-500/20 bg-blue-500/10 p-3 text-xs">
    <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin" aria-hidden="true" />
    <div className="min-w-0"><p className="font-semibold">{pending.label}{pending.selection ? ` · ${pending.selection}` : ''}</p><p className="mt-1 opacity-80">{pending.message}</p></div>
  </div>;
}
