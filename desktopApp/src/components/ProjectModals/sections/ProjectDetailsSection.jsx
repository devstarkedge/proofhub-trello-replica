import { memo } from 'react';
import { Briefcase, DollarSign, Clock, Link2, Tag } from 'lucide-react';
import FormField from './FormField';
import ProjectOptionsDropdown from '../../ProjectOptionsDropdown';
import MilestoneScheduleEditor from '../../MilestoneScheduleEditor';
import useProjectAccess from '../../../hooks/useProjectAccess';

const ProjectDetailsSection = memo(({
  projectType = 'Hired Client',
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
  technologies = [],
  errors,
  projectUrlValid,
  handleInputChange,
  handleDropdownChange,
  handleMilestonesChange,
  handleBudgetChange,
  handleWorkflowChange
}) => {
  const { canCreate, isEmployee } = useProjectAccess();
  if (isEmployee) return null;
  return (
    <section className="bg-gray-50 rounded-2xl p-5 border border-gray-200">
      <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
        <Briefcase size={16} className="text-indigo-600" />
        Project Details
      </h3>

      {projectType !== 'Inhouse' && (
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


      </div>

      )}
      <div className={projectType === 'Inhouse' ? '' : 'mt-4'}>
        <FormField label="Technology" icon={Tag} error={errors?.technologies}>
          <ProjectOptionsDropdown optionType="technology" value={technologies}
            onChange={value => handleDropdownChange('technologies', value)}
            multiple searchable allowManage={canCreate} allowDelete={false}
            addLabel="Add Technology" placeholder="Select technologies" showLabel={false} theme="blue" />
        </FormField>
      </div>

    </section>
  );
});

ProjectDetailsSection.displayName = 'ProjectDetailsSection';

export default ProjectDetailsSection;
