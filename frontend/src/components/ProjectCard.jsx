import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Edit, Trash2 } from 'lucide-react';

const ProjectCard = ({
  title,
  subtitle,
  color = 'bg-blue-500',
  image,
  deptId,
  projectId,
  project,
  onEdit,
  onDelete
}) => {
  const navigate = useNavigate();

  const handleClick = () => {
    if (deptId && projectId) {
      navigate(`/workflow/${deptId}/${projectId}`);
    }
  };

  const handleEdit = (e) => {
    e.stopPropagation();
    if (onEdit && project) {
      onEdit(project);
    }
  };

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (onDelete && project) {
      if (window.confirm(`Are you sure you want to delete "${title}"? This action cannot be undone.`)) {
        onDelete(project);
      }
    }
  };

  return (
    <div
      className={`relative group cursor-pointer overflow-hidden rounded-lg shadow-lg h-64 ${color} hover:shadow-xl transition-all duration-300`}
      onClick={handleClick}
    >
      <img
        src={image}
        alt={title}
        className="absolute inset-0 w-full h-full object-cover opacity-30 group-hover:opacity-50 transition-opacity"
      />
      <div className="absolute inset-0 bg-black bg-opacity-20 group-hover:bg-opacity-30 transition-colors"></div>
      
      {/* Action buttons */}
      <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {onEdit && (
          <button
            onClick={handleEdit}
            className="p-2 bg-white rounded-full shadow-md hover:bg-gray-100 transition-colors"
            title="Edit project"
          >
            <Edit className="h-4 w-4 text-gray-700" />
          </button>
        )}
        {onDelete && (
          <button
            onClick={handleDelete}
            className="p-2 bg-white rounded-full shadow-md hover:bg-red-50 transition-colors"
            title="Delete project"
          >
            <Trash2 className="h-4 w-4 text-red-600" />
          </button>
        )}
      </div>

      <div className="relative p-6 h-full flex flex-col justify-end">
        <h3 className="text-xl font-bold text-white mb-1">{title}</h3>
        <p className="text-white mb-4 opacity-90">{subtitle}</p>
        <div className="flex items-center justify-between">
          <span className="text-white text-sm opacity-80">View Workflow</span>
          <ArrowRight className="text-white h-4 w-4 group-hover:translate-x-1 transition-transform" />
        </div>
      </div>
    </div>
  );
};

export default ProjectCard;
