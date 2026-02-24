import React, { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Save,
  Users,
  AlertCircle,
  TrendingUp,
  Calendar,
  Tag,
  Trash2,
  X,
  Plus,
  ChevronDown,
} from "lucide-react";
import LabelDropdown from "../LabelDropdown";
import DatePickerModal from "../DatePickerModal";
import Avatar from "../Avatar";
import usePermissions from "../../hooks/usePermissions";

const CardSidebar = ({
  saving,
  onSave,
  assignees,
  teamMembers,
  priority,
  status,
  dueDate,
  startDate,
  labels,
  availableStatuses,
  searchQuery,
  isDropdownOpen,
  groupedFilteredMembers,
  expandedDepartments,
  onPriorityChange,
  onStatusChange,
  onDueDateChange,
  onStartDateChange,
  onLabelsChange,
  onSelectMember,
  onRemoveAssignee,
  onToggleDepartment,
  onSearchQueryChange,
  onIsDropdownOpenChange,
  onDeleteCard,
  card,
  boardId,
  entityType = 'card',
}) => {
  const dropdownRef = useRef(null);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  
  const { can } = usePermissions();
  const canAssign = can('canAssignMembers');

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        onIsDropdownOpenChange(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDropdownOpen, onIsDropdownOpenChange]);

  return (
    <div className="lg:col-span-1 space-y-4 lg:space-y-6">
      {/* Save Button */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onSave}
        disabled={saving}
        className="flex items-center justify-center gap-2 w-full p-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg disabled:opacity-50 font-medium"
      >
        <Save size={18} />
        {saving ? "Saving..." : "Save Changes"}
      </motion.button>

      {/* Add to card section */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <h4 className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wider">
          Add to card
        </h4>

        <div className="space-y-3">
          {/* Assignees */}
          <div>
            <label className="flex items-center gap-2 text-sm text-gray-700 mb-3 font-medium">
              <Users size={14} />
              Assignees
            </label>

            {/* Assigned Users Display */}
            {assignees.length > 0 && (
              <div className="mb-3">
                <div className="flex flex-wrap gap-2">
                  {assignees.map((assigneeId, idx) => {
                    // Find assignee in team members
                    const assignee = teamMembers.find(m => m._id === assigneeId);
                    // Handle department as array (take first department name or 'Unassigned')
                    const departmentName = assignee?.department && Array.isArray(assignee.department) && assignee.department.length > 0
                      ? assignee.department[0].name || 'Unassigned'
                      : 'Unassigned';
                    const safeKey = String(assigneeId || `assignee-${idx}`).trim() || `assignee-${idx}`;
                    return (
                      <motion.div
                        key={safeKey}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        className="flex items-center gap-2 bg-blue-100 text-blue-800 px-3 py-2 rounded-full text-sm font-medium"
                      >
                        <Avatar
                          src={assignee?.avatar}
                          name={assignee?.name || assignee?.email}
                          size="xs"
                          showBadge={false}
                        />
                        <div className="flex flex-col items-start">
                          <span>{assignee?.name || assignee?.email || "Unknown"}</span>
                          <span className="text-xs text-blue-600 font-normal">{departmentName}</span>
                        </div>
                        {canAssign ? (
                          <button
                            onClick={() =>
                              onRemoveAssignee(assigneeId)
                            }
                            className="text-blue-600 hover:text-blue-800 ml-1"
                          >
                            <X size={14} />
                          </button>
                        ) : (
                          <div className="w-1 ml-1" /> // Spacer for consistent padding
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Search Bar & Dropdown - Only visible if has permission */}
            {canAssign && (
              <div className="mb-3 relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onSearchQueryChange(e.target.value)}
                  onFocus={() => onIsDropdownOpenChange(true)}
                  placeholder="Search members by name or email..."
                  className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />

                {/* Search Results */}
                {isDropdownOpen && (
                  <div ref={dropdownRef} className="absolute left-0 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-2xl max-h-80 overflow-y-auto z-50 custom-scrollbar">
                    {Object.keys(groupedFilteredMembers).length > 0 ? (
                      Object.entries(groupedFilteredMembers)
                        .sort(([aId, aGroup], [bId, bGroup]) => {
                          // Put "Unassigned" last
                          if (aGroup.department.name === 'Unassigned') return 1;
                          if (bGroup.department.name === 'Unassigned') return -1;
                          // Otherwise sort alphabetically
                          return aGroup.department.name.localeCompare(bGroup.department.name);
                        })
                        .map(([deptId, group], deptIdx) => {
                          // Ensure key is never empty
                          const safeKey = (String(deptId).trim()) || `dept-${deptIdx}`;
                          return (
                            <div key={safeKey} className="border-b border-gray-100 last:border-b-0">
                              {/* Department Header */}
                              <div
                                className="flex items-center justify-between p-4 bg-gray-100 hover:bg-gray-200 cursor-pointer transition-all duration-200 border-l-4 border-blue-500 shadow-sm rounded-t-xl"
                                onClick={() => onToggleDepartment(deptId)}
                              >
                                <div className="flex items-center gap-3">
                                  <motion.div
                                    animate={{ rotate: expandedDepartments[deptId] ? 0 : -90 }}
                                    transition={{ duration: 0.2 }}
                                  >
                                    <ChevronDown size={16} className="text-gray-600" />
                                  </motion.div>
                                  <span className="font-bold text-gray-800 text-sm uppercase tracking-wide">
                                    {group.department.name}
                                  </span>
                                  <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full font-medium border border-blue-200">
                                    {group.members.length}
                                  </span>
                                </div>
                              </div>

                              {/* Department Members */}
                              <AnimatePresence>
                                {expandedDepartments[deptId] && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                  >
                                    {group.members.map((member, idx) => {
                                      const isAssigned = assignees.includes(member._id);
                                      const safeKey = String(member._id || `member-${idx}`).trim() || `member-${idx}`;
                                      return (
                                        <motion.button
                                          key={safeKey}
                                          whileHover={{ scale: 1.01, backgroundColor: "#f9fafb" }}
                                          whileTap={{ scale: 0.99 }}
                                          onClick={() => onSelectMember(member._id)}
                                          disabled={isAssigned}
                                          className={`w-full flex items-center gap-4 p-4 text-left hover:bg-gray-50 transition-all duration-200 ${
                                            isAssigned ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'cursor-pointer'
                                          }`}
                                        >
                                          <Avatar
                                            src={member.avatar}
                                            name={member.name}
                                            role={member.role}
                                            size="md"
                                            showBadge={false}
                                          />
                                          <div className="flex-1 min-w-0">
                                            <div className="text-sm font-semibold text-gray-900 truncate">
                                              {member.name}
                                            </div>
                                            <div className="text-xs text-gray-500 truncate">
                                              {member.email}
                                            </div>
                                          </div>
                                          {isAssigned ? (
                                            <span className="text-xs text-green-600 font-medium bg-green-50 px-2 py-1 rounded-full border border-green-200">
                                              Assigned
                                            </span>
                                          ) : (
                                            <div className="w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-600 flex items-center justify-center transition-colors">
                                              <Plus size={16} className="text-white" />
                                            </div>
                                          )}
                                        </motion.button>
                                      );
                                    })}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })
                    ) : (
                      <div className="text-center text-gray-500 text-sm py-8">
                        No members found
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Priority */}
          <div>
            <label className="flex items-center gap-2 text-sm text-gray-700 mb-1.5 font-medium">
              <AlertCircle size={14} />
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => onPriorityChange(e.target.value)}
              className="w-full p-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">No Priority</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="flex items-center gap-2 text-sm text-gray-700 mb-1.5 font-medium">
              <TrendingUp size={14} />
              Status
            </label>
            <select
              value={status}
              onChange={(e) => onStatusChange(e.target.value)}
              className="w-full p-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Select status</option>
              {availableStatuses.map((statusOption, idx) => (
                <option key={`${statusOption.value}-${idx}`} value={statusOption.value}>
                  {statusOption.label}
                </option>
              ))}
            </select>
          </div>

          {/* Dates */}
          <div className="space-y-2.5">
            {/* Start Date */}
            <motion.div
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className="cursor-pointer"
            >
              <label className="flex items-center gap-2 text-xs text-gray-700 mb-1.5 font-medium">
                <Calendar size={13} className="text-green-600" />
                Start Date
              </label>
              <div 
                onClick={() => setShowStartDatePicker(true)}
                className="p-2.5 border-2 border-gray-300 rounded-lg hover:border-green-400 hover:bg-green-50 transition-all duration-200 bg-white flex items-center justify-between group"
              >
                <p className="text-xs font-medium text-gray-900">
                  {startDate 
                    ? new Date(startDate).toLocaleDateString('en-US', { 
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })
                    : 'Click to select date'
                  }
                </p>
                {startDate && (
                  <motion.button
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartDateChange(null);
                    }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    className="text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <X size={14} />
                  </motion.button>
                )}
              </div>
            </motion.div>

            {/* Due Date */}
            <motion.div
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className="cursor-pointer"
            >
              <label className="flex items-center gap-2 text-xs text-gray-700 mb-1.5 font-medium">
                <Calendar size={13} className="text-red-600" />
                Due Date
              </label>
              <div 
                onClick={() => setShowDueDatePicker(true)}
                className="p-2.5 border-2 border-gray-300 rounded-lg hover:border-red-400 hover:bg-red-50 transition-all duration-200 bg-white flex items-center justify-between group"
              >
                <p className="text-xs font-medium text-gray-900">
                  {dueDate 
                    ? new Date(dueDate).toLocaleDateString('en-US', { 
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })
                    : 'Click to select date'
                  }
                </p>
                {dueDate && (
                  <motion.button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDueDateChange(null);
                    }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    className="text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <X size={14} />
                  </motion.button>
                )}
              </div>
            </motion.div>
          </div>

          {/* Labels - Using LabelDropdown */}
          <LabelDropdown
            boardId={boardId}
            selectedLabels={labels}
            onLabelsChange={onLabelsChange}
            entityType={entityType}
            entityId={card?._id}
          />
        </div>
      </div>

      {/* Actions section */}
      <div className="bg-red-50 rounded-lg p-4 border border-red-200">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onDeleteCard}
          className="flex items-center justify-center gap-2 w-full p-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium shadow-sm"
        >
          <Trash2 size={16} />
          Delete Task
        </motion.button>
      </div>

      {/* Date Picker Modals */}
      <DatePickerModal
        isOpen={showStartDatePicker}
        onClose={() => setShowStartDatePicker(false)}
        onSelectDate={onStartDateChange}
        selectedDate={startDate}
        title="Select Start Date"
      />
      <DatePickerModal
        isOpen={showDueDatePicker}
        onClose={() => setShowDueDatePicker(false)}
        onSelectDate={onDueDateChange}
        selectedDate={dueDate}
        title="Select Due Date"
      />

      <style jsx="true">{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #888;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #555;
        }
      `}</style>
    </div>
  );
};

export default CardSidebar;
