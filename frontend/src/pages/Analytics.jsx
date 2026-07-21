import React, { memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BriefcaseBusiness, CalendarDays, CheckCircle2, ChevronDown, CircleDollarSign, Clock3, Download, FileSpreadsheet, Filter, Gauge, ListTodo, RefreshCw, SearchX, Target, Timer, TrendingUp, UsersRound, X, Zap } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import AuthContext from '../context/AuthContext';
import DepartmentContext from '../context/DepartmentContext';
import Database from '../services/database';
import AnalyticsScheduleDrawer from '../components/AnalyticsScheduleDrawer';
import EmployeeAnalyticsTasks from '../components/EmployeeAnalyticsTasks';
import AnalyticsTaskList from '../components/AnalyticsTaskList';
import AnalyticsEntityLink from '../components/AnalyticsEntityLink';
import { analyticsProjectHref, analyticsTaskHref } from '../utils/analyticsNavigation';
import { formatAnalyticsDate, formatAnalyticsDateTime, formatAnalyticsHours } from '../utils/analyticsFormat';
import './Analytics.css';

const COLORS = ['#3468e8', '#13a874', '#f59e0b', '#ef5b6a', '#8b5cf6', '#64748b', '#0ea5e9'];
const EMPTY_FILTERS = { range: 'last_30_days', startDate: '', endDate: '', departmentId: '', managerId: '', employeeId: '', projectId: '', status: '', priority: '', billingType: '', client: '' };
const RANGE_OPTIONS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['this_week', 'This week'], ['last_week', 'Last week'], ['this_month', 'This month'], ['last_month', 'Last month'], ['quarter', 'This quarter'], ['year', 'This year'], ['last_30_days', 'Last 30 days'], ['custom', 'Custom range']];

const formatNumber = (value, suffix = '') => suffix === 'h'
  ? formatAnalyticsHours(value)
  : `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(Number(value) || 0)}${suffix}`;
