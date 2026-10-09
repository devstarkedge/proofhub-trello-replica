import { useEffect, useId, useRef } from 'react';

/** Native, keyboard-accessible checkbox shared by every permission picker. */
export default function PermissionCheckbox({ label, description, checked = false, indeterminate = false, disabled = false, onChange, accentColor = '#7c3aed', compact = false }) {
  const id = useId();
  const input = useRef(null);
  useEffect(() => {
    if (input.current) input.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label htmlFor={id}
      className={`flex items-start gap-3 rounded-lg border text-sm transition-colors focus-within:ring-2 focus-within:ring-purple-500 focus-within:ring-offset-2 ${compact ? 'px-3 py-2' : 'p-3 min-h-14'} ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:shadow-sm'}`}
      style={{ backgroundColor: checked ? `${accentColor}0d` : 'var(--color-bg-base)', borderColor: checked ? `${accentColor}70` : 'var(--color-border-default)', color: 'var(--color-text-primary)' }}>
      <input ref={input} id={id} type="checkbox" checked={checked} disabled={disabled}
        aria-checked={indeterminate ? 'mixed' : checked} aria-describedby={description ? `${id}-description` : undefined}
        onChange={(event) => !disabled && onChange?.(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-inherit rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500"
        style={{ accentColor }} />
      <span className="min-w-0"><span className="block font-medium leading-5">{label}</span>
        {description && <span id={`${id}-description`} className="mt-1 block text-xs leading-4" style={{ color: 'var(--color-text-secondary)' }}>{description}</span>}
      </span>
    </label>
  );
}
