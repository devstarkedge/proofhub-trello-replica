import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  X, Calendar, Clock, DollarSign, User, Mail, Phone,
  Globe, Tag, Users, Building, FileText, Eye
} from 'lucide-react';
import Database from '../services/database';

// Simple skeleton loader for better UX
const Skeleton = ({ className = '' }) => (
  <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
);

const ViewProjectModal = ({ isOpen, onClose, projectId }) => {
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && projectId) {
      fetchProjectDetails();
    }
    // eslint-disable-next-line
  }, [isOpen, projectId]);

  const fetchProjectDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await Database.getProject(projectId);
      if (response.success) {
        setProject(response.data);
      } else {
        setError('Failed to load project details');
      }
    } catch (err) {
      console.error('Error fetching project details:', err);
      setError('Failed to load project details');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-60 flex items-center justify-center p-2 md:p-6 bg-black/40 backdrop-blur-sm"
      aria-modal="true"
      role="dialog"
      tabIndex={-1}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.97, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.97, opacity: 0 }}
        className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-blue-100"
        onClick={e => e.stopPropagation()}
      >
        {/* Sticky Header */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-blue-600 to-blue-700 text-white p-5 md:p-6 rounded-t-2xl shadow-sm flex justify-between items-center border-b border-blue-200/30">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-white/20 rounded-lg"><Eye size={24} /></span>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Project Details</h2>
              <p className="text-blue-100 text-sm mt-1">View project information</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors focus:outline-none focus:ring-2 focus:ring-white"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50">
          {loading ? (
            <div className="flex flex-col gap-6 animate-pulse">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white rounded-lg p-6 flex flex-col gap-4 shadow-sm">
                  <Skeleton className="h-6 w-1/3 mb-2" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="text-red-500 text-lg font-medium">{error}</div>
              <button
                onClick={fetchProjectDetails}
                className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                Try Again
              </button>
            </div>
          ) : project ? (
            <div className="space-y-8">
              {/* Basic Information */}
              <section className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <FileText size={20} className="text-blue-600" />
                  Basic Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Project Name</label>
                    <p className="text-gray-900 font-semibold text-base">{project.name}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Visibility</label>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      project.visibility === 'public' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {project.visibility || 'private'}
                    </span>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Project Category</label>
                    <p className="text-gray-900">{project.projectCategory || 'Not specified'}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
                    <div className="flex items-center gap-2">
                      <Calendar size={16} className="text-gray-400" />
                      <span>{project.startDate ? new Date(project.startDate).toLocaleDateString() : 'Not set'}</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Due Date</label>
                    <div className="flex items-center gap-2">
                      <Clock size={16} className="text-gray-400" />
                      <span>{project.dueDate ? new Date(project.dueDate).toLocaleDateString() : 'Not set'}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                  <p className="text-gray-700 bg-gray-50 p-3 rounded border border-gray-100 text-sm min-h-[40px]">{project.description || 'No description provided'}</p>
                </div>
              </section>
              <div className="border-t border-gray-200" />

              {/* Project Source & URLs */}
              <section className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Globe size={20} className="text-blue-600" />
                  Project Source & Links
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Project Source</label>
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
                        {project.projectSource || 'Direct'}
                      </span>
                    </div>
                  </div>
                  {project.projectSource === 'Upwork' && project.upworkId && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Upwork ID</label>
                      <p className="text-gray-900">{project.upworkId}</p>
                    </div>
                  )}
                  {project.projectUrl && (
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Project URL</label>
                      <a
                        href={project.projectUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 underline break-all"
                      >
                        {project.projectUrl}
                      </a>
                    </div>
                  )}
                </div>
              </section>
              <div className="border-t border-gray-200" />

              {/* Billing Information */}
              <section className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <DollarSign size={20} className="text-blue-600" />
                  Billing Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Billing Cycle</label>
                    <p className="text-gray-900 capitalize">{project.billingCycle || 'Not specified'}</p>
                  </div>
                  {project.billingCycle === 'fixed' && project.fixedPrice && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Fixed Price</label>
                      <p className="text-gray-900 font-semibold">${project.fixedPrice}</p>
                    </div>
                  )}
                  {project.billingCycle === 'hr' && project.hourlyPrice && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Hourly Rate</label>
                      <p className="text-gray-900 font-semibold">${project.hourlyPrice}/hr</p>
                    </div>
                  )}
                  {project.estimatedTime && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Estimated Time</label>
                      <p className="text-gray-900">{project.estimatedTime}</p>
                    </div>
                  )}
                </div>
              </section>
              <div className="border-t border-gray-200" />

              {/* Client Details */}
              <section className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <User size={20} className="text-blue-600" />
                  Client Details
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Client Name</label>
                    <p className="text-gray-900">{project.clientDetails?.clientName || 'Not provided'}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Client Email</label>
                    <div className="flex items-center gap-2">
                      <Mail size={16} className="text-gray-400" />
                      <p className="text-gray-900">{project.clientDetails?.clientEmail || 'Not provided'}</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Client WhatsApp</label>
                    <div className="flex items-center gap-2">
                      <Phone size={16} className="text-gray-400" />
                      <p className="text-gray-900">{project.clientDetails?.clientWhatsappNumber || 'Not provided'}</p>
                    </div>
                  </div>
                </div>
              </section>
              <div className="border-t border-gray-200" />

              {/* Department & Members */}
              <section className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Users size={20} className="text-blue-600" />
                  Department & Members
                </h3>
                <div className="grid grid-cols-1 gap-6">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Department</label>
                    <div className="flex items-center gap-2">
                      <Building size={16} className="text-gray-400" />
                      <p className="text-gray-900">{project.department?.name || 'Not assigned'}</p>
                    </div>
                  </div>
                </div>
                {project.members && project.members.length > 0 && (
                  <div className="mt-4">
                    <label className="block text-xs font-medium text-gray-500 mb-2">Assigned Members</label>
                    <div className="flex flex-wrap gap-2">
                      {project.members.map((member) => (
                        <div key={member._id} className="flex items-center gap-2 bg-blue-50 px-3 py-2 rounded-lg border border-blue-100 hover:bg-blue-100 transition-colors">
                          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                            {member.name?.[0]?.toUpperCase() || 'U'}
                          </div>
                          <span className="text-sm text-gray-900">{member.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
              <div className="border-t border-gray-200" />

              {/* Status & Progress */}
              <section className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Clock size={20} className="text-blue-600" />
                  Status & Progress
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      project.status === 'Completed' ? 'bg-green-100 text-green-800' :
                      project.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                      project.status === 'Planning' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {project.status || 'Not set'}
                    </span>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Progress</label>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-gray-200 rounded-full h-3">
                        <div
                          className="bg-blue-500 h-3 rounded-full transition-all duration-300"
                          style={{ width: `${project.progress || 0}%` }}
                        ></div>
                      </div>
                      <span className="text-xs font-semibold text-gray-900">{project.progress || 0}%</span>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          ) : null}
        </div>

        {/* Sticky Footer */}
        <div className="sticky bottom-0 z-10 bg-white px-6 py-4 rounded-b-2xl flex justify-end border-t border-gray-200 shadow-sm">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default ViewProjectModal;
