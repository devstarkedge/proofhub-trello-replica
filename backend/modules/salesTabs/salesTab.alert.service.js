/**
 * SalesTab Alert Service
 *
 * Evaluates new/updated sales rows against active watch tabs
 * and triggers alerts when filter criteria match.
 */
import { getActiveWatchTabs, incrementUnread } from './salesTab.service.js';
import { emitSalesTabAlert, emitSalesTabUnreadUpdate } from '../../realtime/emitters.js';
import { enqueueNotification } from '../../queues/index.js';

// ─── Filter Matching Engine ─────────────────────────────────────────────────

/**
 * Check if a sales row matches a tab's saved filter criteria.
 */
function matchesFilters(row, filters) {
  if (!filters || Object.keys(filters).length === 0) return true;

  // Platform
  if (filters.platform && row.platform !== filters.platform) return false;

  // Technology
  if (filters.technology && row.technology !== filters.technology) return false;

  // Status
  if (filters.status && row.status !== filters.status) return false;

  // Location
  if (filters.location && row.clientLocation !== filters.location) return false;

  // Profile
  if (filters.profile && row.profile !== filters.profile) return false;

  // Min rating
  if (filters.minRating != null && (row.clientRating || 0) < Number(filters.minRating)) return false;

  // Min hire rate
  if (filters.minHireRate != null && (row.clientHireRate || 0) < Number(filters.minHireRate)) return false;

  // Budget
  if (filters.budget && row.clientBudget !== filters.budget) return false;

  // Date range
  if (filters.dateFrom) {
    const rowDate = new Date(row.date);
    if (rowDate < new Date(filters.dateFrom)) return false;
  }
  if (filters.dateTo) {
    const rowDate = new Date(row.date);
    if (rowDate > new Date(filters.dateTo)) return false;
  }

  // Search (text match across key fields)
  if (filters.search) {
    const term = filters.search.toLowerCase();
    const searchableText = [
      row.name, row.platform, row.technology, row.profile,
      row.bidLink, row.comments, row.clientLocation,
    ].filter(Boolean).join(' ').toLowerCase();
    if (!searchableText.includes(term)) return false;
  }

  // Name filter
  if (filters.name && row.name !== filters.name) return false;

  return true;
}

/**
 * Check if an alert rule condition is met for a row update.
 */
function matchesAlertRule(rule, oldRow, newRow) {
  switch (rule.type) {
    case 'new_row':
      // Only applies to new row creation (oldRow is null)
      return oldRow === null;

    case 'status_changed':
      return oldRow && oldRow.status !== newRow.status;

    case 'budget_increased': {
      const oldBudget = parseBudget(oldRow?.clientBudget);
      const newBudget = parseBudget(newRow?.clientBudget);
      return oldBudget !== null && newBudget !== null && newBudget > oldBudget;
    }

    case 'rating_improved':
      return oldRow && (newRow.clientRating || 0) > (oldRow.clientRating || 0);

    case 'dead_to_active': {
      const deadStatuses = ['dead', 'lost', 'closed', 'rejected'];
      const activeStatuses = ['active', 'bid', 'in progress', 'won', 'replied'];
      const wasDeadStr = (oldRow?.status || '').toLowerCase();
      const isActiveStr = (newRow?.status || '').toLowerCase();
      return deadStatuses.some(s => wasDeadStr.includes(s)) &&
             activeStatuses.some(s => isActiveStr.includes(s));
    }

    case 'followup_overdue':
      if (!newRow.followUpDate) return false;
      return new Date(newRow.followUpDate) < new Date();

    case 'no_response_days': {
      const days = rule.config?.days || 7;
      if (!newRow.date) return false;
      const rowDate = new Date(newRow.date);
      const daysSince = (Date.now() - rowDate.getTime()) / (1000 * 60 * 60 * 24);
      const noResponse = !newRow.replyFromClient || newRow.replyFromClient === 'No Reply';
      return noResponse && daysSince >= days;
    }

    default:
      return false;
  }
}

