const MONEY_PATTERN = /^\d+(?:\.\d{1,2})?$/;

export const toCents = (value, fieldName = 'Amount', { allowZero = false } = {}) => {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite currency amount`);
  }
  const normalized = String(value ?? '').trim();
  if (!MONEY_PATTERN.test(normalized)) {
    throw new Error(`${fieldName} must be a valid amount with at most two decimal places`);
  }

  const [whole, fraction = ''] = normalized.split('.');
  const cents = (Number(whole) * 100) + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents < 0 || (!allowZero && cents === 0)) {
    throw new Error(`${fieldName} must be ${allowZero ? 'zero or greater' : 'greater than zero'}`);
  }
  return cents;
};

export const fromCents = (value = 0) => Number((Number(value || 0) / 100).toFixed(2));

export const addCents = (values = []) => values.reduce((sum, value) => {
  const next = Number(value || 0);
  if (!Number.isSafeInteger(next)) throw new Error('Currency values must use integer minor units');
  const total = sum + next;
  if (!Number.isSafeInteger(total)) throw new Error('Currency total exceeds the supported range');
  return total;
}, 0);
