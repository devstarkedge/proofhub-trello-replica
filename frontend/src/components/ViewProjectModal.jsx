"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Eye,
  FileText,
  Calendar,
  Clock,
  Globe,
  DollarSign,
  Link2,
  Users,
  Shield,
  Tag,
  Mail,
  Phone,
  Info,
  Image as ImageIcon,
  History,
  Pencil
} from 'lucide-react';
import Database from '../services/database';
import EnterpriseFileUploader from './EnterpriseFileUploader';
import ActivityTimeline from './ActivityTimeline';
import HtmlContent from './ui/HtmlContent';

const drawerVariants = {
  hidden: { x: '100%', opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: { type: 'spring', damping: 30, stiffness: 300 }
  },
  exit: { x: '100%', opacity: 0, transition: { duration: 0.2 } }
};

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 }
};

const StatusBadge = React.memo(({ status }) => {
  const statusConfig = {
    planning: { color: 'bg-gray-100 text-gray-700 border-gray-300', label: 'Planning' },
    'in-progress': { color: 'bg-blue-100 text-blue-700 border-blue-300', label: 'In Progress' },
    completed: { color: 'bg-green-100 text-green-700 border-green-300', label: 'Completed' },
    'on-hold': { color: 'bg-yellow-100 text-yellow-700 border-yellow-300', label: 'On Hold' }
  };
  const config = statusConfig[status] || statusConfig.planning;
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${config.color}`}>
      {config.label}
    </span>
  );
});

const PriorityBadge = React.memo(({ priority }) => {
  const priorityConfig = {
    low: { color: 'bg-emerald-100 text-emerald-700', label: 'Low' },
    medium: { color: 'bg-amber-100 text-amber-700', label: 'Medium' },
    high: { color: 'bg-orange-100 text-orange-700', label: 'High' },
    urgent: { color: 'bg-red-100 text-red-700', label: 'Urgent' }
  };
  const config = priorityConfig[priority] || priorityConfig.medium;
  return (
    <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
});

const TabNavigation = React.memo(({ tabs, activeTab, onTabChange }) => (
  <div className="flex gap-1 p-1 bg-white/10 rounded-xl backdrop-blur-sm">
    {tabs.map((tab) => (
      <button
        key={tab.id}
        onClick={() => onTabChange(tab.id)}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
          activeTab === tab.id
            ? 'bg-white text-indigo-600 shadow-sm'
            : 'text-white/80 hover:text-white hover:bg-white/10'
        }`}
      >
        <tab.icon size={16} />
        {tab.label}
        {tab.badge && (
          <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-600 text-xs font-semibold rounded-full">
            {tab.badge}
          </span>
        )}
      </button>
    ))}
  </div>
));

