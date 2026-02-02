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
  const { createRow, updateRow, dropdownOptions, customColumns, fetchCustomColumns } = useSalesStore();
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
    } else {
      const base = { ...defaultValues };
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
      console.error(err);
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
        <div className="overflow-y-auto flex-1 p-8 custom-scrollbar bg-gradient-to-b from-transparent via-blue-50/10 to-transparent dark:via-blue-900/5">
          <form id="sales-form" onSubmit={handleSubmit(onSubmit)} className="space-y-10">
            
            {/* Deal Details Section */}
            <div>
              <SectionHeader title="Deal Details" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                 <div className="col-span-1">
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
                        className="input w-full bg-gray-50 dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl cursor-pointer transition-all hover:border-blue-300 dark:hover:border-blue-600 font-medium"
                        placeholder="dd-mm-yyyy"
                    />
                    <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors pointer-events-none" />
                  </div>
                  {/* Hidden input to register with hook form if needed, but we used setValue. 
                      However, we are not using register('date') anymore on the visible input because it's read-only and formatted.
                      We need to register the field so it exists in formData.
                  */}
                  <input type="hidden" {...register('date')} />
                  {errors.date && <p className="text-red-500 text-xs mt-1">{errors.date.message}</p>}
                </div>

                <div className="col-span-1">
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
                      />
                    )}
                  />
                  {errors.platform && <p className="text-red-500 text-xs mt-1">{errors.platform.message}</p>}
                </div>

                <div className="col-span-1">
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
                      />
                    )}
                  />
                   {errors.technology && <p className="text-red-500 text-xs mt-1">{errors.technology.message}</p>}
                </div>

                <div className="col-span-1">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Profile</label>
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
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Bid Link</label>
                  <input type="url" placeholder="https://..." {...register('bidLink')} className="input w-full bg-gray-50 dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl transition-all hover:border-blue-300 dark:hover:border-blue-600" />
                   {errors.bidLink && <p className="text-red-500 text-xs mt-1">{errors.bidLink.message}</p>}
                </div>
              </div>
            </div>

            {/* Client Info Section */}
            <div>
              <SectionHeader title="Client Information" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                 <div className="col-span-1">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Rating (0-5)</label>
                  <input type="number" min={0} max={5} step="0.5" {...register('clientRating', { valueAsNumber: true })} className="input w-full bg-gray-50 dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl transition-all hover:border-blue-300 dark:hover:border-blue-600" />
                </div>
                
                <div className="col-span-1">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Hire Rate (%)</label>
                   <input type="number" min={0} max={100} {...register('clientHireRate', { valueAsNumber: true })} className="input w-full bg-gray-50 dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl transition-all hover:border-blue-300 dark:hover:border-blue-600" />
                </div>

                <div className="col-span-1">
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
                      />
                    )}
                  />
                </div>

                <div className="col-span-1">
                   <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Budget</label>
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
                   <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Spending</label>
                   <input type="text" {...register('clientSpending')} className="input w-full bg-gray-50 dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl transition-all hover:border-blue-300 dark:hover:border-blue-600" />
                </div>
              </div>
            </div>

            {/* Deal Mechanics */}
             <div>
              <SectionHeader title="Deal Mechanics" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                 <div className="col-span-1">
                   <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Rate ($)</label>
                   <input type="number" min={0} {...register('rate', { valueAsNumber: true })} className="input w-full bg-gray-50 dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl transition-all hover:border-blue-300 dark:hover:border-blue-600" />
                </div>
                 <div className="col-span-1">
                   <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Connects</label>
                   <input type="number" min={0} {...register('connects', { valueAsNumber: true })} className="input w-full bg-gray-50 dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl transition-all hover:border-blue-300 dark:hover:border-blue-600" />
                </div>
                 <div className="col-span-1 lg:col-span-1">
                   <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Proposal Screenshot</label>
                   <input type="url" placeholder="https://..." {...register('proposalScreenshot')} className="input w-full bg-gray-50 dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl transition-all hover:border-blue-300 dark:hover:border-blue-600" />
                </div>
              </div>
            </div>

            {/* Status & Tracking */}
            <div>
              <SectionHeader title="Status & Tracking" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                 <div className="col-span-1">
                  <label className=" text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                    Current Status
                    <span className="text-red-500 font-bold">*</span>
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
                      />
                    )}
                  />
                   {errors.status && <p className="text-red-500 text-xs mt-1">{errors.status.message}</p>}
                </div>

                <div className="col-span-1">
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
                      />
                    )}
                  />
                </div>

                 <div className="col-span-1">
                   <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Row Color</label>
                   <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition-all">
                     <input type="color" {...register('rowColor')} className="w-12 h-12 p-1 rounded-lg border-2 border-gray-300 dark:border-gray-600 cursor-pointer hover:scale-110 transition-transform" />
                     <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">Pick a highlight color</span>
                   </div>
                </div>

                <div className="col-span-1">
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
                      />
                    )}
                  />
                </div>

                 <div className="col-span-1">
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
                 <div className="col-span-1">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Comments</label>
                    <textarea {...register('comments')} rows={4} className="input w-full bg-gray-50 dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl resize-none transition-all hover:border-blue-300 dark:hover:border-blue-600" placeholder="Add any relevant notes here..."></textarea>
                 </div>
               </div>
            </div>

          </form>
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-gray-100 dark:border-gray-700 bg-gradient-to-r from-gray-50 via-blue-50/30 to-gray-50 dark:from-gray-800 dark:via-blue-900/10 dark:to-gray-800 flex justify-end gap-4 rounded-b-3xl shadow-inner">
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