const titleCase = (value = '') => value.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
const projectRowsForView = (projects, view) => {
  const statusIs = (project, status) => String(project.status || 'planning').trim().toLowerCase() === status;
  const views = {
    'Total projects': () => projects,
    'Active projects': () => projects.filter((project) => statusIs(project, 'in-progress')),
    Completed: () => projects.filter((project) => statusIs(project, 'completed')),
    Planning: () => projects.filter((project) => statusIs(project, 'planning')),
    'On hold': () => projects.filter((project) => statusIs(project, 'on-hold')),
    Delayed: () => projects.filter((project) => project.delayed).map((project) => ({ ...project, drilldownStatus: 'delayed' })),
    'Average progress': () => projects.filter((project) => Number(project.progress) > 0),
    'Project health': () => projects.filter((project) => !project.delayed && Number(project.overdueTasks) === 0),
  };
  return views[view]?.() || [];
};
const peopleRowsForView = (employees, view) => {
  const definitions = {
    'People in scope': {
      value: (employee) => employee.assignedTasks,
      label: 'assigned tasks',
      supporting: (employee) => `${employee.completedTasks} completed • ${formatAnalyticsHours(employee.loggedHours)} logged`,
      alphabetical: true,
    },
    Productivity: {
      value: (employee) => employee.productivityScore,
      suffix: '%',
      label: 'productivity',
      supporting: (employee) => `${employee.completionRate}% completion • ${employee.pendingTasks} open tasks`,
    },
    'Time efficiency': {
      filter: (employee) => employee.estimatedHours > 0 || employee.loggedHours > 0,
      value: (employee) => employee.timeEfficiency,
      suffix: '%',
      label: 'time efficiency',
      supporting: (employee) => `${formatAnalyticsHours(employee.estimatedHours)} estimated • ${formatAnalyticsHours(employee.loggedHours)} logged`,
    },
    'Capacity utilization': {
      filter: (employee) => employee.loggedHours > 0,
      value: (employee) => employee.capacityUtilization,
      suffix: '%',
      label: 'capacity used',
      supporting: (employee) => `${formatAnalyticsHours(employee.loggedHours)} logged in the selected period`,
    },
    'Open workload': {
      filter: (employee) => employee.pendingTasks > 0,
      value: (employee) => employee.pendingTasks,
      label: 'open tasks',
      supporting: (employee) => `${employee.assignedTasks} assigned • ${employee.overdueTasks} overdue`,
    },
    'Avg. completion': {
      filter: (employee) => employee.completionSamples > 0,
      value: (employee) => employee.averageCompletionDays,
      suffix: 'd',
      label: 'average completion',
      supporting: (employee) => `${employee.completedTasks} completed tasks with timing data`,
      ascending: true,
    },
    'Avg. task age': {
      filter: (employee) => employee.activeAgeSamples > 0,
      value: (employee) => employee.averageTaskAgeDays,
      suffix: 'd',
      label: 'average task age',
      supporting: (employee) => `${employee.pendingTasks} currently open tasks`,
    },
    'Task velocity': {
      filter: (employee) => employee.completedTasks > 0,
      value: (employee) => employee.taskVelocity,
      label: 'tasks / week',
      supporting: (employee) => `${employee.completedTasks} completed in the selected period`,
    },
  };
  const definition = definitions[view];
  if (!definition) return [];
  return employees
    .filter((employee) => definition.filter?.(employee) ?? true)
    .map((employee) => ({
      ...employee,
      detailMetric: {
        value: definition.value(employee),
        suffix: definition.suffix || '',
        label: definition.label,
        supporting: definition.supporting(employee),
      },
    }))
    .sort((left, right) => definition.alphabetical
      ? left.name.localeCompare(right.name)
      : (definition.ascending ? 1 : -1) * ((left.detailMetric.value || 0) - (right.detailMetric.value || 0)) || left.name.localeCompare(right.name));
};
const timeAgo = (date) => {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

const AnalyticsTooltip = ({ active, payload, label }) => !active || !payload?.length ? null : <div className="analytics-tooltip"><div className="analytics-tooltip-title">{titleCase(label)}</div>{payload.map((item) => <div className="analytics-tooltip-line" key={item.dataKey || item.name}><span style={{ color: item.color }}>{titleCase(item.name)}</span><strong>{formatNumber(item.value)}</strong></div>)}</div>;
const EmptyState = ({ title = 'No data for this view', message = 'Try a broader date range or clear one of the filters.' }) => <div className="analytics-empty"><div className="analytics-empty-icon"><SearchX size={21} /></div><strong>{title}</strong><span>{message}</span></div>;
const AnalyticsSkeleton = () => <div className="analytics-shell"><div className="analytics-content"><div className="analytics-skeleton" style={{ width: 310, height: 42, marginBottom: 24 }} /><div className="analytics-skeleton" style={{ height: 64, marginBottom: 20 }} /><div className="analytics-kpi-grid">{Array.from({ length: 8 }, (_, index) => <div className="analytics-skeleton analytics-skeleton-kpi" key={index} />)}</div><div className="analytics-grid"><div className="analytics-skeleton analytics-skeleton-panel analytics-panel span-8" /><div className="analytics-skeleton analytics-skeleton-panel analytics-panel span-4" /></div></div></div>;

const useEnterpriseAnalytics = (filters) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const firstLoad = useRef(true);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (filters.range === 'custom' && (!filters.startDate || !filters.endDate)) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      firstLoad.current ? setLoading(true) : setRefreshing(true);
      setError('');
      try {
        const response = await Database.getAnalyticsDashboard(filters, { signal: controller.signal });
        setData(response.data); firstLoad.current = false;
      } catch (requestError) {
        if (requestError.name !== 'AbortError') setError(requestError.message || 'Analytics could not be loaded');
      } finally {
        if (!controller.signal.aborted) { setLoading(false); setRefreshing(false); }
      }
    }, revision ? 0 : 260);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [filters, revision]);

  useEffect(() => {
    let debounce;
    const handleUpdate = () => { clearTimeout(debounce); debounce = setTimeout(refresh, 900); };
    const events = ['socket-card-updated', 'socket-card-created', 'socket-card-deleted', 'socket-card-moved', 'socket-time-logged', 'socket-board-updated'];
    events.forEach((event) => window.addEventListener(event, handleUpdate));
    return () => { clearTimeout(debounce); events.forEach((event) => window.removeEventListener(event, handleUpdate)); };
  }, [refresh]);
  return { data, loading, refreshing, error, refresh };
};

const KpiCard = ({ item, onClick }) => {
  const Icon = item.icon;
  return <button type="button" className="analytics-kpi" style={{ '--kpi-color': item.color, '--kpi-soft': item.soft }} onClick={() => onClick(item)} title={`View details for ${item.label}`}><div className="analytics-kpi-top"><span className="analytics-kpi-label">{item.label}</span><span className="analytics-kpi-icon"><Icon size={17} /></span></div><strong className="analytics-kpi-value">{formatNumber(item.value, item.suffix)}</strong><span className={`analytics-kpi-footer ${item.sentiment || ''}`}>{item.trend > 0 ? <ArrowUpRight size={12} /> : item.trend < 0 ? <ArrowDownRight size={12} /> : null}{item.detail}</span></button>;
};
const FilterSelect = ({ label, value, options, onChange }) => <select className="analytics-select" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{label}</option>{options.map((option) => <option key={String(option.id ?? option)} value={String(option.id ?? option)}>{option.name ?? titleCase(String(option))}</option>)}</select>;
const StatusBadge = ({ status }) => {
  const normalized = String(status || '').toLowerCase();
  const tone = normalized.includes('complete') || normalized === 'done' ? 'green' : normalized.includes('progress') || normalized === 'active' ? 'blue' : normalized.includes('hold') || normalized.includes('review') || normalized === 'planning' ? 'amber' : normalized.includes('delay') || normalized.includes('cancel') || normalized.includes('block') ? 'red' : '';
  return <span className={`analytics-badge ${tone}`}>{titleCase(status || 'Unassigned')}</span>;
};

