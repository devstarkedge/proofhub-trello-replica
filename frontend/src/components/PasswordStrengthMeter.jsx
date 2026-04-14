import React, { useMemo } from 'react';
import { Check, X } from 'lucide-react';

const PasswordStrengthMeter = ({ password = '' }) => {
  const checks = useMemo(() => ({
    minLength: password.length >= 6,
    hasUpper: /[A-Z]/.test(password),
    hasLower: /[a-z]/.test(password),
    hasDigit: /\d/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
    isLong: password.length >= 10,
  }), [password]);

  const score = useMemo(() => {
    if (!password) return 0;
    let s = 0;
    if (checks.minLength) s++;
    if (checks.hasUpper) s++;
    if (checks.hasLower) s++;
    if (checks.hasDigit) s++;
    if (checks.hasSpecial) s++;
    if (checks.isLong) s++;
    return s;
  }, [password, checks]);

  const { label, color, width } = useMemo(() => {
    if (!password) return { label: '', color: '', width: '0%' };
    if (score <= 2) return { label: 'Weak', color: 'bg-red-500', width: '25%' };
    if (score <= 3) return { label: 'Fair', color: 'bg-orange-500', width: '50%' };
    if (score <= 4) return { label: 'Good', color: 'bg-yellow-400', width: '75%' };
    return { label: 'Strong', color: 'bg-green-500', width: '100%' };
  }, [password, score]);

  const requirements = [
    { key: 'minLength', label: 'At least 6 characters', met: checks.minLength },
    { key: 'hasUpper', label: 'One uppercase letter', met: checks.hasUpper },
    { key: 'hasLower', label: 'One lowercase letter', met: checks.hasLower },
    { key: 'hasDigit', label: 'One number', met: checks.hasDigit },
  ];

  if (!password) return null;

  return (
    <div className="mt-3 space-y-3">
      {/* Strength bar */}
      <div>
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs text-white/60">Password strength</span>
          {label && <span className="text-xs font-medium text-white/80">{label}</span>}
        </div>
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${color}`}
            style={{ width }}
          />
        </div>
      </div>

      {/* Requirements checklist */}
      <div className="grid grid-cols-2 gap-1.5">
        {requirements.map(({ key, label: reqLabel, met }) => (
          <div key={key} className="flex items-center gap-1.5">
            {met ? (
              <Check size={12} className="text-green-400 flex-shrink-0" />
            ) : (
              <X size={12} className="text-white/30 flex-shrink-0" />
            )}
            <span className={`text-xs ${met ? 'text-green-400' : 'text-white/40'}`}>
              {reqLabel}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PasswordStrengthMeter;
