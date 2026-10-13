import React, { useState, useEffect } from 'react';
import { Loader, Inbox } from 'lucide-react';
import { useDebounce } from '../../../hooks/useDebounce';
import { listInvitations } from '../../../services/invitationManagementApi';
import InvitationRow from './InvitationRow';

/**
 * One tab's worth of invitations — refetches from page 1 whenever
 * workspaceId/status/search changes, and appends via cursor pagination on
 * "Load more". A resend/revoke result is patched into local state rather
 * than re-fetching, matching JoinRequestsPage's existing pattern of
 * optimistic list mutation after an action succeeds.
 */
const InvitationList = ({ workspaceId, status, search }) => {
  const [debouncedSearch] = useDebounce(search, 300);
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!workspaceId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);

    listInvitations(workspaceId, { status, search: debouncedSearch || undefined, limit: 20 })
      .then((result) => {
        if (cancelled) return;
        setItems(result?.data || []);
        setCursor(result?.nextCursor || null);
        setHasMore(!!result?.hasMore);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load invitations');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [workspaceId, status, debouncedSearch]);

  const handleLoadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await listInvitations(workspaceId, { status, search: debouncedSearch || undefined, limit: 20, cursor });
      setItems((prev) => [...prev, ...(result?.data || [])]);
      setCursor(result?.nextCursor || null);
      setHasMore(!!result?.hasMore);
    } catch {
      setError('Failed to load more invitations');
    } finally {
      setLoadingMore(false);
    }
  };

  // A resent invitation on the Pending tab stays pending (just refreshed) —
  // patch in place. Resent from the Expired tab, or revoked from either, it
  // no longer belongs in the tab currently being viewed — drop it.
  const handleResendSuccess = (id, updated) => {
    if (status === 'pending') {
      setItems((prev) => prev.map((item) => (
        item._id === id ? { ...item, status: 'pending', expiresAt: updated?.expiresAt || item.expiresAt } : item
      )));
    } else {
      setItems((prev) => prev.filter((item) => item._id !== id));
    }
  };

  const handleRevokeSuccess = (id) => {
    setItems((prev) => prev.filter((item) => item._id !== id));
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader size={22} className="animate-spin" style={{ color: 'var(--color-text-muted)' }} />
      </div>
    );
  }

  if (error) {
    return <div className="text-center py-16 text-sm" style={{ color: 'var(--color-text-muted)' }}>{error}</div>;
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16 rounded-2xl border" style={{ borderColor: 'var(--color-border-subtle)' }}>
        <Inbox size={28} className="mx-auto mb-3" style={{ color: 'var(--color-text-muted)' }} />
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No invitations here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <InvitationRow
          key={item._id}
          invitation={item}
          workspaceId={workspaceId}
          onResendSuccess={handleResendSuccess}
          onRevokeSuccess={handleRevokeSuccess}
        />
      ))}
      {hasMore && (
        <div className="flex justify-center pt-3">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border disabled:opacity-60"
            style={{ borderColor: 'var(--color-border-default)', color: 'var(--color-text-secondary)' }}
          >
            {loadingMore && <Loader size={13} className="animate-spin" />}
            Load more
          </button>
        </div>
      )}
    </div>
  );
};

export default InvitationList;
