import React, { memo } from 'react';
import { FileText, Calendar, Clock, Globe, DollarSign, Mail, Image as ImageIcon } from 'lucide-react';
import HtmlContent from '../../ui/HtmlContent';

const ViewDetailsTab = memo(({ project }) => {
  if (!project) return null;

  return (
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
          {project.billingCycle === 'milestone' && (
            <>
              <div>
                <label className="text-xs text-gray-500">Total Project Budget</label>
                <p className="text-sm text-gray-900">${Number(project.totalProjectBudget || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500">Milestone Workflow</label>
                <p className="text-sm text-gray-900 capitalize">{project.milestoneWorkflow || 'sequential'}</p>
              </div>
            </>
          )}
        </div>
        {project.billingCycle === 'milestone' && (
          <div className="mt-5 space-y-3">
            {(project.milestones || []).map((milestone) => (
              <div key={milestone._id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{milestone.order + 1}. {milestone.title}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Due {new Date(milestone.dueDate).toLocaleDateString()}
                      {milestone.paidAt ? ` · Paid ${new Date(milestone.paidAt).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium capitalize text-gray-700">
                    {milestone.status?.replace('-', ' ')}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-gray-500">Amount</span>
                    <p className="font-semibold text-gray-900">${Number(milestone.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Approved</span>
                    <p className="font-semibold text-gray-900">${Number(milestone.approvedAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
                {(milestone.approvals || []).length > 0 && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <p className="mb-2 text-xs font-medium text-gray-700">Approval history</p>
                    {(milestone.approvals || []).map((approval) => (
                      <p key={approval._id} className="text-xs text-gray-500">
                        ${Number(approval.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        {' · '}{new Date(approval.approvedAt).toLocaleString()}
                        {approval.approvedBy?.name ? ` · ${approval.approvedBy.name}` : ''}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
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
  );
});

ViewDetailsTab.displayName = 'ViewDetailsTab';

export default ViewDetailsTab;
