import React, { useEffect } from 'react';
import { X, Calendar } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import DatePickerModal from '../DatePickerModal';
import { formatSalesDate, parseSalesDate } from '../../utils/dateUtils';
import { zodResolver } from '@hookform/resolvers/zod';
import { salesRowSchemaFlexible } from '../../utils/salesValidation';
import useSalesStore from '../../store/salesStore';
import SalesDropdown from './SalesDropdown';

const defaultValues = {
  date: '',
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
  followUpDate: '',
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
  const { createRow, updateRow, dropdownOptions, customColumns, fetchCustomColumns, lockRow, unlockRow } = useSalesStore();
  const isEdit = Boolean(editingRow);
  const [activeSection, setActiveSection] = React.useState('all'); // 'all' | 'deal' | 'client' | 'status'
  
  // Date Picker State
  const [datePickerState, setDatePickerState] = React.useState({
    isOpen: false,
    target: null, // 'date' | 'followUpDate' | customColumnKey
    title: ''
  });

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
  });

  // Watch date fields for display
  const watchedDate = watch('date');
  const watchedFollowUpDate = watch('followUpDate');
  // We need to watch all fields to support custom columns potentially, but for now we can just rely on getValues or specific watches if needed.
  // Actually, for custom columns, we might need to watch them dynamically or just pass current value to the renderer.
  // Using watch() without arguments watches everything, but might be performance heavy.
  // Instead, we'll watch specific known dates, and for custom columns we can use Controller or watch specifically.
  // Let's use `watch()` to get all values for rendering custom date fields correctly.
  const allValues = watch();

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
      } else {
          setValue(datePickerState.target, null, { shouldValidate: true, shouldDirty: true });
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
      reset(base);

      // Lock row
      // Use isMounted to prevent unlocking if we unmount before lock is acquired
      // Use hasLock to ensure we only unlock if we successfully locked it
      let hasLock = false;
      let isMounted = true;

      lockRow(editingRow._id)
          .then(() => {
              if (isMounted) {
                  hasLock = true;
              } else {
                  // If unmounted *after* lock request started but *before* it finished:
                  // The lock succeeded, but we are gone. Unlocking immediately.
                  unlockRow(editingRow._id).catch(() => {});
              }
          })
          .catch((err) => {
             // Silently fail or handle if needed (e.g. 423 Locked)
             console.log("Failed to lock row:", err?.response?.data?.message || err.message);
          });

      return () => {
        isMounted = false;
        if (hasLock) {
           unlockRow(editingRow._id).catch(() => {});
        }
      };
    } else {
      const base = { ...defaultValues };
      if (customColumns && customColumns.length) {
        customColumns.forEach(col => { base[col.key] = ''; });
      }
      reset(base);
    }
  }, [isEdit, editingRow, reset, fetchCustomColumns, customColumns.length, lockRow, unlockRow]);

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
      console.error(err);
    }
  };

  if (!isOpen) return null;

  const SectionHeader = ({ title, icon: Icon }) => (
    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
      {Icon && <Icon className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
      <h3 className="font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
    </div>
  );

  return (
    <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-white dark:bg-gray-800 sticky top-0 z-10">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              {isEdit ? 'Edit Record' : 'New Sales Record'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isEdit ? 'Update the details below' : 'Fill in the information to add a new sales record'}
            </p>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* content */}
        <div className="overflow-y-auto flex-1 p-6 custom-scrollbar">
          <form id="sales-form" onSubmit={handleSubmit(onSubmit)} className="space-y-8">
            
            {/* Deal Details Section */}
            <div>
              <SectionHeader title="Deal Details" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                 <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Date<span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input 
                        type="text" 
                        readOnly
                        value={formatSalesDate(watchedDate)}
                        onClick={() => openDatePicker('date', 'Select Deal Date')}
                        className="input w-full bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:ring-blue-500 rounded-lg cursor-pointer"
                        placeholder="dd-mm-yyyy"
                    />
                    <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                  {/* Hidden input to register with hook form if needed, but we used setValue. 
                      However, we are not using register('date') anymore on the visible input because it's read-only and formatted.
                      We need to register the field so it exists in formData.
                  */}
                  <input type="hidden" {...register('date')} />
                  {errors.date && <p className="text-red-500 text-xs mt-1">{errors.date.message}</p>}
                </div>

                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Platform<span className="text-red-500">*</span></label>
                  <Controller
                    name="platform"
                    control={control}
                    render={({ field }) => (
                      <SalesDropdown
                        columnName="platform"
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Select Platform"
                      />
                    )}
                  />
                  {errors.platform && <p className="text-red-500 text-xs mt-1">{errors.platform.message}</p>}
                </div>

                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Technology<span className="text-red-500">*</span></label>
                  <Controller
                    name="technology"
                    control={control}
                    render={({ field }) => (
                      <SalesDropdown
                        columnName="technology"
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Select Tech"
                      />
                    )}
                  />
                   {errors.technology && <p className="text-red-500 text-xs mt-1">{errors.technology.message}</p>}
                </div>

                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Profile</label>
                  <Controller
                    name="profile"
                    control={control}
                    render={({ field }) => (
                      <SalesDropdown
                        columnName="profile"
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Select Profile"
                      />
                    )}
                  />
                </div>

                <div className="col-span-1 lg:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Bid Link</label>
                  <input type="url" placeholder="https://..." {...register('bidLink')} className="input w-full bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:ring-blue-500 rounded-lg" />
                   {errors.bidLink && <p className="text-red-500 text-xs mt-1">{errors.bidLink.message}</p>}
                </div>
              </div>
            </div>

            {/* Client Info Section */}
            <div>
              <SectionHeader title="Client Information" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                 <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Rating (0-5)</label>
                  <input type="number" min={0} max={5} step="0.5" {...register('clientRating', { valueAsNumber: true })} className="input w-full bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:ring-blue-500 rounded-lg" />
                </div>
                
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Hire Rate (%)</label>
                   <input type="number" min={0} max={100} {...register('clientHireRate', { valueAsNumber: true })} className="input w-full bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:ring-blue-500 rounded-lg" />
                </div>

                <div className="col-span-1">
                   <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Location</label>
                   <Controller
                    name="clientLocation"
                    control={control}
                    render={({ field }) => (
                      <SalesDropdown
                        columnName="clientLocation"
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Select Location"
                      />
                    )}
                  />
                </div>

                <div className="col-span-1">
                   <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Budget</label>
                   <Controller
                    name="clientBudget"
                    control={control}
                    render={({ field }) => (
                      <SalesDropdown
                        columnName="clientBudget"
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Select Budget"
                      />
                    )}
                  />
                </div>
                
                 <div className="col-span-1">
                   <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Spending</label>
                   <input type="text" {...register('clientSpending')} className="input w-full bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:ring-blue-500 rounded-lg" />
                </div>
              </div>
            </div>

            {/* Deal Mechanics */}
             <div>
              <SectionHeader title="Deal Mechanics" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                 <div className="col-span-1">
                   <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Rate ($)</label>
                   <input type="number" min={0} {...register('rate', { valueAsNumber: true })} className="input w-full bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:ring-blue-500 rounded-lg" />
                </div>
                 <div className="col-span-1">
                   <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Connects</label>
                   <input type="number" min={0} {...register('connects', { valueAsNumber: true })} className="input w-full bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:ring-blue-500 rounded-lg" />
                </div>
                 <div className="col-span-1 lg:col-span-1">
                   <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Proposal Screenshot</label>
                   <input type="url" placeholder="https://..." {...register('proposalScreenshot')} className="input w-full bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:ring-blue-500 rounded-lg" />
                </div>
              </div>
            </div>

            {/* Status & Tracking */}
            <div>
              <SectionHeader title="Status & Tracking" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                 <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Current Status<span className="text-red-500">*</span></label>
                  <Controller
                    name="status"
                    control={control}
                    render={({ field }) => (
                      <SalesDropdown
                        columnName="status"
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Select Status"
                      />
                    )}
                  />
                   {errors.status && <p className="text-red-500 text-xs mt-1">{errors.status.message}</p>}
                </div>

                <div className="col-span-1">
                   <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Client Reply</label>
                   <Controller
                    name="replyFromClient"
                    control={control}
                    render={({ field }) => (
                      <SalesDropdown
                        columnName="replyFromClient"
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="No Reply Yet"
                      />
                    )}
                  />
                </div>

                 <div className="col-span-1">
                   <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Row Color</label>
                   <div className="flex items-center gap-3">
                     <input type="color" {...register('rowColor')} className="w-10 h-10 p-0.5 rounded border border-gray-200 cursor-pointer" />
                     <span className="text-sm text-gray-500">Pick a highlight color</span>
                   </div>
                </div>

                <div className="col-span-1">
                   <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Follow Up Status</label>
                   <Controller
                    name="followUps"
                    control={control}
                    render={({ field }) => (
                      <SalesDropdown
                        columnName="followUps"
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Select Follow Up"
                      />
                    )}
                  />
                </div>

                 <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Next Follow Up Date</label>
                  <div className="relative">
                    <input 
                        type="text" 
                        readOnly
                        value={formatSalesDate(watchedFollowUpDate)}
                        onClick={() => openDatePicker('followUpDate', 'Select Follow Up Date')}
                        className="input w-full bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:ring-blue-500 rounded-lg cursor-pointer"
                        placeholder="dd-mm-yyyy"
                    />
                     <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                  <input type="hidden" {...register('followUpDate')} />
                </div>
              </div>
            </div>

            {/* Comments & Extras */}
            <div>
               <SectionHeader title="Additional Notes" />
               <div className="grid grid-cols-1 gap-5">
                 <div className="col-span-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Comments</label>
                    <textarea {...register('comments')} rows={3} className="input w-full bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:ring-blue-500 rounded-lg resize-none" placeholder="Add any relevant notes here..."></textarea>
                 </div>
                  {/* Custom Columns */}
                  {customColumns && customColumns.length > 0 && (
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-2 pt-4 border-t border-dashed border-gray-200 dark:border-gray-700">
                        {customColumns.map(col => (
                            <div key={col.key}>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{col.name}{col.isRequired ? <span className="text-red-500">*</span> : null}</label>
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
                                      />
                                    )}
                                  />
                              ) : col.type === 'date' ? (
                                <div className="relative">
                                    <input 
                                        type="text" 
                                        readOnly
                                        value={formatSalesDate(allValues[col.key])} // Accesing value from watch() result
                                        onClick={() => openDatePicker(col.key, `Select ${col.name}`)}
                                        className="input w-full bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:ring-blue-500 rounded-lg cursor-pointer"
                                        placeholder="dd-mm-yyyy"
                                    />
                                     <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                                     <input type="hidden" {...register(col.key)} />
                                </div>
                              ) : col.type === 'number' ? (
                                <input type="number" {...register(col.key, { valueAsNumber: true })} className="input w-full bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:ring-blue-500 rounded-lg" />
                              ) : col.type === 'link' ? (
                                <input type="url" {...register(col.key)} className="input w-full bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:ring-blue-500 rounded-lg" />
                              ) : (
                                <input type="text" {...register(col.key)} className="input w-full bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:ring-blue-500 rounded-lg" />
                              )}
                            </div>
                        ))}
                     </div>
                  )}
               </div>
            </div>

          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-end gap-3 rounded-b-2xl">
           <button
             type="button"
             onClick={onClose}
             disabled={isSubmitting}
             className="px-6 py-2.5 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors shadow-sm"
           >
             Cancel
           </button>
           <button
             type="submit"
             form="sales-form"
             disabled={isSubmitting}
             className="px-6 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 focus:ring-4 focus:ring-blue-500/20 transition-all shadow-md shadow-blue-500/20 disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
           >
             {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                  <span>Saving...</span>
                </>
             ) : (
                <span>{isEdit ? 'Save Changes' : 'Create Record'}</span>
             )}
           </button>
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
