import React, { useEffect, useContext, useCallback, useRef, useState, useMemo } from 'react';
import { X, Calendar, AlertCircle, ChevronDown, Search, Check, Briefcase, Users, Calculator, Activity, LayoutGrid, MessageSquare, Keyboard } from 'lucide-react';
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
import { useSalesPreferences } from '../../hooks/useSalesPreferences';

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────
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

function convertRowForForm(row) {
  if (!row) return {};
  const out = { ...row };
  if (out.date) out.date = new Date(out.date);
  if (out.followUpDate) out.followUpDate = new Date(out.followUpDate);
  return out;
}

// ────────────────────────────────────────────────────────────
// Shared style tokens (consistent across all sections)
// ────────────────────────────────────────────────────────────
const inputBase = 'w-full h-11 bg-white dark:bg-gray-900/80 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 hover:border-gray-300 dark:hover:border-gray-500';
const inputError = 'border-red-400 dark:border-red-500 ring-1 ring-red-400/20 focus:ring-red-500/30 focus:border-red-500';
const labelBase = 'block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5';
const labelRequired = 'text-red-500 ml-0.5';
const errorText = 'text-red-500 text-xs mt-1 flex items-center gap-1';

// ────────────────────────────────────────────────────────────
// Section Header (pure component, no re-renders)
// ────────────────────────────────────────────────────────────
const SectionHeader = React.memo(({ title, icon: Icon, description }) => (
  <div className="flex items-center gap-3 mb-5 pb-3 border-b border-gray-100 dark:border-gray-700/60">
    {Icon && (
      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20">
        <Icon className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
      </div>
    )}
    <div>
      <h3 className="font-semibold text-[15px] text-gray-800 dark:text-gray-100 tracking-tight">{title}</h3>
      {description && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{description}</p>}
    </div>
  </div>
));
SectionHeader.displayName = 'SectionHeader';

// ────────────────────────────────────────────────────────────
// Field wrapper with auto-scroll on focus
// ────────────────────────────────────────────────────────────
const FieldWrapper = React.memo(({ name, className = 'col-span-1', children }) => {
  const ref = useRef(null);
  const handleFocusIn = useCallback(() => {
    // Auto-scroll to field when focused (for long modals)
    requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }, []);
  return (
    <div ref={ref} className={className} data-field={name} onFocusCapture={handleFocusIn}>
      {children}
    </div>
  );
});
FieldWrapper.displayName = 'FieldWrapper';

// ────────────────────────────────────────────────────────────
// Shared Form Elements (Anti-Autofill)
// ────────────────────────────────────────────────────────────
const FormInput = React.forwardRef((props, ref) => (
  <input
    ref={ref}
    autoComplete="off"
    autoCorrect="off"
    autoCapitalize="off"
    spellCheck="false"
    data-form-type="other"
    data-lpignore="true"
    data-1p-ignore="true"
    {...props}
  />
));
FormInput.displayName = 'FormInput';

const FormTextarea = React.forwardRef((props, ref) => (
  <textarea
    ref={ref}
    autoComplete="off"
    autoCorrect="off"
    autoCapitalize="off"
    spellCheck="false"
    data-form-type="other"
    data-lpignore="true"
    data-1p-ignore="true"
    {...props}
  />
));
FormTextarea.displayName = 'FormTextarea';

