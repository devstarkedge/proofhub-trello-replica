import { format, parseISO } from 'date-fns';
import { formatTrackingReportTime, formatTrackingReportDuration } from '../../../../shared/trackingReportPresentation.mjs';

const headings = {
  daily:['Employee','Department','Check-In Time','Check-Out Time','Office Hours','Worked Hours','Activity Level'],
  details:['Employee','Department','Project','Task / individual work','Worked Hours']
};

export default function GeneratedTrackingReportPreview({report,mode,onModeChange}) {
  const dates = new Map();
  for (const row of report.details) {
    if (!dates.has(row.date)) dates.set(row.date, []);
    dates.get(row.date).push(row);
  }
  const columns = headings[mode];
  return <div className="space-y-4">
    <p className="font-semibold">{report.name}</p>
    <p className="text-sm text-gray-500">{report.filters.startDate} to {report.filters.endDate} · {report.filters.timezone} · {formatTrackingReportDuration(report.totalSeconds || 0)} total</p>
    <div className="flex gap-2" role="group" aria-label="Report view">
      {[['daily','Daily summary'],['details','Task details']].map(([value,label]) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => onModeChange(value)} className={`rounded-lg px-3 py-2 text-sm font-medium ${mode === value ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800'}`}>{label}</button>)}
    </div>
    {mode === 'daily' && <p className="text-xs text-gray-500">Activity level: below 40% Low · 40–70% Medium · above 70% High. Missing activity is shown as Not recorded.</p>}
    <div className="overflow-x-auto">
      <table className={`w-full text-sm text-left ${mode === 'daily' ? 'min-w-[760px]' : 'min-w-[640px]'}`}>
        <caption className="sr-only">{mode === 'daily' ? 'Daily summary' : 'Task details'} grouped by date. Times use {report.filters.timezone}.</caption>
        <thead><tr>{columns.map(title => <th scope="col" key={title} className="p-2 border-b font-semibold">{title}</th>)}</tr></thead>
        {[...dates].map(([date,rows]) => <tbody key={date}>
          <tr><th scope="rowgroup" colSpan={columns.length} className="px-3 py-3 bg-indigo-50 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100 font-semibold border-b">Date: {format(parseISO(date), 'dd MMM yyyy')}</th></tr>
          {rows.map((row,index) => {
            const values = mode === 'daily'
              ? [row.employee,row.department,formatTrackingReportTime(row.checkInTime),formatTrackingReportTime(row.checkOutTime, 'Open / not recorded'),formatTrackingReportDuration(row.officeSeconds),formatTrackingReportDuration(row.seconds),row.activityLevel || 'Not recorded']
              : [row.employee,row.department,row.project,row.task,formatTrackingReportDuration(row.seconds)];
            return <tr key={`${row.userId}:${index}`}>{values.map((value,column) => <td key={column} className="p-2 border-b align-top">{value}</td>)}</tr>;
          })}
        </tbody>)}
      </table>
      {!report.details.length && <p className="py-4 text-sm text-gray-500">No matching tracking records.</p>}
    </div>
  </div>;
}
