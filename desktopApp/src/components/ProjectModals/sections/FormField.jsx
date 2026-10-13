import React, { memo } from 'react';
import { AlertCircle } from 'lucide-react';

const FormField = memo(({ label, icon: Icon, required, error, helperText, children, className = '' }) => (
  <div className={`space-y-2 ${className}`}>
    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
      {Icon && <Icon className="h-4 w-4 text-blue-600" />}
      {label}
      {required && <span className="text-red-500">*</span>}
    </label>
    {children}
    {helperText && !error && (
      <p className="text-xs text-gray-500">{helperText}</p>
    )}
    <p
      className={`text-red-600 text-sm flex items-center gap-1 transition-all duration-200 ${
        error ? 'opacity-100 max-h-8' : 'opacity-0 max-h-0 overflow-hidden'
      }`}
    >
      <AlertCircle size={14} /> {error || ''}
    </p>
  </div>
));

FormField.displayName = 'FormField';

export default FormField;