// ────────────────────────────────────────────────────────────
// Memoized sections
// ────────────────────────────────────────────────────────────
const DealDetailsSection = React.memo(({ control, register, errors, watchedDate, derivedMonth, isAdmin, loadingUsers, filteredUsers, selectedNameValue, userDropdownOpen, setUserDropdownOpen, userSearch, setUserSearch, userDropdownRef, setValue, formatSalesDate, openDatePicker, suggestions }) => (
  <section>
    <SectionHeader title="Deal Details" icon={Briefcase} description="Core deal information" />
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-4">
      {/* Date */}
      <FieldWrapper name="date">
        <label className={labelBase}>Date<span className={labelRequired}>*</span></label>
        <div className="relative group">
          <FormInput
            type="text"
            readOnly
            value={formatSalesDate(watchedDate)}
            onClick={() => openDatePicker('date', 'Select Deal Date')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDatePicker('date', 'Select Deal Date'); } }}
            aria-invalid={errors.date ? 'true' : undefined}
            className={`${inputBase} cursor-pointer font-medium pr-10 ${errors.date ? inputError : ''}`}
            placeholder="Select date..."
          />
          <Calendar className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400 group-hover:text-blue-500 transition-colors pointer-events-none" />
        </div>
        <input type="hidden" {...register('date')} />
        {errors.date && <p className={errorText}><AlertCircle className="w-3 h-3" />{errors.date.message}</p>}
      </FieldWrapper>

      {/* Month (auto) */}
      <FieldWrapper name="monthName" className="col-span-1">
        <label className={labelBase}>
          Month
          <span className="text-[10px] font-normal text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-full ml-2">Auto</span>
        </label>
        <input
          type="text"
          readOnly
          value={derivedMonth}
          tabIndex={-1}
          className="w-full h-11 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50 text-blue-600 dark:text-blue-400 rounded-xl px-3.5 text-sm cursor-default select-none font-medium"
          placeholder="Fills from date"
        />
        <input type="hidden" {...register('monthName')} value={derivedMonth} />
      </FieldWrapper>

      {/* Name */}
      <FieldWrapper name="name">
        <label className={labelBase}>
          Name<span className={labelRequired}>*</span>
          {isAdmin && <span className="text-[10px] font-normal text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded-full ml-2">Admin</span>}
        </label>
        {isAdmin ? (
          <div className="relative" ref={userDropdownRef}>
            <div className="relative">
              <FormInput
                type="text"
                value={userDropdownOpen ? userSearch : selectedNameValue}
                readOnly={!userDropdownOpen}
                onChange={(e) => setUserSearch(e.target.value)}
                onFocus={() => { setUserSearch(''); setUserDropdownOpen(true); }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setUserDropdownOpen(false); }
                  if (e.key === 'ArrowDown' && !userDropdownOpen) { setUserDropdownOpen(true); }
                }}
                aria-invalid={errors.name ? 'true' : undefined}
                aria-haspopup="listbox"
                aria-expanded={userDropdownOpen}
                className={`${inputBase} pr-10 cursor-pointer font-medium ${errors.name ? inputError : ''}`}
                placeholder={loadingUsers ? 'Loading users…' : 'Select user'}
              />
              <ChevronDown className={`absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none transition-transform duration-200 ${userDropdownOpen ? 'rotate-180' : ''}`} />
            </div>
            {userDropdownOpen && (
              <div role="listbox" className="absolute z-[100] top-full mt-1.5 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl shadow-black/8 dark:shadow-black/25 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50/80 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-700">
                  <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span className="text-[11px] text-gray-400">{loadingUsers ? 'Loading…' : `${filteredUsers.length} user${filteredUsers.length !== 1 ? 's' : ''}`}</span>
                </div>
                <div className="overflow-y-auto max-h-44">
                  {filteredUsers.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-gray-400 text-center">{loadingUsers ? 'Loading…' : 'No matching users'}</div>
                  ) : filteredUsers.map(u => (
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
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm text-left transition-colors ${selectedNameValue === u.name ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'}`}
                    >
                      <span>{u.name}</span>
                      {selectedNameValue === u.name && <Check className="w-4 h-4 shrink-0 text-indigo-500" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <input type="hidden" {...register('name')} />
          </div>
        ) : (
          <FormInput
            type="text"
            {...register('name')}
            readOnly
            tabIndex={-1}
            aria-invalid={errors.name ? 'true' : undefined}
            className="w-full h-11 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50 rounded-xl px-3.5 font-medium text-gray-600 dark:text-gray-400 cursor-not-allowed text-sm"
            placeholder="Your name"
          />
        )}
        {errors.name && <p className={errorText}><AlertCircle className="w-3 h-3" />{errors.name.message}</p>}
      </FieldWrapper>

      {/* Platform */}
      <FieldWrapper name="platform">
        <label className={labelBase}>Platform<span className={labelRequired}>*</span></label>
        <Controller name="platform" control={control} render={({ field }) => (
          <SalesDropdown columnName="platform" value={field.value} onChange={field.onChange} placeholder="Select platform" error={!!errors.platform} clearable autoOpenOnFocus autoSelectOnTab prioritizedValues={suggestions?.platform} />
        )} />
        {errors.platform && <p className={errorText}><AlertCircle className="w-3 h-3" />{errors.platform.message}</p>}
      </FieldWrapper>

      {/* Technology */}
      <FieldWrapper name="technology">
        <label className={labelBase}>Technology<span className={labelRequired}>*</span></label>
        <Controller name="technology" control={control} render={({ field }) => (
          <SalesDropdown columnName="technology" value={field.value} onChange={field.onChange} placeholder="Select technology" error={!!errors.technology} clearable autoOpenOnFocus autoSelectOnTab prioritizedValues={suggestions?.technology} />
        )} />
        {errors.technology && <p className={errorText}><AlertCircle className="w-3 h-3" />{errors.technology.message}</p>}
      </FieldWrapper>

      {/* Profile */}
      <FieldWrapper name="profile">
        <label className={labelBase}>Profile<span className={labelRequired}>*</span></label>
        <Controller name="profile" control={control} render={({ field }) => (
          <SalesDropdown columnName="profile" value={field.value} onChange={field.onChange} placeholder="Select profile" error={!!errors.profile} clearable autoOpenOnFocus autoSelectOnTab prioritizedValues={suggestions?.profile} />
        )} />
        {errors.profile && <p className={errorText}><AlertCircle className="w-3 h-3" />{errors.profile.message}</p>}
      </FieldWrapper>

      {/* Bid Link */}
      <FieldWrapper name="bidLink" className="col-span-1 lg:col-span-2">
        <label className={labelBase}>Bid Link<span className={labelRequired}>*</span></label>
        <FormInput type="text" placeholder="https://... or Invite, Direct" {...register('bidLink')} aria-invalid={errors.bidLink ? 'true' : undefined} className={`${inputBase} ${errors.bidLink ? inputError : ''}`} />
        {errors.bidLink && <p className={errorText}><AlertCircle className="w-3 h-3" />{errors.bidLink.message}</p>}
      </FieldWrapper>
    </div>
  </section>
));
DealDetailsSection.displayName = 'DealDetailsSection';

const ClientInfoSection = React.memo(({ control, register, errors, suggestions }) => (
  <section>
    <SectionHeader title="Client Information" icon={Users} description="Client profile and engagement data" />
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-4">
      <FieldWrapper name="clientRating">
        <label className={labelBase}>Rating (0-5)</label>
        <FormInput type="number" min={0} max={5} step="0.5" {...register('clientRating', { valueAsNumber: true })} placeholder="e.g. 4.5" aria-invalid={errors.clientRating ? 'true' : undefined} className={`${inputBase} ${errors.clientRating ? inputError : ''}`} />
        {errors.clientRating && <p className={errorText}><AlertCircle className="w-3 h-3" />{errors.clientRating.message}</p>}
      </FieldWrapper>

      <FieldWrapper name="clientHireRate">
        <label className={labelBase}>Hire Rate (%)</label>
        <FormInput type="number" min={0} max={100} {...register('clientHireRate', { valueAsNumber: true })} placeholder="e.g. 85" aria-invalid={errors.clientHireRate ? 'true' : undefined} className={`${inputBase} ${errors.clientHireRate ? inputError : ''}`} />
        {errors.clientHireRate && <p className={errorText}><AlertCircle className="w-3 h-3" />{errors.clientHireRate.message}</p>}
      </FieldWrapper>

      <FieldWrapper name="clientLocation">
        <label className={labelBase}>Location</label>
        <Controller name="clientLocation" control={control} render={({ field }) => (
          <SalesDropdown columnName="clientLocation" value={field.value} onChange={field.onChange} placeholder="Select location" clearable autoOpenOnFocus autoSelectOnTab prioritizedValues={suggestions?.clientLocation} />
        )} />
      </FieldWrapper>

      <FieldWrapper name="clientBudget">
        <label className={labelBase}>Budget</label>
        <FormInput type="text" {...register('clientBudget')} maxLength={100} className={inputBase} placeholder="e.g. $500, 1000-1500" />
      </FieldWrapper>

      <FieldWrapper name="clientSpending">
        <label className={labelBase}>Spending</label>
        <FormInput type="text" {...register('clientSpending')} className={inputBase} placeholder="Total client spending" />
      </FieldWrapper>
    </div>
  </section>
));
ClientInfoSection.displayName = 'ClientInfoSection';

const DealMechanicsSection = React.memo(({ register, errors }) => (
  <section>
    <SectionHeader title="Deal Mechanics" icon={Calculator} description="Pricing and proposal details" />
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-4">
      <FieldWrapper name="rate">
        <label className={labelBase}>Rate ($)</label>
        <FormInput type="number" min={0} {...register('rate', { valueAsNumber: true })} placeholder="e.g. 50" aria-invalid={errors.rate ? 'true' : undefined} className={`${inputBase} ${errors.rate ? inputError : ''}`} />
        {errors.rate && <p className={errorText}><AlertCircle className="w-3 h-3" />{errors.rate.message}</p>}
      </FieldWrapper>

      <FieldWrapper name="connects">
        <label className={labelBase}>Connects</label>
        <FormInput type="number" min={0} {...register('connects', { valueAsNumber: true })} placeholder="e.g. 6" aria-invalid={errors.connects ? 'true' : undefined} className={`${inputBase} ${errors.connects ? inputError : ''}`} />
        {errors.connects && <p className={errorText}><AlertCircle className="w-3 h-3" />{errors.connects.message}</p>}
      </FieldWrapper>

      <FieldWrapper name="proposalScreenshot">
        <label className={labelBase}>Proposal Screenshot</label>
        <FormInput type="url" placeholder="https://screenshot.url" {...register('proposalScreenshot')} aria-invalid={errors.proposalScreenshot ? 'true' : undefined} className={`${inputBase} ${errors.proposalScreenshot ? inputError : ''}`} />
        {errors.proposalScreenshot && <p className={errorText}><AlertCircle className="w-3 h-3" />{errors.proposalScreenshot.message}</p>}
      </FieldWrapper>
    </div>
  </section>
));
DealMechanicsSection.displayName = 'DealMechanicsSection';

const StatusTrackingSection = React.memo(({ control, register, errors, watchedFollowUpDate, formatSalesDate, openDatePicker, suggestions }) => (
  <section>
    <SectionHeader title="Status & Tracking" icon={Activity} description="Deal progress and follow-ups" />
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-4">
      <FieldWrapper name="status">
        <label className={labelBase}>Current Status</label>
        <Controller name="status" control={control} render={({ field }) => (
          <SalesDropdown columnName="status" value={field.value} onChange={field.onChange} placeholder="Select status" error={!!errors.status} clearable autoOpenOnFocus autoSelectOnTab prioritizedValues={suggestions?.status} />
        )} />
        {errors.status && <p className={errorText}><AlertCircle className="w-3 h-3" />{errors.status.message}</p>}
      </FieldWrapper>

      <FieldWrapper name="replyFromClient">
        <label className={labelBase}>Client Reply</label>
        <Controller name="replyFromClient" control={control} render={({ field }) => (
          <SalesDropdown columnName="replyFromClient" value={field.value} onChange={field.onChange} placeholder="No reply yet" clearable autoOpenOnFocus autoSelectOnTab prioritizedValues={suggestions?.replyFromClient} />
        )} />
      </FieldWrapper>

      <FieldWrapper name="followUps">
        <label className={labelBase}>Follow Up Status</label>
        <Controller name="followUps" control={control} render={({ field }) => (
          <SalesDropdown columnName="followUps" value={field.value} onChange={field.onChange} placeholder="Select follow up" clearable autoOpenOnFocus autoSelectOnTab prioritizedValues={suggestions?.followUps} />
        )} />
      </FieldWrapper>

      <FieldWrapper name="followUpDate">
        <label className={labelBase}>Next Follow Up Date</label>
        <div className="relative group">
          <FormInput
            type="text"
            readOnly
            value={formatSalesDate(watchedFollowUpDate)}
            onClick={() => openDatePicker('followUpDate', 'Select Follow Up Date')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDatePicker('followUpDate', 'Select Follow Up Date'); } }}
            className={`${inputBase} cursor-pointer font-medium pr-10`}
            placeholder="Select date..."
          />
          <Calendar className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400 group-hover:text-blue-500 transition-colors pointer-events-none" />
        </div>
        <input type="hidden" {...register('followUpDate')} />
      </FieldWrapper>

      <FieldWrapper name="rowColor">
        <label className={labelBase}>Row Color</label>
        <div className="flex items-center gap-3 h-11 bg-white dark:bg-gray-900/80 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-500 transition-all px-3">
          <input type="color" {...register('rowColor')} className="w-8 h-8 p-0.5 rounded-lg border border-gray-200 dark:border-gray-600 cursor-pointer hover:scale-105 transition-transform" />
          <span className="text-sm text-gray-400 dark:text-gray-500">Highlight color</span>
        </div>
      </FieldWrapper>
    </div>
  </section>
));
StatusTrackingSection.displayName = 'StatusTrackingSection';

