import React, { useEffect, useContext, useCallback, useRef, useState } from 'react';
import { X, Calendar, AlertCircle, ChevronDown, Search, Check } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import DatePickerModal from '../DatePickerModal';
import { formatSalesDate, parseSalesDate } from '../../utils/dateUtils';
import { zodResolver } from '@hookform/resolvers/zod';
import { salesRowSchemaFlexible, SALES_FIELD_LABELS, getErrorSummary } from '../../utils/salesValidation';
import useSalesStore from '../../store/salesStore';
import SalesDropdown from './SalesDropdown';
import AuthContext from '../../context/AuthContext';
import { toast } from 'react-toastify';
import { getVerifiedUsers } from '../../services/salesApi';

// Month names for auto-derivation from date
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const defaultValues = {
  date: '',
  name: '',
  bidLink: '',
  platform: '',
  profile: '',
  technology: '',
  clientRating: '',
  clientHireRate: '',
  clientBudget: '',
  clientSpending: '',
  clientLocation: '',
  replyFromClient: '',
  followUps: '',
  followUpDate: null,
  connects: '',
  rate: '',
  proposalScreenshot: '',
  status: '',
  comments: '',
  rowColor: '#FFFFFF',
};

// Convert backend row object to values compatible with react-hook-form
// Convert backend row object to values compatible with react-hook-form
function convertRowForForm(row) {
  if (!row) return {};
  const out = { ...row };
  
  // Convert strings to Date objects for Zod schema compliance
  if (out.date) {
    out.date = new Date(out.date);
  }
  if (out.followUpDate) {
    out.followUpDate = new Date(out.followUpDate);
  }
  
  return out;
}

