import { useState } from 'react';
import { FileClock, House, ChevronDown } from 'lucide-react';

/** Presentation tabs only. Both existing request sections and all their
 * original actions remain available to every existing page viewer. */
export default function MyAttendanceRequests({ regularizationCount, wfhCount, regularization, wfh }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [tab, setTab] = useState('regularization');
  const totalCount = (regularizationCount || 0) + (wfhCount || 0);

  const tabs = [
    { id: 'regularization', label: 'Regularization', count: regularizationCount, icon: FileClock },
    { id: 'wfh', label: 'Work from home', count: wfhCount, icon: House }
  ];

  return (
    <section className="overflow-hidden rounded-2xl border shadow-sm transition-all" style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border-default)' }}>
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded(prev => !prev)}
        className="flex w-full items-center justify-between p-4 text-left sm:p-5 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>My requests</h2>
          <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ backgroundColor: 'var(--color-bg-muted)', color: 'var(--color-text-muted)' }}>
            {totalCount}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
          <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isExpanded && (
        <div className="border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
          <div role="tablist" aria-label="My attendance requests" className="mx-4 mt-3 flex gap-1 border-b sm:mx-5" style={{ borderColor: 'var(--color-border-subtle)' }}>
            {tabs.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  id={`my-attendance-${item.id}-tab`}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  aria-controls={`my-attendance-${item.id}-panel`}
                  tabIndex={tab === item.id ? 0 : -1}
                  onClick={() => setTab(item.id)}
                  onKeyDown={event => {
                    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                      event.preventDefault();
                      const next = event.key === 'Home' ? 'regularization' : event.key === 'End' ? 'wfh' : tab === 'regularization' ? 'wfh' : 'regularization';
                      setTab(next);
                      document.getElementById(`my-attendance-${next}-tab`)?.focus();
                    }
                  }}
                  className="inline-flex min-h-11 items-center gap-1.5 border-b-2 px-2 pb-2 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] sm:px-3 cursor-pointer"
                  style={{
                    color: tab === item.id ? 'var(--color-primary)' : 'var(--color-text-muted)',
                    borderColor: tab === item.id ? 'var(--color-primary)' : 'transparent'
                  }}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{item.label}</span>
                  <span className="rounded-md px-1.5 py-0.5 tabular-nums" style={{ backgroundColor: 'var(--color-bg-muted)' }}>
                    {item.count}
                  </span>
                </button>
              );
            })}
          </div>
          <div id="my-attendance-regularization-panel" role="tabpanel" aria-labelledby="my-attendance-regularization-tab" hidden={tab !== 'regularization'} className="p-4 sm:p-5">{regularization}</div>
          <div id="my-attendance-wfh-panel" role="tabpanel" aria-labelledby="my-attendance-wfh-tab" hidden={tab !== 'wfh'} className="p-4 sm:p-5">{wfh}</div>
        </div>
      )}
    </section>
  );
}