const CustomColumnsSection = React.memo(({ customColumns, control, register, allValues, formatSalesDate, openDatePicker }) => {
  if (!customColumns || customColumns.length === 0) return null;
  return (
    <section>
      <SectionHeader title="Additional Information" icon={LayoutGrid} description="Custom fields" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-4">
        {customColumns.map(col => (
          <FieldWrapper key={col.key} name={col.key}>
            <label className={labelBase}>{col.name}{col.isRequired && <span className={labelRequired}>*</span>}</label>
            {col.type === 'dropdown' ? (
              <Controller name={col.key} control={control} render={({ field }) => (
                <SalesDropdown columnName={col.key} value={field.value} onChange={field.onChange} placeholder={`Select ${col.name}`} clearable />
              )} />
            ) : col.type === 'date' ? (
              <div className="relative group">
                <FormInput
                  type="text"
                  readOnly
                  value={formatSalesDate(allValues[col.key])}
                  onClick={() => openDatePicker(col.key, `Select ${col.name}`)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDatePicker(col.key, `Select ${col.name}`); } }}
                  className={`${inputBase} cursor-pointer font-medium pr-10`}
                  placeholder="Select date..."
                />
                <Calendar className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400 group-hover:text-blue-500 transition-colors pointer-events-none" />
                <input type="hidden" {...register(col.key)} />
              </div>
            ) : col.type === 'number' ? (
              <FormInput type="number" {...register(col.key, { valueAsNumber: true })} className={inputBase} placeholder={`Enter ${col.name}`} />
            ) : col.type === 'link' ? (
              <FormInput type="url" {...register(col.key)} className={inputBase} placeholder="https://..." />
            ) : (
              <FormInput type="text" {...register(col.key)} className={inputBase} placeholder={`Enter ${col.name}`} />
            )}
          </FieldWrapper>
        ))}
      </div>
    </section>
  );
});
CustomColumnsSection.displayName = 'CustomColumnsSection';

