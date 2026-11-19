import ExcelJS from 'exceljs';
import { DateTime } from 'luxon';
import { formatTrackingReportTime, TRACKING_REPORT_DURATION_FORMAT } from '../../../shared/trackingReportPresentation.mjs';
const reportId = value => String(value?._id || value || '');
const reportError = (message,statusCode) => { throw Object.assign(new Error(message),{statusCode}); };

export function trackingActivityLevel(percent) {
  if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100) return 'Not recorded';
  return percent < 40 ? 'Low' : percent <= 70 ? 'Medium' : 'High';
}

function writeDateSections(sheet, rows, values) {
  let previousDate;
  for (const row of rows) {
    if (row.date !== previousDate) {
      if (previousDate) sheet.addRow([]);
      const date = DateTime.fromISO(row.date).setLocale('en');
      const heading = sheet.addRow([`Date: ${date.isValid ? date.toFormat('dd MMM yyyy') : row.date}`]);
      sheet.mergeCells(heading.number, 1, heading.number, sheet.columnCount);
      heading.height = 26;
      heading.font = { bold:true, size:12, color:{argb:'FF3730A3'} };
      heading.getCell(1).fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFEEF2FF'} };
      previousDate = row.date;
    }
    sheet.addRow(values(row));
  }
}

const byDateAndEmployee = (a, b) => a.date.localeCompare(b.date) || a.employee.localeCompare(b.employee) || String(a.userId).localeCompare(String(b.userId));

export const trackingDetailsByDate = rows => [...rows].sort((a,b) => byDateAndEmployee(a,b) || a.project.localeCompare(b.project) || a.task.localeCompare(b.task));

export function trackingDailyRows(rows) {
  const days = new Map();
  for (const row of rows) {
    const key = row.userId + ':' + row.date;
    if (!days.has(key)) days.set(key, {
      userId:row.userId, employee:row.employee, department:row.department, date:row.date,
      checkInTime:row.checkInTime, checkOutTime:row.checkOutTime, officeSeconds:row.officeSeconds ?? null,
      activityLevel:typeof row.activityPercent === 'number' ? trackingActivityLevel(row.activityPercent) : row.activityLevel || 'Not recorded', seconds:0
    });
    days.get(key).seconds += row.seconds;
  }
  return [...days.values()].sort(byDateAndEmployee);
}

