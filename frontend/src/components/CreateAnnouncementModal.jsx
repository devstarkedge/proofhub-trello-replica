import React, { useState } from 'react';
import { X, Upload, Calendar, Clock, Users, Pin } from 'lucide-react';
import { toast } from 'react-toastify';

const CreateAnnouncementModal = ({ isOpen, onClose, onSubmit, isLoading }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'General',
    customCategory: '',
    subscribers: {
      type: 'all',
      departments: [],
      users: [],
      roles: []
    },
    lastFor: {
      value: 7,
      unit: 'days'
    },
    scheduledFor: '',
    allowComments: true,
    isPinned: false
  });

  const [files, setFiles] = useState([]);
  const [fileNames, setFileNames] = useState([]);

  if (!isOpen) return null;

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubscriberChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      subscribers: {
        ...prev.subscribers,
        [field]: value
      }
    }));
  };

  const handleDurationChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      lastFor: {
        ...prev.lastFor,
        [field]: field === 'value' ? parseInt(value) : value
      }
    }));
  };

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    setFiles(prev => [...prev, ...selectedFiles]);
    setFileNames(prev => [...prev, ...selectedFiles.map(f => f.name)]);
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setFileNames(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast.error('Title is required');
      return;
    }

    if (!formData.description.trim()) {
      toast.error('Description is required');
      return;
    }

    try {
      await onSubmit(formData, files);
      // Reset form
      setFormData({
        title: '',
        description: '',
        category: 'General',
        customCategory: '',
        subscribers: {
          type: 'all',
          departments: [],
          users: [],
          roles: []
        },
        lastFor: {
          value: 7,
          unit: 'days'
        },
        scheduledFor: '',
        allowComments: true,
        isPinned: false
      });
      setFiles([]);
      setFileNames([]);
      onClose();
    } catch (error) {
      console.error('Error creating announcement:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between p-6 border-b border-gray-200 bg-white">
          <h2 className="text-2xl font-bold text-gray-900">Create Announcement</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Title *
            </label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              placeholder="Enter announcement title"
              maxLength={200}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">{formData.title.length}/200</p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Description *
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder="Enter detailed announcement description"
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Category *
            </label>
            <select
              name="category"
              value={formData.category}
              onChange={handleInputChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="General">General</option>
              <option value="HR">HR</option>
              <option value="Urgent">Urgent</option>
              <option value="System Update">System Update</option>
              <option value="Events">Events</option>
              <option value="Custom">Custom</option>
            </select>
          </div>

          {/* Custom Category */}
          {formData.category === 'Custom' && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Custom Category
              </label>
              <input
                type="text"
                name="customCategory"
                value={formData.customCategory}
                onChange={handleInputChange}
                placeholder="Enter custom category"
                maxLength={50}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Subscriber Type */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Subscribers
            </label>
            <select
              value={formData.subscribers.type}
              onChange={(e) => handleSubscriberChange('type', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All verified users</option>
              <option value="departments">Specific departments</option>
              <option value="users">Specific users</option>
              <option value="managers">Only managers</option>
              <option value="custom">Custom selection</option>
            </select>
          </div>

          {/* Duration */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                <Clock className="w-4 h-4 inline mr-1" />
                Duration Value *
              </label>
              <input
                type="number"
                value={formData.lastFor.value}
                onChange={(e) => handleDurationChange('value', e.target.value)}
                min={1}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Unit *
              </label>
              <select
                value={formData.lastFor.unit}
                onChange={(e) => handleDurationChange('unit', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="hours">Hours</option>
                <option value="days">Days</option>
                <option value="weeks">Weeks</option>
                <option value="months">Months</option>
              </select>
            </div>
          </div>

          {/* Schedule */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              <Calendar className="w-4 h-4 inline mr-1" />
              Schedule for later (Optional)
            </label>
            <input
              type="datetime-local"
              name="scheduledFor"
              value={formData.scheduledFor}
              onChange={handleInputChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">Leave empty for immediate broadcast</p>
          </div>

          {/* Attachments */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              <Upload className="w-4 h-4 inline mr-1" />
              Attachments (Optional)
            </label>
            <input
              type="file"
              multiple
              onChange={handleFileChange}
              accept="image/*"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            />
            {fileNames.length > 0 && (
              <div className="mt-2 space-y-1">
                {fileNames.map((name, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm bg-gray-100 p-2 rounded">
                    <span className="text-gray-700">{name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Options */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="allowComments"
                checked={formData.allowComments}
                onChange={handleInputChange}
                className="w-4 h-4 rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">Allow comments</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="isPinned"
                checked={formData.isPinned}
                onChange={handleInputChange}
                className="w-4 h-4 rounded border-gray-300"
              />
              <Pin className="w-4 h-4 text-blue-600" />
              <span className="text-sm text-gray-700">Pin to top (max 3)</span>
            </label>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
            >
              {isLoading ? 'Creating...' : 'Create Announcement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateAnnouncementModal;
