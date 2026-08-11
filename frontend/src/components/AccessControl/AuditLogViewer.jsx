/**
 * AuditLogViewer — Enterprise-grade, infinite-scroll audit log UI.
 *
 * Features:
 *  • Cursor-based infinite scroll (100 records initial, 50 per page)
 *  • Day-grouped entries (Today / Yesterday / This Week / Earlier)
 *  • Color-coded action badges with icons
 *  • Relative timestamps + exact time on hover
 *  • Lazy expand/collapse with cached change-detail fetch
 *  • Full filter bar: date, actor, target, resource, action, search, sort
 *  • Skeleton loading states
 *  • "No more activity logs" terminal state
 *  • Zero-state illustration when filters return nothing
 *
 * Designed to handle millions of records via keyset pagination — never
 * uses offset, never re-fetches previously loaded records.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Search,
  Shield,
  ShieldCheck,
  ShieldOff,
  SlidersHorizontal,
  SortAsc,
  SortDesc,
  Trash2,
  User,
  X,
  ArrowRight,
  Loader2,
  AlertCircle,
  ZapOff
} from 'lucide-react';
import api from '../../services/api';
import { fetchAuditLogPage, fetchAuditLogEntryDetail } from '../../services/accessControlApi';

// ─── Constants ───────────────────────────────────────────────────────────────

const INITIAL_LIMIT = 100;
const PAGE_LIMIT = 50;

const ACTION_CONFIG = {
  PERMISSION_GRANTED: {
    label: 'Granted',
    bg: 'rgba(22,163,74,0.12)',
    color: '#16a34a',
    border: 'rgba(22,163,74,0.25)',
    Icon: ShieldCheck
  },
  PERMISSION_REVOKED: {
    label: 'Revoked',
    bg: 'rgba(220,38,38,0.10)',
    color: '#dc2626',
    border: 'rgba(220,38,38,0.22)',
    Icon: ShieldOff
  },
  PERMISSION_UPDATED: {
    label: 'Updated',
    bg: 'rgba(2,132,199,0.10)',
    color: '#0284c7',
    border: 'rgba(2,132,199,0.22)',
    Icon: Shield
  },
  ROLE_CHANGED: {
    label: 'Role Changed',
    bg: 'rgba(124,58,237,0.10)',
    color: '#7c3aed',
    border: 'rgba(124,58,237,0.22)',
    Icon: User
  },
  ROLE_PERMISSIONS_UPDATED: {
    label: 'Role Updated',
    bg: 'rgba(124,58,237,0.10)',
    color: '#7c3aed',
    border: 'rgba(124,58,237,0.22)',
    Icon: User
  },
  ROLE_DELETED: {
    label: 'Role Deleted',
    bg: 'rgba(220,38,38,0.10)',
    color: '#dc2626',
    border: 'rgba(220,38,38,0.22)',
    Icon: Trash2
  },
  ACCESS_SCOPE_UPDATED: {
    label: 'Scope Updated',
    bg: 'rgba(217,119,6,0.10)',
    color: '#d97706',
    border: 'rgba(217,119,6,0.22)',
    Icon: Shield
  }
};

const DEFAULT_ACTION_CFG = {
  label: 'Changed',
  bg: 'rgba(107,114,128,0.10)',
  color: '#6b7280',
  border: 'rgba(107,114,128,0.22)',
  Icon: Shield
};

const RESOURCE_LABELS = {
  sales: 'Sales',
  finance: 'Finance',
  access_control: 'Access Control'
};

const ALL_ACTIONS = Object.entries(ACTION_CONFIG).map(([key, cfg]) => ({
  key,
  label: cfg.label
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  if (diff < 60_000)          return 'just now';
  if (diff < 3_600_000)       return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)      return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000)  return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

function exactTime(dateStr) {
  return new Date(dateStr).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
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

  if (sameDay(d, today))     return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';

  const daysDiff = Math.floor((today - d) / 86_400_000);
  if (daysDiff < 7) return 'This Week';
  return 'Earlier';
}

/**
 * Groups a flat sorted list into day-labelled sections preserving
 * insertion order so the final render is stable and duplicates never appear.
 */
