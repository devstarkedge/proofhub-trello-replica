import React, { memo } from 'react';
import { Shield, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { Badge } from '../../ui/badge';

const TeamTab = memo(({
  managers,
  assignees,
  selectedEmployees,
  errors,
  handleAssigneeChange
}) => {
  return (
    <div className="space-y-6">
      <section className="bg-gray-50 rounded-2xl p-5 border border-gray-200">
        <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Shield size={16} className="text-purple-600" />
          Project manager
          {assignees.length > 0 && (
            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-600 text-xs font-semibold rounded-full">
              {assignees.length} selected
            </span>
          )}
        </h3>

        {managers.length === 0 ? (
          <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-800">No Manager Available</p>
              <p className="text-xs text-amber-600">Please assign a manager to this department first.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {managers.map((manager) => (
              <label
                key={manager._id}
                className={`flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all ${
                  assignees.includes(manager._id)
                    ? 'bg-indigo-50 border-2 border-indigo-300'
                    : 'bg-white border border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={assignees.includes(manager._id)}
                  onChange={() => handleAssigneeChange(manager._id)}
                  className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold">
                  {(manager.name || 'U').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{manager.name}</span>
                    <Shield size={14} className="text-blue-500" />
                  </div>
                  <p className="text-sm text-gray-500">{manager.email || 'No email'}</p>
                  <p className="text-xs text-blue-600 font-medium">Manager</p>
                </div>
                {assignees.includes(manager._id) && (
                  <CheckCircle2 className="h-6 w-6 text-indigo-600" />
                )}
              </label>
            ))}
          </div>
        )}

        {errors?.assignees && (
          <p className="text-red-600 text-sm mt-3 flex items-center gap-1">
            <AlertCircle size={14} /> {errors.assignees}
          </p>
        )}
      </section>

      {/* Selected Team Summary */}
      {selectedEmployees.length > 0 && (
        <section className="bg-white rounded-2xl p-5 border border-gray-200">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Selected Team Members</h4>
          <div className="flex flex-wrap gap-2">
            {selectedEmployees.map((mgr) => (
              <Badge
                key={mgr._id}
                className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-3 py-2 flex items-center gap-2"
              >
                <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-semibold">
                  {(mgr?.name || 'U').charAt(0).toUpperCase()}
                </div>
                {mgr?.name || 'Unknown'}
                <button
                  type="button"
                  onClick={() => handleAssigneeChange(mgr._id)}
                  className="ml-1 hover:bg-white/20 rounded-full p-0.5"
                >
                  <X size={14} />
                </button>
              </Badge>
            ))}
          </div>
        </section>
      )}
    </div>
  );
});

TeamTab.displayName = 'TeamTab';

export default TeamTab;