const AddSalesRowModal = ({ isOpen, onClose, editingRow }) => {
  const { createRow, updateRow, dropdownOptions, customColumns, fetchCustomColumns } = useSalesStore();
  const { user } = useContext(AuthContext);
  const isEdit = Boolean(editingRow);
  const isAdmin = user?.role === 'admin';
  const formScrollRef = useRef(null);

  // Verified users state (admin name selector)
  const [verifiedUsers, setVerifiedUsers] = useState([]);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const userDropdownRef = useRef(null);
  
  // Date Picker State
  const [datePickerState, setDatePickerState] = React.useState({
    isOpen: false,
    target: null, // 'date' | 'followUpDate' | customColumnKey
    title: ''
  });

  // Load verified users for admin name selector
  useEffect(() => {
    if (!isOpen || !isAdmin) return;
    setLoadingUsers(true);
    getVerifiedUsers()
      .then(users => setVerifiedUsers(users || []))
      .catch(() => setVerifiedUsers([]))
      .finally(() => setLoadingUsers(false));
  }, [isOpen, isAdmin]);

  // Close user dropdown on outside click
  useEffect(() => {
    if (!userDropdownOpen) return;
    const handler = (e) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target)) {
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userDropdownOpen]);

  // Reset dropdown/search state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setUserDropdownOpen(false);
      setUserSearch('');
    }
  }, [isOpen]);

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors, isSubmitting, isValid, isDirty },
    setValue,
    trigger,
  } = useForm({
    resolver: zodResolver(salesRowSchemaFlexible),
    defaultValues: isEdit ? { ...defaultValues, ...convertRowForForm(editingRow) } : defaultValues,
    mode: 'onTouched', // Validate on blur + submit for instant feedback
  });

  const hasErrors = Object.keys(errors).length > 0;

  // Scroll to first invalid field and focus it
  const scrollToFirstError = useCallback((fieldErrors) => {
    const firstKey = Object.keys(fieldErrors)[0];
    if (!firstKey || !formScrollRef.current) return;

    // Find the field wrapper by data-field attribute
    const fieldEl = formScrollRef.current.querySelector(`[data-field="${firstKey}"]`);
    if (fieldEl) {
      fieldEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Focus the input/button inside after scroll animation
      setTimeout(() => {
        const focusable = fieldEl.querySelector('input, button, select, textarea');
        if (focusable) focusable.focus();
      }, 350);
    }
  }, []);

  // Called by react-hook-form when validation fails on submit
  const onInvalid = useCallback((fieldErrors) => {
    const { message } = getErrorSummary(fieldErrors);
    toast.error(message, { toastId: 'sales-validation', autoClose: 6000 });
    scrollToFirstError(fieldErrors);
  }, [scrollToFirstError]);

  // Ctrl+S / Cmd+S keyboard shortcut to save
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        document.getElementById('sales-form')?.requestSubmit();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen]);

  // Watch date fields for display
  const watchedDate = watch('date');
  const watchedFollowUpDate = watch('followUpDate');
  // We need to watch all fields to support custom columns potentially, but for now we can just rely on getValues or specific watches if needed.
  // Actually, for custom columns, we might need to watch them dynamically or just pass current value to the renderer.
  // Using watch() without arguments watches everything, but might be performance heavy.
  // Instead, we'll watch specific known dates, and for custom columns we can use Controller or watch specifically.
  // Let's use `watch()` to get all values for rendering custom date fields correctly.
  const allValues = watch();

  // Derive month name from the watched date value (Date object or empty)
  const derivedMonth = (watchedDate instanceof Date && !isNaN(watchedDate))
    ? MONTH_NAMES[watchedDate.getMonth()]
    : '';

  // Filtered verified users for admin name selector
  const filteredUsers = verifiedUsers.filter(u =>
    u.name.toLowerCase().includes(userSearch.toLowerCase())
  );

  // Current name value (for admin selector display)
  const selectedNameValue = watch('name') || '';

  const openDatePicker = (target, title) => {
    setDatePickerState({
      isOpen: true,
      target,
      title
    });
  };

  const handleDateSelect = (dateString) => {
    if (datePickerState.target) {
      if (dateString) {
          // Parse string (dd-mm-yyyy or yyyy-mm-dd) to Date object for Zod validation
          const dateObj = parseSalesDate(dateString);
          setValue(datePickerState.target, dateObj, { shouldValidate: true, shouldDirty: true });
          // Auto-set monthName when the main date field is updated
          if (datePickerState.target === 'date' && dateObj instanceof Date && !isNaN(dateObj)) {
            setValue('monthName', MONTH_NAMES[dateObj.getMonth()], { shouldDirty: true });
          }
      } else {
          setValue(datePickerState.target, null, { shouldValidate: true, shouldDirty: true });
          if (datePickerState.target === 'date') {
            setValue('monthName', '', { shouldDirty: true });
          }
      }
    }
  };

  useEffect(() => {
    fetchCustomColumns();
    if (isEdit && editingRow) {
      // merge custom column values into defaults
      const base = { ...defaultValues, ...convertRowForForm(editingRow) };
      if (customColumns && customColumns.length) {
        customColumns.forEach(col => {
          base[col.key] = editingRow?.[col.key] ?? '';
        });
      }
      // Seed monthName from existing date on edit
      if (base.date instanceof Date && !isNaN(base.date)) {
        base.monthName = MONTH_NAMES[base.date.getMonth()];
      } else if (editingRow.monthName) {
        base.monthName = editingRow.monthName;
      }
      reset(base);
    } else {
      const base = { ...defaultValues };
      // Auto-fill name with logged-in user's name for new records
      base.name = user?.name || '';
      if (customColumns && customColumns.length) {
        customColumns.forEach(col => { base[col.key] = ''; });
      }
      reset(base);
    }
  }, [isEdit, editingRow, reset, fetchCustomColumns, customColumns.length]);

  // Keep form in sync when customColumns change while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const additions = {};
    customColumns.forEach(col => {
      additions[col.key] = editingRow ? (editingRow[col.key] ?? '') : '';
    });
    if (Object.keys(additions).length) {
      Object.entries(additions).forEach(([k, v]) => setValue(k, v));
    }
  }, [customColumns, isOpen, editingRow, setValue]);

  const onSubmit = async (data) => {
    try {
      // Convert date fields to Date objects if needed
      if (typeof data.date === 'string') data.date = new Date(data.date);
      if (data.followUpDate && typeof data.followUpDate === 'string') data.followUpDate = new Date(data.followUpDate);
      
      // Also handle custom date columns if any
      if (customColumns) {
        customColumns.forEach(col => {
            if (col.type === 'date' && data[col.key] && typeof data[col.key] === 'string') {
                data[col.key] = new Date(data[col.key]);
            }
        });
      }

      if (isEdit) {
        await updateRow(editingRow._id, data);
      } else {
        await createRow(data);
      }
      onClose();
    } catch (err) {
      // Show backend validation errors as toast
      const backendMsg = err?.response?.data?.message;
      const fields = err?.response?.data?.fields;
      if (backendMsg) {
        toast.error(backendMsg, { toastId: 'sales-api-error', autoClose: 6000 });
      } else {
        toast.error('Failed to save record. Please try again.', { toastId: 'sales-api-error' });
      }
      console.error('Save sales row error:', err);
    }
  };

  if (!isOpen) return null;

  const SectionHeader = ({ title, icon: Icon }) => (
    <div className="flex items-center gap-3 mb-5 pb-3 border-b-2 border-gradient-to-r from-blue-100 via-indigo-100 to-blue-100 dark:from-blue-900/30 dark:via-indigo-900/30 dark:to-blue-900/30">
      {Icon && <Icon className="w-6 h-6 text-blue-600 dark:text-blue-400" />}
      <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100 tracking-tight">{title}</h3>
    </div>
  );

  return (
    <div className="fixed inset-0 backdrop-blur-md bg-black/40 flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 border border-gray-200/50 dark:border-gray-700/50">
        
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-gradient-to-r from-white via-blue-50/30 to-white dark:from-gray-800 dark:via-blue-900/10 dark:to-gray-800 sticky top-0 z-10 shadow-sm">
          <div>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent flex items-center gap-3">
              {isEdit ? '✏️ Edit Record' : '✨ New Sales Record'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {isEdit ? 'Update the details below' : 'Fill in the information to add a new sales record'}
            </p>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:scale-110 hover:rotate-90 duration-200"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* content */}
        <div ref={formScrollRef} className="overflow-y-auto flex-1 p-8 custom-scrollbar bg-gradient-to-b from-transparent via-blue-50/10 to-transparent dark:via-blue-900/5">
          {/* Error Summary Banner */}
          {hasErrors && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
              <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">Please fix the following errors:</p>
                <ul className="mt-1.5 space-y-0.5">
                  {Object.entries(errors).map(([key, err]) => (
                    <li key={key}>
                      <button
                        type="button"
                        className="text-xs text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                        onClick={() => {
                          const el = formScrollRef.current?.querySelector(`[data-field="${key}"]`);
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            setTimeout(() => {
                              const focusable = el.querySelector('input, button, select, textarea');
                              if (focusable) focusable.focus();
                            }, 350);
                          }
                        }}
                      >
                        {SALES_FIELD_LABELS[key] || key}: {err.message}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <form id="sales-form" onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-10">
            
            {/* Deal Details Section */}
            <div>
              <SectionHeader title="Deal Details" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                 <div className="col-span-1" data-field="date">
                  <label className=" text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                    Date
                    <span className="text-red-500 font-bold">*</span>
                  </label>
                  <div className="relative group">
                    <input 
                        type="text" 
                        readOnly
                        value={formatSalesDate(watchedDate)}
                        onClick={() => openDatePicker('date', 'Select Deal Date')}
                        aria-invalid={errors.date ? 'true' : undefined}
                        className={`input w-full bg-gray-50 dark:bg-gray-900 border-2 ${errors.date ? 'border-red-500 dark:border-red-500 ring-1 ring-red-500/30' : 'border-gray-200 dark:border-gray-700'} focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl cursor-pointer transition-all hover:border-blue-300 dark:hover:border-blue-600 font-medium`}
                        placeholder="dd-mm-yyyy"
                    />
                    <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors pointer-events-none" />
                  </div>
                  <input type="hidden" {...register('date')} />
                  {errors.date && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.date.message}</p>}
                </div>

                {/* Month — auto-derived from Date, never manually typed */}
                <div className="col-span-1">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                    Month
                    <span className="text-[10px] font-normal text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-full">Auto</span>
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={derivedMonth}
                    tabIndex={-1}
                    className="input w-full bg-blue-50/50 dark:bg-blue-900/10 border-2 border-blue-100 dark:border-blue-900/40 text-blue-700 dark:text-blue-300 rounded-xl cursor-default select-none font-medium"
                    placeholder="Fills from Date"
                  />
                  <input type="hidden" {...register('monthName')} value={derivedMonth} />
                  <p className="text-[10px] text-gray-400 mt-1">Auto-filled when you pick a date</p>
                </div>

                <div className="col-span-1" data-field="name">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                    Name
                    <span className="text-red-500 font-bold">*</span>
                    {isAdmin && <span className="text-[10px] font-normal text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded-full ml-1">Admin</span>}
                  </label>
                  {isAdmin ? (
                    // Admin: searchable verified-users dropdown selector
                    <div className="relative" ref={userDropdownRef}>
                      <div className="relative">
                        <input
                          type="text"
                          value={userDropdownOpen ? userSearch : selectedNameValue}
                          readOnly={!userDropdownOpen}
                          onChange={(e) => setUserSearch(e.target.value)}
                          onFocus={() => { setUserSearch(''); setUserDropdownOpen(true); }}
                          aria-invalid={errors.name ? 'true' : undefined}
                          aria-haspopup="listbox"
                          aria-expanded={userDropdownOpen}
                          className={`input w-full pr-9 bg-gray-50 dark:bg-gray-900 border-2 ${errors.name ? 'border-red-500 dark:border-red-500 ring-1 ring-red-500/30' : 'border-gray-200 dark:border-gray-700'} focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 rounded-xl transition-all hover:border-indigo-300 dark:hover:border-indigo-600 font-medium cursor-pointer`}
                          placeholder={loadingUsers ? 'Loading users…' : 'Select a verified user'}
                        />
                        <ChevronDown className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none transition-transform duration-200 ${userDropdownOpen ? 'rotate-180' : ''}`} />
                      </div>
                      {userDropdownOpen && (
                        <div role="listbox" className="absolute z-[60] top-full mt-1.5 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl overflow-hidden">
                          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-900/60 border-b border-gray-100 dark:border-gray-700">
                            <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span className="text-[11px] text-gray-400">
                              {loadingUsers ? 'Loading…' : `${filteredUsers.length} user${filteredUsers.length !== 1 ? 's' : ''}`}
                            </span>
                          </div>
                          <div className="overflow-y-auto max-h-44">
                            {filteredUsers.length === 0 ? (
                              <div className="px-3 py-3 text-sm text-gray-400 text-center">
                                {loadingUsers ? 'Loading…' : 'No matching users'}
                              </div>
                            ) : (
                              filteredUsers.map(u => (
                                <button
                                  key={u._id}
                                  type="button"
                                  role="option"
                                  aria-selected={selectedNameValue === u.name}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setValue('name', u.name, { shouldValidate: true, shouldDirty: true });
                                    setUserDropdownOpen(false);
                                    setUserSearch('');
                                  }}
                                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm text-left transition-colors ${selectedNameValue === u.name ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-semibold' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'}`}
                                >
                                  <span>{u.name}</span>
                                  {selectedNameValue === u.name && <Check className="w-4 h-4 shrink-0 text-indigo-500" />}
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                      <input type="hidden" {...register('name')} />
                    </div>
                  ) : (
                    // Non-admin: readonly, auto-filled, no cursor confusion
                    <input
                      type="text"
                      {...register('name')}
                      readOnly
                      aria-invalid={errors.name ? 'true' : undefined}
                      className="input w-full bg-gray-100 dark:bg-gray-900/60 border-2 border-gray-200 dark:border-gray-700 rounded-xl font-medium text-gray-700 dark:text-gray-300 cursor-not-allowed"
                      placeholder="Your name"
                    />
                  )}
                  {!isAdmin && <p className="text-[11px] text-gray-400 mt-1">Auto-filled with your account name</p>}
                  {isAdmin && !userDropdownOpen && <p className="text-[11px] text-gray-400 mt-1">Click to select a verified team member</p>}
                  {errors.name && <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.name.message}</p>}
                </div>

                <div className="col-span-1" data-field="platform">
                  <label className=" text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                    Platform
                    <span className="text-red-500 font-bold">*</span>
                  </label>
                  <Controller
                    name="platform"
                    control={control}
                    render={({ field }) => (
                      <SalesDropdown
                        columnName="platform"
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Select Platform"
                        error={!!errors.platform}
                        clearable
                      />
                    )}
                  />
                  {errors.platform && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.platform.message}</p>}
                </div>

                <div className="col-span-1" data-field="technology">
                  <label className=" text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                    Technology
                    <span className="text-red-500 font-bold">*</span>
                  </label>
                  <Controller
                    name="technology"
                    control={control}
                    render={({ field }) => (
                      <SalesDropdown
                        columnName="technology"
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Select Tech"
                        error={!!errors.technology}
                        clearable
                      />
                    )}
                  />
                   {errors.technology && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.technology.message}</p>}
                </div>

                <div className="col-span-1" data-field="profile">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                    Profile
                    <span className="text-red-500 font-bold">*</span>
                  </label>
                  <Controller
                    name="profile"
                    control={control}
                    render={({ field }) => (
                      <SalesDropdown
                        columnName="profile"
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Select Profile"
                        error={!!errors.profile}
                        clearable
                      />
                    )}
                  />
                  {errors.profile && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.profile.message}</p>}
                </div>

                <div className="col-span-1 lg:col-span-2" data-field="bidLink">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                    Bid Link
                    <span className="text-red-500 font-bold">*</span>
                  </label>
                  <input type="text" placeholder="https://... or Invite, Direct, etc." {...register('bidLink')} aria-invalid={errors.bidLink ? 'true' : undefined} className={`input w-full bg-gray-50 dark:bg-gray-900 border-2 ${errors.bidLink ? 'border-red-500 dark:border-red-500 ring-1 ring-red-500/30' : 'border-gray-200 dark:border-gray-700'} focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl transition-all hover:border-blue-300 dark:hover:border-blue-600`} />
                   {errors.bidLink && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.bidLink.message}</p>}
                </div>
              </div>
            </div>

            {/* Client Info Section */}
            <div>
              <SectionHeader title="Client Information" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                 <div className="col-span-1" data-field="clientRating">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Rating (0-5)</label>
                  <input type="number" min={0} max={5} step="0.5" {...register('clientRating', { valueAsNumber: true })} aria-invalid={errors.clientRating ? 'true' : undefined} className={`input w-full bg-gray-50 dark:bg-gray-900 border-2 ${errors.clientRating ? 'border-red-500 dark:border-red-500 ring-1 ring-red-500/30' : 'border-gray-200 dark:border-gray-700'} focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl transition-all hover:border-blue-300 dark:hover:border-blue-600`} />
                  {errors.clientRating && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.clientRating.message}</p>}
                </div>
                
                <div className="col-span-1" data-field="clientHireRate">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Hire Rate (%)</label>
                   <input type="number" min={0} max={100} {...register('clientHireRate', { valueAsNumber: true })} aria-invalid={errors.clientHireRate ? 'true' : undefined} className={`input w-full bg-gray-50 dark:bg-gray-900 border-2 ${errors.clientHireRate ? 'border-red-500 dark:border-red-500 ring-1 ring-red-500/30' : 'border-gray-200 dark:border-gray-700'} focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl transition-all hover:border-blue-300 dark:hover:border-blue-600`} />
                   {errors.clientHireRate && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.clientHireRate.message}</p>}
                </div>

                <div className="col-span-1" data-field="clientLocation">
                   <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Location</label>
                   <Controller
                    name="clientLocation"
                    control={control}
                    render={({ field }) => (
                      <SalesDropdown
                        columnName="clientLocation"
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Select Location"
                        clearable
                      />
                    )}
                  />
                </div>

                <div className="col-span-1" data-field="clientBudget">
                   <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Budget</label>
                   <input
                     type="text"
                     {...register('clientBudget')}
                     maxLength={100}
                     className="input w-full bg-gray-50 dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl transition-all hover:border-blue-300 dark:hover:border-blue-600"
                     placeholder="e.g. $500, 1000-1500, Negotiable"
                   />
                </div>
                
                 <div className="col-span-1" data-field="clientSpending">
                   <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Spending</label>
                   <input type="text" {...register('clientSpending')} className="input w-full bg-gray-50 dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl transition-all hover:border-blue-300 dark:hover:border-blue-600" />
                </div>
              </div>
            </div>

            {/* Deal Mechanics */}
             <div>
              <SectionHeader title="Deal Mechanics" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                 <div className="col-span-1" data-field="rate">
                   <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Rate ($)</label>
                   <input type="number" min={0} {...register('rate', { valueAsNumber: true })} aria-invalid={errors.rate ? 'true' : undefined} className={`input w-full bg-gray-50 dark:bg-gray-900 border-2 ${errors.rate ? 'border-red-500 dark:border-red-500 ring-1 ring-red-500/30' : 'border-gray-200 dark:border-gray-700'} focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl transition-all hover:border-blue-300 dark:hover:border-blue-600`} />
                   {errors.rate && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.rate.message}</p>}
                </div>
                 <div className="col-span-1" data-field="connects">
                   <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Connects</label>
                   <input type="number" min={0} {...register('connects', { valueAsNumber: true })} aria-invalid={errors.connects ? 'true' : undefined} className={`input w-full bg-gray-50 dark:bg-gray-900 border-2 ${errors.connects ? 'border-red-500 dark:border-red-500 ring-1 ring-red-500/30' : 'border-gray-200 dark:border-gray-700'} focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl transition-all hover:border-blue-300 dark:hover:border-blue-600`} />
                   {errors.connects && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.connects.message}</p>}
                </div>
                 <div className="col-span-1 lg:col-span-1" data-field="proposalScreenshot">
                   <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Proposal Screenshot</label>
                   <input type="url" placeholder="https://..." {...register('proposalScreenshot')} aria-invalid={errors.proposalScreenshot ? 'true' : undefined} className={`input w-full bg-gray-50 dark:bg-gray-900 border-2 ${errors.proposalScreenshot ? 'border-red-500 dark:border-red-500 ring-1 ring-red-500/30' : 'border-gray-200 dark:border-gray-700'} focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl transition-all hover:border-blue-300 dark:hover:border-blue-600`} />
                   {errors.proposalScreenshot && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.proposalScreenshot.message}</p>}
                </div>
              </div>
            </div>

            {/* Status & Tracking */}
            <div>
              <SectionHeader title="Status & Tracking" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                 <div className="col-span-1" data-field="status">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                    Current Status
                  </label>
                  <Controller
                    name="status"
                    control={control}
                    render={({ field }) => (
                      <SalesDropdown
                        columnName="status"
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Select Status"
                        error={!!errors.status}
                        clearable
                      />
                    )}
                  />
                   {errors.status && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.status.message}</p>}
                </div>

                <div className="col-span-1" data-field="replyFromClient">
                   <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Client Reply</label>
                   <Controller
                    name="replyFromClient"
                    control={control}
                    render={({ field }) => (
                      <SalesDropdown
                        columnName="replyFromClient"
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="No Reply Yet"
                        clearable
                      />
                    )}
                  />
                </div>

                 <div className="col-span-1" data-field="rowColor">
                   <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Row Color</label>
                   <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition-all">
                     <input type="color" {...register('rowColor')} className="w-12 h-12 p-1 rounded-lg border-2 border-gray-300 dark:border-gray-600 cursor-pointer hover:scale-110 transition-transform" />
                     <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">Pick a highlight color</span>
                   </div>
                </div>

                <div className="col-span-1" data-field="followUps">
                   <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Follow Up Status</label>
                   <Controller
                    name="followUps"
                    control={control}
                    render={({ field }) => (
                      <SalesDropdown
                        columnName="followUps"
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Select Follow Up"
                        clearable
                      />
                    )}
                  />
                </div>

                 <div className="col-span-1" data-field="followUpDate">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Next Follow Up Date</label>
                  <div className="relative group">
                    <input 
                        type="text" 
                        readOnly
                        value={formatSalesDate(watchedFollowUpDate)}
                        onClick={() => openDatePicker('followUpDate', 'Select Follow Up Date')}
                        className="input w-full bg-gray-50 dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl cursor-pointer transition-all hover:border-blue-300 dark:hover:border-blue-600 font-medium"
                        placeholder="dd-mm-yyyy"
                    />
                     <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors pointer-events-none" />
                  </div>
                  <input type="hidden" {...register('followUpDate')} />
                </div>
              </div>
            </div>

            {/* Custom Columns Section */}
            {customColumns && customColumns.length > 0 && (
              <div>
                 <SectionHeader title="Additional Information" />
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {customColumns.map(col => (
                        <div key={col.key}>
                          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{col.name}{col.isRequired ? <span className="text-red-500 font-bold ml-1">*</span> : null}</label>
                          {col.type === 'dropdown' ? (
                            <Controller
                                name={col.key}
                                control={control}
                                render={({ field }) => (
                                  <SalesDropdown
                                    columnName={col.key}
                                    value={field.value}
                                    onChange={field.onChange}
                                    placeholder={`Select ${col.name}`}
                                    clearable
                                  />
                                )}
                              />
                          ) : col.type === 'date' ? (
                            <div className="relative group">
                                <input 
                                    type="text" 
                                    readOnly
                                    value={formatSalesDate(allValues[col.key])} // Accesing value from watch() result
                                    onClick={() => openDatePicker(col.key, `Select ${col.name}`)}
                                    className="input w-full bg-gray-50 dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl cursor-pointer transition-all hover:border-blue-300 dark:hover:border-blue-600 font-medium"
                                    placeholder="dd-mm-yyyy"
                                />
                                 <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors pointer-events-none" />
                                 <input type="hidden" {...register(col.key)} />
                            </div>
                          ) : col.type === 'number' ? (
                            <input type="number" {...register(col.key, { valueAsNumber: true })} className="input w-full bg-gray-50 dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl transition-all hover:border-blue-300 dark:hover:border-blue-600" />
                          ) : col.type === 'link' ? (
                            <input type="url" {...register(col.key)} className="input w-full bg-gray-50 dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl transition-all hover:border-blue-300 dark:hover:border-blue-600" />
                          ) : (
                            <input type="text" {...register(col.key)} className="input w-full bg-gray-50 dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl transition-all hover:border-blue-300 dark:hover:border-blue-600" />
                          )}
                        </div>
                    ))}
                 </div>
              </div>
            )}

            {/* Comments & Extras */}
            <div>
               <SectionHeader title="Additional Notes" />
               <div className="grid grid-cols-1 gap-5">
                 <div className="col-span-1" data-field="comments">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Comments</label>
                    <textarea {...register('comments')} rows={4} className="input w-full bg-gray-50 dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl resize-none transition-all hover:border-blue-300 dark:hover:border-blue-600" placeholder="Add any relevant notes here..."></textarea>
                 </div>
               </div>
            </div>

          </form>
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-gray-100 dark:border-gray-700 bg-gradient-to-r from-gray-50 via-blue-50/30 to-gray-50 dark:from-gray-800 dark:via-blue-900/10 dark:to-gray-800 flex items-center justify-between rounded-b-3xl shadow-inner">
           <span className="text-[11px] text-gray-400 dark:text-gray-500 hidden sm:inline">
             {hasErrors ? `${Object.keys(errors).length} field error${Object.keys(errors).length > 1 ? 's' : ''}` : 'Ctrl+S to save'}
           </span>
           <div className="flex gap-4">
           <button
             type="button"
             onClick={onClose}
             disabled={isSubmitting}
             className="px-8 py-3 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 hover:border-gray-300 dark:hover:border-gray-500 transition-all shadow-sm hover:shadow-md hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
           >
             Cancel
           </button>
           <button
             type="submit"
             form="sales-form"
             disabled={isSubmitting}
             className="px-8 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-blue-600 via-blue-600 to-indigo-600 hover:from-blue-700 hover:via-blue-700 hover:to-indigo-700 focus:ring-4 focus:ring-blue-500/30 transition-all shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 hover:scale-105 disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2.5"
           >
             {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin"/>
                  <span>Saving...</span>
                </>
             ) : (
                <span>{isEdit ? '✅ Save Changes' : '✨ Create Record'}</span>
             )}
           </button>
           </div>
        </div>
      </div>
      
      {/* Global Date Picker Modal */}
      <DatePickerModal
        isOpen={datePickerState.isOpen}
        onClose={() => setDatePickerState(prev => ({ ...prev, isOpen: false }))}
        onSelectDate={handleDateSelect}
        selectedDate={datePickerState.target ? allValues[datePickerState.target] : null}
        title={datePickerState.title}
      />
    </div>
  );
};

export default AddSalesRowModal;
