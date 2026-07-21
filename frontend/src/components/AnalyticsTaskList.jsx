import React from 'react';
import { AlertTriangle, CalendarDays, ListTodo, LoaderCircle, RefreshCw } from 'lucide-react';
import AnalyticsEntityLink from './AnalyticsEntityLink';
import { analyticsProjectHref, analyticsTaskHref } from '../utils/analyticsNavigation';
import { formatAnalyticsDate } from '../utils/analyticsFormat';
import useInfiniteAnalyticsTasks from '../hooks/useInfiniteAnalyticsTasks';

const titleCase = (value = '') => value.replace(/[-_]/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());

const AnalyticsTaskList = ({ filters, title = 'Tasks', note = 'Tasks matching the active analytics filters' }) => {
  const { tasks, total, loadingInitial, loadingMore, error, hasMore, sentinelRef, retry } = useInfiniteAnalyticsTasks({ filters });

  return <section className="analytics-employee-tasks analytics-all-tasks" aria-label={title}>
    <div className="analytics-employee-tasks-head">
      <div><div className="analytics-panel-title">{title}</div><div className="analytics-panel-note">{note}</div></div>
      {!loadingInitial && <span className="analytics-filter-count">{total}</span>}
    </div>
    {loadingInitial ? <div className="analytics-task-loading">{Array.from({ length: 6 }, (_, index) => <div className="analytics-skeleton analytics-task-skeleton" key={index} />)}</div>
      : error && !tasks.length ? <div className="analytics-task-error"><AlertTriangle size={18} /><span>{error}</span><button className="analytics-button" onClick={retry}><RefreshCw size={14} /> Retry</button></div>
      : tasks.length ? <div className="analytics-task-list">{tasks.map((task) => <article className="analytics-task-card" key={task.id}>
        <div className="analytics-task-card-top">
          <div className="analytics-task-title-wrap"><span className="analytics-task-icon"><ListTodo size={16} /></span><div>
            <AnalyticsEntityLink href={analyticsTaskHref(task)} className="analytics-task-title" ariaLabel={`Open task ${task.title} in a new page`}>{task.title}</AnalyticsEntityLink>
            <AnalyticsEntityLink href={analyticsProjectHref(task)} className="analytics-task-project" ariaLabel={`Open project ${task.projectName} in a new page`}>{task.projectName}</AnalyticsEntityLink>
          </div></div>
          <span className="analytics-badge">{titleCase(task.status)}</span>
        </div>
        <div className="analytics-task-meta"><span className={`analytics-priority priority-${task.priority}`}>{titleCase(task.priority)}</span>{task.dueDate && <span><CalendarDays size={12} /> Due {formatAnalyticsDate(task.dueDate)}</span>}</div>
      </article>)}</div>
        : <div className="analytics-empty analytics-task-empty"><div className="analytics-empty-icon"><ListTodo size={20} /></div><strong>No tasks found</strong><span>No tasks match the active analytics filters.</span></div>}
    <div ref={sentinelRef} className="analytics-infinite-sentinel" aria-hidden="true" />
    {loadingMore && <div className="analytics-infinite-loading" role="status"><LoaderCircle size={17} className="animate-spin" /> Loading more tasks…</div>}
    {error && tasks.length > 0 && !loadingMore && <div className="analytics-task-error compact"><AlertTriangle size={16} /><span>{error}</span><button className="analytics-button" onClick={retry}><RefreshCw size={14} /> Retry</button></div>}
    {!loadingInitial && !hasMore && tasks.length > 0 && <div className="analytics-infinite-end">All {total} tasks loaded</div>}
  </section>;
};

export default AnalyticsTaskList;