const EnterpriseViewProjectModal = ({ isOpen, onClose, projectId, onEditProject }) => {
  const [activeTab, setActiveTab] = useState('details');
  const [project, setProject] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [filesLoading, setFilesLoading] = useState(false);
  const [error, setError] = useState('');

  const tabs = useMemo(() => [
    { id: 'details', label: 'Details', icon: Info },
    { id: 'files', label: 'Files', icon: FileText, badge: attachments?.length ? attachments.length : null },
    { id: 'team', label: 'Team', icon: Users, badge: project?.members?.length || 0 },
    { id: 'activity', label: 'Activity', icon: History, badge: activity?.length || 0 }
  ], [attachments?.length, project?.members?.length, activity?.length]);

  useEffect(() => {
    if (!isOpen || !projectId) return;

    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await Database.getProject(projectId);
        if (response.success) {
          setProject(response.data);
        } else {
          setError('Failed to load project');
        }
      } catch (err) {
        setError('Failed to load project');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isOpen, projectId]);

  // Track which tabs have had their data fetched
  const fetchedTabsRef = React.useRef({});

  // Reset fetched tabs when projectId changes
  useEffect(() => {
    fetchedTabsRef.current = {};
    setAttachments([]);
    setActivity([]);
  }, [projectId]);

  // Lazy fetch attachments when files tab is selected
  useEffect(() => {
    if (!isOpen || !projectId) return;
    if (activeTab === 'files' && !fetchedTabsRef.current.files) {
      fetchedTabsRef.current.files = true;
      setFilesLoading(true);
      Database.getProjectAttachments(projectId)
        .then(res => {
          if (res.success) setAttachments(res.data || []);
        })
        .catch(() => {})
        .finally(() => setFilesLoading(false));
    }
  }, [activeTab, isOpen, projectId]);

  // Lazy fetch activity when activity tab is selected
  useEffect(() => {
    if (!isOpen || !projectId) return;
    if (activeTab === 'activity' && !fetchedTabsRef.current.activity) {
      fetchedTabsRef.current.activity = true;
      setActivityLoading(true);
      Database.getProjectActivity(projectId)
        .then(res => {
          if (res.success) setActivity(res.data || []);
        })
        .catch(() => {})
        .finally(() => setActivityLoading(false));
    }
  }, [activeTab, isOpen, projectId]);

  if (!isOpen) return null;

  const handleEditClick = () => {
    if (!project || !onEditProject) return;
    const departmentId = project?.department?._id || project?.departmentId;
    onEditProject(project, departmentId);
    onClose();
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]"
          />

          <motion.div
            variants={drawerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed right-0 top-0 h-full w-full max-w-5xl bg-white shadow-2xl z-[61] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-shrink-0 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 px-6 py-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-white/10 rounded-xl">
                    <Eye size={22} className="text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <h2 className="text-xl font-bold text-white truncate max-w-[320px]">
                        {project?.name || 'Project Details'}
                      </h2>
                      {project?.status && <StatusBadge status={project.status} />}
                      {project?.priority && <PriorityBadge priority={project.priority} />}
                    </div>
                    <p className="text-indigo-200 text-sm mt-1">
                      {project?.updatedAt ? `Last updated: ${new Date(project.updatedAt).toLocaleDateString()}` : 'View project information'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {onEditProject && project && (
                    <button
                      onClick={handleEditClick}
                      className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                      aria-label="Edit project"
                    >
                      <Pencil size={20} />
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                    aria-label="Close"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <TabNavigation tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="p-6 space-y-6">
                {loading ? (
                  <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
                    <div className="animate-pulse space-y-3">
                      <div className="h-5 bg-gray-200 rounded w-1/3" />
                      <div className="h-4 bg-gray-200 rounded w-2/3" />
                      <div className="h-4 bg-gray-200 rounded w-full" />
                    </div>
                  </div>
                ) : error ? (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4">
                    {error}
                  </div>
                ) : (
                  <>
                    {activeTab === 'details' && project && (
                      <div className="space-y-6">
                        {project.coverImage?.url && (
                          <section className="bg-gray-50 rounded-2xl p-5 border border-gray-200">
                            <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                              <ImageIcon size={16} className="text-purple-600" />
                              Cover Image
                            </h3>
                            <img
                              src={project.coverImage.url}
                              alt="Project Cover"
                              className="w-full max-h-64 object-cover rounded-xl border"
                            />
                          </section>
                        )}

                        <section className="bg-gray-50 rounded-2xl p-5 border border-gray-200">
                          <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <FileText size={16} className="text-blue-600" />
                            Basic Information
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs text-gray-500">Project Name</label>
                              <p className="text-sm font-semibold text-gray-900">{project.name}</p>
                            </div>
                            <div>
                              <label className="text-xs text-gray-500">Visibility</label>
                              <p className="text-sm text-gray-900 capitalize">{project.visibility || 'public'}</p>
                            </div>
                            <div>
                              <label className="text-xs text-gray-500">Project Category</label>
                              <p className="text-sm text-gray-900">{project.projectCategory || 'Not specified'}</p>
                            </div>
                            <div>
                              <label className="text-xs text-gray-500">Estimated Time</label>
                              <p className="text-sm text-gray-900">{project.estimatedTime || 'Not specified'}</p>
                            </div>
                            <div>
                              <label className="text-xs text-gray-500">Start Date</label>
                              <div className="flex items-center gap-2 text-sm text-gray-900">
                                <Calendar size={14} className="text-gray-400" />
                                <span>{project.startDate ? new Date(project.startDate).toLocaleDateString() : 'Not set'}</span>
                              </div>
                            </div>
                            <div>
                              <label className="text-xs text-gray-500">Due Date</label>
                              <div className="flex items-center gap-2 text-sm text-gray-900">
                                <Clock size={14} className="text-gray-400" />
                                <span>{project.dueDate ? new Date(project.dueDate).toLocaleDateString() : 'Not set'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="mt-4">
                            <label className="text-xs text-gray-500">Description</label>
                            {project.description ? (
                              <HtmlContent
                                html={project.description}
                                className="bg-white border border-gray-200 rounded-xl p-3 mt-1"
                              />
                            ) : (
                              <p className="text-gray-700 bg-white p-3 rounded-xl border border-gray-200 text-sm mt-1">
                                No description provided
                              </p>
                            )}
                          </div>
                        </section>

                        <section className="bg-gray-50 rounded-2xl p-5 border border-gray-200">
                          <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <Globe size={16} className="text-indigo-600" />
                            Project Source & Links
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs text-gray-500">Project Source</label>
                              <p className="text-sm text-gray-900">{project.projectSource || 'Direct'}</p>
                            </div>
                            {project.upworkId && (
                              <div>
                                <label className="text-xs text-gray-500">Upwork ID</label>
                                <p className="text-sm text-gray-900">{project.upworkId}</p>
                              </div>
                            )}
                            {project.projectUrl && (
                              <div className="md:col-span-2">
                                <label className="text-xs text-gray-500">Website URL</label>
                                <a
                                  href={project.projectUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm text-indigo-600 hover:text-indigo-800 break-all"
                                >
                                  {project.projectUrl}
                                </a>
                              </div>
                            )}
                          </div>
                        </section>

                        <section className="bg-gray-50 rounded-2xl p-5 border border-gray-200">
                          <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <DollarSign size={16} className="text-emerald-600" />
                            Billing Information
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs text-gray-500">Billing Cycle</label>
                              <p className="text-sm text-gray-900 capitalize">{project.billingCycle || 'Not specified'}</p>
                            </div>
                            {project.billingCycle === 'fixed' && (
                              <div>
                                <label className="text-xs text-gray-500">Fixed Price</label>
                                <p className="text-sm text-gray-900">{project.fixedPrice || '—'}</p>
                              </div>
                            )}
                            {project.billingCycle === 'hr' && (
                              <div>
                                <label className="text-xs text-gray-500">Hourly Rate</label>
                                <p className="text-sm text-gray-900">{project.hourlyPrice || '—'}</p>
                              </div>
                            )}
                          </div>
                        </section>

                        <section className="bg-gray-50 rounded-2xl p-5 border border-gray-200">
                          <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <Mail size={16} className="text-blue-600" />
                            Client Information
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs text-gray-500">Client Name</label>
                              <p className="text-sm text-gray-900">{project.clientDetails?.clientName || 'Not specified'}</p>
                            </div>
                            <div>
                              <label className="text-xs text-gray-500">Client Email</label>
                              <p className="text-sm text-gray-900">{project.clientDetails?.clientEmail || 'Not specified'}</p>
                            </div>
                            <div>
                              <label className="text-xs text-gray-500">Client Phone</label>
                              <p className="text-sm text-gray-900">{project.clientDetails?.clientWhatsappNumber || 'Not specified'}</p>
                            </div>
                          </div>
                        </section>
                      </div>
                    )}

                    {activeTab === 'files' && (
                      <div className="space-y-4">
                        <EnterpriseFileUploader
                          title="Project Attachments"
                          description="Attachments uploaded to this project"
                          pendingFiles={[]}
                          existingFiles={attachments}
                          onFilesAdded={null}
                          onRemovePending={null}
                          onRemoveExisting={null}
                          disabled={true}
                          showVersionHistory={true}
                          showPreview={true}
                          showDropzone={false}
                        />
                        {filesLoading && (
                          <p className="text-xs text-gray-500">Loading files...</p>
                        )}
                      </div>
                    )}

                    {activeTab === 'team' && project && (
                      <section className="bg-gray-50 rounded-2xl p-5 border border-gray-200">
                        <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                          <Shield size={16} className="text-purple-600" />
                          Project Team
                        </h3>
                        {project.members?.length ? (
                          <div className="space-y-3">
                            {project.members.map((member) => (
                              <div
                                key={member._id}
                                className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl"
                              >
                                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold">
                                  {(member?.name || 'U').charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">{member?.name || 'Unknown'}</p>
                                  <p className="text-xs text-gray-500">{member?.email || 'No email'}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">No team members assigned.</p>
                        )}
                      </section>
                    )}

                    {activeTab === 'activity' && (
                      <ActivityTimeline
                        activities={activity}
                        loading={activityLoading}
                        projectCreatedAt={project?.createdAt}
                        projectCreatedBy={project?.owner?.name}
                        projectUpdatedAt={project?.updatedAt}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default EnterpriseViewProjectModal;