function parseBudget(budget) {
  if (!budget) return null;
  const num = parseFloat(String(budget).replace(/[^0-9.]/g, ''));
  return isNaN(num) ? null : num;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Evaluate a newly created sales row against all active watch tabs.
 */
export async function evaluateNewRow(row) {
  try {
    const watchTabs = await getActiveWatchTabs();
    if (watchTabs.length === 0) return;

    const matchedTabs = [];

    for (const tab of watchTabs) {
      // Check filter match
      if (!matchesFilters(row, tab.filters)) continue;

      // Check if any alert rules match for "new row"
      const hasNewRowRule = tab.alertRules.some((r) => r.type === 'new_row');
      if (!hasNewRowRule) continue;

      matchedTabs.push(tab);
    }

    // Process matches
    await processMatches(matchedTabs, row, 'new_row');
  } catch (err) {
    console.error('[SalesAlert] evaluateNewRow error:', err.message);
  }
}

/**
 * Evaluate an updated sales row against all active watch tabs.
 */
export async function evaluateRowUpdate(oldRow, newRow) {
  try {
    const watchTabs = await getActiveWatchTabs();
    if (watchTabs.length === 0) return;

    const matchedTabs = [];

    for (const tab of watchTabs) {
      // Check if the updated row matches the tab's filter criteria
      if (!matchesFilters(newRow, tab.filters)) continue;

      // Check each alert rule
      for (const rule of tab.alertRules) {
        if (rule.type === 'new_row') continue; // Skip new_row rules for updates
        if (matchesAlertRule(rule, oldRow, newRow)) {
          matchedTabs.push({ tab, ruleType: rule.type });
          break; // One match per tab is enough
        }
      }
    }

    // Process matches
    for (const { tab, ruleType } of matchedTabs) {
      await processMatch(tab, newRow, ruleType);
    }
  } catch (err) {
    console.error('[SalesAlert] evaluateRowUpdate error:', err.message);
  }
}

/**
 * Check all watch tabs for overdue follow-ups / no-response rules.
 * Called by the scheduled BullMQ repeatable job.
 */
export async function evaluateOverdueAlerts() {
  try {
    const watchTabs = await getActiveWatchTabs();
    const overdueRuleTabs = watchTabs.filter((tab) =>
      tab.alertRules.some((r) => r.type === 'followup_overdue' || r.type === 'no_response_days')
    );

    if (overdueRuleTabs.length === 0) return;

    // Import SalesRow lazily to avoid circular dependency
    const { default: SalesRow } = await import('../../models/SalesRow.js');

    for (const tab of overdueRuleTabs) {
      // Build query from tab filters
      const query = buildFilterQuery(tab.filters);
      query.isDeleted = { $ne: true };

      const rows = await SalesRow.find(query).lean();

      let matchCount = 0;
      for (const row of rows) {
        for (const rule of tab.alertRules) {
          if (rule.type !== 'followup_overdue' && rule.type !== 'no_response_days') continue;
          if (matchesAlertRule(rule, row, row)) {
            matchCount++;
            break;
          }
        }
      }

      if (matchCount > 0) {
        const updatedTab = await incrementUnread(tab._id, matchCount);
        if (updatedTab) {
          emitSalesTabUnreadUpdate(tab._id, updatedTab.unreadMatches);

          if (tab.alertFrequency === 'instant') {
            emitSalesTabAlert(tab.ownerId, {
              tabId: tab._id,
              tabName: tab.name,
              type: 'overdue_check',
              matchCount,
              priority: tab.alertPriority,
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('[SalesAlert] evaluateOverdueAlerts error:', err.message);
  }
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

async function processMatches(tabs, row, ruleType) {
  for (const tab of tabs) {
    await processMatch(tab, row, ruleType);
  }
}

async function processMatch(tab, row, ruleType) {
  try {
    // Increment unread badge
    const updatedTab = await incrementUnread(tab._id, 1);
    if (!updatedTab) return;

    emitSalesTabUnreadUpdate(tab._id, updatedTab.unreadMatches);

    // Send instant alert if configured
    if (tab.alertFrequency === 'instant') {
      const alertPayload = {
        tabId: tab._id,
        tabName: tab.name,
        type: ruleType,
        rowSummary: {
          id: row._id,
          name: row.name,
          platform: row.platform,
          technology: row.technology,
          status: row.status,
        },
        priority: tab.alertPriority,
        timestamp: new Date().toISOString(),
      };

      // Toast via socket
      emitSalesTabAlert(tab.ownerId, alertPayload);

      // Notification center
      if (tab.alertChannels.includes('notification_center')) {
        enqueueNotification({
          recipient: tab.ownerId,
          type: 'sales_tab_alert',
          title: `Watch Tab: ${tab.name}`,
          message: formatAlertMessage(ruleType, row),
          priority: tab.alertPriority === 'urgent' ? 'high' : tab.alertPriority,
          metadata: { tabId: tab._id, ruleType, rowId: row._id },
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[SalesAlert] processMatch error:', err.message);
  }
}

function formatAlertMessage(ruleType, row) {
  const name = row.name || 'Unknown';
  const platform = row.platform || '';
  switch (ruleType) {
    case 'new_row':
      return `New matching record: ${name} on ${platform}`;
    case 'status_changed':
      return `Status changed for ${name}: ${row.status}`;
    case 'budget_increased':
      return `Budget increased for ${name}: ${row.clientBudget}`;
    case 'rating_improved':
      return `Rating improved for ${name}: ${row.clientRating}★`;
    case 'dead_to_active':
      return `Dead lead ${name} became active!`;
    case 'followup_overdue':
      return `Follow-up overdue for ${name}`;
    case 'no_response_days':
      return `No response from ${name} on ${platform}`;
    default:
      return `Alert triggered for ${name}`;
  }
}

/**
 * Build a Mongoose filter query from tab filter config.
 */
function buildFilterQuery(filters) {
  const query = {};
  if (!filters) return query;

  if (filters.platform) query.platform = filters.platform;
  if (filters.technology) query.technology = filters.technology;
  if (filters.status) query.status = filters.status;
  if (filters.location) query.clientLocation = filters.location;
  if (filters.profile) query.profile = filters.profile;
  if (filters.name) query.name = filters.name;
  if (filters.minRating != null) query.clientRating = { $gte: Number(filters.minRating) };
  if (filters.minHireRate != null) query.clientHireRate = { $gte: Number(filters.minHireRate) };
  if (filters.budget) query.clientBudget = filters.budget;
  if (filters.dateFrom || filters.dateTo) {
    query.date = {};
    if (filters.dateFrom) query.date.$gte = new Date(filters.dateFrom);
    if (filters.dateTo) query.date.$lte = new Date(filters.dateTo);
  }

  return query;
}
