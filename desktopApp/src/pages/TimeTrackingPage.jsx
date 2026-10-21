import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Filter,
  X,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Users,
  Clock,
  Clock3,
  Building2,
  Activity,
  ShieldCheck,
  Briefcase,
  AlertCircle,
  Loader2
} from 'lucide-react';
import TrackingDialog from '../components/Tracking/TrackingDialog';
import { getTrackingDashboard, getWorkOptions, getAgendas, errorMessage } from '../services/trackingApi';
import WorkspaceContext from '../context/WorkspaceContext';
import AuthContext from '../context/AuthContext';
import Avatar from '../components/Avatar';
import TrackingReports from '../components/Tracking/TrackingReports';
import { formatTrackingClock as duration } from '../utils/duration';
import { Button } from '../components/ui/button';
import useTrackingScope from '../components/Tracking/useTrackingScope';
import { summarizeDesktopDevices } from '../services/desktopTracking';

const initial = {
  period: 'today',
  type: '',
  projectId: '',
  taskId: '',
  departmentId: '',
  status: '',
  userId: '',
  search: '',
  agendaId: '',
  linked: '',
  fromDate: '',
  toDate: '',
  page: 1
};

const initialDetailFilters = { type: '', projectId: '', taskId: '', agendaId: '' };

function TrackingOverview({ totals, role, loading, error, onRetry }) {
  const effectiveRole = totals?.viewerRole || role || 'employee';
  const isAdmin = effectiveRole === 'admin';
  const isManager = effectiveRole === 'manager';

  const scopeTitle = isAdmin
    ? 'Workspace Tracking Overview'
    : isManager
    ? 'Department Tracking Overview'
    : 'Personal Tracking Overview';

  const scopeBadge = isAdmin
    ? 'Full Workspace'
    : isManager
    ? 'Assigned Departments'
    : 'Personal Scope';

  const scopeDesc = isAdmin
    ? 'Total aggregated work and office attendance across all workspace members'
    : isManager
    ? 'Total aggregated work and office attendance for users in your assigned departments'
    : 'Your total personal work and office attendance time';

  return (
    <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-5 md:p-6 transition-all">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
            <Activity size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">
                {scopeTitle}
              </h2>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                  isAdmin
                    ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border-purple-200 dark:border-purple-800/60'
                    : isManager
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 dark:border-blue-800/60'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                }`}
              >
                {isAdmin ? <ShieldCheck size={12} /> : isManager ? <Briefcase size={12} /> : null}
                <span>{scopeBadge}</span>
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {scopeDesc}
            </p>
          </div>
        </div>

        {/* Live Active / Attendance Pill */}
        <div className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-850/60 px-3 py-1.5 rounded-xl border border-gray-200/60 dark:border-gray-700/60">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>{totals?.activeUsers ?? '\u2014'} tracking actively</span>
          <span className="text-gray-300 dark:text-gray-600">·</span>
          <span>{totals?.checkedInUsers ?? '\u2014'} checked in</span>
        </div>
      </div>

      {loading&&<p role="status" className="mb-3 text-sm">Loading tracking overview...</p>}
      {error&&<p role="alert" className="mb-3 text-sm text-rose-600">{error} {totals&&'Showing the last confirmed totals.'} <button type="button" className="underline" onClick={onRetry}>Retry overview</button></p>}
      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Total Work Time */}
        <div className="p-4 rounded-xl border border-blue-100 dark:border-blue-950/80 bg-blue-50/40 dark:bg-blue-950/20">
          <div className="flex items-center justify-between text-blue-600 dark:text-blue-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Work Time</span>
            <Clock3 size={15} />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-gray-900 dark:text-white tabular-nums">
            {totals ? duration(totals.workSeconds) : '\u2014'}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {isAdmin
              ? 'Cumulative work across all workspace members'
              : isManager
              ? 'Cumulative work for assigned departments'
              : 'Cumulative personal work time'}
          </p>
        </div>

        {/* Total Office Time */}
        <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-850/50">
          <div className="flex items-center justify-between text-gray-600 dark:text-gray-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Office Time</span>
            <Building2 size={15} />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-gray-800 dark:text-gray-200 tabular-nums">
            {totals ? duration(totals.officeSeconds) : '\u2014'}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Cumulative office attendance check-in duration
          </p>
        </div>

        {/* Workforce Coverage */}
        <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-850/50 sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-gray-600 dark:text-gray-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">
              {isAdmin ? 'Total Members' : isManager ? 'Department Members' : 'Active Status'}
            </span>
            <Users size={15} />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-gray-800 dark:text-gray-200 tabular-nums">
            {totals?.totalUsers ?? '\u2014'}{' '}
            <span className="text-sm font-medium text-gray-500 font-sans">
              {(totals?.totalUsers || 0) === 1 ? 'user' : 'users'}
            </span>
          </div>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1">
            {!totals ? 'Overview is not confirmed yet' : (totals.activeUsers || 0) > 0
              ? `${totals?.activeUsers ?? '\u2014'} currently tracking live`
              : 'No active tracking right now'}
          </p>
        </div>
      </div>
    </section>
  );
}

