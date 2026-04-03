import React, { useState, useEffect, useContext, useMemo, useCallback } from 'react';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '../ui/select';
import { Plus, X, Check, Trash2, Search } from 'lucide-react';
import useSalesStore from '../../store/salesStore';
import { toast } from 'react-toastify';
import AuthContext from '../../context/AuthContext';
import DeletePopup from '../ui/DeletePopup';

const SalesDropdown = ({ columnName, value, onChange, placeholder, disabled, error }) => {
  const { fetchDropdownOptions, addDropdownOption, deleteDropdownOption, dropdownOptions } = useSalesStore();
  const { user } = useContext(AuthContext);
  const isAdmin = user?.role?.toLowerCase() === 'admin';
  const options = dropdownOptions[columnName] || [];
  const [isAdding, setIsAdding] = useState(false);
  const [newOption, setNewOption] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Filter options based on search term
  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) return options;
    const term = searchTerm.toLowerCase();
    return options.filter(opt => opt.label.toLowerCase().includes(term));
  }, [options, searchTerm]);

  // Clear search when dropdown opens/closes
  const handleOpenChange = useCallback((open) => {
    if (open) {
      setSearchTerm('');
      setIsAdding(false);
      setNewOption('');
    }
  }, []);

  useEffect(() => {
    if (columnName) {
      // Ensure options are loaded
      fetchDropdownOptions(columnName);
    }
  }, [columnName, fetchDropdownOptions]);

  const handleAddOption = async (e) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent select closing
    
    if (!newOption.trim()) return;
    
    // Check if duplicate
    if (options.some(opt => opt.value.toLowerCase() === newOption.trim().toLowerCase())) {
        toast.error('Option already exists');
        return;
    }

    try {
        const optionData = { label: newOption.trim(), value: newOption.trim() };
        await addDropdownOption(columnName, optionData);
        
        // Select the new option immediately
        if (onChange) {
            onChange(newOption.trim());
        }
        
        setNewOption('');
        setIsAdding(false);
        toast.success('Option added!');
    } catch(err) {
        console.error(err);
        toast.error('Failed to add option');
    }
  };

  const handleKeyDown = (e) => {
     if(e.key === 'Enter') {
         e.preventDefault(); // Prevent form submission if inside a form
         e.stopPropagation();
         handleAddOption(e);
     }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteDropdownOption(columnName, deleteTarget._id);
      setDeleteTarget(null);
    } catch (err) {
      const message = err?.response?.data?.message || 'Failed to delete option';
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled} onOpenChange={handleOpenChange}>
      <SelectTrigger className={`w-full ${error ? 'border-red-500 dark:border-red-500 ring-1 ring-red-500/30' : ''}`} aria-invalid={error ? 'true' : undefined}>
         <SelectValue placeholder={placeholder || "Select..."} />
      </SelectTrigger>
      <SelectContent className="max-h-[300px]">
         {/* Search Input */}
         {options.length > 3 && (
           <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 p-2 border-b border-gray-100 dark:border-gray-700">
             <div className="relative">
               <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
               <input
                 type="text"
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
                 onClick={(e) => e.stopPropagation()}
                 onKeyDown={(e) => {
                   e.stopPropagation();
                   if (e.key === 'Enter') e.preventDefault();
                 }}
                 placeholder="Search options..."
                 className="w-full h-8 text-sm border border-gray-200 dark:border-gray-600 rounded-md pl-8 pr-8 bg-gray-50 dark:bg-gray-900 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                 autoFocus
               />
               {searchTerm && (
                 <button
                   type="button"
                   onClick={(e) => {
                     e.stopPropagation();
                     setSearchTerm('');
                   }}
                   className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                 >
                   <X className="w-3.5 h-3.5" />
                 </button>
               )}
             </div>
           </div>
         )}

         {filteredOptions.length === 0 && (
             <div className="p-3 text-sm text-gray-500 text-center">
               {searchTerm ? `No options matching "${searchTerm}"` : 'No options yet'}
             </div>
         )}
         
         {filteredOptions.map(opt => {
            const createdById = typeof opt.createdBy === 'object' ? opt.createdBy?._id : opt.createdBy;
            const canDelete = isAdmin || (createdById && user?._id && createdById.toString() === user._id.toString());

            return (
            <SelectItem
              key={opt._id || opt.value}
              value={opt.value}
              label={opt.label}
              className="group pr-8"
            >
              <span className="truncate block pr-4">{opt.label}</span>
              {canDelete && opt._id && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDeleteTarget(opt);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-600 p-1 rounded-md hover:bg-red-50"
                  title={`Delete ${opt.label}`}
                  aria-label={`Delete ${opt.label}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </SelectItem>
            );
         })}

         <div className="p-2 border-t border-gray-100 dark:border-gray-700 mt-1 bg-gray-50/50 dark:bg-gray-800/50">
            {!isAdding ? (
                 <button
                   type="button"
                   className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 w-full px-2 py-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                   onClick={(e) => { 
                       e.preventDefault(); 
                       e.stopPropagation(); // Prevent dropdown from closing 
                       setIsAdding(true); 
                   }}
                 >
                   <Plus className="w-3.5 h-3.5" />
                   Add new option
                 </button>
            ) : (
                <div className="flex items-center gap-2 animate-in fade-in zoom-in duration-200">
                    <input
                        type="text"
                        value={newOption}
                        onChange={(e) => setNewOption(e.target.value)}
                        className="flex-1 h-8 text-sm border border-gray-300 dark:border-gray-600 rounded px-2 bg-white dark:bg-gray-900 focus:ring-1 focus:ring-blue-500 outline-none min-w-0"
                        placeholder="Enter value..."
                        autoFocus
                        onKeyDown={handleKeyDown}
                        onClick={(e) => e.stopPropagation()}
                    />
                    <button
                        type="button"
                        onClick={handleAddOption}
                        disabled={!newOption.trim()}
                        className="p-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex-shrink-0"
                        title="Add Option"
                    >
                        <Check className="w-3.5 h-3.5" />
                    </button>
                     <button
                        type="button"
                        onClick={(e) => { 
                            e.preventDefault(); 
                            e.stopPropagation(); 
                            setIsAdding(false); 
                            setNewOption('');
                        }}
                        className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex-shrink-0"
                        title="Cancel"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}
         </div>
      </SelectContent>
      <DeletePopup
        isOpen={Boolean(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title="Delete option?"
        description="Are you sure you want to delete this option?"
        confirmLabel="Delete Option"
        isLoading={isDeleting}
      />
    </Select>
  );
};

export default SalesDropdown;
