import { DateTime } from 'luxon';
import { shortLeaveWindowMinutes } from '../leave/leaveRequest.validation.js';

// Half-open UTC intervals. These helpers never persist or infer attendance status.
export function unionIntervals(intervals) {
  const result = [];
  for (const [start, end] of intervals.filter(([a,b]) => Number.isFinite(a) && Number.isFinite(b) && b > a).sort((a,b) => a[0]-b[0])) {
    const last = result.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else result.push([start,end]);
  }
  return result;
}
export function subtractIntervals(intervals, exclusions) {
  let result = unionIntervals(intervals);
  for (const [left,right] of unionIntervals(exclusions)) result = result.flatMap(([a,b]) => right <= a || left >= b ? [[a,b]] : [[a,Math.min(b,left)],[Math.max(a,right),b]].filter(([s,e]) => e > s));
  return result;
}
export const intervalMinutes = intervals => unionIntervals(intervals).reduce((sum,[a,b]) => sum+(b-a)/60000,0);

export function attendanceIntervals(sessions, at) {
  return unionIntervals(sessions.flatMap(s => {
    const end = ['CLOSED','COMPLETED'].includes(s.status) ? +new Date(s.checkOutAt) : s.status === 'ACTIVE' ? Math.min(+at,s.missedCheckoutCutoffAt ? +new Date(s.missedCheckoutCutoffAt) : Infinity) : NaN;
    return s.checkInAt && end ? [[+new Date(s.checkInAt),Math.min(end,+at)]] : [];
  }));
}

export function scheduleForDay({ workDateKey, timezone, officeHours, shift }) {
  const startTime = officeHours?.startLocalTime || shift?.startLocalTime, endTime = officeHours?.endLocalTime || shift?.endLocalTime;
  if (!workDateKey || !startTime || !endTime) return null;
  const base = DateTime.fromISO(workDateKey,{zone:timezone});
  const local = (date,time) => { const [hour,minute] = time.split(':').map(Number); const value=date.set({hour,minute,second:0,millisecond:0});return value.isValid && value.toFormat('HH:mm') === time ? value : null; };
  const start = local(base,startTime), end = local(endTime <= startTime ? base.plus({days:1}) : base,endTime);
  if (!start || !end || +end <= +start) return null;
  return { startedAt:start.toJSDate(),endedAt:end.toJSDate(),midpointAt:new Date((+start + +end)/2),timezone,workDateKey };
}

export function resolveLeaveCoverage(leave, schedule) {
  const records = leave.approvedLeaves || (leave.shortLeaveWindow ? [{dayType:'SHORT_LEAVE',...leave.shortLeaveWindow}] : []);
  const coverage = [], shortCoverage = [], summaries = [];
  let unresolved = false;
  for (const record of records) {
    let start, end;
    if (!schedule) unresolved = true;
    else if (record.dayType === 'FULL_DAY') { start=+schedule.startedAt;end=+schedule.endedAt; }
    else if (record.dayType === 'HALF_DAY_FIRST_HALF') { start=+schedule.startedAt;end=+schedule.midpointAt; }
    else if (record.dayType === 'HALF_DAY_SECOND_HALF') { start=+schedule.midpointAt;end=+schedule.endedAt; }
    else if (record.dayType === 'SHORT_LEAVE') {
      const from=record.startLocalTime,to=record.endLocalTime;
      const duration=shortLeaveWindowMinutes(from,to);
      if (duration === null || !Number.isFinite(record.durationMinutes) || Math.abs(duration-record.durationMinutes) > 0.01) unresolved=true;
      else {
        const base=DateTime.fromISO(schedule.workDateKey,{zone:schedule.timezone});
        const [h,m]=from.split(':').map(Number),[eh,em]=to.split(':').map(Number);
        let local=base.set({hour:h,minute:m,second:0,millisecond:0});
        if (+local < +schedule.startedAt && +schedule.endedAt > +base.plus({days:1})) local=local.plus({days:1});
        let finish=local.set({hour:eh,minute:em});if(to <= from)finish=finish.plus({days:1});
        if (local.toFormat('HH:mm') !== from || finish.toFormat('HH:mm') !== to || local.getPossibleOffsets().length>1 || finish.getPossibleOffsets().length>1 || (+finish-+local)/60000 !== duration) unresolved=true;
        else { start=Math.max(+local,+schedule.startedAt);end=Math.min(+finish,+schedule.endedAt); }
      }
    } else unresolved=true;
    const resolved=Number.isFinite(start)&&Number.isFinite(end)&&end>start;
    if (resolved) { coverage.push([start,end]);if(record.dayType==='SHORT_LEAVE')shortCoverage.push([start,end]); }
    summaries.push({requestId:record.requestId,type:record.leaveTypeName,dayType:record.dayType,status:record.status,startedAt:resolved?new Date(start):null,endedAt:resolved?new Date(end):null,coverageResolved:resolved});
  }
  return { intervals:unionIntervals(coverage),shortIntervals:unionIntervals(shortCoverage),summaries,unresolved };
}