const NotesSection = React.memo(({ register }) => (
  <section>
    <SectionHeader title="Notes" icon={MessageSquare} description="Additional context" />
    <FieldWrapper name="comments" className="col-span-1">
      <label className={labelBase}>Comments</label>
      <FormTextarea {...register('comments')} rows={3} className={`${inputBase} h-auto py-2.5 resize-none`} placeholder="Add any relevant notes, context, or observations..." />
    </FieldWrapper>
  </section>
));
NotesSection.displayName = 'NotesSection';

// ────────────────────────────────────────────────────────────
// Main Modal Component
// ────────────────────────────────────────────────────────────
const AddSalesRowModal = ({ isOpen, onClose, editingRow }) => {
  const { createRow, updateRow, dropdownOptions, customColumns, fetchCustomColumns } = useSalesStore();
  const { user } = useContext(AuthContext);
  const { defaults: prefDefaults, getSuggestionsForField, clearCache: clearSuggestionCache } = useSalesPreferences();
  const isEdit = Boolean(editingRow);
  const isAdmin = user?.role === 'admin';
  const formScrollRef = useRef(null);
  const firstFieldRef = useRef(null);

  // Verified users state (admin name selector)
  const [verifiedUsers, setVerifiedUsers] = useState([]);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const userDropdownRef = useRef(null);

  // Date Picker State
  const [datePickerState, setDatePickerState] = useState({
    isOpen: false,
    target: null,
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
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target)) setUserDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userDropdownOpen]);

  // Reset dropdown/search state when modal closes
  useEffect(() => {
    if (!isOpen) { setUserDropdownOpen(false); setUserSearch(''); }
  }, [isOpen]);

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm({
    resolver: zodResolver(salesRowSchemaFlexible),
    defaultValues: isEdit ? { ...defaultValues, ...convertRowForForm(editingRow) } : defaultValues,
    mode: 'onTouched',
  });

  const hasErrors = Object.keys(errors).length > 0;

  // Scroll to first invalid field
  const scrollToFirstError = useCallback((fieldErrors) => {
    const firstKey = Object.keys(fieldErrors)[0];
    if (!firstKey || !formScrollRef.current) return;
    const fieldEl = formScrollRef.current.querySelector(`[data-field="${firstKey}"]`);
    if (fieldEl) {
      fieldEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        const focusable = fieldEl.querySelector('input, button, select, textarea');
        if (focusable) focusable.focus();
      }, 350);
    }
  }, []);

  const onInvalid = useCallback((fieldErrors) => {
    const { message } = getErrorSummary(fieldErrors);
    toast.error(message, { toastId: 'sales-validation', autoClose: 6000 });
    scrollToFirstError(fieldErrors);
  }, [scrollToFirstError]);

  // Ctrl+S / Cmd+S to save + Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        document.getElementById('sales-form')?.requestSubmit();
      }
      if (e.key === 'Escape' && !datePickerState.isOpen) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose, datePickerState.isOpen]);

  // Auto-focus first field when modal opens (after animation)
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      const dateInput = formScrollRef.current?.querySelector('[data-field="date"] input');
      if (dateInput) dateInput.focus();
    }, 350);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Watch fields
  const watchedDate = watch('date');
  const watchedFollowUpDate = watch('followUpDate');
  const allValues = watch();

  // Derive month from date — auto-sync
  const derivedMonth = useMemo(() => {
    return (watchedDate instanceof Date && !isNaN(watchedDate))
      ? MONTH_NAMES[watchedDate.getMonth()]
      : '';
  }, [watchedDate]);

  // Auto-set monthName when derivedMonth changes
  useEffect(() => {
    setValue('monthName', derivedMonth, { shouldDirty: false });
  }, [derivedMonth, setValue]);

  // Filtered verified users for admin name selector
  const filteredUsers = useMemo(() => {
    return verifiedUsers.filter(u => u.name.toLowerCase().includes(userSearch.toLowerCase()));
  }, [verifiedUsers, userSearch]);

  const selectedNameValue = watch('name') || '';

  // ── Smart suggestions per-field (based on current form context) ──
  const [suggestions, setSuggestions] = useState({});
  const watchedPlatform = watch('platform');
  const watchedTechnology = watch('technology');
  const watchedProfile = watch('profile');
  const watchedStatus = watch('status');

  // Re-compute suggestions when key fields change
  useEffect(() => {
    if (!isOpen) return;
    const context = { platform: watchedPlatform, technology: watchedTechnology, profile: watchedProfile, status: watchedStatus };
    const fields = ['platform', 'technology', 'profile', 'status', 'clientLocation', 'replyFromClient', 'followUps'];
    let cancelled = false;
    Promise.all(fields.map(f => getSuggestionsForField(f, context).then(vals => [f, vals])))
      .then(entries => {
        if (!cancelled) setSuggestions(Object.fromEntries(entries));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isOpen, watchedPlatform, watchedTechnology, watchedProfile, watchedStatus, getSuggestionsForField]);

  // Clear suggestion cache when modal opens to get fresh data
  useEffect(() => {
    if (isOpen) clearSuggestionCache();
  }, [isOpen, clearSuggestionCache]);

  const openDatePicker = useCallback((target, title) => {
    setDatePickerState({ isOpen: true, target, title });
  }, []);

  const handleDateSelect = useCallback((dateString) => {
    if (datePickerState.target) {
      if (dateString) {
        const dateObj = parseSalesDate(dateString);
        setValue(datePickerState.target, dateObj, { shouldValidate: true, shouldDirty: true });
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
  }, [datePickerState.target, setValue]);

  // Initialize form on mount / edit change
  useEffect(() => {
    fetchCustomColumns();
    if (isEdit && editingRow) {
      const base = { ...defaultValues, ...convertRowForForm(editingRow) };
      if (customColumns?.length) {
        customColumns.forEach(col => { base[col.key] = editingRow?.[col.key] ?? ''; });
      }
      if (base.date instanceof Date && !isNaN(base.date)) {
        base.monthName = MONTH_NAMES[base.date.getMonth()];
      } else if (editingRow.monthName) {
        base.monthName = editingRow.monthName;
      }
      reset(base);
    } else {
      const base = { ...defaultValues };
      base.name = user?.name || '';
      // Auto-fill today's date for new records
      base.date = new Date();
      base.monthName = MONTH_NAMES[new Date().getMonth()];
      // Apply smart defaults from user preferences (last-used values)
      if (prefDefaults) {
        const prefFields = ['platform', 'technology', 'profile', 'status', 'clientLocation'];
        for (const f of prefFields) {
          if (prefDefaults[f]) base[f] = prefDefaults[f];
        }
      }
      if (customColumns?.length) {
        customColumns.forEach(col => { base[col.key] = ''; });
      }
      reset(base);
    }
  }, [isEdit, editingRow, reset, fetchCustomColumns, customColumns.length]);

  // Keep form in sync when customColumns change while modal is open
  useEffect(() => {
    if (!isOpen) return;
    customColumns.forEach(col => {
      setValue(col.key, editingRow ? (editingRow[col.key] ?? '') : '');
    });
  }, [customColumns, isOpen, editingRow, setValue]);

  const onSubmit = useCallback(async (data) => {
    try {
      if (typeof data.date === 'string') data.date = new Date(data.date);
      if (data.followUpDate && typeof data.followUpDate === 'string') data.followUpDate = new Date(data.followUpDate);
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
      const backendMsg = err?.response?.data?.message;
      if (backendMsg) {
        toast.error(backendMsg, { toastId: 'sales-api-error', autoClose: 6000 });
      } else {
        toast.error('Failed to save record. Please try again.', { toastId: 'sales-api-error' });
      }
      console.error('Save sales row error:', err);
    }
  }, [isEdit, editingRow, customColumns, updateRow, createRow, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center z-50 p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl shadow-black/10 dark:shadow-black/30 w-full max-w-[1100px] max-h-[92vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 border border-gray-200/60 dark:border-gray-700/60">

        {/* ── Header ─────────────────────────────────────── */}
        <div className="px-6 sm:px-8 py-5 border-b border-gray-100 dark:border-gray-700/60 flex items-center justify-between bg-white dark:bg-gray-800 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2.5">
              {isEdit ? 'Edit Sales Record' : 'New Sales Record'}
            </h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {isEdit ? 'Update the details below' : 'Fill in the details to create a new record'}
              <span className="hidden sm:inline"> · Press <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[10px] font-mono mx-0.5">Tab</kbd> to navigate, <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[10px] font-mono mx-0.5">Ctrl+S</kbd> to save</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Scrollable Content ─────────────────────────── */}
        <div ref={formScrollRef} className="overflow-y-auto flex-1 px-6 sm:px-8 py-6 custom-scrollbar scroll-smooth" style={{ scrollPaddingBottom: '80px' }}>
          {/* Error Summary Banner */}
          {hasErrors && (
            <div className="mb-6 p-3.5 bg-red-50 dark:bg-red-900/15 border border-red-200/80 dark:border-red-800/40 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
              <AlertCircle className="w-4.5 h-4.5 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-700 dark:text-red-400">Please fix {Object.keys(errors).length} error{Object.keys(errors).length > 1 ? 's' : ''}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {Object.entries(errors).map(([key, err]) => (
                    <button
                      key={key}
                      type="button"
                      className="text-xs px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-md hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors cursor-pointer"
                      onClick={() => {
                        const el = formScrollRef.current?.querySelector(`[data-field="${key}"]`);
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          setTimeout(() => { el.querySelector('input, button, select, textarea')?.focus(); }, 350);
                        }
                      }}
                    >
                      {SALES_FIELD_LABELS[key] || key}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <form id="sales-form" onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-8">
            <DealDetailsSection
              control={control}
              register={register}
              errors={errors}
              watchedDate={watchedDate}
              derivedMonth={derivedMonth}
              isAdmin={isAdmin}
              loadingUsers={loadingUsers}
              filteredUsers={filteredUsers}
              selectedNameValue={selectedNameValue}
              userDropdownOpen={userDropdownOpen}
              setUserDropdownOpen={setUserDropdownOpen}
              userSearch={userSearch}
              setUserSearch={setUserSearch}
              userDropdownRef={userDropdownRef}
              setValue={setValue}
              formatSalesDate={formatSalesDate}
              openDatePicker={openDatePicker}
              suggestions={suggestions}
            />

            <ClientInfoSection control={control} register={register} errors={errors} suggestions={suggestions} />

            <DealMechanicsSection register={register} errors={errors} />

            <StatusTrackingSection
              control={control}
              register={register}
              errors={errors}
              watchedFollowUpDate={watchedFollowUpDate}
              formatSalesDate={formatSalesDate}
              openDatePicker={openDatePicker}
              suggestions={suggestions}
            />

            <CustomColumnsSection
              customColumns={customColumns}
              control={control}
              register={register}
              allValues={allValues}
              formatSalesDate={formatSalesDate}
              openDatePicker={openDatePicker}
            />

            <NotesSection register={register} />
          </form>
        </div>

        {/* ── Sticky Footer ──────────────────────────────── */}
        <div className="px-6 sm:px-8 py-4 border-t border-gray-100 dark:border-gray-700/60 bg-gray-50/80 dark:bg-gray-800/95 flex items-center justify-between shrink-0">
          <div className="hidden sm:flex items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500">
            <Keyboard className="w-3.5 h-3.5" />
            {hasErrors ? (
              <span className="text-red-400">{Object.keys(errors).length} error{Object.keys(errors).length > 1 ? 's' : ''} remaining</span>
            ) : (
              <span>Ctrl+S to save · Esc to close · Tab to navigate</span>
            )}
          </div>
          <div className="flex gap-3 ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 sm:px-6 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 hover:border-gray-300 dark:hover:border-gray-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="sales-form"
              disabled={isSubmitting}
              className="px-5 sm:px-8 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500/30 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition-all shadow-sm shadow-blue-600/20 hover:shadow-md hover:shadow-blue-600/30 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                isEdit ? 'Save Changes' : 'Create Record'
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