function groupByDay(entries) {
  const seen = new Map(); // label -> { label, items[] }
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

// ─── Sub-components ───────────────────────────────────────────────────────────

const ActionBadge = ({ action }) => {
  const cfg = ACTION_CONFIG[action] || DEFAULT_ACTION_CFG;
  const { Icon } = cfg;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 border"
      style={{ backgroundColor: cfg.bg, color: cfg.color, borderColor: cfg.border }}
    >
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
};

const ChangeRow = ({ label, previous, next }) => {
  const fmt = (v) => {
    if (v === true)  return { text: 'Enabled',  color: '#16a34a' };
    if (v === false) return { text: 'Disabled', color: '#dc2626' };
    if (Array.isArray(v)) return { text: v.length ? v.join(', ') : 'None', color: 'var(--color-text-secondary)' };
    return { text: String(v ?? '—'), color: 'var(--color-text-secondary)' };
  };
  const prev = fmt(previous);
  const nxt  = fmt(next);

  return (
    <div className="flex items-center gap-2 py-1 text-xs">
      <span className="w-36 shrink-0 font-medium" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </span>
      <span style={{ color: prev.color }} className="font-medium">{prev.text}</span>
      <ArrowRight className="w-3 h-3 shrink-0" style={{ color: 'var(--color-text-muted)' }} />
      <span style={{ color: nxt.color }} className="font-medium">{nxt.text}</span>
    </div>
  );
};

const SkeletonCard = () => (
  <div
    className="rounded-xl border px-4 py-4 animate-pulse"
    style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-subtle)' }}
  >
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full shrink-0" style={{ backgroundColor: 'var(--color-bg-muted)' }} />
      <div className="flex-1 space-y-2">
        <div className="h-3 rounded w-1/3" style={{ backgroundColor: 'var(--color-bg-muted)' }} />
        <div className="h-2.5 rounded w-2/3" style={{ backgroundColor: 'var(--color-bg-muted)' }} />
        <div className="h-2 rounded w-1/4" style={{ backgroundColor: 'var(--color-bg-muted)' }} />
      </div>
      <div className="h-2 rounded w-16 shrink-0" style={{ backgroundColor: 'var(--color-bg-muted)' }} />
    </div>
  </div>
);

const DayGroupHeader = ({ label }) => (
  <div className="flex items-center gap-3 py-2 mt-4 first:mt-0">
    <span
      className="text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-md"
      style={{
        color: '#7c3aed',
        backgroundColor: 'rgba(124,58,237,0.08)',
        letterSpacing: '0.12em'
      }}
    >
      {label}
    </span>
    <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border-subtle)' }} />
  </div>
);

// ─── Single Log Entry Card ────────────────────────────────────────────────────

