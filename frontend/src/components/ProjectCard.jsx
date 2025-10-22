import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Calendar, Users, TrendingUp, Clock,
  CheckCircle2, AlertCircle, MoreVertical,
  Edit, Trash2, Eye
} from 'lucide-react';

const ProjectCard = ({ project, title, subtitle, color, image, deptId, projectId, onEdit, onDelete, onView }) => {
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = React.useState(false);

  // Handle both formats: project object or individual props
  const projectData = project || {
    id: projectId,
    name: title,
    description: subtitle,
    departmentId: deptId
  };

  // Normalize the id field to handle both _id and id
  if (projectData._id && !projectData.id) {
    projectData.id = projectData._id;
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'In Progress': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Planning': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Review': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Completed': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Completed': return <CheckCircle2 size={14} />;
      case 'In Progress': return <Clock size={14} />;
      default: return <AlertCircle size={14} />;
    }
  };

  const handleCardClick = () => {
    const departmentId = projectData.departmentId || deptId;
    const projectId = projectData.id;
    if (departmentId && projectId) {
      navigate(`/workflow/${departmentId}/${projectId}`);
    }
  };

  return (
    <motion.div
      whileHover={{ y: -5, transition: { duration: 0.2 } }}
      className="bg-white rounded-xl shadow-sm hover:shadow-xl transition-all border border-gray-100 overflow-hidden cursor-pointer group"
      onClick={handleCardClick}
    >
      {/* Project Image/Header */}
      <div className={`h-32 ${color || 'bg-gradient-to-br from-blue-500 to-blue-600'} relative overflow-hidden`}>
        {image ? (
          <img src={image} alt={projectData.name} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 0.2 }}
              className="text-white text-6xl font-bold"
            >
              {projectData.name?.[0]?.toUpperCase() || 'P'}
            </motion.div>
          </div>
        )}

        {/* Status Badge */}
        {projectData.status && (
          <div className="absolute top-3 right-3">
            <span className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full border backdrop-blur-sm ${getStatusColor(projectData.status)}`}>
              {getStatusIcon(projectData.status)}
              {projectData.status}
            </span>
          </div>
        )}

        {/* Actions Menu */}
        <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-1.5 bg-white/90 backdrop-blur-sm rounded-lg hover:bg-white transition-colors"
          >
            <MoreVertical size={16} className="text-gray-700" />
          </button>

          {showMenu && (
            <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg py-1 z-10 min-w-[120px]">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onView && onView();
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                <Eye size={14} /> View
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit && onEdit();
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                <Edit size={14} /> Edit
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete && onDelete();
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-red-600"
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Project Content */}
      <div className="p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-1 line-clamp-1">
          {projectData.name}
        </h3>
        <p className="text-sm text-gray-600 mb-3 line-clamp-2">
          {projectData.description}
        </p>

        {/* Progress Bar */}
        {projectData.progress !== undefined && (
          <div className="mb-3">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-gray-600">Progress</span>
              <span className="text-xs font-semibold text-gray-900">{projectData.progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${projectData.progress}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className={`h-full rounded-full ${
                  projectData.progress === 100 ? 'bg-green-500' :
                  projectData.progress >= 70 ? 'bg-blue-500' :
                  projectData.progress >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
              />
            </div>
          </div>
        )}

        {/* Project Meta */}
        <div className="flex flex-wrap gap-2 text-xs text-gray-600">
          {projectData.dueDate && (
            <div className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded">
              <Calendar size={12} />
              <span>{new Date(projectData.dueDate).toLocaleDateString()}</span>
            </div>
          )}
          {projectData.team && (
            <div className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded">
              <Users size={12} />
              <span>{projectData.team}</span>
            </div>
          )}
          {projectData.totalCards !== undefined && (
            <div className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded">
              <TrendingUp size={12} />
              <span>{projectData.completedCards || 0}/{projectData.totalCards}</span>
            </div>
          )}
        </div>

        {/* Department Badge */}
        {projectData.department && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <span className="text-xs text-gray-500">{projectData.department}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default ProjectCard;