const DrilldownDrawer = ({ detail, filters, onClose, onSelectEmployee }) => {
  const taskFilters = useMemo(() => detail?.taskList ? {
    ...filters,
    ...(detail.taskView ? { taskView: detail.taskView } : {}),
    ...(detail.taskStatus ? { status: detail.taskStatus } : {}),
  } : filters, [detail?.taskList, detail?.taskStatus, detail?.taskView, filters]);
  if (!detail) return null;
  return <div className="analytics-drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <aside className="analytics-drawer" role="dialog" aria-modal="true" aria-label={detail.title}>
      <div className="analytics-drawer-head"><div><div className="analytics-drawer-title">{detail.title}</div><div className="analytics-drawer-subtitle">Filtered analytics detail • stays within your permitted scope</div></div><button className="analytics-button icon-only" onClick={onClose} aria-label="Close details"><X size={18} /></button></div>
      {detail.stats && <div className="analytics-drawer-grid">{detail.stats.map((stat) => <div className="analytics-drawer-stat" key={stat.label}><span>{stat.label}</span><strong>{formatNumber(stat.value, stat.suffix)}</strong></div>)}</div>}
      <div className="analytics-detail-list">
        {detail.rows?.length ? detail.rows.map((row, index) => {
          const employeeLink = detail.rows.length > 1 && row.assignedTasks !== undefined;
          const dateRow = Boolean(row.date && !row.name && !row.title);
          const rowLabel = row.name || row.title || (dateRow ? formatAnalyticsDate(row.date) : titleCase(row.status || 'Detail'));
          const entityHref = row.title ? analyticsTaskHref(row) : row.totalTasks !== undefined ? analyticsProjectHref(row) : '';
          const Item = employeeLink ? 'button' : 'div';
          return <Item type={employeeLink ? 'button' : undefined} className={`analytics-detail-item ${employeeLink ? 'analytics-detail-item-button' : ''} ${dateRow ? 'analytics-detail-item-date' : ''}`} key={String(row.id || row._id || row.name || row.date || index)} onClick={employeeLink ? () => onSelectEmployee(row) : undefined}>
            <div className="analytics-detail-item-title"><AnalyticsEntityLink href={entityHref} className={dateRow ? 'analytics-detail-date-label' : ''} ariaLabel={entityHref ? `Open ${rowLabel} in a new page` : undefined}>{dateRow && <span className="analytics-detail-date-icon"><CalendarDays size={15} /></span>}{rowLabel}</AnalyticsEntityLink></div>
            <div className="analytics-detail-item-meta">{row.status && <StatusBadge status={row.drilldownStatus || row.status} />}{row.value !== undefined && <span>{formatNumber(row.value)} tasks</span>}{row.totalTasks !== undefined && <span>{formatNumber(row.totalTasks)} tasks</span>}{row.created !== undefined && <span>{formatNumber(row.created)} created</span>}{row.completed !== undefined && <span>{formatNumber(row.completed)} completed</span>}{row.detailMetric ? <><span className="analytics-person-metric"><strong>{formatNumber(row.detailMetric.value, row.detailMetric.suffix)}</strong>{row.detailMetric.label}</span><span>{row.detailMetric.supporting}</span></> : <>{row.completedTasks !== undefined && <span>{formatNumber(row.completedTasks)} completed</span>}{row.loggedHours !== undefined && <span>{formatAnalyticsHours(row.loggedHours)} logged</span>}</>}{row.hours !== undefined && <span className="analytics-time-value"><Clock3 size={12} />{Number(row.hours) > 0 ? `${formatAnalyticsHours(row.hours)} logged` : 'No time logged'}</span>}{row.progress !== undefined && <span>{formatNumber(row.progress, '%')} progress</span>}{row.dueDate && <span><CalendarDays size={12} /> Due {formatAnalyticsDate(row.dueDate)}</span>}</div>
          </Item>;
        }) : !detail.taskList && <EmptyState />}
        {detail.taskList && <AnalyticsTaskList filters={taskFilters} title={detail.title} note={detail.taskView === 'all' ? 'All task names matching the active analytics filters' : `Only ${detail.title.toLowerCase()} matching the active analytics filters`} />}
        {detail.rows?.length === 1 && detail.rows[0]?.assignedTasks !== undefined && <EmployeeAnalyticsTasks employeeId={String(detail.rows[0].id)} filters={filters} />}
      </div>
    </aside>
  </div>;
};