const LogEntryCard = ({ entry, detailCache }) => {
  const [expanded, setExpanded]   = useState(false);
  const [detail,   setDetail]     = useState(null);
  const [loading,  setLoading]    = useState(false);

  const cfg = ACTION_CONFIG[entry.action] || DEFAULT_ACTION_CFG;
  const { Icon } = cfg;

  const handleExpand = useCallback(async () => {
    const next = !expanded;
    setExpanded(next);
    if (!next || detail) return;

    // Check in-memory cache first
    if (detailCache.current.has(entry._id)) {
      setDetail(detailCache.current.get(entry._id));
      return;
    }

    try {
      setLoading(true);
      const d = await fetchAuditLogEntryDetail(entry._id);
      detailCache.current.set(entry._id, d);
      setDetail(d);
    } catch {
      // detail stays null — we'll show the raw changeDetails from the list row
    } finally {
      setLoading(false);
    }
  }, [expanded, detail, entry._id, detailCache]);

  // changeDetails may already be on the list row (projection exclusion in older data).
  // We prefer the full detail when available, fall back to entry.changeDetails.
  const changeDetails = detail?.changeDetails ?? entry.changeDetails ?? [];
  const hasChanges    = changeDetails.length > 0;

  return (
    <div
      className="rounded-xl border transition-all duration-200"
      style={{
        backgroundColor: 'var(--color-bg-secondary)',
        borderColor: expanded ? 'rgba(124,58,237,0.35)' : 'var(--color-border-subtle)',
        boxShadow: expanded ? '0 0 0 1px rgba(124,58,237,0.12)' : 'none'
      }}
    >
      {/* ── Main row ── */}
      <div className="flex items-start gap-3 px-4 py-3.5">
        {/* Icon bubble */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
          style={{ backgroundColor: cfg.bg, border: `1.5px solid ${cfg.border}` }}
        >
          <Icon className="w-4 h-4" style={{ color: cfg.color }} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Summary + badge */}
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <ActionBadge action={entry.action} />
            {entry.resourceLabel && (
              <span
                className="text-xs px-1.5 py-0.5 rounded font-medium border"
                style={{
                  backgroundColor: 'rgba(107,114,128,0.08)',
                  color: 'var(--color-text-secondary)',
                  borderColor: 'var(--color-border-subtle)'
                }}
              >
                {entry.resourceLabel}
              </span>
            )}
          </div>

          {/* Human-readable summary sentence */}
          {entry.summary ? (
            <p className="text-sm font-medium leading-snug mb-1" style={{ color: 'var(--color-text-primary)' }}>
              {entry.summary}
            </p>
          ) : (
            <p className="text-sm font-medium leading-snug mb-1" style={{ color: 'var(--color-text-primary)' }}>
              <span className="font-semibold">{entry.actorName || 'Unknown'}</span>
              {' '}
              {(ACTION_CONFIG[entry.action]?.label || entry.action).toLowerCase()}
              {entry.targetName && (
                <> for <span className="font-semibold">{entry.targetName}</span></>
              )}
            </p>
          )}

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {entry.actorName && (
              <span>
                By <span className="font-medium" style={{ color: 'var(--color-text-secondary)' }}>{entry.actorName}</span>
                {entry.actorRole && (
                  <span className="ml-1 opacity-70">({entry.actorRole})</span>
                )}
              </span>
            )}
            {entry.targetName && (
              <span>
                → <span className="font-medium" style={{ color: 'var(--color-text-secondary)' }}>{entry.targetName}</span>
              </span>
            )}
          </div>
        </div>

        {/* Right: timestamp + expand */}
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="text-xs whitespace-nowrap"
            style={{ color: 'var(--color-text-muted)' }}
            title={exactTime(entry.createdAt)}
          >
            {relativeTime(entry.createdAt)}
          </span>

          <button
            onClick={handleExpand}
            className="w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:opacity-80"
            style={{
              backgroundColor: expanded ? 'rgba(124,58,237,0.12)' : 'var(--color-bg-muted)',
              color: expanded ? '#7c3aed' : 'var(--color-text-muted)'
            }}
            title={expanded ? 'Collapse' : 'View change details'}
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* ── Expanded detail panel ── */}
      {expanded && (
        <div
          className="px-4 pb-4 pt-1 border-t"
          style={{ borderColor: 'var(--color-border-subtle)' }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>
            Change Details
          </p>

          {loading ? (
            <div className="flex items-center gap-2 py-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading details…
            </div>
          ) : hasChanges ? (
            <div
              className="rounded-lg p-3 divide-y"
              style={{
                backgroundColor: 'var(--color-bg-muted)',
                borderColor: 'var(--color-border-subtle)',
                border: '1px solid var(--color-border-subtle)'
              }}
            >
              {changeDetails.map((cd, i) => (
                <ChangeRow key={i} label={cd.label} previous={cd.previous} next={cd.next} />
              ))}
            </div>
          ) : (
            /* Fallback: show exact time with no structural changes */
            <div
              className="rounded-lg px-3 py-2 text-xs"
              style={{
                backgroundColor: 'var(--color-bg-muted)',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border-subtle)'
              }}
            >
              No individual field changes recorded for this action.
              <br />
              <span className="opacity-70">Timestamp: {exactTime(entry.createdAt)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Filter Bar ───────────────────────────────────────────────────────────────

const FilterBar = ({ filters, onFiltersChange, users, registry }) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const resourceKeys = Object.keys(registry?.resources || {});
  const hasActive = Object.values(filters).some((v) => v !== '' && v !== null && v !== undefined);

  const set = (key) => (e) => onFiltersChange((f) => ({ ...f, [key]: e.target.value }));
  const clear = () => onFiltersChange({
    search: '', sort: 'newest', startDate: '', endDate: '',
    actorId: '', targetId: '', resourceKey: '', action: ''
  });

  return (
    <div
      className="rounded-xl border p-4 space-y-3"
      style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-subtle)' }}
    >
      {/* Top row: search + sort + advanced toggle */}
      <div className="flex gap-2 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--color-text-muted)' }} />
          <input
            type="text"
            placeholder="Search by user, action, resource…"
            value={filters.search}
            onChange={set('search')}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border outline-none"
            style={{
              backgroundColor: 'var(--color-bg-muted)',
              borderColor: 'var(--color-border-subtle)',
              color: 'var(--color-text-primary)'
            }}
          />
        </div>

        {/* Sort */}
        <button
          onClick={() => onFiltersChange((f) => ({ ...f, sort: f.sort === 'newest' ? 'oldest' : 'newest' }))}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors"
          style={{
            backgroundColor: 'var(--color-bg-muted)',
            borderColor: 'var(--color-border-subtle)',
            color: 'var(--color-text-secondary)'
          }}
        >
          {filters.sort === 'newest'
            ? <><SortDesc className="w-3.5 h-3.5" /> Newest</>
            : <><SortAsc className="w-3.5 h-3.5" /> Oldest</>
          }
        </button>

        {/* Advanced toggle */}
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors"
          style={{
            backgroundColor: showAdvanced ? 'rgba(124,58,237,0.10)' : 'var(--color-bg-muted)',
            borderColor:     showAdvanced ? 'rgba(124,58,237,0.30)' : 'var(--color-border-subtle)',
            color:           showAdvanced ? '#7c3aed' : 'var(--color-text-secondary)'
          }}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filters
          {hasActive && <span className="w-1.5 h-1.5 rounded-full bg-violet-500 ml-0.5" />}
        </button>

        {hasActive && (
          <button
            onClick={clear}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium"
            style={{ color: '#dc2626', backgroundColor: 'rgba(220,38,38,0.08)' }}
          >
            <X className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Advanced filters */}
      {showAdvanced && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-2 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
          {/* Date range */}
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>From date</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={set('startDate')}
              className="w-full px-2 py-1.5 text-xs rounded-lg border outline-none"
              style={{
                backgroundColor: 'var(--color-bg-muted)',
                borderColor: 'var(--color-border-subtle)',
                color: 'var(--color-text-primary)'
              }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>To date</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={set('endDate')}
              className="w-full px-2 py-1.5 text-xs rounded-lg border outline-none"
              style={{
                backgroundColor: 'var(--color-bg-muted)',
                borderColor: 'var(--color-border-subtle)',
                color: 'var(--color-text-primary)'
              }}
            />
          </div>

          {/* Performed by */}
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Performed by</label>
            <select
              value={filters.actorId}
              onChange={set('actorId')}
              className="w-full px-2 py-1.5 text-xs rounded-lg border outline-none"
              style={{
                backgroundColor: 'var(--color-bg-muted)',
                borderColor: 'var(--color-border-subtle)',
                color: 'var(--color-text-primary)'
              }}
            >
              <option value="">All users</option>
              {users.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
            </select>
          </div>

          {/* Affected user */}
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Affected user</label>
            <select
              value={filters.targetId}
              onChange={set('targetId')}
              className="w-full px-2 py-1.5 text-xs rounded-lg border outline-none"
              style={{
                backgroundColor: 'var(--color-bg-muted)',
                borderColor: 'var(--color-border-subtle)',
                color: 'var(--color-text-primary)'
              }}
            >
              <option value="">All users</option>
              {users.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
            </select>
          </div>

          {/* Module / Resource */}
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Module</label>
            <select
              value={filters.resourceKey}
              onChange={set('resourceKey')}
              className="w-full px-2 py-1.5 text-xs rounded-lg border outline-none"
              style={{
                backgroundColor: 'var(--color-bg-muted)',
                borderColor: 'var(--color-border-subtle)',
                color: 'var(--color-text-primary)'
              }}
            >
              <option value="">All modules</option>
              {resourceKeys.map((k) => (
                <option key={k} value={k}>
                  {registry?.resources?.[k]?.label || RESOURCE_LABELS[k] || k}
                </option>
              ))}
            </select>
          </div>

          {/* Action type */}
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Action type</label>
            <select
              value={filters.action}
              onChange={set('action')}
              className="w-full px-2 py-1.5 text-xs rounded-lg border outline-none"
              style={{
                backgroundColor: 'var(--color-bg-muted)',
                borderColor: 'var(--color-border-subtle)',
                color: 'var(--color-text-primary)'
              }}
            >
              <option value="">All actions</option>
              {ALL_ACTIONS.map(({ key, label }) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main AuditLogViewer ──────────────────────────────────────────────────────

const AuditLogViewer = ({ registry }) => {
  const [entries,   setEntries]   = useState([]);
  const [cursor,    setCursor]    = useState(null);
  const [hasMore,   setHasMore]   = useState(true);
  const [loading,   setLoading]   = useState(true);   // initial page
  const [paginating, setPaginating] = useState(false); // subsequent pages
  const [error,     setError]     = useState(null);
  const [users,     setUsers]     = useState([]);
  const [filters,   setFilters]   = useState({
    search: '', sort: 'newest', startDate: '', endDate: '',
    actorId: '', targetId: '', resourceKey: '', action: ''
  });

  // Stable refs
  const isFetchingRef  = useRef(false);
  const sentinelRef    = useRef(null);
  const detailCache    = useRef(new Map()); // _id -> changeDetails array
  const debounceTimer  = useRef(null);
  const latestFilters  = useRef(filters);
  latestFilters.current = filters;

  // ── Load user list for filter dropdowns ──
  useEffect(() => {
    api.get('/api/users').then((r) => setUsers(r.data?.data || [])).catch(() => {});
  }, []);

  // ── Core fetch function ────────────────────────────────────────────────────
  const fetchPage = useCallback(async ({ cursorValue, isFirstPage, filtersSnapshot }) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    isFirstPage ? setLoading(true) : setPaginating(true);
    setError(null);

    try {
      const params = {
        limit:       isFirstPage ? INITIAL_LIMIT : PAGE_LIMIT,
        sort:        filtersSnapshot.sort,
        cursor:      cursorValue ?? undefined,
        startDate:   filtersSnapshot.startDate   || undefined,
        endDate:     filtersSnapshot.endDate     || undefined,
        actorId:     filtersSnapshot.actorId     || undefined,
        targetId:    filtersSnapshot.targetId    || undefined,
        resourceKey: filtersSnapshot.resourceKey || undefined,
        action:      filtersSnapshot.action      || undefined,
        search:      filtersSnapshot.search      || undefined
      };

      const result = await fetchAuditLogPage(params);

      if (isFirstPage) {
        setEntries(result.data);
      } else {
        setEntries((prev) => [...prev, ...result.data]);
      }

      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
    } catch (err) {
      setError('Failed to load activity logs. Please try again.');
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
      setPaginating(false);
    }
  }, []);

  // ── Debounced filter → reset + re-fetch ────────────────────────────────────
  useEffect(() => {
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      detailCache.current.clear();
      fetchPage({ cursorValue: null, isFirstPage: true, filtersSnapshot: filters });
    }, filters.search ? 400 : 0); // debounce search, instant for other filters

    return () => clearTimeout(debounceTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // ── IntersectionObserver for infinite scroll ────────────────────────────────
  useEffect(() => {
    if (!sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isFetchingRef.current && !loading) {
          fetchPage({
            cursorValue:     cursor,
            isFirstPage:     false,
            filtersSnapshot: latestFilters.current
          });
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [cursor, hasMore, loading, fetchPage]);

  // ── Grouped entries ────────────────────────────────────────────────────────
  const grouped = useMemo(() => groupByDay(entries), [entries]);

  // ─ Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <FilterBar
        filters={filters}
        onFiltersChange={setFilters}
        users={users}
        registry={registry}
      />

      {/* Entry count */}
      {!loading && entries.length > 0 && (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Showing {entries.length.toLocaleString()} record{entries.length !== 1 ? 's' : ''}
          {hasMore ? ' — scroll for more' : ''}
        </p>
      )}

      {/* Error */}
      {error && (
        <div
          className="flex items-center gap-2 rounded-xl border px-4 py-3 text-sm"
          style={{ backgroundColor: 'rgba(220,38,38,0.06)', borderColor: 'rgba(220,38,38,0.20)', color: '#dc2626' }}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
          <button
            className="ml-auto underline text-xs"
            onClick={() => fetchPage({ cursorValue: null, isFirstPage: true, filtersSnapshot: filters })}
          >
            Retry
          </button>
        </div>
      )}

      {/* Initial load skeletons */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* Entries grouped by day */}
      {!loading && entries.length > 0 && (
        <div className="space-y-1">
          {grouped.map((group) => (
            <div key={group.label}>
              <DayGroupHeader label={group.label} />
              <div className="space-y-2">
                {group.items.map((entry) => (
                  <LogEntryCard
                    key={entry._id}
                    entry={entry}
                    detailCache={detailCache}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination skeleton / sentinel */}
      {paginating && (
        <div className="space-y-2 mt-2">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* Sentinel div — IntersectionObserver watches this */}
      <div ref={sentinelRef} className="h-4" />

      {/* Terminal states */}
      {!loading && !hasMore && entries.length > 0 && (
        <div
          className="flex items-center justify-center gap-2 py-6 text-xs rounded-xl border"
          style={{
            color: 'var(--color-text-muted)',
            borderColor: 'var(--color-border-subtle)',
            backgroundColor: 'var(--color-bg-subtle)'
          }}
        >
          <ZapOff className="w-3.5 h-3.5" />
          No more activity logs
        </div>
      )}

      {/* Zero state */}
      {!loading && entries.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ backgroundColor: 'rgba(124,58,237,0.08)' }}
          >
            <Clock className="w-7 h-7" style={{ color: '#7c3aed', opacity: 0.5 }} />
          </div>
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>
            No activity logs found
          </p>
          <p className="text-xs max-w-xs" style={{ color: 'var(--color-text-muted)' }}>
            No permission changes match the current filters. Try adjusting the date range or clearing the filters.
          </p>
        </div>
      )}
    </div>
  );
};

export default AuditLogViewer;
