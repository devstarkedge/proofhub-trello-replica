import { UnrecoverableError } from 'bullmq';

/** Retain the occurrence identity of jobs queued before transactional receipts. */
export function recurrenceJobIdentity(job, recurrence, now = Date.now()) {
  if (job.data.occurrenceKey) return { occurrenceKey: job.data.occurrenceKey, expectedOccurrence: job.data.expectedOccurrence };
  const id = String(recurrence._id), prefix = `recur:${id}:`;
  const oldDate = String(job.id).startsWith(prefix) ? new Date(String(job.id).slice(prefix.length)) : null;
  let expectedOccurrence;
  if (oldDate && !Number.isNaN(+oldDate)) expectedOccurrence = oldDate.toISOString();
  else if (job.id === `recur-recovery:${id}` && recurrence.recurBehavior === 'onSchedule' && recurrence.nextOccurrence) {
    if (+new Date(recurrence.nextOccurrence) > now + 1000) return { skipped: true, reason: 'legacy recovery already superseded' };
    expectedOccurrence = new Date(recurrence.nextOccurrence).toISOString();
  } else throw new UnrecoverableError('Legacy completion job has no stable source identity; review it before replay');
  return { occurrenceKey: `scheduled:${expectedOccurrence}`, expectedOccurrence };
}