function AgentStatus({ user }) {
  const agent = summarizeDesktopDevices(user.devices, user.session?._id);
  const isConnected = agent.connected;
  const isOffline = !agent.connected && user.devices?.length > 0;
  const screenshotIssue = user.devices?.find(d => d.screenshotIssue)?.screenshotIssue;

  return (
    <div className="space-y-1 min-w-[130px] max-w-[220px]">
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${
            isConnected
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
              : isOffline
              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border-rose-200 dark:border-rose-800/60'
              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isConnected ? 'bg-emerald-500' : isOffline ? 'bg-rose-500' : 'bg-gray-400'
            }`}
          />
          {isConnected ? 'Connected' : isOffline ? 'Connection Offline' : 'Agent unavailable'}
        </span>
      </div>

      {user.trackingStatus === 'RUNNING' && agent.needsAttention && (
        <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400 flex items-center gap-1">
          <AlertCircle size={11} /> Attention Required
        </p>
      )}

      {screenshotIssue && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-tight">
          {screenshotIssue}
        </p>
      )}

      <p className="text-[11px] text-gray-400 dark:text-gray-500">
        Last seen {agent.lastSeenAt ? new Date(agent.lastSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'unknown'}
      </p>
    </div>
  );
}

export default function TimeTrackingPage() {
  const { currentWorkspace } = useContext(WorkspaceContext) || {};
  const { user: authUser } = useContext(AuthContext) || {};
  const workspaceId = currentWorkspace?._id;
  const [filters, setFilters] = useState(initial);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [projects, setProjects] = useState([]);
  const [mainTasks, setMainTasks] = useState([]);
  const [agendas, setAgendas] = useState([]);
  const [debounced, setDebounced] = useState(filters);
  const [detailFilters, setDetailFilters] = useState(initialDetailFilters);
  const [detailTasks, setDetailTasks] = useState([]);
  const scope = useTrackingScope();
  const sentinel = useRef(null);
  const client = useQueryClient();

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(filters), 300);
    return () => clearTimeout(timer);
  }, [filters]);

  const query = useInfiniteQuery({
    queryKey: ['tracking-private', scope, 'dashboard', debounced],
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) =>
      getTrackingDashboard({ ...debounced, summaryOnly: false, deferTotals: true, cursor: pageParam || undefined }, signal),
    getNextPageParam: last => last.nextCursor || undefined,
    staleTime: 30000,
    gcTime: 60000,
    retry: false
  });

  useEffect(() => {
    let timer;
    const refresh = e => {
      if (e && !/^(tracking:|attendance:)/.test(e.detail?.type || '')) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        for(const section of ['dashboard','dashboard-activity','dashboard-overview'])client.invalidateQueries({queryKey:['tracking-private',scope,section]},{cancelRefetch:false});
      }, 750);
    };
    window.addEventListener('flowtask:realtime', refresh);
    const poll = setInterval(() => refresh(), 60000);
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      window.removeEventListener('flowtask:realtime', refresh);
    };
  }, [scope, debounced, client]);

  const data = useMemo(() => {
    if (!query.data) return null;
    return {
      ...query.data.pages[0],
      users: [
        ...new Map(
          query.data.pages.flatMap(p => p?.users || []).map(u => [u.userId, u])
        ).values()
      ]
    };
  }, [query.data]);

  const readError=value=>value?.code==='ECONNABORTED'?'Tracking data took too long to load. Narrow the date range or retry.':errorMessage(value);
  const error = query.error ? readError(query.error) : '';
  const overview=useQuery({queryKey:['tracking-private',scope,'dashboard-overview',debounced],queryFn:({signal})=>getTrackingDashboard({...debounced,totalsOnly:true},signal),staleTime:30000,gcTime:60000,retry:false});

  useEffect(() => {
    setSelected(null);
    setDetailFilters(initialDetailFilters);
    setDetailTasks([]);
  }, [scope]);

  useEffect(() => {
    setDetailFilters(initialDetailFilters);
    setDetailTasks([]);
  }, [selected?.userId]);

  const { hasNextPage, isFetchingNextPage, isError, fetchNextPage } = query;

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || isError) return;
    const observer = new IntersectionObserver(
      entries => {
        if (Array.isArray(entries) && entries.some(e => e.isIntersecting)) fetchNextPage();
      },
      { rootMargin: '100px' }
    );
    if (sentinel.current) observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage]);

  useEffect(() => {
    let live = true;
    setProjects([]);
    setAgendas([]);
    if (!isFiltersOpen && !selected) return () => { live = false; };
    getWorkOptions()
      .then(next => live && setProjects(next.projects))
      .catch(() => {});
    getAgendas()
      .then(next => live && setAgendas(next))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [workspaceId, scope, isFiltersOpen, selected]);

  useEffect(() => {
    let live = true;
    setMainTasks([]);
    if (!filters.projectId) return;
    getWorkOptions(filters.projectId)
      .then(next => live && setMainTasks(next.tasks))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [filters.projectId, workspaceId, scope]);

  useEffect(() => {
    let live = true;
    setDetailTasks([]);
    if (!detailFilters.projectId) return;
    getWorkOptions(detailFilters.projectId)
      .then(next => live && setDetailTasks(next.tasks))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [detailFilters.projectId, workspaceId, scope]);

  const change = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      ...(key === 'projectId' ? { taskId: '' } : {}),
      page: 1
    }));
  };

  const changeDetailFilter = (key, value) => {
    setDetailFilters(prev => ({
      ...prev,
      [key]: value,
      ...(key === 'projectId' ? { taskId: '' } : {})
    }));
  };

  const closeSelected = useCallback(() => setSelected(null), []);
  const selectedUser = selected?.scope === scope ? selected : null;

  // Filter choices without Role and without Agenda Description
  const choices = [
    [
      'Time period',
      'period',
      [
        ['today', 'Today'],
        ['yesterday', 'Yesterday'],
        ['week', 'This Week'],
        ['month', 'This Month'],
        ['custom', 'Custom date range']
      ]
    ],
    [
      'Tracking type',
      'type',
      [
        ['TASK', 'Assigned task'],
        ['INDIVIDUAL', 'Individual agenda']
      ]
    ],
    ['Project', 'projectId', projects.map(p => [p._id, p.name])],
    ['Task', 'taskId', mainTasks.map(t => [t._id, t.title])],
    [
      'Department',
      'departmentId',
      [...new Map((data?.users || []).flatMap(u => u.departments).map(d => [d._id, [d._id, d.name]])).values()]
    ],
    [
      'Tracking status',
      'status',
      [
        ['RUNNING', 'Actively Tracking'],
        ['PAUSED', 'Personal Pause'],
        ['NOT_TRACKING', 'Not Tracking']
      ]
    ],
    ['Specific user', 'userId', (data?.users || []).map(u => [u.userId, u.name])],
    ['Agenda', 'agendaId', agendas.map(a => [a._id, a.title])],
    [
      'Attribution',
      'linked',
      [
        ['true', 'Linked'],
        ['false', 'Separate']
      ]
    ]
  ];

  const detailChoices = [
    [
      'Tracking type',
      'type',
      [
        ['TASK', 'Assigned task'],
        ['INDIVIDUAL', 'Individual agenda']
      ]
    ],
    ['Project', 'projectId', projects.map(p => [p._id, p.name])],
    ['Task', 'taskId', detailTasks.map(t => [t._id, t.title])],
    ['Agenda', 'agendaId', agendas.map(a => [a._id, a.title])]
  ];

  const hasActiveDetailFilters = Boolean(
    detailFilters.type || detailFilters.projectId || detailFilters.taskId || detailFilters.agendaId
  );

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.period && filters.period !== 'today') count++;
    if (filters.type) count++;
    if (filters.projectId) count++;
    if (filters.taskId) count++;
    if (filters.departmentId) count++;
    if (filters.status) count++;
    if (filters.userId) count++;
    if (filters.agendaId) count++;
    if (filters.linked) count++;
    if (filters.fromDate || filters.toDate) count++;
    if (filters.search) count++;
    return count;
  }, [filters]);

  const handleClearFilters = () => {
    setFilters(initial);
  };

  const totals=overview.data?.totals||null;

  return (
    <main className="space-y-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full transition-colors" style={{ color: 'var(--color-text-primary)' }}>
      {/* Page Header */}
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 dark:text-gray-50">
          Time Tracking
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-3xl leading-relaxed">
          Live work, attendance, agendas, and monitoring coverage. Input activity measures interaction, not work quality.
        </p>
      </div>

      {/* Role-authorized Compact Read-only Tracking Overview */}
      <TrackingOverview totals={totals} role={data?.viewerRole||authUser?.role} loading={overview.isPending} error={overview.error?readError(overview.error):''} onRetry={()=>overview.refetch()} />

      {/* Workspace Tracking Activity Section */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden transition-all">
        {/* Section Header & Toolbar */}
        <div className="p-5 md:p-6 border-b border-gray-100 dark:border-gray-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                Workspace tracking activity
              </h2>
              {data && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                  <Users size={12} />
                  <span>{data.total} {data.total === 1 ? 'user' : 'users'}</span>
                </span>
              )}
            </div>
            {data?.timezone && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                <Clock size={11} />
                <span>Dates in {data.timezone}</span>
              </p>
            )}
          </div>

          {/* Quick Toolbar */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Quick Search */}
            <div className="relative min-w-[200px] flex-1 sm:flex-initial">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              <input
                type="text"
                aria-label="Search authorized user"
                placeholder="Search user..."
                value={filters.search}
                onChange={e => change('search', e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-xs md:text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/60 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
              />
              {filters.search && (
                <button
                  type="button"
                  onClick={() => change('search', '')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Filter Toggle Button */}
            <button
              type="button"
              onClick={() => setIsFiltersOpen(prev => !prev)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs md:text-sm font-medium rounded-lg border transition-all cursor-pointer ${
                isFiltersOpen || activeFiltersCount > 0
                  ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-750'
              }`}
              aria-expanded={isFiltersOpen}
            >
              <Filter size={14} />
              <span>Filters</span>
              {activeFiltersCount > 0 && (
                <span className="w-5 h-5 rounded-full text-[11px] font-bold bg-blue-600 text-white flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
              {isFiltersOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {/* Clear Filters Button */}
            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs md:text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
              >
                <RotateCcw size={13} />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>

        {/* Collapsible Filter Panel */}
        {isFiltersOpen && (
          <div className="p-5 bg-gray-50/60 dark:bg-gray-800/40 border-b border-gray-200 dark:border-gray-800 transition-all">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-200/60 dark:border-gray-700/60">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Filter Parameters
              </span>
              {activeFiltersCount > 0 && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium cursor-pointer"
                >
                  Reset all filters ({activeFiltersCount})
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
              {choices.map(([label, key, items]) => (
                <div key={key} className="space-y-1">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block">
                    {label}
                  </label>
                  <div className="relative">
                    <select
                      aria-label={label}
                      value={filters[key]}
                      onChange={e => change(key, e.target.value)}
                      className="w-full appearance-none rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 py-2 pl-3 pr-8 text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors cursor-pointer"
                    >
                      <option value="">{key === 'period' ? 'Today' : 'All'}</option>
                      {items.map(([value, text]) => (
                        <option key={value} value={value}>
                          {text}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" size={14} />
                  </div>
                </div>
              ))}

              {filters.period === 'custom' && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block">
                      From Date
                    </label>
                    <input
                      type="date"
                      value={filters.fromDate}
                      onChange={e => change('fromDate', e.target.value)}
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 py-2 px-3 text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block">
                      To Date
                    </label>
                    <input
                      type="date"
                      value={filters.toDate}
                      onChange={e => change('toDate', e.target.value)}
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 py-2 px-3 text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Error notification */}
        {error && (
          <div className="p-4 m-4 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-sm flex items-center gap-2" role="alert">
            <AlertCircle size={16} />
            <span>{error} {data&&'Showing the last confirmed rows.'}</span><button type="button" className="underline" onClick={()=>query.refetch()}>Retry tracking</button>
          </div>
        )}

        {data?.activityUnavailable&&<p role="alert" className="px-5 py-2 text-xs text-amber-700">Activity details could not refresh. Attendance and work rows remain available. <button type="button" className="underline" onClick={()=>query.refetch()}>Retry activity</button></p>}
        {/* Table View */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/75 dark:bg-gray-850/60 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <th className="py-3 px-4">User / Department</th>
                <th className="py-3 px-4">Attendance</th>
                <th className="py-3 px-4">Tracking Context</th>
                <th className="py-3 px-4">Work / Office</th>
                <th className="py-3 px-4">Agent / Sync</th>
                <th className="py-3 px-4">Activity</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {data?.users.map(u => (
                <tr
                  key={u.userId}
                  className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition-colors"
                >
                  {/* User / Department */}
                  <td className="py-3.5 px-4 align-top">
                    <div className="flex items-center gap-3">
                      <Avatar src={u.avatar} name={u.name} role={u.role} size="md" />
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{u.name}</p>
                        <div className="flex items-center gap-1.5 flex-wrap text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          <span className="capitalize">{u.role}</span>
                          {u.departments?.length > 0 && (
                            <>
                              <span>·</span>
                              <span className="truncate max-w-[150px]">{u.departments.map(d => d.name).join(', ')}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Attendance */}
                  <td className="py-3.5 px-4 align-top">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${
                        u.attendanceStatus?.toLowerCase().includes('in')
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      {u.attendanceStatus || 'Not checked in'}
                    </span>
                  </td>

                  {/* Tracking Context */}
                  <td className="py-3.5 px-4 align-top">
                    <div>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                          u.trackingStatus === 'RUNNING'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
                            : u.trackingStatus === 'PAUSED'
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800/60'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            u.trackingStatus === 'RUNNING'
                              ? 'bg-emerald-500 animate-pulse'
                              : u.trackingStatus === 'PAUSED'
                              ? 'bg-amber-500'
                              : 'bg-gray-400'
                          }`}
                        />
                        {u.trackingStatus === 'RUNNING'
                          ? 'Actively Tracking'
                          : u.trackingStatus === 'PAUSED'
                          ? 'Personal Pause'
                          : 'Not Tracking'}
                      </span>
                      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 font-medium truncate max-w-[200px]" title={u.title}>
                        {u.title || 'No active work'}
                      </p>
                    </div>
                  </td>

                  {/* Work / Office */}
                  <td className="py-3.5 px-4 align-top">
                    <div className="tabular-nums">
                      <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm block">
                        {duration(u.workSeconds)}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 block">
                        Office: {duration(u.officeSeconds)}
                      </span>
                    </div>
                  </td>

                  {/* Agent / Sync */}
                  <td className="py-3.5 px-4 align-top">
                    <AgentStatus user={u} />
                  </td>

                  {/* Activity */}
                  <td className="py-3.5 px-4 align-top">
                    {u.evidence ? (
                      <div className="space-y-1.5 min-w-[150px]">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs font-bold tabular-nums ${
                              u.evidence.activityPercent === null
                                ? 'text-gray-500'
                                : u.evidence.activityPercent >= 70
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : u.evidence.activityPercent >= 40
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {u.evidence.activityPercent === null ? 'N/A' : `${u.evidence.activityPercent.toFixed(1)}%`}
                          </span>
                          {u.evidence.activityPercent !== null && (
                            <div className="w-16 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  u.evidence.activityPercent >= 70
                                    ? 'bg-emerald-500'
                                    : u.evidence.activityPercent >= 40
                                    ? 'bg-blue-500'
                                    : 'bg-amber-500'
                                }`}
                                style={{ width: `${Math.min(100, Math.max(0, u.evidence.activityPercent))}%` }}
                              />
                            </div>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">
                          Keys {u.evidence.keyboardCount ?? 'N/A'} · Mouse {u.evidence.mouseCount ?? 'N/A'} · Captures {u.evidence.capturedWindows}/{u.evidence.eligibleWindows}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        Activity unavailable
                      </span>
                    )}
                  </td>

                  {/* Details */}
                  <td className="py-3.5 px-4 align-top text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-3 text-xs gap-1.5 hover:border-blue-500 hover:text-blue-600 dark:hover:border-blue-400 dark:hover:text-blue-400 transition-colors cursor-pointer"
                      onClick={() => setSelected({ ...u, scope })}
                    >
                      <span>Open</span>
                      <ExternalLink size={12} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Loading Authorized Records Skeleton / State */}
        {!data && !error && (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
            <p className="text-sm">Loading authorized tracking records…</p>
          </div>
        )}

        {/* Empty state when no records match */}
        {data && data.users.length === 0 && (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 flex items-center justify-center mx-auto mb-3">
              <Users size={22} />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">No tracking records found</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
              No authorized users match the selected filters or search query.
            </p>
            {activeFiltersCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 text-xs cursor-pointer"
                onClick={handleClearFilters}
              >
                Clear all filters
              </Button>
            )}
          </div>
        )}

        {/* Pagination / Infinite Scroll Sentinel */}
        <div ref={sentinel} className="p-4 border-t border-gray-100 dark:border-gray-800 flex justify-center items-center">
          {query.isFetchingNextPage ? (
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              <span>Loading more users…</span>
            </div>
          ) : query.hasNextPage ? (
            <Button variant="outline" size="sm" onClick={() => query.fetchNextPage()} className="text-xs cursor-pointer">
              Load more users
            </Button>
          ) : data?.users.length > 0 ? (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              All authorized users loaded ({data.users.length} of {data.total})
            </span>
          ) : null}
        </div>
      </section>

      {/* Detail Drawer Modal */}
      {selectedUser && (
        <TrackingDialog drawer title={`${selectedUser.name} tracking details`} onClose={closeSelected}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{selectedUser.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{selectedUser.title || 'No active agenda'}</p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div>
                  <span className="text-gray-500 dark:text-gray-400 block">Work Time</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm tabular-nums">
                    {duration(selectedUser.workSeconds)}
                  </span>
                </div>
                <div className="w-px h-7 bg-gray-200 dark:bg-gray-700" />
                <div>
                  <span className="text-gray-500 dark:text-gray-400 block">Office Time</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm tabular-nums">
                    {duration(selectedUser.officeSeconds)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-2.5 flex-wrap items-end p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
              {detailChoices.map(([label, key, items]) => (
                <div key={key} className="space-y-1">
                  <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block">
                    {label}
                  </label>
                  <div className="relative">
                    <select
                      aria-label={`Detail ${label}`}
                      className="appearance-none rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 py-1.5 pl-2.5 pr-7 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                      value={detailFilters[key] || ''}
                      onChange={e => changeDetailFilter(key, e.target.value)}
                    >
                      <option value="">All</option>
                      {items.map(([value, text]) => (
                        <option key={value} value={value}>
                          {text}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" size={13} />
                  </div>
                </div>
              ))}
              {hasActiveDetailFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-8 cursor-pointer"
                  onClick={() => {
                    setDetailFilters(initialDetailFilters);
                    setDetailTasks([]);
                  }}
                >
                  Reset filters
                </Button>
              )}
            </div>

            <TrackingReports
              key={`${scope}:${selectedUser.userId}`}
              initialFilters={{
                userId: selectedUser.userId,
                type: detailFilters.type || undefined,
                projectId: detailFilters.projectId || undefined,
                taskId: detailFilters.taskId || undefined,
                agendaId: detailFilters.agendaId || undefined
              }}
            />
          </div>
        </TrackingDialog>
      )}
    </main>
  );
}
