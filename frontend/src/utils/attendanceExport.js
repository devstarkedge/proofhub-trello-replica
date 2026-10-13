// Export the authorized, filtered rows already shown in the attendance view.
export function attendanceCsv(records) {
  const cell = (value) => {
    const text = String(value ?? '');
    const safe = /^[\s]*[=+@-]/.test(text) ? "'" + text : text;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  return [
    ['Employee', 'Date', 'Work mode', 'Worked hours', 'Status'],
    ...records.map((record) => [record.user?.name, record.workDateKey, record.workMode, Number(record.workedMinutes || 0) / 60, record.presenceState])
  ].map((row) => row.map(cell).join(',')).join('\r\n');
}
