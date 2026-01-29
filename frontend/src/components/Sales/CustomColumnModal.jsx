import React, { useEffect } from 'react';
import { X, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
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
  const { register, control, handleSubmit, watch, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: '', type: 'dropdown', allowCustom: false, options: [] }
  });

  const { fields, append, remove, move } = useFieldArray({ control, name: 'options' });
  const type = watch('type');

  useEffect(() => {
    if (!isOpen) {
      reset({ name: '', type: 'dropdown', allowCustom: false, options: [] });
    }
  }, [isOpen, reset]);

  const onSubmit = async (data) => {
    const payload = {
      name: data.name.trim(),
      key: slugify(data.name.trim()),
      type: data.type,
      allowCustom: !!data.allowCustom,
      options: data.type === 'dropdown' ? (data.options || []).map((o, idx) => ({ ...o, order: idx })) : []
    };

    try {
      await createCustomColumn(payload);
      onClose();
    } catch (err) {
      console.error('Failed to create column', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-sm bg-opacity-50 flex items-center justify-center z-50">
      <form onSubmit={handleSubmit(onSubmit)} className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full m-4">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Create Custom Column</h2>
            <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Column Name</label>
              <input className="input w-full" {...register('name')} />
              {errors.name && <div className="text-red-500 text-sm mt-1">{errors.name.message}</div>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Column Type</label>
              <select className="input w-full" {...register('type')}>
                <option value="dropdown">Dropdown</option>
                <option value="date">Date</option>
                <option value="text">Text</option>
                <option value="link">Link</option>
                <option value="number">Number</option>
              </select>
            </div>

            {type === 'dropdown' && (
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  <strong>Note:</strong> You can add options dynamically when adding or editing rows.
                </p>
                <div className="mt-2 hidden">
                   {/* Hidden but kept in form structure if needed for validation or we just remove fields */}
                   <input type="checkbox" {...register('allowCustom')} checked={true} readOnly className="hidden" />
                </div>
              </div>
            )}

            <div>
              <p className="text-sm text-gray-500">Preview: Column key will be auto-generated from name.</p>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-green-600 text-white rounded-lg">Create Column</button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default CustomColumnModal;
