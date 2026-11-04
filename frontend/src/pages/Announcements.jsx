import { useCallback, useContext, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Plus, Search, Archive, RefreshCw, Loader2, Sparkles, TrendingUp, Filter } from 'lucide-react';
import { toast } from 'react-toastify';
import AuthContext from '../context/AuthContext';
import WorkspaceContext from '../context/WorkspaceContext';
import announcementService from '../services/announcementService';
import socketService from '../services/socket';
import AnnouncementCard from '../components/AnnouncementCard';
import { Button } from '../components/ui/button';
import { filterAnnouncements, setAnnouncementReaction, entityId } from '../../../shared/announcementState.mjs';
import { captureRequestScope, assertRequestScope } from '../../../shared/requestScope.mjs';

const CreateAnnouncementModal = lazy(() => import('../components/CreateAnnouncementModal'));
const EditAnnouncementModal = lazy(() => import('../components/EditAnnouncementModal'));
const AnnouncementDetailModal = lazy(() => import('../components/AnnouncementDetailModal'));

function AnnouncementFeed({ scope, user, workspaceId }) {
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [remoteSearch, setRemoteSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('latest');
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedId, setSelectedId] = useState(() => params.get('open'));
  const [busy, setBusy] = useState(false);
  const pending = useRef(new Set());
  const seen = useRef(new Set());
  const rootKey = useMemo(() => ['announcements', scope], [scope]);
  const feedKey = useMemo(() => [...rootKey, 'feed'], [rootKey]);
  const detailKey = useMemo(() => [...rootKey, 'detail', selectedId], [rootKey, selectedId]);
  const canCreate = ['admin', 'manager', 'hr'].includes(user.role);

  useEffect(() => { const timer = setTimeout(() => setRemoteSearch(search.trim()), 250); return () => clearTimeout(timer); }, [search]);
  const query = useInfiniteQuery({
    queryKey: [...feedKey, { search: remoteSearch, category, sort, archived }],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => announcementService.getAnnouncements({ page: pageParam, limit: 30,
      search: remoteSearch, category, sort, isArchived: String(archived) }, signal),
    getNextPageParam: last => last.pagination?.hasMore ? last.pagination.page + 1 : undefined,
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[1] === scope ? previous : undefined,
    staleTime: 15000, gcTime: 60000, maxPages: 10, retry: false, refetchOnWindowFocus: true
  });
  const rows = useMemo(() => [...new Map((query.data?.pages || []).flatMap(page => page.data || []).map(row => [row._id, row])).values()], [query.data]);
  const visible = useMemo(() => filterAnnouncements(rows, { search, category, sort, archived }), [rows, search, category, sort, archived]);
  const detail = useQuery({ queryKey: detailKey, enabled: Boolean(selectedId),
    queryFn: ({ signal }) => announcementService.getAnnouncement(selectedId, signal).then(result => result.data),
    staleTime: 0, gcTime: 60000, retry: false });
  const unreadKey = [...rootKey, 'unread'];
  const unread = useQuery({ queryKey: unreadKey, queryFn: () => announcementService.getUnreadCount(), staleTime: 30000, gcTime: 60000, retry: false });
  const selected = detail.data || rows.find(row => row._id === selectedId);

  const patch = useCallback((id, update) => {
    client.setQueriesData({ queryKey: feedKey }, data => data && ({ ...data, pages: data.pages.map(page => ({
      ...page, data: page.data.map(row => row._id === id ? update(row) : row).filter(Boolean)
    })) }));
    client.setQueryData([...rootKey, 'detail', id], row => row ? update(row) : row);
  }, [client, feedKey, rootKey]);
  const refresh = useCallback(() => client.invalidateQueries({ queryKey: rootKey }, { cancelRefetch: false }), [client, rootKey]);

  useEffect(() => {
    const open = params.get('open');
    if (open) { setSelectedId(open); const next = new URLSearchParams(params); next.delete('open'); setParams(next, { replace: true }); }
  }, [params, setParams]);

  useEffect(() => {
    let timer;
    socketService.joinAnnouncements();
    const events = ['created', 'updated', 'deleted', 'archived', 'pin-toggled', 'reaction-added', 'reaction-removed', 'comment-added', 'comment-deleted', 'attachment-deleted', 'attachment-restored'];
    const receive = event => {
      const payload = event.detail || {};
      if (payload.workspaceId && String(payload.workspaceId) !== String(workspaceId)) return;
      const id = entityId(payload.announcementId || payload.announcement);
      if (event.type.endsWith('-deleted') && !event.type.includes('comment') && !event.type.includes('attachment')) {
        patch(id, () => null); setSelectedId(value => value === id ? null : value); return;
      }
      if (payload.reactions) { patch(id, row => ({ ...row, reactions: payload.reactions })); return; }
      if (event.type.includes('reaction-')) return; // Older servers: reconcile the detail, not the entire feed.
      if (payload.announcement) patch(id, row => ({ ...row, ...payload.announcement }));
      if ('isPinned' in payload) patch(id, row => ({ ...row, isPinned: payload.isPinned }));
      if ('isArchived' in payload) patch(id, row => ({ ...row, isArchived: payload.isArchived }));
      if (event.type.includes('comment-') || event.type.includes('attachment-')) {
        client.invalidateQueries({ queryKey: [...rootKey, 'detail', id] }, { cancelRefetch: false });
      }
      clearTimeout(timer); timer = setTimeout(refresh, 500);
    };
    events.forEach(event => window.addEventListener(`socket-announcement-${event}`, receive));
    const reconnect = () => refresh();
    window.addEventListener('online', reconnect);
    return () => { clearTimeout(timer); socketService.leaveAnnouncements(); events.forEach(event => window.removeEventListener(`socket-announcement-${event}`, receive)); window.removeEventListener('online', reconnect); };
  }, [client, patch, refresh, rootKey, workspaceId]);

  const markSeen = useCallback(id => {
    if (seen.current.has(id)) return;
    seen.current.add(id);
    announcementService.markAsSeen(id).then(result => {
      if (!result.success) { seen.current.delete(id); return; }
      if (result.changed) client.setQueryData([...rootKey, 'unread'], previous => previous ? { ...previous, count: Math.max(0, previous.count - 1) } : previous);
    });
  }, [client, rootKey]);

  const react = useCallback(async (id, emoji, present) => {
    if (pending.current.has(id)) return false;
    pending.current.add(id);
    const requestScope = captureRequestScope(localStorage);
    await client.cancelQueries({ queryKey: feedKey });
    await client.cancelQueries({ queryKey: [...rootKey, 'detail', id] });
    let before;
    patch(id, row => { before ??= row.reactions || []; return { ...row, reactions: setAnnouncementReaction(row.reactions, emoji, user, present) }; });
    try {
      const result = await (present ? announcementService.addReaction(id, emoji) : announcementService.removeReaction(id, emoji));
      assertRequestScope(localStorage, requestScope);
      if (result.reactions) patch(id, row => ({ ...row, reactions: result.reactions }));
      return true;
    } catch (error) {
      try { assertRequestScope(localStorage, requestScope); } catch { return false; }
      patch(id, row => ({ ...row, reactions: before || [] }));
      client.invalidateQueries({ queryKey: [...rootKey, 'detail', id] });
      toast.error(error.message || 'Could not update reaction. Please retry.'); return false;
    } finally { pending.current.delete(id); }
  }, [client, feedKey, patch, rootKey, user]);

  const change = async (row, kind) => {
    if (pending.current.has(row._id)) return;
    if (kind === 'delete' && !window.confirm('Delete this announcement and its attachments?')) return;
    pending.current.add(row._id);
    const requestScope = captureRequestScope(localStorage);
    await client.cancelQueries({ queryKey: feedKey });
    patch(row._id, value => kind === 'delete' ? null : ({ ...value, [kind === 'archive' ? 'isArchived' : 'isPinned']: kind === 'archive' ? !row.isArchived : !row.isPinned }));
    try {
      const result = await (kind === 'delete' ? announcementService.deleteAnnouncement(row._id) : kind === 'archive' ? announcementService.toggleArchive(row._id, !row.isArchived) : announcementService.togglePin(row._id, !row.isPinned));
      assertRequestScope(localStorage, requestScope);
      if (result.data) patch(row._id, value => ({ ...value, ...result.data }));
      if (kind === 'delete') setSelectedId(value => value === row._id ? null : value);
    } catch (error) { toast.error(error.message || 'Could not save change'); }
    finally { pending.current.delete(row._id); refresh(); }
  };
  const comment = async (id, text, commentId) => {
    if (pending.current.has(`comment:${id}`)) return false;
    pending.current.add(`comment:${id}`); setBusy(true);
    try {
      await (commentId ? announcementService.deleteComment(id, commentId) : announcementService.addComment(id, text));
      await client.invalidateQueries({ queryKey: [...rootKey, 'detail', id] });
      client.invalidateQueries({ queryKey: feedKey }); return true;
    } catch (error) { toast.error(error.message || 'Could not update comment'); return false; }
    finally { pending.current.delete(`comment:${id}`); setBusy(false); }
  };

  return <main className="min-h-full w-full min-w-0 space-y-6 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4 sm:p-6 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950" style={{ color: 'var(--color-text-primary)' }}>
    <header className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 p-6 text-white shadow-2xl sm:p-8">
      <div className="pointer-events-none absolute inset-0 bg-black/10" />
      <div className="relative flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-center gap-4">
          <div className="shrink-0 rounded-full bg-white/20 p-3"><Bell className="h-8 w-8" /></div>
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-3 text-3xl font-bold sm:text-4xl">Announcements<Sparkles className="h-6 w-6 text-yellow-300" /></h1>
            <p className="mt-2 text-base text-blue-100 sm:text-lg">Stay updated with the latest announcements and important updates</p>
          </div>
        </div>
        {canCreate && <button type="button" onClick={() => setCreating(true)} className="flex shrink-0 items-center gap-3 rounded-xl bg-white px-6 py-3 font-semibold text-blue-600 shadow-lg transition-colors hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"><Plus className="h-5 w-5" />Create Announcement<TrendingUp className="h-4 w-4" /></button>}
      </div>
    </header>

    <section className="grid grid-cols-1 gap-6 md:grid-cols-3" aria-label="Announcement summary">
      <div className="rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 p-6 text-white shadow-lg" title="Announcements loaded in this view">
        <div className="flex items-center justify-between"><div><p className="text-sm font-medium text-green-100">Total Announcements</p><p className="text-3xl font-bold">{rows.length}</p></div><Bell className="h-8 w-8 text-green-200" /></div>
      </div>
      <div className="rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 p-6 text-white shadow-lg" title="Active announcements loaded in this view">
        <div className="flex items-center justify-between"><div><p className="text-sm font-medium text-blue-100">Active</p><p className="text-3xl font-bold">{rows.filter(row => !row.isArchived).length}</p></div><TrendingUp className="h-8 w-8 text-blue-200" /></div>
      </div>
      <div className="rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 p-6 text-white shadow-lg" title="Categories loaded in this view">
        <div className="flex items-center justify-between"><div><p className="text-sm font-medium text-purple-100">Categories</p><p className="text-3xl font-bold">{new Set(rows.map(row => row.category)).size}</p></div><Filter className="h-8 w-8 text-purple-200" /></div>
      </div>
    </section>

    <section className="space-y-6 rounded-2xl border border-white/20 bg-white/80 p-6 shadow-xl dark:border-gray-800 dark:bg-gray-900/80" aria-label="Announcement filters">
      <label className="relative block w-full"><Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" /><input aria-label="Search announcements" placeholder="Search announcements..." value={search} onChange={event => setSearch(event.target.value)} className="w-full rounded-xl border border-gray-200 bg-white/50 py-3 pl-12 pr-4 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800/50" /></label>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 rounded-lg bg-gray-50 p-2 text-sm font-medium dark:bg-gray-800"><Filter className="h-4 w-4 text-gray-600 dark:text-gray-300" /><select aria-label="Sort announcements" value={sort} onChange={event => setSort(event.target.value)} className="border-none bg-transparent px-3 py-2 focus:outline-none"><option value="latest">Latest First</option><option value="pinned">Pinned First</option><option value="oldest">Oldest First</option><option value="category">By Category</option></select></label>
        <select aria-label="Category" value={category} onChange={event => setCategory(event.target.value)} className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800"><option value="all">All Categories</option>{['General', 'HR', 'Urgent', 'System Update', 'Events', 'Custom'].map(value => <option key={value}>{value}</option>)}</select>
        <button type="button" aria-label={archived ? 'Show active announcements' : 'Show archived announcements'} aria-pressed={archived} onClick={() => setArchived(value => !value)} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors ${archived ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200'}`}><Archive className="h-4 w-4" />{archived ? 'Archived' : 'Active'}</button>
        <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
          {!archived && unread.data?.count > 0 && <span className="rounded-full bg-blue-50 px-2 py-1 font-medium text-blue-600">{unread.data.count} new</span>}
          {query.isFetching && <span role="status" className="flex items-center gap-1"><Loader2 size={13} className="animate-spin" />Updating</span>}
          <button type="button" onClick={refresh} disabled={query.isFetching} aria-label="Refresh announcements" className="rounded-lg p-2 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-800"><RefreshCw size={16} className={query.isFetching ? 'animate-spin' : ''} /></button>
        </div>
      </div>
    </section>
    {query.error && <p role="alert" className="rounded-lg border border-red-200 p-4 text-sm text-red-600">Could not refresh announcements. <button className="underline" onClick={() => query.refetch()}>Retry</button></p>}
    <p className="sr-only" aria-live="polite">{visible.length} announcement{visible.length === 1 ? '' : 's'} shown</p>

    <section className="space-y-4 rounded-2xl border border-white/20 bg-white/80 p-4 shadow-xl sm:p-6 dark:border-gray-800 dark:bg-gray-900/80" aria-label="Announcements list">
      {query.isPending ? <div role="status" className="space-y-4">{[1, 2, 3].map(value => <div key={value} className="h-48 animate-pulse rounded-lg border bg-gray-100 dark:bg-gray-800" />)}<span className="sr-only">Loading announcements</span></div> : <div className="space-y-4">{visible.map(row => <AnnouncementCard key={row._id} announcement={row} userId={user._id || user.id} userRole={user.role} onOpen={setSelectedId} onEdit={setEditing} onReaction={react} onPin={row => change(row, 'pin')} onArchive={row => change(row, 'archive')} onDelete={row => change(row, 'delete')} onSeen={markSeen} />)}</div>}
      {!query.isPending && !query.isFetching && !query.error && !visible.length && <div className="px-6 py-16 text-center"><div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800"><Bell className="h-10 w-10 text-gray-400" /></div><h2 className="text-2xl font-bold">{search ? 'No matching announcements' : 'No announcements yet'}</h2><p className="mt-2 text-gray-500">{search ? 'Try another search or category.' : archived ? 'No archived announcements to show' : 'Stay tuned for important updates from your team.'}</p></div>}
      {query.hasNextPage && <div className="text-center"><Button variant="outline" disabled={query.isFetchingNextPage || query.isPlaceholderData || search.trim() !== remoteSearch} onClick={() => query.fetchNextPage()}>{query.isFetchingNextPage ? 'Loading…' : 'Load more announcements'}</Button></div>}
    </section>
    {selectedId && detail.isPending && !selected && <p role="status">Loading announcement…</p>}
    {selectedId && detail.error && <p role="alert">This announcement could not be opened. <button className="underline" onClick={() => detail.refetch()}>Retry</button><button className="ml-3 underline" onClick={() => setSelectedId(null)}>Close</button></p>}
    <Suspense fallback={<p role="status">Opening announcement…</p>}>
      {creating && <CreateAnnouncementModal isOpen onClose={() => setCreating(false)} onSubmit={async (draft, files, progress) => {
        const result = await announcementService.createAnnouncement(draft, files, progress);
        if (!result.success) throw new Error(result.message || 'Could not create announcement');
        result.uploadErrors?.forEach(error => toast.warning(`Attachment could not upload: ${error.originalName}`));
        toast.success(result.message || 'Announcement published'); refresh();
      }} />}
      {editing && <EditAnnouncementModal key={editing._id} announcement={editing} onClose={() => setEditing(null)} onSave={async (id, draft) => {
        const result = await announcementService.updateAnnouncement(id, draft);
        patch(id, row => ({ ...row, ...result.data })); refresh(); toast.success('Announcement updated');
      }} />}
      {selected && !detail.error && <AnnouncementDetailModal isOpen announcement={selected} onClose={() => setSelectedId(null)} onAddComment={(id, text) => comment(id, text)} onDeleteComment={(id, commentId) => comment(id, null, commentId)} onAddReaction={(id, emoji) => react(id, emoji, true)} onRemoveReaction={(id, emoji) => react(id, emoji, false)} onAttachmentDeleted={attachmentId => patch(selectedId, row => ({ ...row, attachments: row.attachments.filter(file => file._id !== attachmentId) }))} isLoading={busy || detail.isPending} />}
    </Suspense>
  </main>;
}

export default function Announcements() {
  const { user } = useContext(AuthContext);
  const { currentWorkspace } = useContext(WorkspaceContext);
  const scope = JSON.stringify([currentWorkspace?._id, user?._id, user?.role, user?.roleId, user?.department, user?.permissionsVersion]);
  return user && currentWorkspace ? <AnnouncementFeed key={scope} scope={scope} user={user} workspaceId={currentWorkspace._id} /> : null;
}
