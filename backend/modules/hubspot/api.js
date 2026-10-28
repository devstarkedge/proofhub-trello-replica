import axios from 'axios';
import { PROPERTIES, REQUIRED_SCOPES, SyncError } from './domain.js';
import { normalizeOwner } from './contactProperties.js';

export function retryAfterTime(header, now = Date.now()) {
  if (!header) return 0;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? now + Math.max(0, seconds) * 1000 : (Date.parse(header) || 0);
}
export function validateServiceKey(key) {
  // Do not bake in a token prefix: Service Key formats can evolve.
  if (typeof key !== 'string' || key.length < 20 || key.length > 2048 || !/^[\x21-\x7E]+$/.test(key)) {
    throw new SyncError('INVALID_KEY', 'Enter a valid HubSpot Service Key.', { permanent: true, status: 400 });
  }
}
export class HubSpotApi {
  constructor(key, { beforeRequest = async () => {}, transport = axios } = {}) {
    this.key = key; this.beforeRequest = beforeRequest; this.transport = transport;
  }
  async request(method, path, data, { missing = false } = {}) {
    await this.beforeRequest(method);
    try {
      const response = await this.transport.request({
        method, url: `https://api.hubapi.com${path}`, data,
        headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
        timeout: 10_000, maxRedirects: 0, maxContentLength: 2_000_000, maxBodyLength: 16_384,
      });
      const correlationId = response.headers?.['x-hubspot-correlation-id'];
      if (typeof correlationId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(correlationId)) this.correlationId = correlationId;
      return response.data;
    } catch (error) {
      // NEVER propagate Axios errors: they contain credentials, headers and PII.
      const status = Number(error.response?.status || 0);
      const correlationId = error.response?.headers?.['x-hubspot-correlation-id'];
      if (typeof correlationId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(correlationId)) this.correlationId = correlationId;
      if (missing && status === 404) return null;
      const code = status === 401 ? 'CREDENTIAL_REVOKED' : status === 403 ? 'MISSING_SCOPE'
        : status === 429 ? 'RATE_LIMITED' : status === 409 ? 'CONTACT_CONFLICT'
          : status >= 400 && status < 500 ? 'HUBSPOT_VALIDATION' : 'HUBSPOT_UNAVAILABLE';
      const messages = {
        CREDENTIAL_REVOKED: 'HubSpot rejected the Service Key. Replace the key.',
        MISSING_SCOPE: 'HubSpot denied access. Check the Contacts read and write scopes.',
        RATE_LIMITED: 'HubSpot rate limit reached. Synchronization will wait.',
        CONTACT_CONFLICT: 'HubSpot reported an identity conflict. Reconciliation is required.',
        HUBSPOT_VALIDATION: 'HubSpot rejected the contact data or API request.',
        HUBSPOT_UNAVAILABLE: 'HubSpot is temporarily unavailable or the request timed out.',
      };
      throw new SyncError(code, messages[code], {
        status, permanent: status === 400 || status === 422,
        retryAfter: retryAfterTime(error.response?.headers?.['retry-after']),
      });
    }
  }
  async validate() {
    validateServiceKey(this.key);
    await this.request('GET', '/crm/objects/2026-09/contacts?limit=1&properties=email');
    // Account identity is mandatory for safe account replacement and shared
    // portal ownership. Never accept a user-supplied portal or guess from a key.
    const account = await this.request('GET', '/account-info/2026-09/details');
    if (!/^\d+$/.test(String(account?.portalId || ''))) {
      throw new SyncError('ACCOUNT_UNVERIFIED', 'HubSpot account identity could not be verified. Configuration was not saved.', { permanent: true });
    }
    let writeCapability = 'unverified';
    try {
      const info = await this.request('POST', '/oauth/v2/private-apps/get/access-token-info', { tokenKey: this.key });
      if (String(info.hubId) !== String(account.portalId)) throw new SyncError('ACCOUNT_MISMATCH', 'HubSpot returned inconsistent account identities.', { permanent: true });
      if (Array.isArray(info.scopes)) {
        if (!REQUIRED_SCOPES.every(scope => info.scopes.includes(scope))) throw new SyncError('MISSING_SCOPE', 'The Service Key needs Contacts read and write scopes.', { permanent: true });
        writeCapability = 'verified';
      }
    } catch (error) {
      // Some Service Keys do not support private-app permission inspection.
      // Read and portal identity remain verified; no dummy contact is created.
      if (!['HUBSPOT_VALIDATION', 'MISSING_SCOPE'].includes(error.code) || ![400, 403, 404].includes(error.status)) throw error;
    }
    return { portalId: String(account.portalId), readVerified: true, writeCapability };
  }
  getContact(id) { return this.request('GET', `/crm/objects/2026-09/contacts/${encodeURIComponent(id)}?properties=${PROPERTIES.join(',')}`, undefined, { missing: true }); }
  getProperty(name) { return this.request('GET', `/crm/properties/2026-09/contacts/${encodeURIComponent(name)}`); }
  async validateOwner(value) {
    const id = normalizeOwner(value);
    if (!id) return 'not_configured';
    try {
      const owner = await this.request('GET', `/crm/owners/2026-09/${id}`, undefined, { missing: true });
      if (!owner || owner.archived || String(owner.id) !== id) throw new SyncError('INVALID_OWNER', 'Contact Owner was not found as an active Owner in the connected HubSpot account. Enter an Owner ID, not a User ID.', { permanent: true, status: 400 });
      return 'verified';
    } catch (error) {
      if (error.status === 403) return 'unverified';
      throw error;
    }
  }
  async findByEmail(email) {
    const direct = await this.request('GET', `/crm/objects/2026-09/contacts/${encodeURIComponent(email)}?idProperty=email&properties=${PROPERTIES.join(',')}`, undefined, { missing: true });
    const matches = new Map();
    if (direct && !direct.archived) matches.set(String(direct.id), direct);
    // Exact search also catches ambiguous data; do not select an arbitrary
    // first result. A large or paginated result set is unsafe and blocked.
    const result = await this.request('POST', '/crm/objects/2026-09/contacts/search', {
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }], properties: PROPERTIES, limit: 100,
    });
    if (result.paging?.next || result.total > 100) throw new SyncError('AMBIGUOUS_EMAIL', 'Multiple HubSpot contacts match this identity.', { permanent: true });
    for (const contact of result.results || []) {
      if (!contact.archived && String(contact.properties?.email || '').trim().toLowerCase() === email) matches.set(String(contact.id), contact);
    }
    if (matches.size > 1) throw new SyncError('AMBIGUOUS_EMAIL', 'Multiple HubSpot contacts match this identity.', { permanent: true });
    return [...matches.values()][0] || null;
  }
  create(properties) { return this.request('POST', '/crm/objects/2026-09/contacts', { properties }); }
  update(id, properties) { return this.request('PATCH', `/crm/objects/2026-09/contacts/${encodeURIComponent(id)}`, { properties }); }
}
