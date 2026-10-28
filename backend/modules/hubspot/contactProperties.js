import { SyncError } from './domain.js';

export function normalizeOwner(value = '') {
  if (typeof value !== 'string' || (value && !/^[1-9]\d{0,19}$/.test(value))) throw new SyncError('INVALID_OWNER', 'Contact Owner must be a positive integer HubSpot Owner ID.', { status: 400, permanent: true });
  return value;
}
export function technologyValues(options, property) {
  if (property?.type !== 'enumeration' || property?.fieldType !== 'checkbox' || property.modificationMetadata?.readOnlyValue) throw new SyncError('TECHNOLOGY_PROPERTY', 'HubSpot technology must be an editable multiple-checkbox contact property.', { permanent: true });
  const available = (property.options || []).filter(option => !option.hidden);
  return [...new Set(options.map(option => {
    const exact = available.filter(item => item.value === option.value);
    const matched = exact.length ? exact : available.filter(item => String(item.label).trim().toLowerCase() === option.label.trim().toLowerCase());
    if (matched.length !== 1 || !matched[0].value || matched[0].value.includes(';')) throw new SyncError('INVALID_TECHNOLOGY', 'A selected project technology has no unique enabled HubSpot option. Correct the property options before syncing.', { permanent: true });
    return matched[0].value;
  }))].sort().join(';');
}
