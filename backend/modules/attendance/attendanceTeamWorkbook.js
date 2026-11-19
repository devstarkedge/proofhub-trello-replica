import ExcelJS from 'exceljs';
import { DateTime } from 'luxon';
import { formatTrackingReportDuration, TRACKING_REPORT_DURATION_FORMAT } from '../../../shared/trackingReportPresentation.mjs';

const summaryHeaders = ['Employee', 'Email', 'Department', 'Present days', 'Half days', 'Absent days', 'Missing checkout', 'Full leave days', 'Office hours', 'Working Hours'];
const dailyHeaders = ['Employee', 'Office hours', 'Working Hours', 'Status'];
const duration = seconds => typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0 ? seconds / 86400 : 'N/A';

function titleRows(sheet, title, metadata, columns) {
  sheet.addRow([title]); sheet.mergeCells(1, 1, 1, columns);
  sheet.getRow(1).font = { bold:true, size:18, color:{argb:'FF1D4ED8'} };
  sheet.getRow(1).height = 32;
  sheet.addRow([metadata]); sheet.mergeCells(2, 1, 2, columns);
  sheet.getRow(2).font = { size:10, color:{argb:'FF475569'} };
  sheet.getRow(2).height = 28;
  sheet.addRow([]);
}

function table(sheet, name, row, headers, data) {
  sheet.addTable({ name, ref:`A${row}`, headerRow:true,
    columns:headers.map(name => ({name, filterButton:true})), rows:data,
    style:{theme:'TableStyleMedium2', showRowStripes:true} });
  sheet.getRow(row).font = {bold:true, color:{argb:'FFFFFFFF'}};
  sheet.getRow(row).height = 32;
}

function fitCells(sheet, columns) {
  const display = cell => typeof cell.value === 'number' && cell.numFmt === TRACKING_REPORT_DURATION_FORMAT
    ? formatTrackingReportDuration(cell.value * 86400) : String(cell.value ?? '');
  for (let column=1; column<=columns; column++) {
    let width = 14;
    sheet.getColumn(column).eachCell(cell => {
      if (!cell.isMerged) for (const line of display(cell).split('\n')) width = Math.max(width, line.length + 4);
    });
    sheet.getColumn(column).width = Math.min(width, 70);
  }
  sheet.eachRow((row, index) => {
    row.alignment = {vertical:'middle', wrapText:true};
    if (index <= 3 || row.getCell(1).isMerged) return;
    let lines = 1;
    row.eachCell((cell, column) => {
      const available = Math.max(1, sheet.getColumn(column).width - 3);
      lines = Math.max(lines, display(cell).split('\n').reduce((total, text) => total + Math.max(1, Math.ceil(text.length / available)), 0));
    });
    row.height = Math.min(409, Math.max(row.height || 24, lines * 16 + 10));
  });
  sheet.pageSetup = {orientation:'landscape', fitToPage:true, fitToWidth:1, fitToHeight:0};
}

export async function attendanceTeamWorkbook({rows, days, query, timezone, asOf}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FlowTask'; workbook.created = new Date(asOf);
  const summary = workbook.addWorksheet('User Summary'), daily = workbook.addWorksheet('Daily Records');
  const metadata = `${query.startDate} to ${query.endDate} · ${timezone} · Generated ${DateTime.fromJSDate(new Date(asOf), {zone:timezone}).toFormat('dd MMM yyyy hh:mm a')}`;
  titleRows(summary, 'Attendance — User Summary', metadata, summaryHeaders.length);
  table(summary, 'AttendanceUserSummary', 4, summaryHeaders, rows.map(row => [
    row.user.name || 'Member details unavailable', row.user.email || 'N/A', row.departments.map(department => department.name).join('; '),
    row.present, row.halfDays, row.absent, row.missingCheckout, row.leaveDays,
    duration(row.attendanceMinutes == null ? null : row.attendanceMinutes * 60), duration(row.workSeconds)
  ]));
  summary.getColumn(9).numFmt = TRACKING_REPORT_DURATION_FORMAT;
  summary.getColumn(10).numFmt = TRACKING_REPORT_DURATION_FORMAT;
  summary.views = [{state:'frozen', ySplit:4}];

  titleRows(daily, 'Attendance — Daily Records', metadata, dailyHeaders.length);
  const dates = new Map();
  const names = new Map(rows.map(row => [String(row.user._id), row.user.name || 'Member details unavailable']));
  for (const day of [...days].sort((a,b) => a.workDateKey.localeCompare(b.workDateKey) || (names.get(String(a.user)) || '').localeCompare(names.get(String(b.user)) || '') || String(a.user).localeCompare(String(b.user)))) {
    if (!dates.has(day.workDateKey)) dates.set(day.workDateKey, []);
    dates.get(day.workDateKey).push([
      names.get(String(day.user)), duration(day.hasAttendance && Number.isFinite(day.workedMinutes) ? day.workedMinutes * 60 : null),
      duration(day.workSeconds), day.displayStatus
    ]);
  }
  let nextRow = 4, index = 0;
  for (const [date, values] of dates) {
    const heading = daily.getRow(nextRow);
    heading.getCell(1).value = `Date: ${DateTime.fromISO(date).setLocale('en').toFormat('dd MMM yyyy')}`;
    daily.mergeCells(nextRow, 1, nextRow, dailyHeaders.length);
    heading.font = {bold:true, size:12, color:{argb:'FF1E40AF'}};
    heading.getCell(1).fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FFEFF6FF'}};
    heading.height = 30;
    // Each date has its own table, so filters never hide or mix date headings.
    table(daily, `AttendanceDaily${++index}`, nextRow+1, dailyHeaders, values);
    nextRow += values.length + 3;
  }
  if (!dates.size) {
    table(daily, 'AttendanceDailyEmpty', 4, dailyHeaders, []);
    daily.getCell('A6').value = 'No daily attendance records match these filters.';
  }
  daily.getColumn(2).numFmt = TRACKING_REPORT_DURATION_FORMAT;
  daily.getColumn(3).numFmt = TRACKING_REPORT_DURATION_FORMAT;
  // Freeze only report metadata; each date and its table header must scroll
  // together so the first date is never shown above another date's records.
  daily.views = [{state:'frozen', ySplit:3}];
  fitCells(summary, summaryHeaders.length); fitCells(daily, dailyHeaders.length);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
