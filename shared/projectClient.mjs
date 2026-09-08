export const COUNTRY_CODES = [
  { code: "+91", country: "IND", countryCode: "IN", name: "India", digits: 10 },
  { code: "+1", country: "USA", countryCode: "US", name: "United States", digits: 10 },
  { code: "+44", country: "UK", countryCode: "GB", name: "United Kingdom", digits: 10 },
  { code: "+61", country: "AUS", countryCode: "AU", name: "Australia", digits: 9 },
  { code: "+86", country: "CHN", countryCode: "CN", name: "China", digits: 11 },
  { code: "+81", country: "JPN", countryCode: "JP", name: "Japan", digits: 10 },
  { code: "+49", country: "DEU", countryCode: "DE", name: "Germany", digits: 10 },
  { code: "+33", country: "FRA", countryCode: "FR", name: "France", digits: 9 },
  { code: "+971", country: "UAE", countryCode: "AE", name: "UAE", digits: 9 },
  { code: "+65", country: "SGP", countryCode: "SG", name: "Singapore", digits: 8 },
  { code: "+55", country: "BRA", countryCode: "BR", name: "Brazil", digits: 11 },
  { code: "+7", country: "RUS", countryCode: "RU", name: "Russia", digits: 10 },
  { code: "+39", country: "ITA", countryCode: "IT", name: "Italy", digits: 10 },
  { code: "+34", country: "ESP", countryCode: "ES", name: "Spain", digits: 9 },
  { code: "+82", country: "KOR", countryCode: "KR", name: "South Korea", digits: 10 },
  { code: "+92", country: "PAK", countryCode: "PK", name: "Pakistan", digits: 10 },
  { code: "+880", country: "BGD", countryCode: "BD", name: "Bangladesh", digits: 10 },
  { code: "+27", country: "ZAF", countryCode: "ZA", name: "South Africa", digits: 9 },
  { code: "+60", country: "MYS", countryCode: "MY", name: "Malaysia", digits: 9 },
  { code: "+63", country: "PHL", countryCode: "PH", name: "Philippines", digits: 10 },
  { code: "+966", country: "SAU", countryCode: "SA", name: "Saudi Arabia", digits: 9 },
  { code: "+64", country: "NZL", countryCode: "NZ", name: "New Zealand", digits: 9 },
  { code: "+41", country: "CHE", countryCode: "CH", name: "Switzerland", digits: 9 },
  { code: "+31", country: "NLD", countryCode: "NL", name: "Netherlands", digits: 9 },
  { code: "+46", country: "SWE", countryCode: "SE", name: "Sweden", digits: 9 },
];

export const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const trim = value => typeof value === 'string' ? value.trim() : '';
export function splitClientPhone(value) {
  const phone = trim(value).replace(/[\s().-]/g, '');
  const country = COUNTRY_CODES.find(item => phone.startsWith(item.code));
  // Unrecognized legacy numbers stay visible, with no invented country code.
  return { clientCountryCode: country?.code || '', clientMobileNumber: country ? phone.slice(country.code.length) : trim(value) };
}

export function normalizeClientDetails(value) {
  return {
    clientName: trim(value?.clientName),
    clientEmail: trim(value?.clientEmail),
    clientWhatsappNumber: trim(value?.clientWhatsappNumber).replace(/[\s().-]/g, ''),
  };
}

export function validateProjectClient(projectType, value) {
  if (projectType !== 'Hired Client') return {};
  const details = normalizeClientDetails(value);
  const errors = {};
  if (!details.clientName || !/[\p{L}\p{N}]/u.test(details.clientName)) {
    errors.clientName = 'Client name is required for Hired Client projects.';
  }
  if (!EMAIL_REGEX.test(details.clientEmail)) errors.clientEmail = 'Please enter a valid client email address.';
  const { clientCountryCode, clientMobileNumber } = splitClientPhone(details.clientWhatsappNumber);
  const country = COUNTRY_CODES.find(item => item.code === clientCountryCode);
  if (!country || !/^\d+$/.test(clientMobileNumber) || clientMobileNumber.length !== country.digits || /^0+$/.test(clientMobileNumber)) {
    errors.clientMobileNumber = 'Please enter a valid client phone number.';
  }
  return errors;
}

export function clientDetailsFromForm(form) {
  return normalizeClientDetails({
    clientName: form.clientName,
    clientEmail: form.clientEmail,
    clientWhatsappNumber: form.clientMobileNumber
      ? `${form.clientCountryCode || ''}${form.clientMobileNumber}` : '',
  });
}
