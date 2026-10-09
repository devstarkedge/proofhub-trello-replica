import { useEffect, useRef } from 'react';

/** Keep keyboard navigation inside the active dialog; restore the opener on close. */
export default function useModalFocus({ open, dialogRef, onClose, blocked = false, suspended = false }) {
  const options = useRef({ onClose, blocked, suspended });
  options.current = { onClose, blocked, suspended };
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const controls = () => [...(dialogRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || [])]
      .filter((element) => element.getClientRects().length > 0);
    const focusFirst = () => (controls()[0] || dialogRef.current)?.focus();
    focusFirst();
    const handleKey = (event) => {
      if (options.current.suspended) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!options.current.blocked) options.current.onClose?.();
      }
      if (event.key !== 'Tab') return;
      const elements = controls();
      if (!elements.length) { event.preventDefault(); dialogRef.current?.focus(); return; }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    const handleFocus = (event) => {
      if (!options.current.suspended && !dialogRef.current?.contains(event.target)) focusFirst();
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('focusin', handleFocus);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('focusin', handleFocus);
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, [open, dialogRef]);
}
