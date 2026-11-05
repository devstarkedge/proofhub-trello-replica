const labels = { checkin: 'Checking in', checkout: 'Checking out', start: 'Starting work', switch: 'Switching work', pause: 'Pausing work', resume: 'Resuming work', link: 'Linking work' };

// Presentation is separate from confirmed attendance and work state. A pending
// selection must never start native monitoring or add uncommitted tracked time.
export function pendingSessionPresentation(action) {
  if (action?.phase !== 'PENDING') return null;
  return { label: labels[action.action] || 'Saving changes', selection: String(action.presentation?.label || '').slice(0,240),
    message: 'Saving in the background. You can keep using FlowTask.' };
}
