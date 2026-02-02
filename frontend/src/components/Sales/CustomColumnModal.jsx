import React, { useEffect, useState } from 'react';
import { X, Plus, Trash2, ArrowUp, ArrowDown, Edit2 } from 'lucide-react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import useSalesStore from '../../store/salesStore';

const schema = z.object({
  name: z.string().min(1, 'Column name is required'),
  type: z.enum(['dropdown', 'date', 'text', 'link', 'number']),
  allowCustom: z.boolean().optional(),
  options: z.array(
    z.object({
      label: z.string().min(1, 'Label required'),
      value: z.string().optional(),
      color: z.string().optional()
    })
  ).optional()
});

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const CustomColumnModal = ({ isOpen, onClose }) => {
  const createCustomColumn = useSalesStore(state => state.createCustomColumn);
  const updateCustomColumn = useSalesStore(state => state.updateCustomColumn);
  const deleteCustomColumn = useSalesStore(state => state.deleteCustomColumn);
  const customColumns = useSalesStore(state => state.customColumns);
  const fetchCustomColumns = useSalesStore(state => state.fetchCustomColumns);
  
  const [editingColumn, setEditingColumn] = useState(null);
  
  const { register, control, handleSubmit, watch, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: '', type: 'dropdown', allowCustom: false, options: [] }
  });

  const { fields, append, remove, move } = useFieldArray({ control, name: 'options' });
  const type = watch('type');

  useEffect(() => {
    if (isOpen) {
      fetchCustomColumns();
      return;
    }

    reset({ name: '', type: 'dropdown', allowCustom: false, options: [] });
    setEditingColumn(null);
  }, [isOpen, reset, fetchCustomColumns]);

  const handleEditColumn = (col) => {
    setEditingColumn(col);
    reset({ 
      name: col.name, 
      type: col.type, 
      allowCustom: col.allowCustom || false, 
      options: col.options || [] 
    });
  };

  const handleCancelEdit = () => {
    setEditingColumn(null);
    reset({ name: '', type: 'dropdown', allowCustom: false, options: [] });
  };

  const handleDeleteColumn = async (columnId) => {
    const confirmed = window.confirm('Are you sure you want to delete this custom column?');
    if (!confirmed) return;

    try {
      await deleteCustomColumn(columnId);
    } catch (err) {
      console.error('Failed to delete column', err);
    }
  };

  const onSubmit = async (data) => {
    const payload = {
      name: data.name.trim(),
      type: data.type,
      allowCustom: !!data.allowCustom,
      options: data.type === 'dropdown' ? (data.options || []).map((o, idx) => ({ ...o, order: idx })) : []
    };

    // Only add key for new columns
    if (!editingColumn) {
      payload.key = slugify(data.name.trim());
    }

    try {
      if (editingColumn) {
        await updateCustomColumn(editingColumn._id, payload);
      } else {
        await createCustomColumn(payload);
      }
      handleCancelEdit();
      reset({ name: '', type: 'dropdown', allowCustom: false, options: [] });
    } catch (err) {
      console.error('Failed to save column', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-md bg-black/40 flex items-center justify-center z-50 animate-in fade-in duration-300">
      <form onSubmit={handleSubmit(onSubmit)} className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-3xl w-full m-4 border border-gray-200/50 dark:border-gray-700/50 animate-in zoom-in-95 duration-300">
        <div className="p-8">
          <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-gradient-to-r from-blue-100 via-indigo-100 to-blue-100 dark:from-blue-900/30 dark:via-indigo-900/30 dark:to-blue-900/30">
            <div>
              <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
                {editingColumn ? '✏️ Edit Custom Column' : '🔧 Create Custom Column'}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {editingColumn ? 'Update the column details below' : 'Add custom fields to your sales tracking'}
              </p>
            </div>
            <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 p-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all hover:scale-110 hover:rotate-90 duration-200">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Column Name</label>
              <input className="input w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all hover:border-blue-300 dark:hover:border-blue-600 font-medium" {...register('name')} placeholder="Enter column name" />
              {errors.name && <div className="text-red-500 text-sm mt-2 font-medium">{errors.name.message}</div>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Column Type</label>
              <select className="input w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all hover:border-blue-300 dark:hover:border-blue-600 cursor-pointer font-medium" {...register('type')}>
                <option value="dropdown">📋 Dropdown</option>
                <option value="date">📅 Date</option>
                <option value="text">📝 Text</option>
                <option value="link">🔗 Link</option>
                <option value="number">🔢 Number</option>
              </select>
            </div>

            {type === 'dropdown' && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-5 rounded-2xl border-2 border-blue-200 dark:border-blue-800 shadow-sm">
                <p className="text-sm text-blue-700 dark:text-blue-300 font-medium leading-relaxed">
                  💡 <strong>Note:</strong> You can add options dynamically when adding or editing rows.
                </p>
                <div className="mt-2 hidden">
                   {/* Hidden but kept in form structure if needed for validation or we just remove fields */}
                   <input type="checkbox" {...register('allowCustom')} checked={true} readOnly className="hidden" />
                </div>
              </div>
            )}
            {customColumns && customColumns.length > 0 && (
              <div className="bg-gradient-to-br from-gray-50 to-blue-50/30 dark:from-gray-900/30 dark:to-blue-900/10 p-5 rounded-2xl border-2 border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                    📊 Existing Custom Columns
                  </h3>
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 px-3 py-1 rounded-full">{customColumns.length}</span>
                </div>
                <div className="space-y-2.5 max-h-48 overflow-y-auto custom-scrollbar">
                  {customColumns.map((col) => (
                    <div key={col._id} className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 px-4 py-3 hover:border-blue-300 dark:hover:border-blue-600 transition-all shadow-sm hover:shadow-md group">
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{col.name}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase">{col.type}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleEditColumn(col)}
                          className="text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 p-2 rounded-lg transition-all opacity-0 group-hover:opacity-100 hover:scale-110"
                          aria-label={`Edit ${col.name}`}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteColumn(col._id)}
                          className="text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 p-2 rounded-lg transition-all opacity-0 group-hover:opacity-100 hover:scale-110"
                          aria-label={`Delete ${col.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium italic">✨ Preview: Column key will be auto-generated from name.</p>
            </div>
          </div>

          <div className="mt-8 flex justify-end gap-4 pt-6 border-t-2 border-gray-100 dark:border-gray-700">
            <button type="button" onClick={onClose} className="px-6 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold transition-all hover:scale-105 shadow-sm hover:shadow-md">Cancel</button>
            {editingColumn && (
              <button type="button" onClick={handleCancelEdit} className="px-6 py-3 border-2 border-orange-300 dark:border-orange-600 rounded-xl hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300 font-semibold transition-all hover:scale-105 shadow-sm hover:shadow-md">Clear Edit</button>
            )}
            <button type="submit" disabled={isSubmitting} className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-bold hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg shadow-green-500/30 hover:shadow-xl hover:shadow-green-500/40 hover:scale-105 disabled:opacity-70 disabled:cursor-not-allowed">
              {editingColumn ? '💾 Update Column' : '✨ Create Column'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default CustomColumnModal;
