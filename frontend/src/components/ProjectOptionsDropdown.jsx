import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Plus, Check, X, Trash2, Loader } from 'lucide-react';
import { toast } from 'react-toastify';
import Database from '../services/database';

const ProjectOptionsDropdown = ({
  label,
  icon: Icon,
  value,
  onChange,
  optionType,
  placeholder = 'Select...',
  allowManage = false,
  showLabel = true,
  theme = 'indigo'
}) => {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newOptionLabel, setNewOptionLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const dropdownRef = useRef(null);

  const fetchOptions = async () => {
    setLoading(true);
    try {
      const res = await Database.getProjectDropdownOptions(optionType);
      setOptions(res?.data || []);
    } catch (error) {
      toast.error(error.message || 'Failed to fetch options');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOptions();
  }, [optionType]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
        setIsAdding(false);
        setNewOptionLabel('');
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const selectedOption = useMemo(() => {
    return options.find((opt) => opt.value === value || opt.label === value);
  }, [options, value]);

  const displayValue = selectedOption?.label || value || placeholder;
  const hasValue = Boolean(value);

  const handleSelect = (option) => {
    onChange(option.value);
    setOpen(false);
  };

  const handleAddOption = async () => {
    const trimmed = newOptionLabel.trim();
    if (!trimmed) {
      toast.error('Option cannot be empty');
      return;
    }

    const duplicate = options.some(
      (opt) => opt.label?.toLowerCase() === trimmed.toLowerCase() || opt.value?.toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      toast.error('Option already exists');
      return;
    }

    setSaving(true);
    try {
      const res = await Database.addProjectDropdownOption(optionType, trimmed);
      const created = res?.data;
      if (created) {
        setOptions((prev) => [...prev, created]);
        onChange(created.value);
      }
      setIsAdding(false);
      setNewOptionLabel('');
      toast.success('Option added');
    } catch (error) {
      toast.error(error.message || 'Failed to add option');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOption = async (option) => {
    if (option?.isUsed) {
      toast.error('This option is used by existing projects');
      return;
    }

    const confirmed = window.confirm('Delete this option?');
    if (!confirmed) return;

    setDeletingId(option._id);
    try {
      await Database.deleteProjectDropdownOption(optionType, option._id);
      setOptions((prev) => prev.filter((opt) => opt._id !== option._id));
      if (value === option.value || value === option.label) {
        onChange('');
      }
      toast.success('Option deleted');
    } catch (error) {
      toast.error(error.message || 'Failed to delete option');
    } finally {
      setDeletingId(null);
    }
  };

  const themeClasses = theme === 'blue'
    ? {
        ring: 'focus:ring-blue-500',
        hoverBorder: 'hover:border-blue-300',
        selectedBg: 'bg-blue-50',
        selectedText: 'text-blue-600',
        addHover: 'hover:bg-blue-50',
        addText: 'text-blue-600',
        addButton: 'bg-blue-500 hover:bg-blue-600',
        inputRing: 'focus:ring-blue-500'
      }
    : {
        ring: 'focus:ring-indigo-500',
        hoverBorder: 'hover:border-indigo-300',
        selectedBg: 'bg-indigo-50',
        selectedText: 'text-indigo-600',
        addHover: 'hover:bg-indigo-50',
        addText: 'text-indigo-600',
        addButton: 'bg-indigo-500 hover:bg-indigo-600',
        inputRing: 'focus:ring-indigo-500'
      };

  return (
    <div className={showLabel ? 'space-y-2' : ''} ref={dropdownRef}>
      {showLabel && (
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          {Icon && <Icon className="h-4 w-4 text-indigo-600" />}
          {label}
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className={`w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 transition-all bg-white flex items-center justify-between ${themeClasses.ring} ${themeClasses.hoverBorder}`}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className={hasValue ? 'text-gray-900' : 'text-gray-400'}>{displayValue}</span>
          <ChevronDown size={16} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-3 text-sm text-gray-500 flex items-center gap-2">
                <Loader size={14} className="animate-spin" /> Loading options...
              </div>
            ) : options.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-500">No options available</div>
            ) : (
              options.map((option) => {
                const isSelected = option.value === value || option.label === value;
                return (
                  <div
                    key={option._id}
                    className={`flex items-center justify-between px-4 py-2 text-sm cursor-pointer transition-colors ${
                      isSelected ? `${themeClasses.selectedBg} ${themeClasses.selectedText}` : 'hover:bg-gray-50 text-gray-700'
                    }`}
                    onClick={() => handleSelect(option)}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <span>{option.label}</span>
                    {allowManage && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteOption(option);
                        }}
                        disabled={deletingId === option._id || option.isUsed}
                        title={option.isUsed ? 'Option is used by existing projects' : 'Delete option'}
                        className={`p-1 rounded-md transition-colors ${
                          option.isUsed
                            ? 'text-gray-300 cursor-not-allowed'
                            : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                        }`}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                );
              })
            )}

            {allowManage && (
              <div className="border-t border-gray-100 p-2">
                {isAdding ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newOptionLabel}
                      onChange={(e) => setNewOptionLabel(e.target.value)}
                      placeholder="Enter value..."
                      className={`flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 ${themeClasses.inputRing}`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddOption();
                        if (e.key === 'Escape') {
                          setIsAdding(false);
                          setNewOptionLabel('');
                        }
                      }}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleAddOption}
                      disabled={saving}
                      className={`p-2 rounded-lg text-white disabled:opacity-60 ${themeClasses.addButton}`}
                      title="Save"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAdding(false);
                        setNewOptionLabel('');
                      }}
                      className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
                      title="Cancel"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsAdding(true)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg ${themeClasses.addText} ${themeClasses.addHover}`}
                  >
                    <Plus size={14} /> Add new option
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectOptionsDropdown;
