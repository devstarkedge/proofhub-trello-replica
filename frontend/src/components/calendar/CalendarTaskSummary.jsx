import {useState} from 'react';
import {uniqueCalendarTasks} from '../../../../shared/calendarTasks.mjs';

export default function CalendarTaskSummary({events,title,onSelect,onClose}) {
  const [page,setPage]=useState(1), tasks=uniqueCalendarTasks(events), pages=Math.max(1,Math.ceil(tasks.length/20));
  const current=Math.min(page,pages);
  return <section aria-label="Matching calendar tasks" className="mb-6 rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
    <header className="mb-3 flex items-center justify-between gap-3"><h2 className="font-semibold text-gray-900">{title} · {tasks.length} {tasks.length===1?'task':'tasks'}</h2><button type="button" onClick={onClose} className="rounded-lg border px-3 py-1.5 text-sm">Close task list</button></header>
    {tasks.length ? <ul className="divide-y divide-gray-100">{tasks.slice((current-1)*20,current*20).map(event=><li key={event.extendedProps.cardId}><button type="button" onClick={()=>onSelect(event)} className="flex w-full items-center justify-between gap-4 px-2 py-3 text-left hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-500"><span><span className="block font-medium text-gray-900">{event.title}</span><span className="text-xs text-gray-500">{event.extendedProps.projectName} · {event.extendedProps.status}</span></span><span className="shrink-0 text-sm text-gray-600">{event.start}</span></button></li>)}</ul> : <p className="py-4 text-sm text-gray-500">No matching tasks in this calendar period.</p>}
    {pages>1 && <footer className="mt-3 flex items-center justify-end gap-3 text-sm"><button type="button" disabled={current===1} onClick={()=>setPage(current-1)} className="rounded border px-3 py-1 disabled:opacity-50">Previous tasks</button><span>{current} / {pages}</span><button type="button" disabled={current===pages} onClick={()=>setPage(current+1)} className="rounded border px-3 py-1 disabled:opacity-50">Next tasks</button></footer>}
  </section>;
}
