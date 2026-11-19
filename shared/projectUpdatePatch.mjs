import { clientDetailsFromForm } from './projectClient.mjs';

function fields(form) {
  const value = Object.fromEntries(['description', 'department', 'startDate', 'dueDate', 'technologies', 'status', 'priority', 'visibility', 'projectType'].map(key => [key, form[key]]));
  value.name = form.title;
  value.members = [...(form.assignees || [])].map(String).sort();
  value.technologies = [...(form.technologies || [])].map(String).sort();
  if (form.projectType !== 'Inhouse') {
    for (const key of ['projectUrl', 'projectSource', 'upworkId', 'billingCycle', 'estimatedTime']) value[key] = form[key];
    if (form.billingCycle === 'fixed') value.fixedPrice = form.fixedPrice;
    if (['hr', 'hourly'].includes(form.billingCycle)) value.hourlyPrice = form.hourlyPrice;
    if (form.billingCycle === 'milestone') {
      value.totalProjectBudget = form.totalProjectBudget;
      value.milestoneWorkflow = form.milestoneWorkflow;
      value.milestones = (form.milestones || []).map(({ _id, title, amount, dueDate }, order) => ({ _id, title, amount, dueDate, order }));
    }
    value.clientDetails = clientDetailsFromForm(form);
  }
  return value;
}

// Compare against the server-loaded form, before restoring any local draft.
// A type/cycle transition still sends its dependent billing fields together.
export function projectUpdatePatch(form, baseline) {
  const next = fields(form), previous = fields(baseline);
  if (next.projectType !== previous.projectType || next.billingCycle !== previous.billingCycle) return next;
  return Object.fromEntries(Object.entries(next).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(previous[key])));
}
