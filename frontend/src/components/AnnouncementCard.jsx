import { createElement, memo, useEffect, useRef } from 'react';
import { Archive, ArchiveRestore, Pin, Pencil, X, MessageCircle, Paperclip, Users } from 'lucide-react';
import { formatDistanceToNow, formatDate } from 'date-fns';
import { announcementEmojis, entityId } from '../../../shared/announcementState.mjs';

const relativeDate = date => Number.isFinite(+new Date(date)) ? formatDistanceToNow(new Date(date), { addSuffix: true }) : '';
const expiryDate = date => Number.isFinite(+new Date(date)) ? formatDate(new Date(date), 'MMM d, yyyy') : '—';
const categoryStyle = category => ({ HR: 'bg-purple-100 text-purple-700', Urgent: 'bg-red-100 text-red-700', 'System Update': 'bg-blue-100 text-blue-700', Events: 'bg-yellow-100 text-yellow-700' }[category] || 'bg-gray-100 text-gray-700');

export default memo(function AnnouncementCard({ announcement: row, onOpen, onEdit, onPin, onArchive, onDelete, onReaction, onSeen, userId, userRole }) {
  const element = useRef(null);
  useEffect(() => {
    if (!onSeen || !element.current || row.isArchived) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { onSeen(row._id); observer.disconnect(); }
    }, { threshold: 0.5 });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [onSeen, row._id, row.isArchived]);
  const creator = entityId(row.createdBy) === String(userId);
  const canEdit = creator || ['admin', 'manager'].includes(userRole);
  const canOrganize = creator || userRole === 'admin';
  const attachments = row.attachments?.filter(file => !file.isDeleted).length || 0;
  const actions = [
    canEdit && onEdit && [Pencil, 'Edit announcement', () => onEdit(row)],
    canOrganize && onPin && !row.isArchived && [Pin, row.isPinned ? 'Unpin announcement' : 'Pin announcement', () => onPin(row)],
    canOrganize && onArchive && [row.isArchived ? ArchiveRestore : Archive, row.isArchived ? 'Restore announcement' : 'Archive announcement', () => onArchive(row)],
    canEdit && onDelete && [X, 'Delete announcement', () => onDelete(row)]
  ].filter(Boolean);
  return <article ref={element} className={`rounded-lg border-2 p-4 shadow-sm transition-shadow hover:shadow-lg ${row.isPinned ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/20' : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'}`} style={{ color: 'var(--color-text-primary)' }}>
    <header className="mb-3 flex items-start justify-between gap-3">
      <button type="button" className="flex min-w-0 flex-1 items-start gap-3 text-left focus-visible:outline-2 focus-visible:outline-blue-500" onClick={() => onOpen?.(row._id)}>
        {row.isPinned && <Pin className="mt-1 h-5 w-5 shrink-0 text-blue-600" fill="currentColor" aria-label="Pinned" />}
        <div className="min-w-0 flex-1">
          <h2 className="mb-1 break-words text-lg font-bold leading-snug">{row.title}</h2>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-sm font-medium ${categoryStyle(row.category)}`}>{row.category === 'Custom' ? row.customCategory : row.category}</span>
            <span className="text-xs text-gray-500">{relativeDate(row.createdAt)}</span>
          </div>
        </div>
      </button>
      <div className="flex shrink-0 flex-wrap justify-end gap-1">{actions.map(([Icon, label, action]) => <button key={label} type="button" onClick={action} title={label} aria-label={label} className={`rounded-md p-2 transition-colors ${label === 'Delete announcement' ? 'text-red-600 hover:bg-red-100' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'}`}>{createElement(Icon, { size: 16 })}</button>)}</div>
    </header>
    <button type="button" aria-label={`Read ${row.title}`} className="mb-3 block w-full text-left focus-visible:outline-2 focus-visible:outline-blue-500" onClick={() => onOpen?.(row._id)}>
      <p className="line-clamp-2 break-words text-sm leading-relaxed text-gray-700 dark:text-gray-300">{row.description}</p>
    </button>
    {!!attachments && <div className="mb-3 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300"><Paperclip className="h-4 w-4" /><span>{attachments} attachment{attachments === 1 ? '' : 's'}</span></div>}
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-3 dark:border-gray-700">
      <div className="flex flex-wrap items-center gap-2">{announcementEmojis.map(emoji => {
        const reaction = row.reactions?.find(item => item.emoji === emoji);
        const selected = reaction?.users?.some(member => entityId(member) === String(userId));
        return <button key={emoji} type="button" aria-label={`React ${emoji}`} aria-pressed={Boolean(selected)} onClick={() => onReaction?.(row._id, emoji, !selected)} className={`flex items-center gap-1 rounded border px-2 py-1 text-sm transition-colors ${selected ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-transparent bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}`}>
          {emoji}<span className="ml-1 text-xs tabular-nums">{reaction?.count || 0}</span>
        </button>;
      })}</div>
      <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
        {row.commentsCount > 0 && <button type="button" onClick={() => onOpen?.(row._id)} className="flex items-center gap-1" aria-label={`Open ${row.commentsCount} comments`}><MessageCircle size={16} />{row.commentsCount}</button>}
        {row.subscribers?.users?.length > 0 && <span className="flex items-center gap-1"><Users size={16} />{row.subscribers.users.length}</span>}
      </div>
    </footer>
    <p className="mt-2 text-xs text-gray-500">Expires: {expiryDate(row.expiresAt)}{row.isArchived ? ' · Archived' : row.isScheduled && +new Date(row.scheduledFor) > Date.now() ? ` · Scheduled ${relativeDate(row.scheduledFor)}` : ''}</p>
  </article>;
});
