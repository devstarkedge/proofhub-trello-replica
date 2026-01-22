import React, { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FolderKanban, ChevronRight, RefreshCw, AlertCircle } from 'lucide-react';
import useMyShortcutsStore from '../../store/myShortcutsStore';

const MyProjectsSection = () => {
  const navigate = useNavigate();
  const { projects, loading, errors, projectPagination, fetchProjects } = useMyShortcutsStore();

  const handleProjectClick = (project) => {
    const { departmentId, projectId } = project.navigationContext || {};
    if (departmentId && projectId) {
      navigate(`/workflow/${departmentId}/${projectId}`);
    }
  };

  const handleLoadMore = () => {
    if (projectPagination.page < projectPagination.pages) {
      fetchProjects(projectPagination.page + 1);
    }
  };

  if (loading.projects && projects.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 bg-gray-200 rounded-lg animate-pulse"></div>
          <div className="w-32 h-5 bg-gray-200 rounded animate-pulse"></div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  if (errors.projects) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-lg border border-red-100">
        <div className="flex items-center gap-3 text-red-500 mb-4">
          <AlertCircle size={20} />
          <span>Failed to load projects</span>
        </div>
        <button 
          onClick={() => fetchProjects(1)}
          className="text-sm text-blue-600 hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
            <FolderKanban className="text-white" size={18} />
          </div>
          My Projects
          <span className="text-sm font-normal text-gray-500">({projectPagination.total})</span>
        </h2>
        <button
          onClick={() => fetchProjects(1)}
          disabled={loading.projects}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <RefreshCw size={16} className={loading.projects ? 'animate-spin text-gray-400' : 'text-gray-500'} />
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <FolderKanban size={40} className="mx-auto mb-3 opacity-50" />
          <p>No projects assigned to you yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map((project, index) => (
            <motion.div
              key={project._id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => handleProjectClick(project)}
              className="flex items-center justify-between p-4 bg-gray-50 hover:bg-blue-50 rounded-xl cursor-pointer transition-all group"
            >
              <div className="flex items-center gap-3">
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-semibold text-sm"
                  style={{ backgroundColor: project.background || '#6366f1' }}
                >
                  {project.name?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                    {project.name}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {project.department?.name || 'No department'}
                  </p>
                </div>
              </div>
              <ChevronRight size={18} className="text-gray-400 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
            </motion.div>
          ))}

          {projectPagination.page < projectPagination.pages && (
            <button
              onClick={handleLoadMore}
              disabled={loading.projects}
              className="w-full py-3 text-sm text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
            >
              {loading.projects ? 'Loading...' : `Load more (${projectPagination.total - projects.length} remaining)`}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default memo(MyProjectsSection);
