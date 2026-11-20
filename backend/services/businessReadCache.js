import { createVersionedReadCache } from './versionedReadCache.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { moduleReadPolicies } from '../../shared/moduleReadPolicies.mjs';

// Reuse tracking's bounded, revision-checked Redis cache and outage fallback.
export const businessCaches = Object.fromEntries(Object.entries(moduleReadPolicies).map(([domain, policy]) => {
  const observations = new AsyncLocalStorage();
  const caches = Object.fromEntries(policy.resources.map(resource => [resource, createVersionedReadCache(`${domain}-${resource}-read`, { observations })]));
  return [domain, {
    read: (options, load) => caches[policy.serverResource(options.kind)].read(options, load),
    observe: load => caches[policy.resources[0]].observe(load),
    invalidate: (workspaceId, resources = policy.resources) => Promise.all(resources.map(resource => caches[resource].invalidate(workspaceId))),
    stats: () => Object.fromEntries(Object.entries(caches).map(([resource, cache]) => [resource, cache.stats()]))
  }];
}));

// Dependencies follow the models actually consumed by each read handler.
// Row edits cannot evict Sales dropdown/column reference data.
export function readResources(model, domain) {
  if (domain === 'sales') {
    if (/^Sales(Row|ActivityLog)$/.test(model)) return ['rows'];
    if (/^Sales(Column|DropdownOption)$/.test(model)) return ['reference'];
    if (model === 'SalesUserPreference') return ['preferences'];
    if (/^SalesTab/.test(model)) return ['tabs'];
  }
  if (domain === 'finance' && !/^(Department|Role|WorkspaceMembership|AccessOverride|Workspace|User)$/.test(model)) return [model === 'FinancePage' ? 'pages' : 'reports'];
  if (domain === 'attendance') {
    // Tracking data feeds team/work-time reports, not persisted day history
    // or guarded policy/location reference reads.
    if (/^(WorkSession|TrackingPolicy|Card|Subtask|SubtaskNano|Board)$/.test(model)) return ['reports'];
    if (/^Attendance(Day|Session|Regularization)$/.test(model) || /^(Leave|WorkCalendar|Calendar|Holiday)/.test(model)) return ['history', 'reports'];
  }
  return moduleReadPolicies[domain].resources;
}

export function readDomains(model) {
  // Delivery leases/retries do not alter attendance or financial read models.
  if (/^Attendance(Event|Report)/.test(model)) return [];
  // Delivery state does not feed the saved-tab DTO; visible unread counters
  // are persisted on SalesTab and invalidate that resource separately.
  if (/^SalesTab(WatchState|AlertEvent)$/.test(model)) return [];
  if (/^Sales/.test(model)) return ['sales'];
  if (/^FinancePage$/.test(model)) return ['finance'];
  if (/^(Attendance|Wfh|WFH|Leave|WorkCalendar|Calendar|Holiday)/.test(model)) return ['attendance'];
  if (/^(WorkSession|TrackingPolicy)$/.test(model)) return ['attendance'];
  if (/^(Milestone|MilestoneApproval)$/.test(model)) return ['finance'];
  // Project/task assignments can change Tracking visibility as well as billing.
  if (/^(Card|Subtask|SubtaskNano|Board)$/.test(model)) return ['finance', 'attendance'];
  if (/^(Department|Role|WorkspaceMembership|AccessOverride|Workspace|User)$/.test(model)) return ['attendance', 'sales', 'finance'];
  return [];
}

const deferred = new WeakMap();
// A model save inside a transaction is not a committed change. Invalidate only
// after a successful commit, including transactions owned by background jobs.
export async function invalidateBusinessReads(model, workspaceId, session) {
  const domains = readDomains(model);
  if (!workspaceId || !domains.length) return;
  const invalidate = () => Promise.all(domains.map(domain => businessCaches[domain].invalidate(workspaceId, readResources(model, domain))));
  if (!session?.inTransaction()) return invalidate();
  let pending = deferred.get(session);
  if (!pending) {
    pending = new Map(); deferred.set(session, pending);
    const commit = session.commitTransaction.bind(session), abort = session.abortTransaction.bind(session);
    session.commitTransaction = async (...args) => {
      const result = await commit(...args);
      const changes = [...pending.values()]; pending.clear();
      await Promise.all(changes.map(({ domain, workspaceId: workspace, resources }) => businessCaches[domain].invalidate(workspace, [...resources])));
      return result;
    };
    session.abortTransaction = async (...args) => {
      try { return await abort(...args); } finally { pending.clear(); }
    };
  }
  for (const domain of domains) {
    const key = `${workspaceId}:${domain}`;
    if (!pending.has(key)) pending.set(key, { domain, workspaceId, resources: new Set() });
    for (const resource of readResources(model, domain)) pending.get(key).resources.add(resource);
  }
}
