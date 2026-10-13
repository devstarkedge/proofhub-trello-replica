import React, { useState, useEffect, useRef } from 'react';
import { 
  Building2,
  ChevronDown,
  Check,
  X
} from 'lucide-react';
import api from '../../services/api';

/**
 * DepartmentFilter - Department filter dropdown for Finance module
 */
const DepartmentFilter = ({ selectedDepartmentId, onChange }) => {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Fetch departments
  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const response = await api.get('/api/finance/departments');
        if (response.data.success) {
          setDepartments(response.data.data || []);
        }
      } catch (err) {
        console.error('Error fetching departments:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchDepartments();
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get selected department name
  const selectedDept = departments.find(d => d._id === selectedDepartmentId);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all duration-200"
        style={{
          backgroundColor: selectedDepartmentId 
            ? 'rgba(16, 185, 129, 0.1)' 
            : 'var(--color-bg-secondary)',
          borderColor: selectedDepartmentId || isOpen
            ? '#10b981' 
            : 'var(--color-border-subtle)',
          color: selectedDepartmentId 
            ? '#10b981' 
            : 'var(--color-text-secondary)'
        }}
      >
        <Building2 className="w-4 h-4" />
        <span className="font-medium">
          {selectedDept?.name || 'All Departments'}
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div 
          className="absolute top-full left-0 mt-2 py-2 rounded-xl border z-[100] min-w-52"
          style={{
            backgroundColor: '#ffffff',
            borderColor: '#e5e7eb',
            boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.2), 0 4px 20px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.05)'
          }}
        >
          {/* All Departments Option */}
          <button
            onClick={() => {
              onChange(null);
              setIsOpen(false);
            }}
            className="w-full flex items-center justify-between px-3 py-2.5 mx-1.5 rounded-lg text-sm transition-all duration-150"
            style={{ 
              color: !selectedDepartmentId ? '#10b981' : 'var(--color-text-primary)',
              backgroundColor: !selectedDepartmentId ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
              width: 'calc(100% - 12px)'
            }}
            onMouseEnter={(e) => {
              if (selectedDepartmentId) e.currentTarget.style.backgroundColor = '#f3f4f6';
            }}
            onMouseLeave={(e) => {
              if (selectedDepartmentId) e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span>All Departments</span>
            {!selectedDepartmentId && <Check className="w-4 h-4" />}
          </button>

          {/* Separator */}
          <div 
            className="my-2 mx-3"
            style={{ borderTop: '1px solid var(--color-border-subtle)' }}
          />

          {/* Department List */}
          {loading ? (
            <div className="px-4 py-3 text-sm text-center" style={{ color: 'var(--color-text-muted)' }}>
              Loading...
            </div>
          ) : departments.length === 0 ? (
            <div className="px-4 py-3 text-sm text-center" style={{ color: 'var(--color-text-muted)' }}>
              No departments found
            </div>
          ) : (
            departments.map((dept) => (
              <button
                key={dept._id}
                onClick={() => {
                  onChange(dept._id);
                  setIsOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 mx-1.5 rounded-lg text-sm transition-all duration-150"
                style={{ 
                  color: selectedDepartmentId === dept._id ? '#10b981' : 'var(--color-text-primary)',
                  backgroundColor: selectedDepartmentId === dept._id ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                  width: 'calc(100% - 12px)'
                }}
                onMouseEnter={(e) => {
                  if (selectedDepartmentId !== dept._id) {
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedDepartmentId !== dept._id) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <span>{dept.name}</span>
                {selectedDepartmentId === dept._id && <Check className="w-4 h-4" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default DepartmentFilter;
