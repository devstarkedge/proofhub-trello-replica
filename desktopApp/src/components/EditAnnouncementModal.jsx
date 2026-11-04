import { useState } from 'react';
import { Dialog } from 'radix-ui';
import { X, Loader2 } from 'lucide-react';
import { Button } from './ui/button';

export default function EditAnnouncementModal({ announcement, onClose, onSave }) {
  const [draft, setDraft] = useState(() => ({
    title: announcement.title, description: announcement.description,
    category: announcement.category, customCategory: announcement.customCategory || '',
    allowComments: announcement.allowComments
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const change = event => setDraft(value => ({ ...value, [event.target.name]: event.target.value }));
  const input = 'w-full rounded-lg border px-3 py-2.5 bg-transparent';
  const save = async event => {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError('');
    try { await onSave(announcement._id, draft); onClose(); }
    catch (failure) { setError(failure.message || 'Could not save your changes. Please retry.'); }
    finally { setSaving(false); }
  };
  return <Dialog.Root open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/50" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-[101] w-[min(94vw,640px)] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-2xl border p-6 shadow-xl" style={{ background: 'var(--color-card-bg)', color: 'var(--color-text-primary)', borderColor: 'var(--color-border-default)' }}>
        <header className="mb-5 flex items-center justify-between gap-3">
          <Dialog.Title className="text-xl font-semibold">Edit announcement</Dialog.Title>
          <Dialog.Close disabled={saving} aria-label="Close editor"><X size={20} /></Dialog.Close>
        </header>
        <Dialog.Description className="mb-5 text-sm text-gray-500">Update your announcement. Existing attachments, audience, and conversations are preserved.</Dialog.Description>
        <form onSubmit={save} className="space-y-4">
          <label className="block space-y-1 text-sm">Title<input autoFocus required maxLength={200} name="title" value={draft.title} onChange={change} className={input} /></label>
          <label className="block space-y-1 text-sm">Message<textarea required name="description" value={draft.description} onChange={change} rows={7} className={input} /></label>
          <label className="block space-y-1 text-sm">Category<select name="category" value={draft.category} onChange={change} className={input}>
            {['General', 'HR', 'Urgent', 'System Update', 'Events', 'Custom'].map(category => <option key={category}>{category}</option>)}
          </select></label>
          {draft.category === 'Custom' && <label className="block space-y-1 text-sm">Custom category<input required maxLength={50} name="customCategory" value={draft.customCategory} onChange={change} className={input} /></label>}
          <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={draft.allowComments} onChange={event => setDraft(value => ({ ...value, allowComments: event.target.checked }))} />Allow comments</label>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <footer className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving && <Loader2 size={16} className="animate-spin" />}Save changes</Button>
          </footer>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
