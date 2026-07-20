import React, { memo, useState, useRef, useEffect } from 'react';
import { Briefcase, DollarSign, Clock, Link2, Tag, ChevronDown, Trash2, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import FormField from './FormField';
import ProjectOptionsDropdown from '../../ProjectOptionsDropdown';
import MilestoneScheduleEditor from '../../MilestoneScheduleEditor';

const ProjectDetailsSection = memo(({
  projectSource,
  upworkId,
  billingCycle,
  fixedPrice,
  hourlyPrice,
  totalProjectBudget,
  milestoneWorkflow,
  milestones,
  estimatedTime,
  projectUrl,
  projectCategory,
  categories,
  errors,
  projectUrlValid,
  handleInputChange,
  handleDropdownChange,
  handleMilestonesChange,
  handleBudgetChange,
  handleWorkflowChange,
  handleCategoryChange,
  handleDeleteCategory,
  handleCreateCategory
}) => {
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");
  const categoryDropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (categoryDropdownOpen && categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target)) {
        setCategoryDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [categoryDropdownOpen]);

  const onCategoryCreate = () => {
    handleCreateCategory(newCategoryName, newCategoryDescription);
    setNewCategoryName("");
    setNewCategoryDescription("");
    setShowAddCategory(false);
  };

  return (
    <section className="bg-gray-50 rounded-2xl p-5 border border-gray-200">
      <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
        <Briefcase size={16} className="text-indigo-600" />
        Project Details
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <FormField label="Project Source" icon={Briefcase}>
          <ProjectOptionsDropdown
            optionType="projectSource"
            value={projectSource}
            onChange={(val) => handleDropdownChange('projectSource', val)}
            allowManage={true}
            showLabel={false}
            theme="blue"
          />
        </FormField>

        {projectSource === 'Upwork' && (
          <FormField label="Upwork ID" icon={Tag}>
            <input
              type="text"
              name="upworkId"
              value={upworkId}
              onChange={handleInputChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-blue-300"
              placeholder="Upwork Job ID"
            />
          </FormField>
        )}

        <FormField label="Billing Type" icon={DollarSign}>
          <ProjectOptionsDropdown
            optionType="billingType"
            value={billingCycle}
            onChange={(val) => handleDropdownChange('billingCycle', val)}
            allowManage={true}
            showLabel={false}
            theme="blue"
          />
        </FormField>

        {billingCycle === 'milestone' ? (
          <MilestoneScheduleEditor
            totalProjectBudget={totalProjectBudget}
            milestoneWorkflow={milestoneWorkflow}
            milestones={milestones}
            onBudgetChange={handleBudgetChange}
            onWorkflowChange={handleWorkflowChange}
            onMilestonesChange={handleMilestonesChange}
            error={errors?.milestones}
          />
        ) : billingCycle === 'fixed' ? (
          <FormField label="Fixed Price" icon={DollarSign}>
            <input
              type="number"
              name="fixedPrice"
              value={fixedPrice}
              onChange={handleInputChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-blue-300"
              placeholder="$0.00"
              min="0"
            />
          </FormField>
        ) : (
          <FormField label="Hourly Rate" icon={DollarSign}>
            <input
              type="number"
              name="hourlyPrice"
              value={hourlyPrice}
              onChange={handleInputChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-blue-300"
              placeholder="$/hr"
              min="0"
            />
          </FormField>
        )}

        <FormField label="Estimated Time" icon={Clock}>
          <input
            type="text"
            name="estimatedTime"
            value={estimatedTime}
            autoComplete="off"
            onChange={handleInputChange}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-blue-300"
            placeholder="e.g., 3 days, 40h"
          />
        </FormField>

        <FormField label="Website URL" icon={Link2} error={errors?.projectUrl}>
          <input
            type="text"
            name="projectUrl"
            value={projectUrl}
            onChange={handleInputChange}
            autoComplete="off"
            className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors?.projectUrl ? 'border-red-500 bg-red-50' : projectUrlValid && projectUrl ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-blue-300'
            }`}
            placeholder="https://example.com"
          />
        </FormField>

        <FormField label="Category" icon={Tag}>
          <div className="relative" ref={categoryDropdownRef}>
            <div
              onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl cursor-pointer flex items-center justify-between hover:border-blue-300 bg-white"
            >
              <span className={projectCategory ? 'text-gray-900' : 'text-gray-400'}>
                {projectCategory || 'Select category'}
              </span>
              <ChevronDown size={16} className={`text-gray-400 transition-transform ${categoryDropdownOpen ? 'rotate-180' : ''}`} />
            </div>

            {categoryDropdownOpen && (
              <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                {categories.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-500">
                    No categories available
                  </div>
                ) : (
                  categories.map((cat) => (
                    <div
                      key={cat._id}
                      className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 group transition-colors border-b border-gray-100 last:border-b-0"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          handleCategoryChange(cat.name);
                          setCategoryDropdownOpen(false);
                        }}
                        className="flex-1 text-left text-sm text-gray-700 hover:text-gray-900"
                      >
                        {cat.name}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteCategory(cat._id, cat.name, e)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all ml-2"
                        title="Delete category"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowAddCategory(true);
                    setCategoryDropdownOpen(false);
                  }}
                  className="w-full px-4 py-2.5 flex items-center gap-2 text-blue-600 hover:bg-blue-50 text-sm font-medium transition-colors border-t border-gray-200"
                >
                  <Plus size={14} />
                  Add New Category
                </button>
              </div>
            )}
          </div>
        </FormField>
      </div>

      {/* Add Category Form */}
      <AnimatePresence>
        {showAddCategory && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 p-4 bg-pink-50 border border-pink-200 rounded-xl"
          >
            <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Plus size={14} className="text-pink-600" />
              New Category
            </h4>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Category name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
              />
              <textarea
                placeholder="Description (optional)"
                value={newCategoryDescription}
                onChange={(e) => setNewCategoryDescription(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 resize-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onCategoryCreate}
                  className="flex-1 px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 font-medium"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddCategory(false); setNewCategoryName(""); setNewCategoryDescription(""); }}
                  className="px-4 py-2 text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
});

ProjectDetailsSection.displayName = 'ProjectDetailsSection';

export default ProjectDetailsSection;
