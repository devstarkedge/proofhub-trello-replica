import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';

/**
 * ColumnTooltip - Explains finance calculations to users
 * Answers: "Where did this number come from?"
 */
const ColumnTooltip = ({ children, explanation, position = 'top' }) => {
  const [show, setShow] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);

  useEffect(() => {
    if (show && triggerRef.current && tooltipRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      
      let top, left;
      
      switch (position) {
        case 'top':
          top = triggerRect.top - tooltipRect.height - 8;
          left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
          break;
        case 'bottom':
          top = triggerRect.bottom + 8;
          left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
          break;
        case 'left':
          top = triggerRect.top + (triggerRect.height / 2) - (tooltipRect.height / 2);
          left = triggerRect.left - tooltipRect.width - 8;
          break;
        case 'right':
          top = triggerRect.top + (triggerRect.height / 2) - (tooltipRect.height / 2);
          left = triggerRect.right + 8;
          break;
        default:
          top = triggerRect.top - tooltipRect.height - 8;
          left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
      }
      
      // Keep tooltip within viewport
      const padding = 10;
      if (left < padding) left = padding;
      if (left + tooltipRect.width > window.innerWidth - padding) {
        left = window.innerWidth - tooltipRect.width - padding;
      }
      if (top < padding) {
        top = triggerRect.bottom + 8; // Flip to bottom
      }
      
      setTooltipPos({ top, left });
    }
  }, [show, position]);

  return (
    <span 
      ref={triggerRef}
      className="inline-flex items-center gap-1 cursor-help"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      <HelpCircle className="w-3 h-3 opacity-50 hover:opacity-100 transition-opacity" />
      
      {show && (
        <div 
          ref={tooltipRef}
          className="fixed z-[9999] px-3 py-2 rounded-lg shadow-xl border text-xs max-w-xs"
          style={{
            top: tooltipPos.top,
            left: tooltipPos.left,
            backgroundColor: 'var(--color-bg-elevated, #1f2937)',
            borderColor: 'var(--color-border-subtle)',
            color: 'var(--color-text-primary)'
          }}
        >
          <div className="whitespace-pre-wrap">{explanation}</div>
          <div 
            className="absolute w-2 h-2 rotate-45"
            style={{
              backgroundColor: 'var(--color-bg-elevated, #1f2937)',
              borderColor: 'var(--color-border-subtle)',
              ...(position === 'top' ? { bottom: -4, left: '50%', transform: 'translateX(-50%) rotate(45deg)', borderRight: '1px solid', borderBottom: '1px solid' } : {}),
              ...(position === 'bottom' ? { top: -4, left: '50%', transform: 'translateX(-50%) rotate(45deg)', borderLeft: '1px solid', borderTop: '1px solid' } : {})
            }}
          />
        </div>
      )}
    </span>
  );
};

// Predefined explanations for common finance columns
export const COLUMN_EXPLANATIONS = {
  payment: {
    hourly: 'Payment = Billed Time × Hourly Rate\nIncludes time from tasks, subtasks & nano-subtasks',
    fixed: 'Payment = Fixed Project Amount\nHourly rate is not considered for fixed projects'
  },
  loggedTime: 'Total time logged by all users on this project/task\nSum of hours:minutes from all time entries',
  billedTime: 'Time marked as billable to client\nUsed for calculating hourly project payments',
  unbilledTime: 'Logged Time - Billed Time\nTime that hasn\'t been invoiced yet',
  totalRevenue: 'Sum of all payments across selected filters\nHourly: Billed Time × Rate\nFixed: Project Amount',
  topEarner: 'User with highest total payment in selected period',
  topProject: 'Project generating most revenue in selected period'
};

export default ColumnTooltip;
