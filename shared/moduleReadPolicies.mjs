// The transport/cache mechanism is shared; freshness and dependencies belong
// to each domain. null means an authoritative read that must reach the server.
export const salesReadPolicy = {
  resources: ['rows', 'reference', 'preferences', 'tabs', 'directory'],
  defaultTtlMs: 15000,
  clientResource(path) {
    if (/\/sales-tabs(?:\/|$)/.test(path)) return 'tabs';
    if (/\/users\/verified(?:\/|$)/.test(path)) return 'directory';
    if (/\/(dropdowns|columns)(?:\/|$)/.test(path)) return 'reference';
    if (/\/preferences(?:\/|$)/.test(path)) return 'preferences';
    return 'rows';
  },
  serverResource(kind) {
    if (['getDropdownOptions', 'getCustomColumns'].includes(kind)) return 'reference';
    if (['getPreferences', 'getSuggestions'].includes(kind)) return 'preferences';
    return kind === 'saved-tabs' ? 'tabs' : 'rows';
  },
  clientTtl(path) {
    if (/(?:^|\/)(permissions|export|lock|unlock)(?:\/|$)/.test(path)) return null;
    return /(?:^|\/)(dropdowns|columns|users\/verified)(?:\/|$)/.test(path) ? 30000 : 15000;
  },
  serverTtl(kind) {
    return this.serverResource(kind) === 'reference' ? 120000 : 30000;
  },
  eventResources(type) {
    if (!/sales/.test(type)) return [];
    if (/sales:tab:/.test(type)) return ['tabs'];
    if (/sales:(dropdown|column):/.test(type)) return ['reference'];
    if (/sales:rows?:/.test(type)) return ['rows', 'preferences'];
    return this.resources;
  },
  mutationResources(path) {
    if (/\/preferences\/suggestions$/.test(path)) return [];
    if (/\/(permissions|sales-permissions)(?:\/|$)/.test(path)) return this.resources;
    if (/\/rows\/import$/.test(path)) return ['rows', 'reference', 'preferences', 'tabs'];
    return [this.clientResource(path), ...(/\/rows(?:\/|$)/.test(path) ? ['preferences'] : [])];
  }
};

export const financeReadPolicy = {
  resources: ['reports', 'pages', 'reference'],
  defaultTtlMs: 30000,
  clientResource: path => /\/pages(?:\/|$)/.test(path) ? 'pages' : /\/departments(?:\/|$)/.test(path) ? 'reference' : 'reports',
  serverResource: kind => kind === 'pages' ? 'pages' : kind === 'departments' ? 'reference' : 'reports',
  clientTtl(path) {
    if (/(?:^|\/)(permissions|export)(?:\/|$)/.test(path)) return null;
    return /\/pages(?:\/|$)/.test(path) ? 15000 : 30000;
  },
  // Reports reuse the durable posted/billed-time context. Page configuration
  // is separate from the financial calculation itself.
  serverTtl: kind => kind === 'pages' ? 15000 : 60000,
  eventResources(type) {
    if (/finance:page/.test(type)) return ['pages'];
    return /finance|board|card|task|milestone|time-logged|estimation/.test(type) ? ['reports'] : [];
  },
  mutationResources(path) { return [this.clientResource(path)]; }
};

export const attendanceReadPolicy = {
  resources: ['reports', 'history', 'reference'],
  clientResource(path) {
    if (/\/(view|dashboard)(?:\/|$)/.test(path)) return 'history';
    return /\/(policy|shifts|shift-assignments|locations|work-mode-overrides|office-hours-overrides)(?:\/|$)/.test(path) ? 'reference' : 'reports';
  },
  serverResource: kind => ['history', 'dashboard'].includes(kind) ? 'history' : /\.routes\.js:/.test(kind) ? 'reference' : 'reports',
  defaultTtlMs: 15000,
  historyTtl(records) {
    // A date in the past alone cannot establish finality (overnight sessions,
    // missing checkout and pending corrections can still change a day).
    return records.length > 0 && records.every(day => day.isFinalized === true && !day.activeSession && !day.durationIsLive && day.presenceState !== 'MISSING_CHECKOUT') ? 120000 : 15000;
  },
  clientTtl(path) {
    if (/(?:^|\/)(today|access|preview|operations|export|sessions)(?:\/|$)/.test(path) || /\/approvals\/queue(?:\/|$)/.test(path)) return null;
    return /(?:^|\/)(wfh|regularizations)(?:\/|$)/.test(path) ? 10000 : 15000;
  },
  // Management handlers have an explicit operation guard. Live attendance,
  // checkout, approval decisions and operation receipts never use this cache.
  serverTtl: kind => /\.routes\.js:/.test(kind) ? 30000 : 15000,
  eventResources(type) {
    if (/attendance|leave|calendar/.test(type)) return this.resources;
    return /tracking/.test(type) ? ['reports'] : [];
  },
  mutationResources() { return this.resources; }
};

export const moduleReadPolicies = { sales: salesReadPolicy, finance: financeReadPolicy, attendance: attendanceReadPolicy };