const buildKpis = (data, activeTab, personalOnly) => {
  const { tasks, projects, time, team } = data.kpis;
  const simple = (entries, icon, rows) => entries.map(([label, value, suffix, detail], index) => ({ key: label, label, value, suffix, icon: index === 5 && activeTab === 'projects' ? AlertTriangle : icon, detail: detail || 'For the selected scope', color: COLORS[index % COLORS.length], soft: `${COLORS[index % COLORS.length]}18`, rows }));
  const groups = {
    overview: [
      { key: 'totalTasks', label: 'Total tasks', value: tasks.total, icon: ListTodo, color: '#2563eb', soft: '#e9f0ff', detail: `${tasks.active} currently active`, rows: [], taskList: true },
      { key: 'completion', label: 'Completion rate', value: tasks.completionRate, suffix: '%', icon: CheckCircle2, color: '#0e9f6e', soft: '#e6f8f1', detail: `${tasks.completed} tasks completed`, trend: tasks.growth, sentiment: tasks.growth >= 0 ? 'positive' : 'negative', rows: data.charts.dailyTrend },
      { key: 'overdue', label: 'Overdue', value: tasks.overdue, icon: AlertTriangle, color: '#e04f5f', soft: '#ffebee', detail: tasks.overdue ? 'Needs immediate attention' : 'Everything is on track', sentiment: tasks.overdue ? 'negative' : 'positive', rows: data.attention },
      { key: 'projects', label: 'Projects in scope', value: projects.total, icon: BriefcaseBusiness, color: '#7c5ce7', soft: '#f0ecff', detail: `${projects.active} in progress`, rows: data.projects },
      { key: 'logged', label: 'Logged hours', value: time.loggedHours, suffix: 'h', icon: Timer, color: '#0b91c7', soft: '#e7f7fd', detail: `${formatAnalyticsHours(time.averageDailyHours)} average per day`, rows: data.charts.dailyTrend },
      { key: 'productivity', label: personalOnly ? 'Productivity score' : 'Team productivity', value: team.productivity, suffix: '%', icon: Zap, color: '#f08a13', soft: '#fff2df', detail: `${team.velocityPerWeek} tasks / week`, rows: peopleRowsForView(data.employees, 'Productivity') },
      { key: 'health', label: 'Project health', value: projects.health, suffix: '%', icon: Gauge, color: '#16a36a', soft: '#e5f8ef', detail: `${projects.delayed} delayed projects`, rows: data.projects },
      { key: 'variance', label: 'Time variance', value: time.varianceHours, suffix: 'h', icon: Clock3, color: time.varianceHours < 0 ? '#e04f5f' : '#16a36a', soft: time.varianceHours < 0 ? '#ffebee' : '#e5f8ef', detail: time.varianceHours < 0 ? 'Over estimated time' : 'Within estimated time', sentiment: time.varianceHours < 0 ? 'negative' : 'positive', rows: data.charts.dailyTrend },
    ],
    tasks: simple([['Total tasks', tasks.total], ['Active', tasks.active], ['Completed', tasks.completed, '', `${tasks.completionRate}% completion rate`], ['Pending', tasks.pending], ['In progress', tasks.inProgress], ['Review', tasks.review], ['Blocked', tasks.blocked], ['Overdue', tasks.overdue]], ListTodo, []).map((item) => ({
      ...item,
      rows: [],
      taskList: true,
      taskView: ({ 'Total tasks': 'all', Active: 'active', Completed: 'completed', Pending: 'pending', 'In progress': 'in-progress', Review: 'review', Blocked: 'blocked', Overdue: 'overdue' })[item.label],
      ...(item.label === 'Overdue' ? { icon: AlertTriangle } : {}),
    })),
    projects: simple([['Total projects', projects.total], ['Active projects', projects.active], ['Completed', projects.completed], ['Planning', projects.planning], ['On hold', projects.onHold], ['Delayed', projects.delayed], ['Average progress', projects.averageProgress, '%'], ['Project health', projects.health, '%']], BriefcaseBusiness, []).map((item) => ({ ...item, rows: projectRowsForView(data.projects, item.label) })),
    time: simple([['Estimated hours', time.estimatedHours, 'h'], ['Logged hours', time.loggedHours, 'h'], ['Remaining hours', time.remainingHours, 'h'], ['Variance', time.varianceHours, 'h'], ['Efficiency', time.efficiency, '%'], ['Daily average', time.averageDailyHours, 'h'], ['Billable hours', time.billableHours, 'h'], ['Non-billable', time.nonBillableHours, 'h']], Timer, data.charts.dailyTrend),
    people: simple([['People in scope', team.members], ['Productivity', team.productivity, '%'], ['Time efficiency', team.efficiency, '%'], ['Capacity utilization', team.capacityUtilization, '%'], ['Open workload', team.workload], ['Avg. completion', team.averageCompletionDays, 'd'], ['Avg. task age', team.averageTaskAgeDays, 'd'], ['Task velocity', team.velocityPerWeek]], UsersRound, []).map((item) => ({ ...item, rows: peopleRowsForView(data.employees, item.label) })),
  };
  return groups[activeTab] || groups.overview;
};

