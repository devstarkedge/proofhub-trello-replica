import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, User } from 'lucide-react';

const ManagerSelector = ({ managers, selectedManagers, onChange, disabled = false, currentDepartment }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  // Filter managers based on search term, exclude already selected ones, and exclude managers already assigned to this department
  const availableManagers = managers.filter(manager =>
    !selectedManagers.includes(manager._id) &&
    (!currentDepartment || !currentDepartment.managers?.includes(manager._id)) &&
    (manager.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
     manager.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelectManager = (managerId) => {
    if (!selectedManagers.includes(managerId)) {
      onChange([...selectedManagers, managerId]);
    }
    setSearchTerm('');
  };

  const handleRemoveManager = (managerId) => {
    onChange(selectedManagers.filter(id => id !== managerId));
  };

  const getSelectedManagerObjects = () => {
    return managers.filter(manager => selectedManagers.includes(manager._id));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setSearchTerm('');
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-semibold text-gray-700">
        Department Managers
      </label>

      {/* Selected Managers Chips */}
      {selectedManagers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedManagers.map(managerItem => {
            const isObject = typeof managerItem === 'object' && managerItem !== null;
            const managerId = isObject ? managerItem._id : managerItem;
            const manager = isObject ? managerItem : managers.find(m => m._id === managerItem);
            return (
              <div
                key={managerId}
                className="inline-flex items-center gap-2 px-3 py-2 bg-indigo-100 text-indigo-800 rounded-full text-sm font-medium"
              >
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-indigo-200 rounded-full flex items-center justify-center">
                    <User size={12} />
                  </div>
                  <span>{manager ? manager.name : managerId}</span>
                </div>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => handleRemoveManager(isObject ? managerItem : managerId)}
                    className="hover:bg-indigo-200 rounded-full p-0.5 transition-colors"
                    title="Remove manager"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dropdown Trigger */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all flex items-center justify-between ${
            disabled
              ? 'bg-gray-100 border-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-white border-gray-300 hover:border-gray-400'
          }`}
        >
          <span className={selectedManagers.length === 0 ? 'text-gray-500' : 'text-gray-900'}>
            {selectedManagers.length === 0
              ? 'Select managers...'
              : `${selectedManagers.length} manager${selectedManagers.length > 1 ? 's' : ''} selected`
            }
          </span>
          <ChevronDown
            size={20}
            className={`transition-transform ${isOpen ? 'rotate-180' : ''} ${disabled ? 'text-gray-400' : 'text-gray-500'}`}
          />
        </button>

        {/* Dropdown Content */}
        {isOpen && (
          <div className="absolute z-[70] w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-hidden">
            {/* Search Input */}
            <div className="p-3 border-b border-gray-200">
              <input
                ref={inputRef}
                type="text"
                placeholder="Search managers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
              />
            </div>

            {/* Manager List */}
            <div className="max-h-48 overflow-y-auto">
              {availableManagers.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-sm">
                  {searchTerm ? 'No managers found' : 'All managers selected'}
                </div>
              ) : (
                availableManagers.map(manager => (
                  <button
                    key={manager._id}
                    type="button"
                    onClick={() => handleSelectManager(manager._id)}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold text-sm">
                          {manager.name?.[0]?.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{manager.name}</p>
                        <p className="text-sm text-gray-600 truncate">{manager.email}</p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Helper Text */}
      <p className="text-xs text-gray-500">
        Select one or more managers for this department.
      </p>
    </div>
  );
};

export default ManagerSelector;
