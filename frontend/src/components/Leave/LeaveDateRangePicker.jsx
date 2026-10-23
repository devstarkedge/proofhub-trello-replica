import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import DatePickerModal from '../DatePickerModal';

export default function LeaveDateRangePicker({ startDate, endDate, onChange, singleDay = false, minDate, todayDate }) {
  const [picking, setPicking] = useState(null);
  const select = (value) => {
    if (picking === 'start') {
      onChange({ startDate: value || '', endDate: singleDay ? value || '' : endDate && endDate >= value ? endDate : value || '' });
    } else onChange({ startDate, endDate: value || '' });
  };
  const field = (kind, label, value) => <div>
    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>{label}</label>
    <button type="button" aria-label={label} onClick={() => setPicking(kind)}
      className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm"
      style={{ backgroundColor: 'var(--color-bg-base)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' }}>
      <span>{value ? value.split('-').reverse().join('-') : 'Select date'}</span><CalendarDays className="h-4 w-4" />
    </button>
  </div>;
  return <>
    <div className={singleDay ? '' : 'grid grid-cols-2 gap-3'}>
      {field('start', singleDay ? 'Date' : 'Start Date', startDate)}
      {!singleDay && field('end', 'End Date', endDate)}
    </div>
    <DatePickerModal isOpen={Boolean(picking)} onClose={() => setPicking(null)} onSelectDate={select}
      todayDate={todayDate || minDate}
      selectedDate={picking === 'end' ? endDate : startDate}
      minDate={picking === 'end' && startDate > (minDate || '') ? startDate : minDate}
      title={singleDay ? 'Leave Date' : picking === 'end' ? 'Leave End Date' : 'Leave Start Date'} />
  </>;
}
