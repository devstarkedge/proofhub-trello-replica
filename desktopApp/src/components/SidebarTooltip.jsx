import { Tooltip } from 'radix-ui';
import { useEffect, useState } from 'react';

// Portal beyond the scrollable nav so labels never get clipped by the rail.
export default function SidebarTooltip({ label, enabled = true, children }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [enabled]);

  const preventDisabledOpen = (event) => {
    if (!enabled) event.preventDefault();
  };

  return (
    <Tooltip.Root open={enabled && open} onOpenChange={(nextOpen) => setOpen(enabled && nextOpen)} disableHoverableContent>
      <Tooltip.Trigger asChild onPointerMove={preventDisabledOpen} onFocus={preventDisabledOpen}>
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side="right" sideOffset={10} collisionPadding={8} className="sidebar-tooltip">
          {label}
          <Tooltip.Arrow style={{ fill: 'var(--color-text-primary)' }} />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
