import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Loader2,
  AlertCircle,
  ScrollText,
  ChevronDown,
  ChevronUp,
  X,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Ban,
  CheckCircle2,
  Archive,
  RotateCcw,
  CreditCard,
  Building2,
  User,
  Clock,
  ArrowRight,
  ArrowDownUp,
  MessageSquare,
  Sparkles,
  Layers,
  Globe
} from 'lucide-react';
import { useSuperAdminAuditLog } from '../../hooks/useSuperAdminQueries';
import { getSuperAdminAuditLogEntry } from '../../services/superAdminApi';
import { useQueryClient } from '@tanstack/react-query';

// ─── CRED-Inspired Action Configuration ───────────────────────────────────────

const ACTION_CONFIG = {
  SUPER_ADMIN_WORKSPACE_SUSPENDED: {
    label: 'Workspace Suspended',
    shortLabel: 'Suspended',
    badgeBg: 'rgba(239, 68, 68, 0.10)',
    badgeColor: '#ef4444',
    badgeBorder: 'rgba(239, 68, 68, 0.25)',
    iconBg: 'rgba(239, 68, 68, 0.12)',
    iconColor: '#ef4444',
    iconBorder: 'rgba(239, 68, 68, 0.20)',
    Icon: Ban
  },
  SUPER_ADMIN_WORKSPACE_REACTIVATED: {
    label: 'Workspace Reactivated',
    shortLabel: 'Reactivated',
    badgeBg: 'rgba(16, 185, 129, 0.10)',
    badgeColor: '#10b981',
    badgeBorder: 'rgba(16, 185, 129, 0.25)',
    iconBg: 'rgba(16, 185, 129, 0.12)',
    iconColor: '#10b981',
    iconBorder: 'rgba(16, 185, 129, 0.20)',
    Icon: CheckCircle2
  },
  SUPER_ADMIN_WORKSPACE_ARCHIVED: {
    label: 'Workspace Archived',
    shortLabel: 'Archived',
    badgeBg: 'rgba(107, 114, 128, 0.10)',
    badgeColor: '#9ca3af',
    badgeBorder: 'rgba(107, 114, 128, 0.25)',
    iconBg: 'rgba(107, 114, 128, 0.12)',
    iconColor: '#9ca3af',
    iconBorder: 'rgba(107, 114, 128, 0.20)',
    Icon: Archive
  },
  SUPER_ADMIN_WORKSPACE_RESTORED: {
    label: 'Workspace Restored',
    shortLabel: 'Restored',
    badgeBg: 'rgba(16, 185, 129, 0.10)',
    badgeColor: '#10b981',
    badgeBorder: 'rgba(16, 185, 129, 0.25)',
    iconBg: 'rgba(16, 185, 129, 0.12)',
    iconColor: '#10b981',
    iconBorder: 'rgba(16, 185, 129, 0.20)',
    Icon: RotateCcw
  },
  SUPER_ADMIN_PLAN_CHANGED: {
    label: 'Plan Changed',
    shortLabel: 'Plan Changed',
    badgeBg: 'rgba(124, 58, 237, 0.10)',
    badgeColor: '#a855f7',
    badgeBorder: 'rgba(124, 58, 237, 0.25)',
    iconBg: 'rgba(124, 58, 237, 0.12)',
    iconColor: '#a855f7',
    iconBorder: 'rgba(124, 58, 237, 0.20)',
    Icon: CreditCard
  },
  SUPER_ADMIN_ACCESS_GRANTED: {
    label: 'Super Admin Granted',
    shortLabel: 'Admin Granted',
    badgeBg: 'rgba(14, 165, 233, 0.10)',
    badgeColor: '#38bdf8',
    badgeBorder: 'rgba(14, 165, 233, 0.25)',
    iconBg: 'rgba(14, 165, 233, 0.12)',
    iconColor: '#38bdf8',
    iconBorder: 'rgba(14, 165, 233, 0.20)',
    Icon: ShieldCheck
  },
  SUPER_ADMIN_ACCESS_REVOKED: {
    label: 'Super Admin Revoked',
    shortLabel: 'Admin Revoked',
    badgeBg: 'rgba(244, 63, 94, 0.10)',
    badgeColor: '#fb7185',
    badgeBorder: 'rgba(244, 63, 94, 0.25)',
    iconBg: 'rgba(244, 63, 94, 0.12)',
    iconColor: '#fb7185',
    iconBorder: 'rgba(244, 63, 94, 0.20)',
    Icon: ShieldAlert
  },
  SUPER_ADMIN_LOGIN: {
    label: 'Super Admin Login',
    shortLabel: 'Login',
    badgeBg: 'rgba(99, 102, 241, 0.10)',
    badgeColor: '#818cf8',
    badgeBorder: 'rgba(99, 102, 241, 0.25)',
    iconBg: 'rgba(99, 102, 241, 0.12)',
    iconColor: '#818cf8',
    iconBorder: 'rgba(99, 102, 241, 0.20)',
    Icon: Shield
  },
  SUPER_ADMIN_WORKSPACE_REMOVED: {
    label: 'Workspace Removed',
    shortLabel: 'Removed',
    badgeBg: 'rgba(239, 68, 68, 0.10)',
    badgeColor: '#ef4444',
    badgeBorder: 'rgba(239, 68, 68, 0.25)',
    iconBg: 'rgba(239, 68, 68, 0.12)',
    iconColor: '#ef4444',
    iconBorder: 'rgba(239, 68, 68, 0.20)',
    Icon: Ban
  }
};

