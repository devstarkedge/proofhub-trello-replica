import { useEffect, useState } from 'react';
import { hoursToMinutes, minutesToHours } from '../../utils/duration';

/** Edits hours while the parent and API retain canonical integer minutes. */
export default function DurationHoursInput({ value, onChange, minMinutes = 0, maxMinutes = 1440, ...props }) {
  const [hours, setHours] = useState(() => minutesToHours(value));
  useEffect(() => { setHours(minutesToHours(value)); }, [value]);
  return <input {...props} type="number" step="any" min={minMinutes / 60} max={maxMinutes / 60} value={hours} onChange={(event) => {
    const raw = event.target.value;
    setHours(raw);
    try {
      const minutes = hoursToMinutes(raw, { min: minMinutes, max: maxMinutes });
      event.target.setCustomValidity('');
      onChange(minutes);
    } catch (error) { event.target.setCustomValidity(error.message); }
  }} />;
}
