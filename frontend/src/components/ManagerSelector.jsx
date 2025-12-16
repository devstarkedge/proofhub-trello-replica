import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, X, User, CheckCircle } from 'lucide-react';

const ManagerSelector = ({ managers, selectedManagers, onChange, disabled = false, currentDepartment, departments = [] }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  // Helper function to normalize an ID (extract string ID from object or return string as-is)
  const normalizeId = (item) => {
    if (!item) return null;
    if (typeof item === 'object' && item !== null) {
      return item._id?.toString() || item.toString();
    }
    return item?.toString();
  };

  // Normalize selectedManagers to array of string IDs for consistent comparison
  const selectedManagerIds = useMemo(() => {
    return selectedManagers.map(m => normalizeId(m)).filter(Boolean);
  }, [selectedManagers]);

  // Filter managers based on search term and exclude already selected ones
  // Already selected managers should NOT appear in the dropdown
  const availableManagers = useMemo(() => {
    return managers.filter(manager => {
      const managerId = normalizeId(manager._id);
      
      // Exclude if already selected
      if (selectedManagerIds.includes(managerId)) {
        return false;
      }
      
      // Apply search filter
      const matchesSearch = 
        manager.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        manager.email.toLowerCase().includes(searchTerm.toLowerCase());
      
      return matchesSearch;
    });
  }, [managers, selectedManagerIds, searchTerm]);

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
    const normalizedId = normalizeId(managerId);
    if (!selectedManagerIds.includes(normalizedId)) {
      onChange([...selectedManagers, normalizedId]);
    }
    setSearchTerm('');
  };

  const handleRemoveManager = (managerId) => {
    const normalizedId = normalizeId(managerId);
    onChange(selectedManagers.filter(id => normalizeId(id) !== normalizedId));
  };

  const getSelectedManagerObjects = () => {
    return managers.filter(manager => selectedManagerIds.includes(normalizeId(manager._id)));
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
            const managerId = normalizeId(managerItem);
            const manager = managers.find(m => normalizeId(m._id) === managerId);
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
                    onClick={() => handleRemoveManager(managerId)}
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
          <div className="absolute z-[70] w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-96 overflow-hidden">
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
            <div className="max-h-80 overflow-y-auto">
              {availableManagers.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-sm">
                  {searchTerm ? 'No managers found' : 'All managers selected'}
                </div>
              ) : (
                availableManagers.map(manager => {
                  // Check if manager is assigned to any department
                  const isAssigned = manager.department && manager.department.length > 0;
                  const assignedDepartments = isAssigned ? manager.department : [];

                  return (
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
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 truncate">{manager.name}</p>
                              <p className="text-sm text-gray-600 truncate">{manager.email}</p>
                              {/* Show assigned department names if assigned to multiple */}
                              {isAssigned && assignedDepartments.length > 1 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {assignedDepartments.slice(0, 2).map((deptId, index) => {
                                    const deptIdStr = normalizeId(deptId);
                                    // Find department name from departments array using normalized IDs
                                    const dept = departments.find(d => normalizeId(d._id) === deptIdStr);
                                    const deptName = dept ? dept.name : `Dept ${index + 1}`;
                                    return (
                                      <span
                                        key={deptIdStr}
                                        className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full font-medium"
                                      >
                                        {deptName}
                                      </span>
                                    );
                                  })}
                                  {assignedDepartments.length > 2 && (
                                    <span className="text-xs text-gray-500">
                                      +{assignedDepartments.length - 2} more
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            {/* Show "Assigned" tag if assigned to any department */}
                            {isAssigned && (
                              <div className="flex items-center gap-2">
                                <span className="flex items-center gap-1 px-2 py-1 text-xs bg-green-100 text-green-700 rounded-full font-semibold shadow-sm">
                                  <CheckCircle size={12} />
                                  Assigned
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
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