const DEFAULT_ACTION_CFG = {
  label: 'Platform Action',
  shortLabel: 'Action',
  badgeBg: 'rgba(107, 114, 128, 0.10)',
  badgeColor: '#9ca3af',
  badgeBorder: 'rgba(107, 114, 128, 0.25)',
  iconBg: 'rgba(107, 114, 128, 0.12)',
  iconColor: '#9ca3af',
  iconBorder: 'rgba(107, 114, 128, 0.20)',
  Icon: Shield
};

// ─── Human Formatting Helpers ────────────────────────────────────────────────

function relativeTime(dateStr) {
  if (!dateStr) return '—';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  if (diff < 45_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function exactTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

function getDayLabel(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a, b) =>
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear();

  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';

  const daysDiff = Math.floor((today - d) / 86_400_000);
  if (daysDiff < 7) return 'This Week';
  return 'Earlier';
}

function groupByDay(entries) {
  const seen = new Map();
  const order = [];

  for (const entry of entries) {
    const label = getDayLabel(entry.createdAt);
    if (!seen.has(label)) {
      seen.set(label, { label, items: [] });
      order.push(label);
    }
    seen.get(label).items.push(entry);
  }

  return order.map((label) => seen.get(label));
}

function humanizeKey(key) {
  const KEY_MAP = {
    status: 'Status',
    isActive: 'Active State',
    plan: 'Plan',
    billingCycle: 'Billing Cycle',
    statusReason: 'Reason',
    notes: 'Subscription Notes',
    isSuperAdmin: 'Super Admin Access'
  };

  if (KEY_MAP[key]) return KEY_MAP[key];

  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

function formatValueBadge(val) {
  if (val === true || val === 'active') {
    return {
      text: 'active',
      bg: 'rgba(16, 185, 129, 0.12)',
      color: '#10b981',
      border: 'rgba(16, 185, 129, 0.25)'
    };
  }
  if (val === false || val === 'suspended') {
    return {
      text: String(val === false ? 'inactive' : val),
      bg: 'rgba(239, 68, 68, 0.12)',
      color: '#ef4444',
      border: 'rgba(239, 68, 68, 0.25)'
    };
  }
  if (val === 'archived') {
    return {
      text: 'archived',
      bg: 'rgba(107, 114, 128, 0.12)',
      color: '#9ca3af',
      border: 'rgba(107, 114, 128, 0.25)'
    };
  }
  if (val === null || val === undefined || val === '') {
    return {
      text: 'none',
      bg: 'var(--color-bg-muted)',
      color: 'var(--color-text-muted)',
      border: 'var(--color-border-subtle)'
    };
  }
  if (typeof val === 'object') {
    if (val.name) {
      return {
        text: val.name,
        bg: 'rgba(124, 58, 237, 0.12)',
        color: '#a855f7',
        border: 'rgba(124, 58, 237, 0.25)'
      };
    }
    return {
      text: JSON.stringify(val),
      bg: 'var(--color-bg-muted)',
      color: 'var(--color-text-secondary)',
      border: 'var(--color-border-subtle)'
    };
  }

  return {
    text: String(val),
    bg: 'var(--color-bg-muted)',
    color: 'var(--color-text-primary)',
    border: 'var(--color-border-subtle)'
  };
}

/**
 * Extracts clean, deduplicated human-readable diffs.
 */
function extractHumanChanges(detail) {
  if (!detail) return [];

  // Case 1: Structured changeDetails array
  if (Array.isArray(detail.changeDetails) && detail.changeDetails.length > 0) {
    return detail.changeDetails.map((cd) => ({
      label: cd.label,
      previous: cd.previous,
      next: cd.next
    }));
  }

  // Case 2: Extract from changes.before / changes.after
  const beforeObj = detail.changes?.before;
  const afterObj = detail.changes?.after;

  if (beforeObj || afterObj) {
    const keys = Array.from(
      new Set([...Object.keys(beforeObj || {}), ...Object.keys(afterObj || {})])
    );

    const hasStatus = keys.includes('status');
    const diffs = [];

    for (const key of keys) {
      if (key === '_id' || key === '__v' || key === 'updatedAt' || key === 'createdAt') continue;
      if (hasStatus && key === 'isActive') continue;

      const prevVal = beforeObj ? beforeObj[key] : undefined;
      const nextVal = afterObj ? afterObj[key] : undefined;

      if (JSON.stringify(prevVal) !== JSON.stringify(nextVal)) {
        diffs.push({
          label: humanizeKey(key),
          previous: prevVal,
          next: nextVal
        });
      }
    }

    if (diffs.length > 0) return diffs;
  }

  return [];
}

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

// ─── CRED-Style Expanded Statement Drawer ─────────────────────────────────────

const CredEntryDetail = ({ id }) => {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getSuperAdminAuditLogEntry(id)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div
        className="px-5 py-4 text-xs flex items-center gap-2.5 border-t"
        style={{ borderColor: 'var(--color-border-subtle)', color: 'var(--color-text-muted)' }}
      >
        <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
        <span className="font-medium">Fetching transaction details…</span>
      </div>
    );
  }

  if (!detail) {
    return (
      <div
        className="px-5 py-3 text-xs border-t"
        style={{ borderColor: 'var(--color-border-subtle)', color: 'var(--color-text-muted)' }}
      >
        No additional record details found.
      </div>
    );
  }

  const changes = extractHumanChanges(detail);
  const hasChanges = changes.length > 0;

  return (
    <div
      className="px-5 py-4 border-t space-y-3.5 text-xs transition-all"
      style={{
        borderColor: 'var(--color-border-subtle)',
        backgroundColor: 'var(--color-bg-base)'
      }}
    >
      {/* ── Reason Callout (CRED Receipt Style) ── */}
      {detail.reason && (
        <div
          className="p-3.5 rounded-xl border flex items-start gap-3 transition-colors"
          style={{
            backgroundColor: 'rgba(245, 158, 11, 0.07)',
            borderColor: 'rgba(245, 158, 11, 0.22)'
          }}
        >
          <MessageSquare className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#f59e0b' }} />
          <div className="space-y-0.5 min-w-0">
            <span
              className="text-[10px] font-bold uppercase tracking-widest"
              style={{ color: '#d97706' }}
            >
              Reason Provided
            </span>
            <p
              className="text-xs font-semibold italic leading-relaxed"
              style={{ color: 'var(--color-text-primary)' }}
            >
              "{detail.reason}"
            </p>
          </div>
        </div>
      )}

      {/* ── State Mutation Diffs (CRED Flow) ── */}
      {hasChanges && (
        <div className="space-y-2">
          <div
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: 'var(--color-text-muted)' }}
          >
            State Changes
          </div>
          <div className="space-y-1.5">
            {changes.map((change, idx) => {
              const prev = formatValueBadge(change.previous);
              const next = formatValueBadge(change.next);
              return (
                <div
                  key={idx}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-3.5 py-2 rounded-xl border"
                  style={{
                    backgroundColor: 'var(--color-bg-secondary)',
                    borderColor: 'var(--color-border-subtle)'
                  }}
                >
                  <span className="font-semibold text-xs" style={{ color: 'var(--color-text-primary)' }}>
                    {change.label}
                  </span>
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className="px-2.5 py-0.5 rounded-md font-semibold border uppercase text-[11px] tracking-wide"
                      style={{ backgroundColor: prev.bg, color: prev.color, borderColor: prev.border }}
                    >
                      {prev.text}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--color-text-muted)' }} />
                    <span
                      className="px-2.5 py-0.5 rounded-md font-semibold border uppercase text-[11px] tracking-wide"
                      style={{ backgroundColor: next.bg, color: next.color, borderColor: next.border }}
                    >
                      {next.text}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Audit Ledger Metadata (CRED Specs Grid) ── */}
      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-1.5 border-t"
        style={{ borderColor: 'var(--color-border-subtle)' }}
      >
        <div
          className="p-2.5 rounded-xl border space-y-0.5"
          style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-subtle)' }}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
            Performed By
          </span>
          <p className="text-xs font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
            {detail.actorName || 'Super Admin'}
          </p>
          {detail.actorEmail && (
            <p className="text-[10px] truncate opacity-75" style={{ color: 'var(--color-text-secondary)' }}>
              {detail.actorEmail}
            </p>
          )}
        </div>

        <div
          className="p-2.5 rounded-xl border space-y-0.5"
          style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-subtle)' }}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
            Target Entity
          </span>
          <p className="text-xs font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
            {detail.targetName || detail.workspaceName || 'Platform'}
          </p>
          <p className="text-[10px] truncate opacity-75" style={{ color: 'var(--color-text-secondary)' }}>
            {detail.targetType || 'Workspace'}
          </p>
        </div>

        <div
          className="p-2.5 rounded-xl border space-y-0.5"
          style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-subtle)' }}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
            Timestamp
          </span>
          <p className="text-xs font-semibold leading-tight" style={{ color: 'var(--color-text-primary)' }}>
            {exactTime(detail.createdAt)}
          </p>
        </div>

        <div
          className="p-2.5 rounded-xl border space-y-0.5"
          style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-subtle)' }}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
            Origin Source
          </span>
          <p className="text-xs font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
            {detail.ipAddress || 'Internal Admin'}
          </p>
          <p className="text-[10px] font-medium" style={{ color: '#10b981' }}>
            Verified Security Audit
          </p>
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const SuperAdminAuditLogViewer = ({ workspaceId }) => {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [action, setAction] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');
  const [expandedId, setExpandedId] = useState(null);
  const search = useDebouncedValue(searchInput, 300);

  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useSuperAdminAuditLog({ workspaceId, search, action, sort: sortOrder });

  const entries = useMemo(() => (data?.pages || []).flatMap((p) => p.data), [data]);
  const groupedEntries = useMemo(() => groupByDay(entries), [entries]);

  // Real-time live log ingestion
  useEffect(() => {
    const handler = (e) => {
      const entry = e.detail;
      if (workspaceId && String(entry?.workspace) !== String(workspaceId)) return;
      queryClient.setQueryData(
        ['super-admin', 'audit-log', { workspaceId, search, action, sort: sortOrder }],
        (old) => {
          if (!old) return old;
          const pages = [...old.pages];
          if (pages.length > 0) {
            pages[0] = { ...pages[0], data: [entry, ...pages[0].data] };
          }
          return { ...old, pages };
        }
      );
    };
    window.addEventListener('socket-super-admin-audit-log-created', handler);
    return () => window.removeEventListener('socket-super-admin-audit-log-created', handler);
  }, [queryClient, workspaceId, search, action, sortOrder]);

  // Infinite scroll
  const sentinelRef = useRef(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entriesList) => {
        if (entriesList[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const toggleExpand = useCallback((id) => {
    setExpandedId((cur) => (cur === id ? null : id));
  }, []);

  const clearFilters = () => {
    setSearchInput('');
    setAction('');
  };

  const hasActiveFilters = Boolean(searchInput || action);

  return (
    <div className="space-y-4">
      {/* ── CRED-Style Toolbar ── */}
      <div
        className="p-3.5 rounded-2xl border shadow-xs flex flex-wrap items-center justify-between gap-3"
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border-subtle)'
        }}
      >
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: 'var(--color-text-muted)' }}
            />
            <input
              type="text"
              placeholder="Search actor, workspace, summary…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-8 py-2 rounded-xl border text-xs sm:text-sm outline-none transition-all focus:ring-2 focus:ring-violet-500/20"
              style={{
                backgroundColor: 'var(--color-bg-base)',
                borderColor: 'var(--color-border-subtle)',
                color: 'var(--color-text-primary)'
              }}
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Action Filter */}
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="px-3 py-2 rounded-xl border text-xs sm:text-sm outline-none cursor-pointer"
            style={{
              backgroundColor: 'var(--color-bg-base)',
              borderColor: 'var(--color-border-subtle)',
              color: 'var(--color-text-primary)'
            }}
          >
            <option value="">All Action Types</option>
            {Object.entries(ACTION_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>
                {cfg.label}
              </option>
            ))}
          </select>

          {/* Sort Order */}
          <button
            onClick={() => setSortOrder((cur) => (cur === 'newest' ? 'oldest' : 'newest'))}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs sm:text-sm font-medium transition-all"
            style={{
              backgroundColor: 'var(--color-bg-base)',
              borderColor: 'var(--color-border-subtle)',
              color: 'var(--color-text-secondary)'
            }}
          >
            <ArrowDownUp className="w-3.5 h-3.5 text-violet-500" />
            <span>{sortOrder === 'newest' ? 'Newest' : 'Oldest'}</span>
          </button>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold"
              style={{ color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.08)' }}
            >
              <X className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>

        {/* Right Status */}
        {!isLoading && !isError && entries.length > 0 && (
          <div className="flex items-center gap-2 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
            <span>{entries.length} Events</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        )}
      </div>

      {/* ── Error Banner ── */}
      {isError && (
        <div
          className="flex items-center gap-3 p-4 rounded-2xl border text-xs"
          style={{
            borderColor: 'rgba(239, 68, 68, 0.3)',
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            color: '#ef4444'
          }}
        >
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="flex-1 text-sm">{error?.response?.data?.message || 'Failed to load audit records.'}</span>
          <button
            onClick={() => refetch()}
            className="px-3 py-1.5 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Initial Loading ── */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="p-5 rounded-2xl border animate-pulse flex items-center justify-between gap-4"
              style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-subtle)' }}
            >
              <div className="flex items-center gap-3.5 flex-1">
                <div className="w-11 h-11 rounded-2xl bg-gray-200 dark:bg-gray-800 shrink-0" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 rounded bg-gray-200 dark:bg-gray-800 w-1/3" />
                  <div className="h-3 rounded bg-gray-200 dark:bg-gray-800 w-1/2" />
                </div>
              </div>
              <div className="h-4 rounded bg-gray-200 dark:bg-gray-800 w-20" />
            </div>
          ))}
        </div>
      )}

      {/* ── Zero State ── */}
      {!isLoading && entries.length === 0 && !isError && (
        <div
          className="flex flex-col items-center justify-center gap-2.5 py-14 px-4 rounded-2xl border text-center text-xs"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderColor: 'var(--color-border-subtle)',
            color: 'var(--color-text-muted)'
          }}
        >
          <ScrollText className="w-7 h-7 opacity-60 text-violet-500" />
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {hasActiveFilters ? 'No Matching Audit Logs' : 'No Super Admin Actions Yet'}
          </p>
          <p className="text-xs max-w-sm">
            {hasActiveFilters
              ? 'Try changing your search terms or selecting another action type.'
              : 'Security actions and workspace operations will be automatically recorded here.'}
          </p>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="mt-2 px-4 py-2 rounded-xl text-xs font-bold bg-violet-600 text-white"
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* ── Day-Grouped Activity Feed (CRED Cards) ── */}
      {!isLoading && entries.length > 0 && (
        <div className="space-y-5">
          {groupedEntries.map((group) => (
            <div key={group.label} className="space-y-3">
              {/* Day Header */}
              <div className="flex items-center gap-2.5 pt-1">
                <span
                  className="text-[11px] font-bold uppercase tracking-widest"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {group.label}
                </span>
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                  style={{
                    backgroundColor: 'rgba(124, 58, 237, 0.08)',
                    color: '#7c3aed'
                  }}
                >
                  {group.items.length}
                </span>
                <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border-subtle)' }} />
              </div>

              {/* Group Cards */}
              <div className="space-y-2.5">
                {group.items.map((entry) => {
                  const isExpanded = expandedId === entry._id;
                  const cfg = ACTION_CONFIG[entry.action] || DEFAULT_ACTION_CFG;
                  const { Icon } = cfg;

                  return (
                    <div
                      key={entry._id}
                      className="rounded-2xl border transition-all duration-200 overflow-hidden shadow-xs hover:shadow-sm"
                      style={{
                        backgroundColor: 'var(--color-bg-secondary)',
                        borderColor: isExpanded ? 'rgba(124, 58, 237, 0.35)' : 'var(--color-border-subtle)'
                      }}
                    >
                      {/* Clickable Card Header */}
                      <button
                        onClick={() => toggleExpand(entry._id)}
                        className="w-full flex items-center justify-between gap-3.5 p-4 sm:p-4.5 text-left cursor-pointer transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                      >
                        {/* Left: CRED Squircle Icon + Text */}
                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                          {/* Squircle Badge */}
                          <div
                            className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center shrink-0 border transition-transform"
                            style={{
                              backgroundColor: cfg.iconBg,
                              borderColor: cfg.iconBorder,
                              color: cfg.iconColor
                            }}
                          >
                            <Icon className="w-5 h-5" />
                          </div>

                          {/* Content Block */}
                          <div className="min-w-0 flex-1 space-y-1">
                            {/* Badges line */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border"
                                style={{
                                  backgroundColor: cfg.badgeBg,
                                  color: cfg.badgeColor,
                                  borderColor: cfg.badgeBorder
                                }}
                              >
                                {cfg.label}
                              </span>

                              {entry.workspaceName && (
                                <span
                                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md font-semibold border"
                                  style={{
                                    backgroundColor: 'var(--color-bg-base)',
                                    color: 'var(--color-text-secondary)',
                                    borderColor: 'var(--color-border-subtle)'
                                  }}
                                >
                                  <Building2 className="w-3 h-3 text-sky-500" />
                                  <span>{entry.workspaceName}</span>
                                </span>
                              )}
                            </div>

                            {/* Human Summary Sentence */}
                            <p
                              className="text-sm font-semibold leading-snug break-words"
                              style={{ color: 'var(--color-text-primary)' }}
                            >
                              {entry.summary || cfg.label}
                            </p>

                            {/* Meta subline */}
                            <div
                              className="flex items-center gap-x-2.5 gap-y-1 flex-wrap text-xs"
                              style={{ color: 'var(--color-text-muted)' }}
                            >
                              <span className="font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                                {entry.actorName || 'Super Admin'}
                              </span>

                              <span>•</span>

                              <span title={exactTime(entry.createdAt)}>
                                {relativeTime(entry.createdAt)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Right: Expand Button Pill */}
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className="hidden sm:inline-block text-xs font-semibold px-2.5 py-1 rounded-xl border transition-colors"
                            style={{
                              backgroundColor: isExpanded ? 'rgba(124, 58, 237, 0.10)' : 'var(--color-bg-base)',
                              color: isExpanded ? '#7c3aed' : 'var(--color-text-secondary)',
                              borderColor: isExpanded ? 'rgba(124, 58, 237, 0.25)' : 'var(--color-border-subtle)'
                            }}
                          >
                            {isExpanded ? 'Hide Details' : 'View Details'}
                          </span>
                          <div
                            className="w-8 h-8 rounded-xl flex items-center justify-center border transition-transform"
                            style={{
                              backgroundColor: isExpanded ? 'rgba(124, 58, 237, 0.12)' : 'var(--color-bg-base)',
                              borderColor: isExpanded ? 'rgba(124, 58, 237, 0.30)' : 'var(--color-border-subtle)',
                              color: isExpanded ? '#7c3aed' : 'var(--color-text-secondary)'
                            }}
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </div>
                        </div>
                      </button>

                      {/* Expanded Drawer Details */}
                      {isExpanded && <CredEntryDetail id={entry._id} />}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Infinite Scroll Sentinel ── */}
      <div ref={sentinelRef} className="h-2" />
      {isFetchingNextPage && (
        <div className="flex items-center justify-center gap-2 py-4 text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
          <span>Loading more activity records…</span>
        </div>
      )}
    </div>
  );
};

export default SuperAdminAuditLogViewer;
