export function calendarDateKey(value, timezone='UTC') {
  if (!value || !Number.isFinite(+new Date(value))) return null;
  return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
}

export function calendarTaskEvents(tasks, range, timezone='UTC', now=new Date()) {
  const today=calendarDateKey(now,timezone), events=[];
  for (const task of tasks) {
    const status=task.listTitle || task.list?.title || task.status || 'N/A';
    const effectiveDue = task.dueDate || task.startDate;
    const due=calendarDateKey(effectiveDue,timezone);
    const statusLabel = status.toLowerCase();
    const isDone = ['done','completed','complete'].includes(statusLabel);
    const overdue=!!due && due<today && !isDone;
    const hasDueDate = !!task.dueDate;
    const startDateKey = calendarDateKey(task.startDate, timezone);
    const dueDateKey = calendarDateKey(task.dueDate, timezone);

    for (const [eventType,value] of [['start',task.startDate],['due',task.dueDate]]) {
      if (eventType === 'start' && hasDueDate && startDateKey === dueDateKey) continue;
      const date=calendarDateKey(value,timezone);
      if (!date || date<range.start || date>=range.end) continue;
      const late=overdue && (eventType==='due' || !hasDueDate);
      events.push({id:`${task._id}-${eventType}`,title:task.title,start:date,allDay:true,
        backgroundColor:late?'#EF4444':eventType==='start'?'#3B82F6':'#10B981',
        borderColor:late?'#DC2626':eventType==='start'?'#1D4ED8':'#059669',textColor:'#FFFFFF',
        classNames:[late?'calendar-task-overdue':eventType==='start'?'calendar-task-start':'calendar-task-due'],
        extendedProps:{cardId:task._id,eventType,assignees:task.assignees || [],status,description:task.description,
          priority:task.priority || 'Default',projectName:task.project?.name || task.board?.name || 'N/A',labels:task.labels || [],createdBy:task.createdBy,
          startDate:task.startDate,dueDate:task.dueDate,isOverdue:late,taskIsOverdue:overdue,hasRecurrence:task.hasRecurrence || task.recurringTask}
      });
    }
  }
  return events;
}

export function uniqueCalendarTasks(events) {
  const unique=new Map();
  for (const event of events) {
    const key=String(event.extendedProps.cardId);
    if (!unique.has(key) || event.extendedProps.eventType==='due') unique.set(key,event);
  }
  return [...unique.values()];
}

export function filterCalendarEvents(events,{priority='all',status='all',summary='all'}={}) {
  return events.filter(event=>{
    const props=event.extendedProps, level=String(props.priority).toLowerCase();
    const matchPriority = value => value==='high'?['high','critical'].includes(level):level===value;
    const matchSummary = summary==='all' || (summary==='overdue' ? props.taskIsOverdue : matchPriority(summary));
    return (priority==='all' || matchPriority(priority.toLowerCase())) && (status==='all' || props.status===status) && matchSummary;
  });
}

export function calendarTaskStats(events) {
  const tasks=uniqueCalendarTasks(events);
  return {total:tasks.length,high:filterCalendarEvents(tasks,{summary:'high'}).length,medium:filterCalendarEvents(tasks,{summary:'medium'}).length,
    low:filterCalendarEvents(tasks,{summary:'low'}).length,overdue:filterCalendarEvents(tasks,{summary:'overdue'}).length};
}
