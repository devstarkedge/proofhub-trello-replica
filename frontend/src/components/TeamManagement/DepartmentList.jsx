import React, { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Edit2,
  Trash2,
  Building2,
  Shield,
  Users
} from 'lucide-react';
import { DepartmentListSkeleton } from './SkeletonLoaders';
import PermissionGate from '../PermissionGate';

/**
 * DepartmentList Component
 * Displays list of departments with selection and management UI
 * Memoized to prevent unnecessary re-renders
 */
const DepartmentList = memo(({
  departments,
  currentDepartment,
  isLoading,
  onSelectDepartment,
  onCreateClick,
  onEditClick,
  onDeleteClick,
  isAdmin = false,
  isManager = false
}) => {
  // Only Admin can edit/delete departments
  const canManageDepartment = isAdmin;
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Create Department Card - Only show if user has permission */}
      <PermissionGate permission="canCreateDepartment">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl sm:rounded-2xl shadow-lg md:shadow-xl p-4 sm:p-6 text-white"
        >
          <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <div className="p-2 sm:p-3 bg-white/20 backdrop-blur-sm rounded-lg sm:rounded-xl flex-shrink-0">
              <Plus size={20} className="sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold">New Department</h2>
              <p className="text-xs sm:text-sm text-blue-100 truncate">Create a new team</p>
            </div>
          </div>
          <button
            onClick={onCreateClick}
            className="w-full py-2 sm:py-3 bg-white text-blue-600 rounded-lg sm:rounded-xl font-semibold hover:bg-blue-50 transition-all shadow-md md:shadow-lg hover:shadow-lg md:hover:shadow-xl transform hover:-translate-y-0.5 text-sm sm:text-base"
          >
            Create Department
          </button>
        </motion.div>
      </PermissionGate>

      {/* Departments List */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-xl sm:rounded-2xl shadow-sm md:shadow-md border border-gray-100 overflow-hidden"
      >
        <div className="p-3 sm:p-5 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 flex items-center gap-2 min-w-0">
              <Building2 size={18} className="text-blue-600 flex-shrink-0" />
              <span className="truncate">Departments</span>
            </h2>
            <span className="px-2 sm:px-3 py-0.5 sm:py-1 bg-blue-100 text-blue-700 rounded-full text-xs sm:text-sm font-semibold flex-shrink-0">
              {departments.length}
            </span>
          </div>
        </div>
        <div className="max-h-[60vh] sm:max-h-[50vh] md:max-h-[600px] overflow-y-auto">
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <DepartmentListSkeleton count={4} />
              </motion.div>
            ) : departments.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-12 text-center text-gray-500"
              >
                <Building2 size={48} className="mx-auto mb-3 text-gray-300" />
                <p className="font-medium">No departments yet</p>
                <p className="text-sm mt-1">Create your first department to get started</p>
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {departments.map((dept, index) => (
                  <DepartmentListItem
                    key={dept._id}
                    dept={dept}
                    isSelected={currentDepartment?._id === dept._id}
                    index={index}
                    onSelect={onSelectDepartment}
                    onEdit={onEditClick}
                    onDelete={onDeleteClick}
                    canManageDepartment={canManageDepartment}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
});

/**
 * DepartmentListItem Component
 * Individual department card within the list
 */
const DepartmentListItem = memo(({
  dept,
  isSelected,
  index,
  onSelect,
  onEdit,
  onDelete,
  canManageDepartment = false
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ delay: index * 0.05 }}
      onClick={() => onSelect(dept)}
      className={`p-5 border-b border-gray-100 cursor-pointer transition-all hover:bg-gray-50 ${
        isSelected
          ? 'bg-blue-50 border-l-4 border-l-blue-600 shadow-sm'
          : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex-shrink-0">
              <Building2 size={16} className="text-white" />
            </div>
            <h3 className="font-semibold text-gray-900 truncate">
              {dept.name}
            </h3>
          </div>
          {dept.description && (
            <p className="text-sm text-gray-600 mb-3 line-clamp-2">{dept.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded-lg font-medium">
              <Shield size={12} />
              {dept.managers?.length ? `${dept.managers.length} manager${dept.managers.length > 1 ? 's' : ''}` : 'No manager'}
            </span>
            <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-lg font-medium">
              <Users size={12} />
              {dept.members?.length || 0} employees
            </span>
            <span className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-lg font-medium">
              <Building2 size={12} />
              {dept.projectsCount || 0} projects
            </span>
          </div>
        </div>
        {canManageDepartment && (
          <div className="flex flex-col gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(dept);
              }}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Edit department"
            >
              <Edit2 size={16} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(dept);
              }}
              className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Delete department"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
});

DepartmentList.displayName = 'DepartmentList';
DepartmentListItem.displayName = 'DepartmentListItem';

export default DepartmentList;
