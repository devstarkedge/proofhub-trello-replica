import React, { memo, useState, useMemo, useRef, useEffect } from 'react';
import { Mail, User, Phone, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactCountryFlag from 'react-country-flag';
import FormField from './FormField';

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

const ClientSection = memo(({
  clientName,
  clientEmail,
  clientCountryCode,
  clientMobileNumber,
  errors,
  handleInputChange,
  handleBlur,
  handleCountryCodeChange,
  handleMobileNumberChange
}) => {
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [countrySearchQuery, setCountrySearchQuery] = useState("");
  const countryDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (countryDropdownOpen && countryDropdownRef.current && !countryDropdownRef.current.contains(event.target)) {
        setCountryDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [countryDropdownOpen]);

  const filteredCountries = useMemo(() => {
    if (!countrySearchQuery.trim()) return COUNTRY_CODES;
    const query = countrySearchQuery.toLowerCase().trim();
    return COUNTRY_CODES.filter(country =>
      country.code.toLowerCase().includes(query) ||
      country.country.toLowerCase().includes(query) ||
      country.name.toLowerCase().includes(query)
    );
  }, [countrySearchQuery]);

  const selectedCountry = useMemo(() =>
    COUNTRY_CODES.find(c => c.code === clientCountryCode) || COUNTRY_CODES[0],
    [clientCountryCode]
  );

  return (
    <section className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-5 border border-blue-200">
      <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
        <Mail size={16} className="text-blue-600" />
        Client Information
      </h3>

      <div className="space-y-4">
        <FormField label="Client Name" icon={User}>
          <input
            type="text"
            name="clientName"
            autoComplete="off"
            value={clientName}
            onChange={handleInputChange}
            className="w-full px-4 py-3 border border-gray-300 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-blue-300"
            placeholder="Client's full name"
          />
        </FormField>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Email Address" icon={Mail} error={errors?.clientEmail}>
            <input
              type="email"
              name="clientEmail"
              autoComplete="off"
              value={clientEmail}
              onChange={handleInputChange}
              onBlur={() => handleBlur('clientEmail')}
              className={`w-full px-4 py-3 border bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors?.clientEmail ? 'border-red-500' : 'border-gray-300 hover:border-blue-300'
              }`}
              placeholder="client@company.com"
            />
          </FormField>

          <FormField label="Phone Number" icon={Phone} error={errors?.clientMobileNumber}>
            <div className="flex gap-2">
              {/* Country Code */}
              <div className="relative" ref={countryDropdownRef}>
                <button
                  type="button"
                  onClick={() => setCountryDropdownOpen(!countryDropdownOpen)}
                  className="flex items-center gap-2 px-3 py-3 border border-gray-300 bg-white rounded-xl hover:border-blue-300 h-[50px] min-w-[110px]"
                >
                  <ReactCountryFlag countryCode={selectedCountry.countryCode} svg style={{ width: '1.2em', height: '1.2em' }} />
                  <span className="text-sm font-medium">{selectedCountry.code}</span>
                  <ChevronDown size={14} className="text-gray-400" />
                </button>

                <AnimatePresence>
                  {countryDropdownOpen && (
                    <div className="absolute bottom-full left-0 mb-2 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50">
                      <div className="p-2 border-b border-gray-100">
                        <input
                          type="text"
                          value={countrySearchQuery}
                          onChange={(e) => setCountrySearchQuery(e.target.value)}
                          placeholder="Search..."
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {filteredCountries.map((country) => (
                          <div
                            key={country.code}
                            onClick={() => {
                              handleCountryCodeChange(country.code);
                              setCountryDropdownOpen(false);
                            }}
                            className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-blue-50 ${
                              clientCountryCode === country.code ? 'bg-blue-50' : ''
                            }`}
                          >
                            <ReactCountryFlag countryCode={country.countryCode} svg style={{ width: '1.2em', height: '1.2em' }} />
                            <span className="flex-1 text-sm">{country.name}</span>
                            <span className="text-xs text-gray-500">{country.code}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </AnimatePresence>
              </div>

              <input
                type="text"
                inputMode="numeric"
                value={clientMobileNumber}
                onChange={handleMobileNumberChange}
                onBlur={() => handleBlur('clientMobileNumber')}
                placeholder={`${selectedCountry.digits}-digit number`}
                className={`flex-1 px-4 py-3 border bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors?.clientMobileNumber ? 'border-red-500' : 'border-gray-300 hover:border-blue-300'
                }`}
              />
            </div>
          </FormField>
        </div>
      </div>
    </section>
  );
});

ClientSection.displayName = 'ClientSection';

export default ClientSection;
