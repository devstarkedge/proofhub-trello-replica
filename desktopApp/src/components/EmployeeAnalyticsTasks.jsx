import React from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, ListTodo, LoaderCircle, RefreshCw } from 'lucide-react';
import AnalyticsEntityLink from './AnalyticsEntityLink';
import { analyticsProjectHref, analyticsTaskHref } from '../utils/analyticsNavigation';
import { formatAnalyticsDate, formatAnalyticsHours } from '../utils/analyticsFormat';
import useInfiniteAnalyticsTasks from '../hooks/useInfiniteAnalyticsTasks';

const titleCase = (value = '') => value.replace(/[-_]/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());

const EmployeeAnalyticsTasks = ({ employeeId, filters }) => {
  const { tasks, total, loadingInitial, loadingMore, error, hasMore, sentinelRef, retry } = useInfiniteAnalyticsTasks({ employeeId, filters });

  return <section className="analytics-employee-tasks" aria-label="Assigned tasks">
    <div className="analytics-employee-tasks-head">
      <div><div className="analytics-panel-title">Assigned tasks</div><div className="analytics-panel-note">Live progress and time for tasks assigned to this employee</div></div>
      {!loadingInitial && <span className="analytics-filter-count">{total}</span>}
    </div>
    {loadingInitial ? <div className="analytics-task-loading">{Array.from({ length: 6 }, (_, index) => <div className="analytics-skeleton analytics-task-skeleton" key={index} />)}</div>
      : error && !tasks.length ? <div className="analytics-task-error"><AlertTriangle size={18} /><span>{error}</span><button className="analytics-button" onClick={retry}><RefreshCw size={14} /> Retry</button></div>
      : tasks.length ? <div className="analytics-task-list">{tasks.map((task) => {
        const statusTone = task.completed ? 'green' : task.overdue ? 'red' : String(task.status).toLowerCase().includes('progress') ? 'blue' : 'amber';
        return <article className={`analytics-task-card ${task.overdue ? 'overdue' : ''}`} key={task.id}>
          <div className="analytics-task-card-top"><div className="analytics-task-title-wrap"><span className="analytics-task-icon">{task.completed ? <CheckCircle2 size={16} /> : <ListTodo size={16} />}</span><div><AnalyticsEntityLink href={analyticsTaskHref(task)} className="analytics-task-title" ariaLabel={`Open task ${task.title} in a new page`}>{task.title}</AnalyticsEntityLink><AnalyticsEntityLink href={analyticsProjectHref(task)} className="analytics-task-project" ariaLabel={`Open project ${task.projectName} in a new page`}>{task.projectName}</AnalyticsEntityLink></div></div><span className={`analytics-badge ${statusTone}`}>{titleCase(task.status)}</span></div>
          <div className="analytics-task-progress-row"><div className="analytics-progress-track analytics-task-progress"><div className="analytics-progress-fill" style={{ width: `${Math.min(100, task.progress)}%` }} /></div><strong>{task.progress}%</strong></div>
          <div className="analytics-task-meta"><span className={`analytics-priority priority-${task.priority}`}>{titleCase(task.priority)}</span>{task.dueDate && <span className={task.overdue ? 'analytics-task-overdue' : ''}><CalendarDays size={12} /> {task.overdue ? 'Overdue ' : 'Due '}{formatAnalyticsDate(task.dueDate)}</span>}<span><Clock3 size={12} /> {formatAnalyticsHours(task.loggedHours)} logged / {formatAnalyticsHours(task.estimatedHours)} estimated</span>{task.remainingHours > 0 && <span>{formatAnalyticsHours(task.remainingHours)} remaining</span>}</div>
        </article>;
      })}</div>
        : <div className="analytics-empty analytics-task-empty"><div className="analytics-empty-icon"><ListTodo size={20} /></div><strong>No assigned tasks</strong><span>No tasks match the active analytics filters.</span></div>}
    <div ref={sentinelRef} className="analytics-infinite-sentinel" aria-hidden="true" />
    {loadingMore && <div className="analytics-infinite-loading" role="status"><LoaderCircle size={17} className="animate-spin" /> Loading more tasks…</div>}
    {error && tasks.length > 0 && !loadingMore && <div className="analytics-task-error compact"><AlertTriangle size={16} /><span>{error}</span><button className="analytics-button" onClick={retry}><RefreshCw size={14} /> Retry</button></div>}
    {!loadingInitial && !hasMore && tasks.length > 0 && <div className="analytics-infinite-end">All {total} assigned tasks loaded</div>}
  </section>;
};

export default EmployeeAnalyticsTasks;
