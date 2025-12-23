import React, { memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  UserPlus,
  Search,
  Award,
  Mail,
  CheckCircle
} from 'lucide-react';
import { EmployeeListSkeleton } from './SkeletonLoaders';
import { useDebounce } from '../../hooks/useDebounce';
import PermissionGate from '../PermissionGate';
import Avatar from '../Avatar';
import useThemeStore from '../../store/themeStore';

/**
 * EmployeeAssignment Component
 * Displays employee list with assignment/unassignment logic
 * Features: Virtual scrolling, pagination, debounced search
 * Memoized to prevent unnecessary re-renders
 */
const EmployeeAssignment = memo(({
  currentDepartment,
  assignedEmployees,
  availableEmployees,
  selectedUsers,
  searchQuery,
  activeTab,
  isLoading,
  isAdmin,
  departments,
  currentPage,
  itemsPerPage,
  onSelectUser,
  onSelectAll,
  onSearchChange,
  onTabChange,
  onAddMemberClick,
  onAssignClick,
  onUnassignClick,
  onClearSelection,
  onPageChange,
  onItemsPerPageChange
}) => {
  const { effectiveMode } = useThemeStore();
  const isDarkMode = effectiveMode === 'dark';

  // Debounce search query
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Get current tab data
  const currentTabEmployees = activeTab === 'assigned' ? assignedEmployees : availableEmployees;

  // Paginate employees
  const paginatedEmployees = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return currentTabEmployees.slice(start, end);
  }, [currentTabEmployees, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(currentTabEmployees.length / itemsPerPage);

  if (!currentDepartment) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`${isDarkMode ? 'bg-gray-800/80 backdrop-blur-sm border-gray-700' : 'bg-white border-gray-100'} rounded-2xl shadow-sm p-8 sm:p-16 text-center border`}
      >
        <motion.div
          animate={{ 
            y: [0, -10, 0],
            rotate: [0, 5, -5, 0]
          }}
          transition={{ 
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        >
          <Users size={80} className={`mx-auto mb-6 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
        </motion.div>
        <h3 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'} mb-2`}>Select a Department</h3>
        <p className={`${isDarkMode ? 'text-gray-400' : 'text-gray-600'} max-w-md mx-auto`}>
          Choose a department from the list to view and manage its members
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className={`${isDarkMode ? 'bg-gray-800/80 backdrop-blur-sm border-gray-700' : 'bg-white border-gray-100'} rounded-xl sm:rounded-2xl shadow-sm md:shadow-md border overflow-hidden`}
    >
      {/* Header */}
      <div className={`p-3 sm:p-6 border-b ${isDarkMode ? 'border-gray-700 bg-gradient-to-r from-blue-900/30 via-indigo-900/30 to-purple-900/30' : 'border-gray-200 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50'}`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          {/* Left Side - Department Title and Description */}
          <div className="flex-1 min-w-0">
            <h2 className={`text-xl sm:text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'} flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2`}>
              <div className="p-1.5 sm:p-2 bg-blue-600 rounded-lg sm:rounded-xl shadow-md md:shadow-lg flex-shrink-0">
                <UserPlus className="text-white" size={20} />
              </div>
              <span className="truncate">{currentDepartment.name}</span>
            </h2>
            <p className={`text-xs sm:text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Select employees to add to this department</p>
          </div>

          {/* Right Side - Member Count and Add Member Button */}
          <div className="flex flex-col gap-2 sm:items-end">
            {/* Member Count Badge */}
            <div className={`flex items-center gap-2 text-xs sm:text-sm px-3 py-1.5 ${isDarkMode ? 'bg-gray-700/50 border-purple-500/30' : 'bg-white border-purple-200'} rounded-lg border w-fit sm:ml-auto`}>
              <Award className="text-purple-600 flex-shrink-0" size={18} />
              <span className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                {currentDepartment.members?.length || 0} Members
              </span>
            </div>

            {/* Add Member Button - Use PermissionGate instead of isAdmin check */}
            <PermissionGate permission="canAssignMembers">
              <button
                onClick={onAddMemberClick}
                className="px-3 sm:px-4 py-2 sm:py-2.5 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-lg sm:rounded-xl hover:from-green-700 hover:to-blue-700 transition-all shadow-md sm:shadow-lg shadow-green-500/30 font-semibold flex items-center gap-1.5 sm:gap-2 text-sm sm:text-base justify-center"
              >
                <UserPlus size={16} className="flex-shrink-0" />
                <span>Add Member</span>
              </button>
            </PermissionGate>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-3 sm:p-6">
        {/* Tabs */}
        <div className={`flex border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-200'} mb-4 sm:mb-6 overflow-x-auto`}>
          <button
            onClick={() => onTabChange('assigned')}
            className={`px-3 sm:px-6 py-2 sm:py-3 font-semibold transition-all whitespace-nowrap text-sm sm:text-base ${
              activeTab === 'assigned'
                ? isDarkMode 
                  ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-500/10'
                  : 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : isDarkMode
                  ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <span className="hidden sm:inline">Assigned Employees</span>
            <span className="sm:hidden">Assigned</span> ({assignedEmployees.length})
          </button>
          <button
            onClick={() => onTabChange('all')}
            className={`px-3 sm:px-6 py-2 sm:py-3 font-semibold transition-all whitespace-nowrap text-sm sm:text-base ${
              activeTab === 'all'
                ? isDarkMode 
                  ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-500/10'
                  : 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : isDarkMode
                  ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <span className="hidden sm:inline">Available Employees</span>
            <span className="sm:hidden">Available</span> ({availableEmployees.length})
          </button>
        </div>

        {/* Search and Controls */}
        <div className="flex flex-col gap-2 sm:gap-3 mb-4 sm:mb-6">
          <div className="flex-1 relative">
            <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'} flex-shrink-0`} size={18} />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className={`w-full pl-10 pr-3 py-2 sm:py-3 border rounded-lg sm:rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm sm:text-base ${
                isDarkMode 
                  ? 'bg-gray-700/50 border-gray-600 text-white placeholder-gray-500' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
              }`}
            />
          </div>
          <button
            onClick={onSelectAll}
            className={`px-3 sm:px-4 py-2 sm:py-3 ${isDarkMode ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'} rounded-lg sm:rounded-xl transition-colors font-medium whitespace-nowrap text-sm sm:text-base`}
          >
            {selectedUsers.length === paginatedEmployees.length && paginatedEmployees.length > 0
              ? 'Deselect All'
              : 'Select All'}
          </button>
        </div>

        {/* Employee List */}
        <div className={`border ${isDarkMode ? 'border-gray-700' : 'border-gray-200'} rounded-lg sm:rounded-xl overflow-hidden`}>
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <EmployeeListSkeleton count={5} />
              </motion.div>
            ) : currentTabEmployees.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`p-12 text-center ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}
              >
                <Users size={48} className={`mx-auto mb-4 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                <p className="font-semibold mb-2">
                  {activeTab === 'assigned' ? 'No assigned employees' : 'No available employees'}
                </p>
                <p className="text-sm">
                  {activeTab === 'assigned'
                    ? 'Employees assigned to this department will appear here'
                    : 'All employees not assigned to this department will appear here'
                  }
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="max-h-[40vh] sm:max-h-96 overflow-y-auto"
              >
                {paginatedEmployees.map((employee, index) => (
                  <EmployeeListRow
                    key={employee._id}
                    employee={employee}
                    isSelected={selectedUsers.includes(employee._id)}
                    index={index}
                    activeTab={activeTab}
                    departments={departments}
                    onSelect={onSelectUser}
                    isDarkMode={isDarkMode}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Pagination - Responsive */}
        {currentTabEmployees.length > itemsPerPage && (
          <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 p-4 ${isDarkMode ? 'bg-gray-700/50' : 'bg-gray-50'} rounded-xl`}>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
              <label className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'} font-medium`}>Items per page:</label>
              <select
                value={itemsPerPage}
                onChange={(e) => onItemsPerPageChange(parseInt(e.target.value))}
                className={`px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isDarkMode 
                    ? 'bg-gray-700 border-gray-600 text-white' 
                    : 'bg-white border-gray-300 text-gray-900'
                }`}
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div className="flex items-center justify-between w-full sm:w-auto gap-2">
              <button
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className={`px-3 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex-1 sm:flex-none ${
                  isDarkMode 
                    ? 'border-gray-600 text-gray-200 hover:bg-gray-600' 
                    : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                }`}
              >
                Previous
              </button>
              <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'} font-medium whitespace-nowrap`}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className={`px-3 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex-1 sm:flex-none ${
                  isDarkMode 
                    ? 'border-gray-600 text-gray-200 hover:bg-gray-600' 
                    : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                }`}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Action Button */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={activeTab === 'assigned' ? onUnassignClick : onAssignClick}
          disabled={selectedUsers.length === 0 || isLoading}
          className={`w-full mt-4 sm:mt-6 py-3 sm:py-4 rounded-lg sm:rounded-xl font-semibold transition-all shadow-lg md:shadow-xl flex items-center justify-center gap-2 text-sm sm:text-base ${
            activeTab === 'assigned'
              ? 'bg-gradient-to-r from-red-600 to-red-700 text-white hover:from-red-700 hover:to-red-800 shadow-red-500/30'
              : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 shadow-blue-500/30'
          } disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100`}
        >
          {isLoading ? (
            <>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-5 h-5 border-2 border-white border-t-transparent rounded-full flex-shrink-0"
              />
              <span>Processing...</span>
            </>
          ) : (
            <>
              <UserPlus size={18} className={`flex-shrink-0 ${activeTab === 'assigned' ? 'rotate-45' : ''}`} />
              <span className="truncate">{activeTab === 'assigned' ? 'Unassign' : 'Assign'} {selectedUsers.length > 0 && `(${selectedUsers.length})`}</span>
            </>
          )}
        </motion.button>

        {/* Selected Count */}
        <AnimatePresence>
          {selectedUsers.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`mt-4 p-4 ${isDarkMode ? 'bg-blue-500/10 border-blue-500/30' : 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200'} border rounded-xl flex items-center justify-between`}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600 rounded-lg">
                  <CheckCircle className="text-white" size={20} />
                </div>
                <span className={`font-semibold ${isDarkMode ? 'text-blue-300' : 'text-blue-900'}`}>
                  {selectedUsers.length} employee{selectedUsers.length !== 1 ? 's' : ''} selected
                </span>
              </div>
              <button
                onClick={onClearSelection}
                className={`text-sm ${isDarkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-800'} font-semibold hover:underline`}
              >
                Clear Selection
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
});

/**
 * EmployeeListRow Component
 * Individual employee row with checkbox and details
 */
const EmployeeListRow = memo(({
  employee,
  isSelected,
  index,
  activeTab,
  departments,
  onSelect,
  isDarkMode = false
}) => {
  return (
    <motion.label
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ delay: index * 0.02 }}
      className={`flex items-center p-4 cursor-pointer border-b last:border-b-0 transition-all ${
        isDarkMode 
          ? `border-gray-700 ${isSelected ? 'bg-blue-500/10' : 'hover:bg-gray-700/50'}`
          : `border-gray-100 ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`
      }`}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onSelect(employee._id)}
        key={`checkbox-${employee._id}-${isDarkMode}`}
        className="w-5 h-5 rounded border-2 cursor-pointer transition-colors focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
        style={{
          backgroundColor: isSelected 
            ? '#2563eb' 
            : isDarkMode ? '#374151' : '#ffffff',
          borderColor: isSelected 
            ? '#2563eb' 
            : isDarkMode ? '#6b7280' : '#d1d5db',
          accentColor: '#2563eb',
          colorScheme: isDarkMode ? 'dark' : 'light'
        }}
      />
      <div className="ml-4 flex-1">
        <div className="flex items-center gap-3">
          <Avatar 
            src={employee.avatar} 
            name={employee.name} 
            role={employee.role}
            isVerified={employee.isVerified}
            size="lg"
            showBadge={true}
          />
          <div className="flex-1 min-w-0">
            <p className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'} truncate`}>{employee.name}</p>
            <div className="flex items-center gap-2 mt-1">
              <Mail size={12} className={`${isDarkMode ? 'text-gray-500' : 'text-gray-400'} flex-shrink-0`} />
              <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} truncate`}>{employee.email}</p>
            </div>
            {/* Show assigned department names for employees with multiple assignments */}
            {activeTab === 'assigned' && employee.department && employee.department.length > 1 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {departments
                  .filter(dept => employee.department.includes(dept._id))
                  .map(dept => (
                    <span
                      key={dept._id}
                      className={`px-2 py-1 text-xs ${isDarkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700'} rounded-full font-medium`}
                    >
                      {dept.name}
                    </span>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Show "Assigned" tag only in available employees list for employees with any department assignment */}
      {activeTab === 'all' && employee.department && employee.department.length > 0 && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="flex items-center gap-2"
        >
          <span className={`flex items-center gap-1 px-3 py-1.5 text-xs ${isDarkMode ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'} rounded-full font-semibold shadow-sm`}>
            <CheckCircle size={14} />
            Assigned
          </span>
        </motion.div>
      )}
    </motion.label>
  );
});

EmployeeAssignment.displayName = 'EmployeeAssignment';
EmployeeListRow.displayName = 'EmployeeListRow';

export default EmployeeAssignment;

