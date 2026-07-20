import React, { useState, memo } from 'react';
import { Info, FileText, Calendar } from 'lucide-react';
import RichTextEditor from '../../RichTextEditor';
import DatePickerModal from '../../DatePickerModal';
import FormField from './FormField'; // We will create this shared component

const BasicInfoSection = memo(({
  title,
  description,
  startDate,
  dueDate,
  errors,
  handleInputChange,
  handleDescriptionChange,
  handleStartDateChange,
  handleDueDateChange
}) => {
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);

  return (
    <>
      <section className="bg-gray-50 rounded-2xl p-5 border border-gray-200">
        <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Info size={16} className="text-blue-600" />
          Basic Information
        </h3>

        <div className="space-y-5">
          <FormField label="Project Title" icon={FileText} required error={errors?.title}>
            <input
              type="text"
              name="title"
              value={title}
              onChange={handleInputChange}
              className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                errors?.title ? 'border-red-500 bg-red-50' : 'border-gray-300 hover:border-blue-300'
              }`}
              placeholder="Enter a descriptive project title"
            />
          </FormField>

          <FormField label="Description" icon={FileText} helperText="No character limit - describe your project in detail">
            <RichTextEditor
              content={description}
              onChange={handleDescriptionChange}
              placeholder="Describe the project goals, deliverables, and requirements..."
              startExpanded={true}
              allowMentions={false}
              enableAttachments={false}
              showLinkTool={false}
              showImageTool={false}
              editorMinHeightClass="min-h-[120px]"
              className="bg-white border border-gray-300 rounded-xl p-2 hover:border-blue-300"
            />
          </FormField>
        </div>
      </section>

      {/* Dates */}
      <section className="bg-gray-50 rounded-2xl p-5 border border-gray-200 mt-6">
        <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Calendar size={16} className="text-green-600" />
          Timeline
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Start Date" icon={Calendar} required error={errors?.startDate}>
            <div
              onClick={() => setShowStartDatePicker(true)}
              className={`w-full px-4 py-3 border rounded-xl cursor-pointer flex items-center justify-between hover:border-blue-300 ${
                errors?.startDate ? 'border-red-500 bg-red-50' : 'border-gray-300'
              }`}
            >
              <span className={startDate ? 'text-gray-900' : 'text-gray-400'}>
                {startDate
                  ? new Date(startDate).toLocaleDateString('en-US', {
                      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
                    })
                  : 'Select start date'}
              </span>
              <Calendar size={16} className="text-gray-400" />
            </div>
          </FormField>

          <FormField label="Due Date" icon={Calendar} error={errors?.dueDate}>
            <div
              onClick={() => setShowDueDatePicker(true)}
              className={`w-full px-4 py-3 border rounded-xl cursor-pointer flex items-center justify-between hover:border-blue-300 ${
                errors?.dueDate ? 'border-red-500 bg-red-50' : 'border-gray-300'
              }`}
            >
              <span className={dueDate ? 'text-gray-900' : 'text-gray-400'}>
                {dueDate
                  ? new Date(dueDate).toLocaleDateString('en-US', {
                      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
                    })
                  : 'Select due date'}
              </span>
              <Calendar size={16} className="text-gray-400" />
            </div>
          </FormField>
        </div>
      </section>

      <DatePickerModal
        isOpen={showStartDatePicker}
        onClose={() => setShowStartDatePicker(false)}
        onSelectDate={(date) => {
          handleStartDateChange(date || '');
          setShowStartDatePicker(false);
        }}
        selectedDate={startDate}
        title="Select Start Date"
      />
      <DatePickerModal
        isOpen={showDueDatePicker}
        onClose={() => setShowDueDatePicker(false)}
        onSelectDate={(date) => {
          handleDueDateChange(date || '');
          setShowDueDatePicker(false);
        }}
        selectedDate={dueDate}
        title="Select Due Date"
        minDate={startDate || null}
      />
    </>
  );
});

BasicInfoSection.displayName = 'BasicInfoSection';

export default BasicInfoSection;
