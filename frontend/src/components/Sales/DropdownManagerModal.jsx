
import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Edit2, GripVertical, ArrowUp, ArrowDown } from 'lucide-react';
import useSalesStore from '../../store/salesStore';

const DropdownManagerModal = ({ isOpen, onClose }) => {
  const { customColumns, fetchCustomColumns, dropdownOptions, fetchDropdownOptions, addDropdownOption, updateDropdownOption, deleteDropdownOption } = useSalesStore();
  const [selectedColumn, setSelectedColumn] = useState('');
  const [options, setOptions] = useState([]);
  const [newOption, setNewOption] = useState({ label: '', value: '', color: '#6B7280' });
  const [editingOption, setEditingOption] = useState(null);
  const [editValue, setEditValue] = useState({ label: '', value: '', color: '#6B7280' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchCustomColumns();
    }
  }, [isOpen, fetchCustomColumns]);

  useEffect(() => {
    if (selectedColumn) {
      setLoading(true);
      fetchDropdownOptions(selectedColumn)
        .then(() => setLoading(false))
        .catch(() => setLoading(false));
    }
  }, [selectedColumn, fetchDropdownOptions]);

  useEffect(() => {
    if (selectedColumn && dropdownOptions[selectedColumn]) {
      setOptions(dropdownOptions[selectedColumn]);
    } else {
      setOptions([]);
    }
  }, [dropdownOptions, selectedColumn]);

  const handleAddOption = async () => {
    if (!newOption.label.trim()) {
      setError('Label is required');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await addDropdownOption(selectedColumn, newOption);
      setNewOption({ label: '', value: '', color: '#6B7280' });
    } catch (err) {
      setError('Failed to add option');
    } finally {
      setLoading(false);
    }
  };

  const handleEditOption = (option) => {
    setEditingOption(option._id);
    setEditValue({ label: option.label, value: option.value, color: option.color || '#6B7280' });
  };

  const moveOption = (from, to) => {
    if (to < 0 || to >= options.length) return;
    const next = [...options];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setOptions(next);
  };

  const handleSaveOrder = async () => {
    setLoading(true);
    try {
      await Promise.all(options.map((opt, idx) => updateDropdownOption(selectedColumn, opt._id, { order: idx })));
      await fetchDropdownOptions(selectedColumn);
    } catch (err) {
      setError('Failed to save order');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateOption = async (optionId) => {
    if (!editValue.label.trim()) {
      setError('Label is required');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await updateDropdownOption(selectedColumn, optionId, editValue);
      setEditingOption(null);
    } catch (err) {
      setError('Failed to update option');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteOption = async (optionId) => {
    setLoading(true);
    try {
      await deleteDropdownOption(selectedColumn, optionId);
    } catch (err) {
      setError('Failed to delete option');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-sm bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full m-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Manage Dropdown Options</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Select Column</label>
            <select
              className="input w-full"
              value={selectedColumn}
              onChange={e => setSelectedColumn(e.target.value)}
            >
              <option value="">-- Select --</option>
              {customColumns.filter(col => col.type === 'dropdown').map(col => (
                <option key={col.key} value={col.key}>{col.name}</option>
              ))}
            </select>
          </div>

          {selectedColumn && (
            <>
              <div className="mb-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold mb-2">Options</h3>
                  <div className="flex items-center gap-2">
                    <button onClick={handleSaveOrder} disabled={loading} className="px-2 py-1 border rounded text-sm bg-gray-50 hover:bg-gray-100">Save Order</button>
                  </div>
                </div>
                {loading ? (
                  <div className="text-gray-500">Loading...</div>
                ) : (
                  <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                    {options.map((option, idx) => (
                      <li key={option._id} className="flex items-center gap-2 py-2">
                        <GripVertical className="w-4 h-4 text-gray-400" title="Reorder" />
                        <button onClick={() => moveOption(idx, idx - 1)} className="p-1 text-gray-500 hover:text-gray-700" title="Move up"><ArrowUp className="w-4 h-4" /></button>
                        <button onClick={() => moveOption(idx, idx + 1)} className="p-1 text-gray-500 hover:text-gray-700" title="Move down"><ArrowDown className="w-4 h-4" /></button>
                        {editingOption === option._id ? (
                          <>
                            <input
                              className="input w-32"
                              value={editValue.label}
                              onChange={e => setEditValue(v => ({ ...v, label: e.target.value }))}
                              placeholder="Label"
                            />
                            <input
                              className="input w-24"
                              value={editValue.value}
                              onChange={e => setEditValue(v => ({ ...v, value: e.target.value }))}
                              placeholder="Value"
                            />
                            <input
                              type="color"
                              className="w-8 h-8 border-none bg-transparent"
                              value={editValue.color}
                              onChange={e => setEditValue(v => ({ ...v, color: e.target.value }))}
                            />
                            <button onClick={() => handleUpdateOption(option._id)} className="ml-2 px-2 py-1 bg-green-600 text-white rounded">Save</button>
                            <button onClick={() => setEditingOption(null)} className="ml-1 px-2 py-1 border rounded">Cancel</button>
                          </>
                        ) : (
                          <>
                            <span className="w-32 truncate" title={option.label}>{option.label}</span>
                            <span className="w-24 truncate text-gray-500" title={option.value}>{option.value}</span>
                            <span className="inline-block w-6 h-6 rounded-full border" style={{ background: option.color || '#6B7280' }} title={option.color}></span>
                            <button onClick={() => handleEditOption(option)} className="ml-2 text-blue-600 hover:text-blue-800"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => handleDeleteOption(option._id)} className="ml-1 text-red-600 hover:text-red-800"><Trash2 className="w-4 h-4" /></button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex items-center gap-2 mb-2">
                <input
                  className="input w-32"
                  value={newOption.label}
                  onChange={e => setNewOption(v => ({ ...v, label: e.target.value }))}
                  placeholder="Label"
                />
                <input
                  className="input w-24"
                  value={newOption.value}
                  onChange={e => setNewOption(v => ({ ...v, value: e.target.value }))}
                  placeholder="Value"
                />
                <input
                  type="color"
                  className="w-8 h-8 border-none bg-transparent"
                  value={newOption.color}
                  onChange={e => setNewOption(v => ({ ...v, color: e.target.value }))}
                />
                <button onClick={handleAddOption} className="px-2 py-1 bg-blue-600 text-white rounded flex items-center gap-1"><Plus className="w-4 h-4" />Add</button>
              </div>
              {error && <div className="text-red-500 text-sm mb-2">{error}</div>}
            </>
          )}

          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DropdownManagerModal;
