import React, { useState, useEffect, useContext } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  Save,
  X,
  Users,
  FolderKanban,
  Plus,
  Trash2,
  GripVertical,
  Eye,
  EyeOff,
  ArrowLeft,
  AlertCircle,
  Check
} from 'lucide-react';
import api from '../../services/api';
import AuthContext from '../../context/AuthContext';
import { toast } from 'react-toastify';

/**
 * CreateFinancePage - Page to create/edit custom finance pages
 * Allows selecting columns, setting filters, and configuring the page
 */
const CreateFinancePage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user } = useContext(AuthContext);
  const isEditing = Boolean(id);
  const isAdmin = user?.role?.toLowerCase() === 'admin';

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    pageType: 'users',
    columns: [],
    defaultFilters: {
      departmentId: null,
      datePreset: 'thisMonth',
      billingType: 'all'
    }
  });

  // Available columns based on page type
  const availableColumns = {
    users: [
      { key: 'userName', label: 'User Name', required: true },
      { key: 'department', label: 'Department', required: true },
      { key: 'projects', label: 'Projects', required: false },
      { key: 'loggedTime', label: 'Logged Time', required: false },
      { key: 'billedTime', label: 'Billed Time', required: false },
      { key: 'payment', label: 'Payment', required: true },
      { key: 'taskCount', label: 'Task Count', required: false },
      { key: 'lastActivity', label: 'Last Activity', required: false }
    ],
    projects: [
      { key: 'projectName', label: 'Project Name', required: true },
      { key: 'department', label: 'Department', required: true },
      { key: 'startDate', label: 'Start Date', required: false },
      { key: 'endDate', label: 'End Date', required: false },
      { key: 'coordinators', label: 'Coordinators', required: false },
      { key: 'projectSource', label: 'Source', required: false },
      { key: 'upworkId', label: 'Upwork ID', required: false },
      { key: 'billingType', label: 'Billing Type', required: false },
      { key: 'hourlyRate', label: 'Hourly Rate', required: false },
      { key: 'loggedTime', label: 'Logged Time', required: false },
      { key: 'billedTime', label: 'Billed Time', required: false },
      { key: 'payment', label: 'Payment', required: true },
      { key: 'status', label: 'Status', required: false },
      { key: 'lastActivity', label: 'Last Activity', required: false },
      { key: 'clientName', label: 'Client Name', required: false },
      { key: 'clientEmail', label: 'Client Email', required: false },
      { key: 'clientPhone', label: 'Client Phone', required: false }
    ]
  };

  // Fetch existing page data if editing
  useEffect(() => {
    if (isEditing) {
      fetchPageData();
    } else {
      // Initialize with default required columns
      const defaultColumns = availableColumns.users
        .filter(col => col.required)
        .map((col, idx) => ({ key: col.key, label: col.label, visible: true, order: idx }));
      setFormData(prev => ({ ...prev, columns: defaultColumns }));
    }
  }, [id]);

  const fetchPageData = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/finance/pages/${id}`);
      if (response.data.success) {
        const page = response.data.data;
        setFormData({
          name: page.name || '',
          description: page.description || '',
          pageType: page.pageType || 'users',
          columns: page.columns || [],
          defaultFilters: page.defaultFilters || {}
        });
      }
    } catch (err) {
      console.error('Error fetching page:', err);
      toast.error('Failed to load page data');
      navigate('/finance/pages');
    } finally {
      setLoading(false);
    }
  };

  // Handle page type change
  const handlePageTypeChange = (type) => {
    const defaultColumns = availableColumns[type]
      .filter(col => col.required)
      .map((col, idx) => ({ key: col.key, label: col.label, visible: true, order: idx }));
    
    setFormData(prev => ({
      ...prev,
      pageType: type,
      columns: defaultColumns
    }));
  };

  // Toggle column visibility
  const toggleColumn = (columnKey) => {
    const existingIdx = formData.columns.findIndex(c => c.key === columnKey);
    
    if (existingIdx >= 0) {
      // Remove column
      const isRequired = availableColumns[formData.pageType].find(c => c.key === columnKey)?.required;
      if (isRequired) {
        toast.warning('This column is required and cannot be removed');
        return;
      }
      setFormData(prev => ({
        ...prev,
        columns: prev.columns.filter(c => c.key !== columnKey)
      }));
    } else {
      // Add column
      const colDef = availableColumns[formData.pageType].find(c => c.key === columnKey);
      if (colDef) {
        setFormData(prev => ({
          ...prev,
          columns: [...prev.columns, { 
            key: colDef.key, 
            label: colDef.label, 
            visible: true, 
            order: prev.columns.length 
          }]
        }));
      }
    }
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error('Page name is required');
      return;
    }
    
    if (formData.columns.length === 0) {
      toast.error('At least one column is required');
      return;
    }

    try {
      setSaving(true);
      
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        pageType: formData.pageType,
        columns: formData.columns.map((col, idx) => ({ ...col, order: idx })),
        defaultFilters: formData.defaultFilters
      };

      let response;
      if (isEditing) {
        response = await api.put(`/api/finance/pages/${id}`, payload);
      } else {
        response = await api.post('/api/finance/pages', payload);
      }

      if (response.data.success) {
        toast.success(isEditing ? 'Page updated successfully' : 'Page created successfully');
        navigate('/finance/pages');
      }
    } catch (err) {
      console.error('Save error:', err);
      toast.error(err.response?.data?.message || 'Failed to save page');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/finance/pages')}
          className="p-2 rounded-lg transition-colors hover:bg-opacity-80"
          style={{ backgroundColor: 'var(--color-bg-secondary)' }}
        >
          <ArrowLeft className="w-5 h-5" style={{ color: 'var(--color-text-secondary)' }} />
        </button>
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {isEditing ? 'Edit Page' : 'Create New Page'}
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {isEditing ? 'Modify your custom finance page' : 'Configure a new custom finance page'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div 
          className="p-6 rounded-xl border"
          style={{ 
            backgroundColor: 'var(--color-bg-secondary)',
            borderColor: 'var(--color-border-subtle)'
          }}
        >
          <h2 className="font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
            Basic Information
          </h2>
          
          <div className="space-y-4">
            {/* Page Name */}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                Page Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter page name"
                className="w-full px-4 py-2 rounded-lg border text-sm"
                style={{
                  backgroundColor: 'var(--color-bg-primary)',
                  borderColor: 'var(--color-border-subtle)',
                  color: 'var(--color-text-primary)'
                }}
                maxLength={100}
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description"
                rows={3}
                className="w-full px-4 py-2 rounded-lg border text-sm resize-none"
                style={{
                  backgroundColor: 'var(--color-bg-primary)',
                  borderColor: 'var(--color-border-subtle)',
                  color: 'var(--color-text-primary)'
                }}
                maxLength={500}
              />
            </div>

            {/* Page Type */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                Page Type *
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => handlePageTypeChange('users')}
                  className="flex-1 flex items-center gap-3 p-4 rounded-xl border transition-all duration-200"
                  style={{
                    backgroundColor: formData.pageType === 'users' ? 'rgba(59, 130, 246, 0.1)' : 'var(--color-bg-primary)',
                    borderColor: formData.pageType === 'users' ? '#3b82f6' : 'var(--color-border-subtle)'
                  }}
                >
                  <div 
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: formData.pageType === 'users' ? 'rgba(59, 130, 246, 0.15)' : 'var(--color-bg-muted)' }}
                  >
                    <Users className="w-5 h-5" style={{ color: formData.pageType === 'users' ? '#3b82f6' : 'var(--color-text-muted)' }} />
                  </div>
                  <div className="text-left">
                    <p className="font-medium" style={{ color: formData.pageType === 'users' ? '#3b82f6' : 'var(--color-text-primary)' }}>
                      Users View
                    </p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      User-centric finance data
                    </p>
                  </div>
                  {formData.pageType === 'users' && (
                    <Check className="w-5 h-5 ml-auto" style={{ color: '#3b82f6' }} />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handlePageTypeChange('projects')}
                  className="flex-1 flex items-center gap-3 p-4 rounded-xl border transition-all duration-200"
                  style={{
                    backgroundColor: formData.pageType === 'projects' ? 'rgba(139, 92, 246, 0.1)' : 'var(--color-bg-primary)',
                    borderColor: formData.pageType === 'projects' ? '#8b5cf6' : 'var(--color-border-subtle)'
                  }}
                >
                  <div 
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: formData.pageType === 'projects' ? 'rgba(139, 92, 246, 0.15)' : 'var(--color-bg-muted)' }}
                  >
                    <FolderKanban className="w-5 h-5" style={{ color: formData.pageType === 'projects' ? '#8b5cf6' : 'var(--color-text-muted)' }} />
                  </div>
                  <div className="text-left">
                    <p className="font-medium" style={{ color: formData.pageType === 'projects' ? '#8b5cf6' : 'var(--color-text-primary)' }}>
                      Projects View
                    </p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      Project-centric finance data
                    </p>
                  </div>
                  {formData.pageType === 'projects' && (
                    <Check className="w-5 h-5 ml-auto" style={{ color: '#8b5cf6' }} />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Column Selection */}
        <div 
          className="p-6 rounded-xl border"
          style={{ 
            backgroundColor: 'var(--color-bg-secondary)',
            borderColor: 'var(--color-border-subtle)'
          }}
        >
          <h2 className="font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
            Table Columns
          </h2>
          <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
            Select the columns to display in your table. Required columns cannot be removed.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {availableColumns[formData.pageType].map(column => {
              const isSelected = formData.columns.some(c => c.key === column.key);
              
              return (
                <button
                  key={column.key}
                  type="button"
                  onClick={() => toggleColumn(column.key)}
                  className="flex items-center gap-2 p-3 rounded-lg border transition-all duration-200 text-left"
                  style={{
                    backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.1)' : 'var(--color-bg-primary)',
                    borderColor: isSelected ? 'rgba(16, 185, 129, 0.3)' : 'var(--color-border-subtle)'
                  }}
                >
                  <div 
                    className="w-5 h-5 rounded border flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: isSelected ? '#10b981' : 'transparent',
                      borderColor: isSelected ? '#10b981' : 'var(--color-border-subtle)'
                    }}
                  >
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span 
                    className="text-sm font-medium"
                    style={{ color: isSelected ? '#10b981' : 'var(--color-text-primary)' }}
                  >
                    {column.label}
                  </span>
                  {column.required && (
                    <span className="text-xs px-1 rounded" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                      Required
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected columns count */}
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {formData.columns.length} column{formData.columns.length !== 1 ? 's' : ''} selected
            </p>
          </div>
        </div>

        {/* Default Filters */}
        <div 
          className="p-6 rounded-xl border"
          style={{ 
            backgroundColor: 'var(--color-bg-secondary)',
            borderColor: 'var(--color-border-subtle)'
          }}
        >
          <h2 className="font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
            Default Filters (Optional)
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Date Preset */}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                Date Range
              </label>
              <select
                value={formData.defaultFilters.datePreset || 'thisMonth'}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  defaultFilters: { ...prev.defaultFilters, datePreset: e.target.value }
                }))}
                className="w-full px-4 py-2 rounded-lg border text-sm"
                style={{
                  backgroundColor: 'var(--color-bg-primary)',
                  borderColor: 'var(--color-border-subtle)',
                  color: 'var(--color-text-primary)'
                }}
              >
                <option value="today">Today</option>
                <option value="thisWeek">This Week</option>
                <option value="thisMonth">This Month</option>
                <option value="thisYear">This Year</option>
              </select>
            </div>

            {/* Billing Type */}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                Billing Type
              </label>
              <select
                value={formData.defaultFilters.billingType || 'all'}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  defaultFilters: { ...prev.defaultFilters, billingType: e.target.value }
                }))}
                className="w-full px-4 py-2 rounded-lg border text-sm"
                style={{
                  backgroundColor: 'var(--color-bg-primary)',
                  borderColor: 'var(--color-border-subtle)',
                  color: 'var(--color-text-primary)'
                }}
              >
                <option value="all">All Types</option>
                <option value="hr">Hourly</option>
                <option value="fixed">Fixed</option>
              </select>
            </div>
          </div>
        </div>

        {/* Info Message */}
        {!isAdmin && !isEditing && (
          <div 
            className="p-4 rounded-xl border flex items-start gap-3"
            style={{
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              borderColor: 'rgba(59, 130, 246, 0.3)'
            }}
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#3b82f6' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: '#3b82f6' }}>
                Pending Admin Approval
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                Your page will be visible only to you until an admin approves it. Once approved, it will be visible to all managers.
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={() => navigate('/finance/pages')}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: 'var(--color-bg-muted)',
              color: 'var(--color-text-secondary)'
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-50"
            style={{
              backgroundColor: '#10b981',
              color: 'white'
            }}
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {isEditing ? 'Update Page' : 'Create Page'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateFinancePage;
