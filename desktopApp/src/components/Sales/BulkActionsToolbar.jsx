import React from 'react';
import { Trash2, Edit } from 'lucide-react';
import useSalesStore from '../../store/salesStore';

const BulkActionsToolbar = ({ permissions }) => {
  const { selectedRows, bulkUpdate, bulkDelete, clearSelection, dropdownOptions } = useSalesStore();

  const handleBulkStatusUpdate = async (status) => {
    if (!status) return;
    
    try {
      await bulkUpdate(Array.from(selectedRows), { status });
    } catch (error) {
      console.error('Bulk update failed:', error);
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedRows.size} rows?`)) {
      return;
    }

    try {
      await bulkDelete(Array.from(selectedRows));
    } catch (error) {
      console.error('Bulk delete failed:', error);
    }
  };

  return (
    <div className="bg-blue-50 dark:bg-blue-900 border-b border-blue-200 dark:border-blue-700 py-3">
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
              {selectedRows.size} row{selectedRows.size !== 1 ? 's' : ''} selected
            </span>

            {permissions?.canUpdate && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-blue-700 dark:text-blue-300">Update Status:</span>
                <select
                  onChange={(e) => handleBulkStatusUpdate(e.target.value)}
                  className="px-3 py-1 border border-blue-300 dark:border-blue-600 rounded-lg text-sm dark:bg-blue-800 dark:text-white"
                  defaultValue=""
                >
                  <option value="">Select status...</option>
                  {dropdownOptions.status?.map((option) => (
                    <option key={option._id} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {permissions?.canDelete && (
              <button
                  onClick={handleBulkDelete}
                className="px-4 py-1.5 flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
              >
                <Trash2 className="w-4 h-4" />
                Delete Selected
              </button>
            )}

            <button
              onClick={clearSelection}
              className="px-4 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 rounded-lg transition-colors text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkActionsToolbar;
