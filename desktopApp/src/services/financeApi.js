import api from './api';
import { businessReads } from './businessReadClient';

// Keep the shared authentication transport; only Finance display GETs opt in.
const financeApi = {
  get: api.get.bind(api),
  interceptors: api.interceptors
};
businessReads.install(financeApi, 'finance', (url, config) => url.startsWith('/api/finance/') && !config.responseType,
  config => /\/api\/(finance|boards|cards|milestones|subtasks|subtask-nanos)(\/|$)/.test(config.url || ''));
export default { ...api, get: financeApi.get, refresh: () => businessReads.clear('finance', { fresh: true }) };
