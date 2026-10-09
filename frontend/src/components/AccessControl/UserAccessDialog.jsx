import { useContext, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck, X } from 'lucide-react';
import WorkspaceContext from '../../context/WorkspaceContext';
import useConfirmModalStore from '../../store/confirmModalStore';
import useModalFocus from '../../hooks/useModalFocus';
import Avatar from '../Avatar';
import UserAccessEditor from './UserAccessEditor';

export default function UserAccessDialog({ user, currentUserId, onClose, onUserUpdated }) {
  const { currentWorkspace } = useContext(WorkspaceContext);
  const confirmationOpen = useConfirmModalStore((state) => state.isOpen);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef(null);
  const titleId = useId();
  useModalFocus({ open: Boolean(user), dialogRef, onClose, blocked: busy, suspended: confirmationOpen });
  if (!user) return null;
  const close = () => { if (!busy) onClose(); };
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-2 sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }} style={{ backgroundColor: 'rgba(15,23,42,.5)', backdropFilter: 'blur(4px)' }}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl border shadow-2xl outline-none" style={{ maxHeight: 'calc(100dvh - 2rem)', backgroundColor: 'var(--color-bg-base)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' }}>
        <header className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-4 sm:px-6" style={{ borderColor: 'var(--color-border-default)' }}>
          <div className="flex min-w-0 items-center gap-3"><Avatar src={user.avatar} name={user.name} role={user.role} size="lg" />
            <div className="min-w-0"><p className="flex items-center gap-1.5 text-xs font-semibold text-purple-600"><ShieldCheck className="w-3.5 h-3.5" />Member access</p>
              <h2 id={titleId} className="truncate text-lg font-bold">{user.name}</h2><p className="truncate text-xs" style={{ color: 'var(--color-text-secondary)' }}>{user.email}{currentWorkspace?.name ? ` · ${currentWorkspace.name}` : ''}</p>
            </div>
          </div>
          <button type="button" aria-label="Close member access" disabled={busy} onClick={close} className="shrink-0 rounded-lg p-2 hover:bg-purple-50 focus-visible:ring-2 focus-visible:ring-purple-500 disabled:opacity-40"><X className="h-5 w-5" /></button>
        </header>
        <div className="min-h-0 overflow-y-auto px-4 py-5 sm:px-6">
          <UserAccessEditor key={`${currentWorkspace?._id}:${user._id}`} userId={user._id} currentUserId={currentUserId} onUserUpdated={onUserUpdated} onBusyChange={setBusy} />
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t px-4 py-3 sm:px-6" style={{ backgroundColor: 'var(--color-bg-subtle)', borderColor: 'var(--color-border-default)' }}>
          <p role="status" className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{busy ? 'Finish the current change before closing.' : 'Changes apply to this workspace.'}</p>
          <button type="button" disabled={busy} onClick={close} className="rounded-lg border px-4 py-2 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-purple-500 disabled:opacity-50" style={{ borderColor: 'var(--color-border-default)' }}>Close</button>
        </footer>
      </div>
    </div>, document.body
  );
}
