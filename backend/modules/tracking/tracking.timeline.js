// Pure interval algebra. Time is stored as UTC instants; adjacent intervals are
// half-open [start, end), so equal-time events never count a boundary twice.
const ms = value => new Date(value).getTime();
const sid = value => String(value?._id || value || '');
export function assertTimeline(segments, end = null) {
  let previous = -Infinity;
  let open = false;
  for (const s of segments) {
    const start = ms(s.startedAt), finish = s.endedAt ? ms(s.endedAt) : Infinity;
    if (!Number.isFinite(start) || finish < start || start < previous || open || end && finish > ms(end)) throw new Error('Invalid or overlapping work segments');
    open = !s.endedAt; previous = finish;
  }
}
export function closeTimeline(session, at) {
  const end = Math.max(ms(session.startedAt), ms(at));
  session.segments = session.segments.filter(s => ms(s.startedAt) <= end).map(s => ({
    ...s, endedAt: new Date(Math.min(s.endedAt ? ms(s.endedAt) : end, end))
  }));
  session.endedAt = new Date(end); session.status = 'CLOSED';
  for (const pause of session.pauses || []) if (!pause.endedAt) pause.endedAt = new Date(Math.max(ms(pause.startedAt),end));
  assertTimeline(session.segments, session.endedAt);
  return session;
}
export function linkAssignment(segments, event, task) {
  if (event.type !== 'ASSIGNED') return segments;
  const at = ms(event.at), result = [];
  for (const original of segments) {
    const s = { ...original }, start = ms(s.startedAt), end = s.endedAt ? ms(s.endedAt) : Infinity;
    if (s.kind !== 'INDIVIDUAL' || s.linkedTask || sid(s.candidateTask) !== sid(task._id) || sid(s.project) !== sid(event.project) || at < start) {
      result.push(s); continue;
    }
    if (at >= end) {
      result.push({...s,linkedTask:task._id,assignedAt:new Date(at),assignmentEventId:event.id});continue;
    }
    if (at > start) result.push({ ...s, endedAt: new Date(at), linkedTask: task._id,
      assignedAt: new Date(at), assignmentEventId: event.id });
    result.push({ ...s, _id: undefined, kind: 'TASK', task: task._id, taskTitle: task.title,
      candidateTask: null, linkedTask: null, startedAt: new Date(at), assignedAt: new Date(at), assignmentEventId: event.id });
  }
  assertTimeline(result);
  return result;
}
export function endAssignment(segments, event, task) {
  if (event.type !== 'UNASSIGNED') return segments;
  const at = ms(event.at);
  return segments.map(s => s.kind === 'TASK' && sid(s.task) === sid(task._id) && sid(s.project) === sid(event.project)
    && ms(s.startedAt) <= at && (!s.endedAt || ms(s.endedAt) > at)
    ? { ...s, endedAt: new Date(at), reason: 'TASK_UNASSIGNED' } : s);
}
export function summarize(session, now = new Date()) {
  const end = Math.min(ms(now), session.endedAt ? ms(session.endedAt) : Infinity);
  let workSeconds = 0, individualSeconds = 0, preAssignmentSeconds = 0, assignedSeconds = 0;
  const projects = {}, tasks = {};
  for (const s of session.segments || []) {
    const seconds = Math.max(0, (Math.min(s.endedAt ? ms(s.endedAt) : end, end) - ms(s.startedAt)) / 1000);
    workSeconds += seconds;
    const project = sid(s.attributedProject||s.project); if(project)projects[project] = (projects[project] || 0) + seconds;
    if (s.kind === 'TASK') assignedSeconds += seconds;
    else { individualSeconds += seconds; if (s.linkedTask||s.attributedTask) preAssignmentSeconds += seconds; }
    const task = sid(s.attributedTask||s.task || (session.includePreAssignment && s.linkedTask));
    if (task) tasks[task] = (tasks[task] || 0) + seconds;
  }
  const personalPauseSeconds = (session.pauses || []).reduce((sum,p)=>sum+Math.max(0,(Math.min(ms(p.endedAt||now),end)-ms(p.startedAt))/1000),0);
  return { workSeconds, individualSeconds, preAssignmentSeconds, assignedSeconds, personalPauseSeconds, projects, tasks };
}
export function overlapSeconds(start, end, segments) {
  return (segments || []).reduce((sum, s) => sum + Math.max(0,
    Math.min(ms(end), s.endedAt ? ms(s.endedAt) : ms(end)) - Math.max(ms(start), ms(s.startedAt))) / 1000, 0);
}
export function coverageGaps(segments, intervals, now = new Date()) {
  const gaps=[];
  const measured=[...intervals].sort((a,b)=>ms(a.startedAt)-ms(b.startedAt));
  for (const segment of segments) {
    const end=Math.min(ms(segment.endedAt||now),ms(now));let cursor=ms(segment.startedAt);
    for(const interval of measured){
      const start=Math.max(ms(interval.startedAt),ms(segment.startedAt)),finish=Math.min(ms(interval.endedAt),end);
      if(finish<=cursor||start>=end)continue;
      if(start>cursor)gaps.push({startedAt:new Date(cursor),endedAt:new Date(start)});
      cursor=Math.max(cursor,finish);
    }
    if(cursor<end)gaps.push({startedAt:new Date(cursor),endedAt:new Date(end)});
  }
  return gaps;
}
