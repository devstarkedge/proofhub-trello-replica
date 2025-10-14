import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

const ProjectCard = ({ title, subtitle, color = 'bg-blue-500', image = 'https://via.placeholder.com/300x200?text=Project+Image', deptId, projectId }) => {
  const navigate = useNavigate();

  const handleClick = () => {
    if (deptId && projectId) {
      navigate(`/workflow/${deptId}/${projectId}`);
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