const Analytics = memo(() => {
  const { user } = useContext(AuthContext);
  const { currentDepartment } = useContext(DepartmentContext);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [activeTab, setActiveTab] = useState('overview');
  const [showExport, setShowExport] = useState(false);
  const [detail, setDetail] = useState(null);
  const { data, loading, refreshing, error, refresh } = useEnterpriseAnalytics(filters);

  useEffect(() => {
    const button = document.createElement('button');
    button.className = 'analytics-button primary analytics-schedule-fab';
    button.textContent = 'Schedule report';
    button.setAttribute('aria-label', 'Schedule analytics report');
    let host;
    let root;
    button.addEventListener('click', () => {
      if (root) return;
      host = document.createElement('div');
      document.body.appendChild(host);
      root = createRoot(host);
      const close = () => { root?.unmount(); host?.remove(); root = null; host = null; };
      root.render(React.createElement(AnalyticsScheduleDrawer, { filters, user, onClose: close }));
    });
    document.body.appendChild(button);
    return () => { root?.unmount(); host?.remove(); button.remove(); };
  }, [filters, user]);

  useEffect(() => {
    const departmentId = currentDepartment?._id && currentDepartment._id !== 'all' ? currentDepartment._id : '';
    setFilters((previous) => previous.departmentId === departmentId ? previous : { ...previous, departmentId, managerId: '', employeeId: '', projectId: '' });
  }, [currentDepartment?._id]);
  const updateFilter = useCallback((name, value) => setFilters((previous) => ({ ...previous, [name]: value, ...(name === 'departmentId' ? { managerId: '', employeeId: '', projectId: '' } : {}) })), []);
  const clearFilters = () => setFilters({ ...EMPTY_FILTERS, departmentId: currentDepartment?._id !== 'all' ? currentDepartment?._id || '' : '' });
  const personalOnly = data?.meta?.personalOnly || String(user?.role).toLowerCase() === 'employee';
  const filteredOptions = useMemo(() => {
    const options = data?.filters || { departments: [], managers: [], teams: [], employees: [], projects: [], statuses: [], priorities: [], billingTypes: [], clients: [] };
    return { ...options, projects: options.projects.filter((project) => !filters.departmentId || String(project.departmentId) === filters.departmentId), employees: options.employees.filter((employee) => !filters.departmentId || (employee.departmentIds || []).map(String).includes(filters.departmentId)) };
  }, [data?.filters, filters.departmentId]);
  useEffect(() => {
    if (personalOnly || !data) return undefined;
    const container = document.querySelector('.analytics-filter-scroll');
    if (!container) return undefined;
    const select = document.createElement('select');
    select.className = 'analytics-select';
    select.setAttribute('aria-label', 'All managers');
    select.appendChild(new Option('All managers', ''));
    filteredOptions.managers.forEach((manager) => select.appendChild(new Option(manager.name, String(manager.id))));
    select.value = filters.managerId;
    select.addEventListener('change', (event) => updateFilter('managerId', event.target.value));
    container.insertBefore(select, container.children[Math.min(2, container.children.length)] || null);
    return () => select.remove();
  }, [data, filteredOptions.managers, filters.managerId, personalOnly, updateFilter]);
  const kpis = useMemo(() => data ? buildKpis(data, activeTab, personalOnly) : [], [activeTab, data, personalOnly]);
  const openKpi = (item) => setDetail({ title: item.label, rows: item.rows || [], taskList: item.taskList, taskView: item.taskView, stats: [{ label: item.label, value: item.value, suffix: item.suffix }, { label: 'Date range', value: data.meta.range.days, suffix: 'd' }] });
  const exportRows = useMemo(() => !data ? [] : [...kpis.map((item) => ({ Section: activeTab, Metric: item.label, Value: item.suffix === 'h' ? formatAnalyticsHours(item.value) : `${item.value}${item.suffix || ''}`, Detail: item.detail })), ...data.projects.map((project) => ({ Section: 'Projects', Metric: project.name, Value: `${project.progress}%`, Detail: `${project.completedTasks}/${project.totalTasks} tasks • ${formatAnalyticsHours(project.loggedHours)} logged` })), ...data.employees.map((employee) => ({ Section: 'Employees', Metric: employee.name, Value: `${employee.productivityScore}%`, Detail: `${employee.completedTasks}/${employee.assignedTasks} tasks • ${formatAnalyticsHours(employee.loggedHours)} logged` }))], [activeTab, data, kpis]);

  const exportAnalytics = async (type) => {
    const filename = `flowtask-analytics-${new Date().toISOString().slice(0, 10)}`;
    if (type === 'csv') {
      const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const csv = [Object.keys(exportRows[0] || {}).map(escape).join(','), ...exportRows.map((row) => Object.values(row).map(escape).join(','))].join('\n');
      const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); link.download = `${filename}.csv`; link.click(); URL.revokeObjectURL(link.href);
    } else if (type === 'xlsx') {
      const XLSX = await import('xlsx'); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(exportRows), 'Analytics'); XLSX.writeFile(workbook, `${filename}.xlsx`);
    } else {
      const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const doc = new jsPDF({ orientation: 'landscape' }); doc.setFontSize(18); doc.text(personalOnly ? 'Personal Analytics Report' : 'FlowTask Analytics Report', 14, 18); doc.setFontSize(9); doc.text(`Generated ${formatAnalyticsDateTime(new Date())} • ${data.meta.range.days} day scope`, 14, 25); autoTableModule.default(doc, { startY: 31, head: [Object.keys(exportRows[0] || {})], body: exportRows.map(Object.values), styles: { fontSize: 8 }, headStyles: { fillColor: [37, 99, 235] } }); doc.save(`${filename}.pdf`);
    }
    setShowExport(false);
  };

  if (loading) return <AnalyticsSkeleton />;
  if (error && !data) return <div className="analytics-shell"><div className="analytics-content"><div className="analytics-error"><div className="analytics-error-icon"><AlertTriangle /></div><h2>Analytics couldn’t be loaded</h2><p>{error}</p><button className="analytics-button primary" onClick={refresh}><RefreshCw size={15} /> Try again</button></div></div></div>;
  if (!data) return null;

  const activeFilterCount = Object.entries(filters).filter(([key, value]) => key !== 'range' && value).length;
  const hasTrend = data.charts.dailyTrend.some((point) => point.created || point.completed || point.hours);
  const roleLabel = personalOnly ? 'Personal workspace' : data.meta.role === 'admin' ? 'Company overview' : 'Managed organization scope';

  return <div className="analytics-shell"><div className="analytics-content">
    <header className="analytics-header"><div><div className="analytics-eyebrow"><span className="analytics-live-dot" /> Live analytics • {roleLabel}</div><h1 className="analytics-title">{personalOnly ? 'My performance' : 'Analytics overview'}</h1><p className="analytics-subtitle">{personalOnly ? 'Your projects, tasks, time and productivity in one focused view.' : 'Operational visibility across projects, people, workload and delivery.'}</p></div><div className="analytics-header-actions"><button className="analytics-button icon-only" onClick={refresh} disabled={refreshing} title="Refresh analytics"><RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /></button><div className="analytics-export-wrap"><button className="analytics-button primary" onClick={() => setShowExport((value) => !value)}><Download size={15} /> Export <ChevronDown size={13} /></button>{showExport && <div className="analytics-export-menu"><button onClick={() => exportAnalytics('pdf')}><FileSpreadsheet size={15} /> PDF report</button><button onClick={() => exportAnalytics('xlsx')}><FileSpreadsheet size={15} /> Excel workbook</button><button onClick={() => exportAnalytics('csv')}><Download size={15} /> CSV data</button></div>}</div></div></header>

    <div className="analytics-filter-bar"><div className="analytics-filter-scroll"><FilterSelect label="Date range" value={filters.range} options={RANGE_OPTIONS.map(([id, name]) => ({ id, name }))} onChange={(value) => updateFilter('range', value)} />{filters.range === 'custom' && <><input type="date" aria-label="Start date" className="analytics-date" value={filters.startDate} onChange={(event) => updateFilter('startDate', event.target.value)} /><input type="date" aria-label="End date" className="analytics-date" value={filters.endDate} onChange={(event) => updateFilter('endDate', event.target.value)} /></>}{!personalOnly && <FilterSelect label="All departments" value={filters.departmentId} options={filteredOptions.departments} onChange={(value) => updateFilter('departmentId', value)} />}{!personalOnly && <FilterSelect label="All employees" value={filters.employeeId} options={filteredOptions.employees} onChange={(value) => updateFilter('employeeId', value)} />}<FilterSelect label="All projects" value={filters.projectId} options={filteredOptions.projects} onChange={(value) => updateFilter('projectId', value)} /><FilterSelect label="All statuses" value={filters.status} options={filteredOptions.statuses} onChange={(value) => updateFilter('status', value)} /><FilterSelect label="All priorities" value={filters.priority} options={filteredOptions.priorities} onChange={(value) => updateFilter('priority', value)} />{!personalOnly && <FilterSelect label="Billing type" value={filters.billingType} options={filteredOptions.billingTypes} onChange={(value) => updateFilter('billingType', value)} />}{!personalOnly && <FilterSelect label="All clients" value={filters.client} options={filteredOptions.clients} onChange={(value) => updateFilter('client', value)} />}</div>{activeFilterCount > 0 && <div className="analytics-active-filters"><span className="analytics-filter-count">{activeFilterCount}</span><button className="analytics-button icon-only" onClick={clearFilters} title="Clear filters"><X size={15} /></button></div>}</div>
    <nav className="analytics-tabs" aria-label="Analytics sections">{[['overview', 'Overview'], ['tasks', 'Tasks'], ['projects', 'Projects'], ['time', 'Time'], ['people', personalOnly ? 'My metrics' : 'People']].map(([key, label]) => <button key={key} className={`analytics-tab ${activeTab === key ? 'active' : ''}`} onClick={() => setActiveTab(key)}>{label}</button>)}</nav>
    {error && <div className="analytics-panel" style={{ borderColor: '#f3c1c7', color: '#b72e3c', marginBottom: 14 }}>Latest refresh failed: {error}. Showing the most recent successful snapshot.</div>}
    <section className="analytics-kpi-grid">{kpis.map((item) => <KpiCard key={item.key} item={item} onClick={openKpi} />)}</section>

    <section className="analytics-grid"><article className="analytics-panel span-8"><div className="analytics-panel-header"><div><div className="analytics-panel-title">Delivery trend</div><div className="analytics-panel-note">Tasks created and completed across the selected period</div></div><button className="analytics-panel-link" onClick={() => setDetail({ title: 'Delivery trend', rows: data.charts.dailyTrend })}>Explore</button></div>{hasTrend ? <div className="analytics-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.charts.dailyTrend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} onClick={(event) => event?.activePayload && setDetail({ title: `Activity on ${event.activeLabel}`, rows: [event.activePayload[0].payload] })}><defs><linearGradient id="createdFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3468e8" stopOpacity=".28"/><stop offset="100%" stopColor="#3468e8" stopOpacity=".02"/></linearGradient></defs><CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#e8ecf2"/><XAxis dataKey="date" tick={{ fontSize: 10, fill: '#8390a2' }} tickFormatter={(value) => new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} axisLine={false} tickLine={false} minTickGap={28}/><YAxis tick={{ fontSize: 10, fill: '#8390a2' }} axisLine={false} tickLine={false}/><Tooltip content={<AnalyticsTooltip />}/><Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11 }}/><Area type="monotone" dataKey="created" name="Created" stroke="#3468e8" fill="url(#createdFill)" strokeWidth={2.2}/><Line type="monotone" dataKey="completed" name="Completed" stroke="#13a874" strokeWidth={2.2} dot={false}/></AreaChart></ResponsiveContainer></div> : <EmptyState title="No task movement in this period" />}</article>
      <article className="analytics-panel span-4"><div className="analytics-panel-header"><div><div className="analytics-panel-title">Task status</div><div className="analytics-panel-note">Current distribution in your scope</div></div></div>{data.charts.status.length ? <div className="analytics-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.charts.status} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="78%" paddingAngle={3} onClick={(entry) => setDetail({ title: `${titleCase(entry.name)} tasks`, rows: [], taskList: true, taskStatus: entry.name })}>{data.charts.status.map((entry, index) => <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip content={<AnalyticsTooltip />}/><Legend iconType="circle" iconSize={7} formatter={titleCase} wrapperStyle={{ fontSize: 11 }}/></PieChart></ResponsiveContainer></div> : <EmptyState />}</article></section>

    <section className="analytics-grid"><article className="analytics-panel span-7"><div className="analytics-panel-header"><div><div className="analytics-panel-title">Project portfolio</div><div className="analytics-panel-note">Progress, workload and delivery risk</div></div><button className="analytics-panel-link" onClick={() => setDetail({ title: 'All projects', rows: data.projects })}>View all</button></div>{data.projects.length ? <div className="analytics-table-wrap"><table className="analytics-table"><thead><tr><th>Project</th><th>Status</th><th>Progress</th><th>Tasks</th><th>Overdue</th><th>Logged</th></tr></thead><tbody>{data.projects.slice(0, 8).map((project) => <tr key={project.id} onClick={() => setDetail({ title: project.name, rows: [project], stats: [{ label: 'Progress', value: project.progress, suffix: '%' }, { label: 'Logged', value: project.loggedHours, suffix: 'h' }, { label: 'Tasks', value: project.totalTasks }, { label: 'Overdue', value: project.overdueTasks }] })}><td><AnalyticsEntityLink href={analyticsProjectHref(project)} className="analytics-table-name" ariaLabel={`Open project ${project.name} in a new page`}>{project.name}</AnalyticsEntityLink></td><td><StatusBadge status={project.delayed ? 'delayed' : project.status} /></td><td><div className="analytics-progress"><div className="analytics-progress-track"><div className="analytics-progress-fill" style={{ width: `${Math.min(100, project.progress)}%` }} /></div><span>{project.progress}%</span></div></td><td>{project.completedTasks}/{project.totalTasks}</td><td>{project.overdueTasks}</td><td>{formatAnalyticsHours(project.loggedHours)}</td></tr>)}</tbody></table></div> : <EmptyState title="No projects in this scope" />}</article>
      <article className="analytics-panel span-5"><div className="analytics-panel-header"><div><div className="analytics-panel-title">Time utilization</div><div className="analytics-panel-note">Daily logged hours</div></div></div>{hasTrend ? <div className="analytics-chart compact"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.charts.dailyTrend} margin={{ top: 8, right: 2, left: -20, bottom: 0 }}><CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#e8ecf2"/><XAxis dataKey="date" tick={{ fontSize: 9, fill: '#8390a2' }} tickFormatter={(value) => new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} axisLine={false} tickLine={false} minTickGap={25}/><YAxis tick={{ fontSize: 10, fill: '#8390a2' }} axisLine={false} tickLine={false}/><Tooltip content={<AnalyticsTooltip />}/><Bar dataKey="hours" name="Logged hours" fill="#3468e8" radius={[5,5,0,0]} maxBarSize={28}/></BarChart></ResponsiveContainer></div> : <EmptyState />}</article></section>

    {!personalOnly && <section className="analytics-grid"><article className="analytics-panel span-6"><div className="analytics-panel-header"><div><div className="analytics-panel-title">Department comparison</div><div className="analytics-panel-note">Completion rate by permitted department</div></div></div>{data.charts.departments.length ? <div className="analytics-chart compact"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.charts.departments} layout="vertical" margin={{ top: 0, right: 18, left: 10, bottom: 0 }}><CartesianGrid strokeDasharray="3 4" horizontal={false} stroke="#e8ecf2"/><XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} axisLine={false} tickLine={false}/><YAxis type="category" dataKey="name" width={95} tick={{ fontSize: 10, fill: '#5f6d80' }} axisLine={false} tickLine={false}/><Tooltip content={<AnalyticsTooltip />}/><Bar dataKey="completionRate" name="Completion rate" fill="#3468e8" radius={[0,6,6,0]} maxBarSize={22}/></BarChart></ResponsiveContainer></div> : <EmptyState />}</article><article className="analytics-panel span-6"><div className="analytics-panel-header"><div><div className="analytics-panel-title">Team workload</div><div className="analytics-panel-note">Assigned, completed and overdue tasks</div></div></div>{data.charts.workload.length ? <div className="analytics-chart compact"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.charts.workload} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}><CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#e8ecf2"/><XAxis dataKey="name" tick={{ fontSize: 9 }} axisLine={false} tickLine={false}/><YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false}/><Tooltip content={<AnalyticsTooltip />}/><Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11 }}/><Bar dataKey="completed" stackId="tasks" fill="#13a874"/><Bar dataKey="overdue" stackId="tasks" fill="#ef5b6a"/><Bar dataKey="assigned" fill="#b8c7e8" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div> : <EmptyState />}</article></section>}

    <section className="analytics-grid"><article className={`analytics-panel ${personalOnly ? 'span-7' : 'span-8'}`}><div className="analytics-panel-header"><div><div className="analytics-panel-title">{personalOnly ? 'My task and time performance' : 'Employee performance'}</div><div className="analytics-panel-note">Completion, workload and time for the selected period</div></div><button className="analytics-panel-link" onClick={() => setDetail({ title: personalOnly ? 'My performance' : 'Employee performance', rows: data.employees })}>View details</button></div>{data.employees.length ? <div className="analytics-table-wrap"><table className="analytics-table"><thead><tr><th>Employee</th><th>Productivity</th><th>Completion</th><th>Assigned</th><th>Overdue</th><th>Logged</th></tr></thead><tbody>{data.employees.slice(0, 8).map((employee) => <tr key={employee.id} onClick={() => setDetail({ title: employee.name, rows: [employee], stats: [{ label: 'Productivity', value: employee.productivityScore, suffix: '%' }, { label: 'Completion', value: employee.completionRate, suffix: '%' }, { label: 'Assigned', value: employee.assignedTasks }, { label: 'Logged', value: employee.loggedHours, suffix: 'h' }] })}><td><div className="analytics-person">{employee.avatar ? <img className="analytics-avatar" src={employee.avatar} alt="" /> : <span className="analytics-avatar">{employee.name?.[0]}</span>}<div><div className="analytics-table-name">{employee.name}</div><div className="analytics-panel-note">{employee.title || 'Team member'}</div></div></div></td><td>{employee.productivityScore}%</td><td>{employee.completionRate}%</td><td>{employee.assignedTasks}</td><td>{employee.overdueTasks}</td><td>{formatAnalyticsHours(employee.loggedHours)}</td></tr>)}</tbody></table></div> : <EmptyState title={personalOnly ? 'No assigned work in this scope' : 'No employees in this scope'} />}</article><article className={`analytics-panel ${personalOnly ? 'span-5' : 'span-4'}`}><div className="analytics-panel-header"><div><div className="analytics-panel-title">Recent activity</div><div className="analytics-panel-note">Latest permitted updates</div></div></div>{data.recentActivity.length ? <div className="analytics-activity-list">{data.recentActivity.slice(0, 7).map((item) => <div className="analytics-activity" key={item._id}><span className="analytics-activity-icon"><Activity size={14} /></span><div className="analytics-activity-text"><strong>{item.user?.name || 'Team member'}</strong> {item.description}<div className="analytics-panel-note">{item.board?.name || 'Project'}</div></div><span className="analytics-activity-meta">{timeAgo(item.createdAt)}</span></div>)}</div> : <EmptyState title="No recent activity" />}</article></section>
    <footer className="analytics-subtitle" style={{ textAlign: 'center', marginTop: 24 }}>Last updated {formatAnalyticsDateTime(data.meta.generatedAt)} • Live updates are debounced to reduce unnecessary requests</footer>
  </div><DrilldownDrawer detail={detail} filters={filters} onClose={() => setDetail(null)} onSelectEmployee={(employee) => setDetail({ title: employee.name, rows: [employee], stats: [{ label: 'Productivity', value: employee.productivityScore, suffix: '%' }, { label: 'Completion', value: employee.completionRate, suffix: '%' }, { label: 'Assigned', value: employee.assignedTasks }, { label: 'Logged', value: employee.loggedHours, suffix: 'h' }] })} /></div>;
});

Analytics.displayName = 'Analytics';
export default Analytics;