export function splitTrackingDays(startAt, endAt, zone) {
  const rows=[]; let start=DateTime.fromMillis(startAt,{zone});
  while (start.toMillis()<endAt) {
    const end=Math.min(endAt,start.plus({days:1}).startOf('day').toMillis());
    rows.push({date:start.toISODate(),seconds:(end-start.toMillis())/1000});
    start=DateTime.fromMillis(end,{zone});
  }
  return rows;
}
export function aggregateTrackingRows(segments, access, report, projects) {
  const rows=new Map(), sessions=new Set(), people=new Map(access.subjects.map(person=>[reportId(person._id),person]));
  const departments=new Map(access.departments.map(department=>[reportId(department._id),department.name]));
  const {filters}=report;
  function add(record) {
    const person=people.get(reportId(record.user)), segment=record.segment;
    if (!person) return;
    const history=(record.departmentIdsAtStart||[]).map(reportId);
    const allowedHistory=history.filter(value=>access.allowedDepartments.has(value));
    if (access.role==='manager' && !allowedHistory.length) return;
    if (filters.departmentId && !history.includes(filters.departmentId)) return;
    const projectId=reportId(segment.project || segment.attributedProject), project=projects.get(projectId);
    // Project-attributed time can be scoped precisely for multi-department
    // employees. Unattributed individual work needs an unambiguous history.
    if (access.role==='manager' && !projectId && history.some(value=>!access.allowedDepartments.has(value))) return;
    if ((access.role==='manager' || filters.departmentId) && projectId && (!project || !access.allowedDepartments.has(reportId(project.department)) || filters.departmentId && reportId(project.department)!==filters.departmentId)) return;
    const start=Math.max(+new Date(segment.startedAt),+new Date(filters.startAt));
    const end=Math.min(+new Date(segment.endedAt || record.cutoff),+new Date(record.cutoff),+new Date(filters.endAt));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end<=start) return;
    for (const day of splitTrackingDays(start,end,filters.timezone)) {
      const taskId=reportId(segment.task || segment.attributedTask || segment.linkedTask);
      const key=JSON.stringify([reportId(record.user),projectId,taskId,day.date]);
      if (!rows.has(key)) {
        if (rows.size>=20000) reportError('Report exceeds 20,000 daily rows. Select an employee or project and try again.',413);
        rows.set(key,{userId:reportId(record.user),employee:person.name,department:allowedHistory.map(value=>departments.get(value)).filter(Boolean).join(', ') || person.departmentIds.map(value=>departments.get(value)).filter(Boolean).join(', '),projectId,project:project?.name || segment.projectName || segment.attributedProjectName || 'Individual work',taskId,task:segment.taskTitle || segment.attributedTaskTitle || segment.agendaTitle || segment.description || 'Individual work',date:day.date,seconds:0,sessions:new Set()});
      }
      const row=rows.get(key); row.seconds+=day.seconds; row.sessions.add(reportId(record.sessionId)); sessions.add(reportId(record.sessionId));
    }
  }
  return {add,finish:()=>({rows:[...rows.values()].sort((a,b)=>a.employee.localeCompare(b.employee)||a.project.localeCompare(b.project)||a.task.localeCompare(b.task)||a.date.localeCompare(b.date)).map(row=>({...row,seconds:Math.round(row.seconds),sessionIds:[...row.sessions],sessions:row.sessions.size})),sessionCount:sessions.size})};
}
export async function trackingWorkbook(report, data) {
  const workbook=new ExcelJS.Workbook(); workbook.creator='FlowTask'; workbook.created=new Date(report.createdAt);
  // Excel opens the first worksheet. Put the daily attendance/work fields here.
  const daily=workbook.addWorksheet('Daily summary');
  const summary=workbook.addWorksheet('Summary'), details=workbook.addWorksheet('Daily details');
  workbook.views=[{activeTab:0,firstSheet:0}];
  summary.columns=[{width:28},{width:30},{width:32},{width:20}];
  summary.addRow([report.name]); summary.mergeCells('A1:D1'); summary.getRow(1).font={size:18,bold:true,color:{argb:'FF4F46E5'}};
  summary.addRow(['Reporting period',`${report.filters.startDate} – ${report.filters.endDate}`]);
  summary.addRow(['Time zone',report.filters.timezone]); summary.addRow(['Generated by',report.generatedBy]);
  summary.addRow(['As of',new Date(report.createdAt).toISOString()]);
  summary.addRow(['Filters', ['departmentId','userId','projectId','taskId','status'].filter(key=>report.filters[key]).map(key=>`${key}: ${report.filters[key]}`).join('; ') || 'All authorized records']);
  summary.addRow(['Scope','Active non-admin workspace members; historical department boundaries enforced']);
  summary.addRow([]); summary.addRow(['Employee','Department','Project','Tracked time']);
  const groups=new Map();
  for (const row of data.rows) {
    const key=JSON.stringify([row.userId,row.projectId]);
    if (!groups.has(key)) groups.set(key,{userId:row.userId,employee:row.employee,department:row.department,project:row.project,seconds:0});
    const group=groups.get(key);group.seconds+=row.seconds;
  }
  let employee='', employeeId='', employeeSeconds=0;
  const subtotal=()=>{if(employee){const row=summary.addRow([`${employee} total`,'','',employeeSeconds/86400]);row.font={bold:true};}};
  for(const group of groups.values()) {
    if(employeeId && employeeId!==group.userId){subtotal();employeeSeconds=0;}
    employee=group.employee;employeeId=group.userId;employeeSeconds+=group.seconds;
    summary.addRow([group.employee,group.department,group.project,group.seconds/86400]);
  }
  subtotal();summary.addRow([`${report.filters.period==='weekly'?'Weekly':'Monthly'} total`,'','',data.rows.reduce((sum,row)=>sum+row.seconds,0)/86400]).font={bold:true};
  summary.getColumn(4).numFmt=TRACKING_REPORT_DURATION_FORMAT;
  details.columns=[{header:'Employee',key:'employee',width:26},{header:'Department',key:'department',width:28},{header:'Project',key:'project',width:30},{header:'Task / individual work',key:'task',width:40},{header:'Tracked time',key:'duration',width:18}];
  const datedDetails = trackingDetailsByDate(data.rows);
  writeDateSections(details, datedDetails, row => ({...row,duration:row.seconds/86400}));
  details.getColumn('duration').numFmt=TRACKING_REPORT_DURATION_FORMAT;
  daily.columns = [
    {header:'Employee',key:'employee',width:26}, {header:'Department',key:'department',width:24},
    {header:'Check-In Time',key:'checkInTime',width:24},
    {header:'Check-Out Time',key:'checkOutTime',width:24}, {header:'Office Hours',key:'office',width:18},
    {header:'Worked Hours',key:'worked',width:18}, {header:'Activity Level',key:'activityLevel',width:18}
  ];
  writeDateSections(daily, trackingDailyRows(data.rows), row => (
    {...row, checkInTime:formatTrackingReportTime(row.checkInTime), checkOutTime:formatTrackingReportTime(row.checkOutTime, 'Open / not recorded'),
      office:row.officeSeconds == null ? 'Not recorded' : row.officeSeconds/86400, worked:row.seconds/86400}
  ));
  daily.getCell('G1').note='Based on recorded input activity: below 40% = Low; 40% through 70% = Medium; above 70% = High. Missing activity is shown as Not recorded.';
  daily.getCell('C1').note=`Check-in time in ${report.filters.timezone}.`;
  daily.getCell('D1').note=`Check-out time in ${report.filters.timezone}. An open session has no confirmed checkout.`;
  daily.getCell('E1').note='Daily office hours are shown once per employee and date; they are not repeated for each task.';
  daily.getColumn('office').numFmt=TRACKING_REPORT_DURATION_FORMAT;
  daily.getColumn('worked').numFmt=TRACKING_REPORT_DURATION_FORMAT;
  for(const [sheet,header] of [[summary,9],[details,1],[daily,1]]) {
    sheet.views=[{state:'frozen',ySplit:header}];
    sheet.getRow(header).eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF4F46E5'}};cell.font={bold:true,color:{argb:'FFFFFFFF'}};});
    // A single filter over date-heading rows would hide or mix date sections.
    if (sheet === summary) sheet.autoFilter={from:{row:header,column:1},to:{row:sheet.rowCount,column:sheet.columnCount}};
    sheet.eachRow(row=>{row.alignment={vertical:'middle',wrapText:true};});
    sheet.pageSetup={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0};
  }
  daily.views=[{state:'frozen',ySplit:1,tabSelected:true}];
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
