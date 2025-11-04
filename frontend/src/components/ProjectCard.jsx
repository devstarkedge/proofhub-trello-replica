import React, { useState, useRef, useEffect, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar, Users, TrendingUp, Clock,
  CheckCircle2, AlertCircle, MoreVertical,
  Edit, Trash2, Eye, Target, Star,
  Activity, Layers, Sparkles, ArrowRight,
  Briefcase, MapPin, Zap, Shield, Crown
} from 'lucide-react';

const ProjectCard = ({ 
  project, 
  title, 
  subtitle, 
  color, 
  image, 
  deptId, 
  projectId, 
  onEdit, 
  onDelete, 
  onView 
}) => {
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const menuRef = useRef(null);

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

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  const getStatusConfig = (status) => {
    const configs = {
      'In Progress': {
        bg: 'bg-blue-500/10',
        text: 'text-orange-400',
        border: 'border-blue-300',
        icon: <Clock size={14} />,
        gradient: 'from-blue-500 to-cyan-500'
      },
      'Planning': {
        bg: 'bg-yellow-500/10',
        text: 'text-white',
        border: 'border-yellow-300',
        icon: <Target size={14} />,
        gradient: 'from-yellow-500 to-orange-500'
      },
      'Review': {
        bg: 'bg-purple-500/10',
        text: 'text-gray-500',
        border: 'border-purple-300',
        icon: <Eye size={14} />,
        gradient: 'from-purple-500 to-pink-500'
      },
      'Completed': {
        bg: 'bg-green-500/10',
        text: 'text-green-400',
        border: 'border-green-300',
        icon: <CheckCircle2 size={14} />,
        gradient: 'from-green-500 to-emerald-500'
      },
      'On Hold': {
        bg: 'bg-gray-500/10',
        text: 'text-gray-700',
        border: 'border-gray-300',
        icon: <AlertCircle size={14} />,
        gradient: 'from-gray-500 to-slate-500'
      }
    };
    return configs[status] || configs['In Progress'];
  };

  const getProgressColor = (progress) => {
    if (progress >= 90) return 'from-green-500 to-emerald-500';
    if (progress >= 70) return 'from-blue-500 to-cyan-500';
    if (progress >= 40) return 'from-yellow-500 to-orange-500';
    return 'from-red-500 to-rose-500';
  };

  const getPriorityBadge = (priority) => {
    const priorities = {
      high: { bg: 'bg-red-100', text: 'text-red-700', label: 'High Priority' },
      medium: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Medium' },
      low: { bg: 'bg-green-100', text: 'text-green-700', label: 'Low Priority' }
    };
    return priorities[priority?.toLowerCase()] || null;
  };

  const handleCardClick = () => {
    const departmentId = projectData.departmentId || deptId;
    const projectId = projectData.id;
    if (departmentId && projectId) {
      navigate(`/workflow/${departmentId}/${projectId}`);
    }
  };

  const statusConfig = getStatusConfig(projectData.status);
  const priorityConfig = getPriorityBadge(projectData.priority);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ 
        y: -8, 
        transition: { duration: 0.3, ease: "easeOut" } 
      }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className="bg-white rounded-2xl shadow-md hover:shadow-2xl transition-all duration-300 border border-gray-100 overflow-hidden cursor-pointer group relative"
      onClick={handleCardClick}
    >
      {/* Animated Background Gradient */}
      <motion.div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(147, 51, 234, 0.05) 100%)'
        }}
      />

      {/* Project Image/Header */}
      <div className="relative h-40 overflow-hidden">
        <div className={`absolute inset-0 ${color || 'bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600'}`}>
          {image ? (
            <img 
              src={image} 
              alt={projectData.name} 
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 0.15 }}
                className="text-white text-7xl font-black"
              >
                {projectData.name?.[0]?.toUpperCase() || 'P'}
              </motion.div>
              
              {/* Decorative Elements */}
              <motion.div
                animate={{ 
                  rotate: 360,
                  scale: [1, 1.2, 1]
                }}
                transition={{ 
                  duration: 20, 
                  repeat: Infinity,
                  ease: "linear"
                }}
                className="absolute top-4 right-4 w-20 h-20 border-2 border-white/20 rounded-full"
              />
              <motion.div
                animate={{ 
                  rotate: -360,
                  scale: [1, 0.8, 1]
                }}
                transition={{ 
                  duration: 15, 
                  repeat: Infinity,
                  ease: "linear"
                }}
                className="absolute bottom-4 left-4 w-16 h-16 border-2 border-white/20 rounded-full"
              />
            </div>
          )}
        </div>

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />

        {/* Status Badge */}
        {projectData.status && (
          <motion.div
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="absolute top-3 right-3 z-10"
          >
            <div className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border backdrop-blur-md ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border} shadow-lg`}>
              {statusConfig.icon}
              <span>{projectData.status}</span>
            </div>
          </motion.div>
        )}

        {/* Priority Badge */}
        {priorityConfig && (
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="absolute top-3 left-3 z-10"
          >
            <div className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full ${priorityConfig.bg} ${priorityConfig.text} shadow-lg backdrop-blur-sm`}>
              <Star size={12} fill="currentColor" />
              <span>{priorityConfig.label}</span>
            </div>
          </motion.div>
        )}

        {/* Actions Menu */}
        <div
          ref={menuRef}
          className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-all duration-500 z-40"
        >
          <motion.button
            whileHover={{
              scale: 1.15,
              rotate: 180,
              transition: { duration: 0.3, ease: "easeInOut" }
            }}
            whileTap={{ scale: 0.95 }}
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-2.5 bg-white/90 backdrop-blur-md rounded-2xl hover:bg-white transition-all duration-300 shadow-xl border border-white/20 hover:border-white/40"
          >
            <motion.div
              animate={{ rotate: showMenu ? 90 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <MoreVertical size={20} className="text-gray-700" />
            </motion.div>
          </motion.button>

          <AnimatePresence>
            {showMenu && (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.9, rotateX: -15 }}
                animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
                exit={{ opacity: 0, y: 20, scale: 0.9, rotateX: -15 }}
                transition={{
                  duration: 0.3,
                  ease: "easeOut",
                  type: "spring",
                  stiffness: 300,
                  damping: 25
                }}
                className="absolute top-0 left-full ml-2 mt-3 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl py-2 z-[9999] min-w-[160px] border border-white/20 overflow-hidden"
              >
                <motion.button
                  whileHover={{
                    scale: 1.02,
                    backgroundColor: "rgba(59, 130, 246, 0.1)",
                    x: 4
                  }}
                  whileTap={{ scale: 0.98 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onView && onView();
                  }}
                  className="w-full px-4 py-2 text-left text-xs flex items-center gap-3 text-gray-700 hover:text-blue-600 transition-all duration-200 font-medium group"
                >
                  <motion.div
                    whileHover={{ rotate: 360 }}
                    transition={{ duration: 0.5 }}
                  >
                    <Eye size={18} className="group-hover:text-blue-500" />
                  </motion.div>
                  <span>View Details</span>
                  <motion.div
                    className="ml-auto opacity-0 group-hover:opacity-100"
                    initial={{ x: -10 }}
                    animate={{ x: 0 }}
                  >
                    <ArrowRight size={14} />
                  </motion.div>
                </motion.button>

                <motion.button
                  whileHover={{
                    scale: 1.02,
                    backgroundColor: "rgba(99, 102, 241, 0.1)",
                    x: 4
                  }}
                  whileTap={{ scale: 0.98 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onEdit && onEdit();
                  }}
                  className="w-full px-4 py-2 text-left text-xs flex items-center gap-3 text-gray-700 hover:text-indigo-600 transition-all duration-200 font-medium group"
                >
                  <motion.div
                    whileHover={{ rotate: 15 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Edit size={18} className="group-hover:text-indigo-500" />
                  </motion.div>
                  <span>Edit Project</span>
                  <motion.div
                    className="ml-auto opacity-0 group-hover:opacity-100"
                    initial={{ x: -10 }}
                    animate={{ x: 0 }}
                  >
                    <Zap size={14} />
                  </motion.div>
                </motion.button>

                <motion.div
                  className="border-t border-gray-200/50 my-2 mx-3"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.1 }}
                />

                <motion.button
                  whileHover={{
                    scale: 1.02,
                    backgroundColor: "rgba(239, 68, 68, 0.1)",
                    x: 4
                  }}
                  whileTap={{ scale: 0.98 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onDelete && onDelete();
                  }}
                  className="w-full px-2 py-1 text-left text-xs flex items-center gap-2 text-red-600 hover:text-red-700 transition-all duration-200 font-medium group"
                >
                  <motion.div
                    whileHover={{
                      rotate: [0, -10, 10, 0],
                      scale: 1.1
                    }}
                    transition={{ duration: 0.4 }}
                  >
                    <Trash2 size={18} className="group-hover:text-red-500" />
                  </motion.div>
                  <span>Delete Project</span>
                  <motion.div
                    className="ml-auto opacity-0 group-hover:opacity-100"
                    initial={{ x: -10 }}
                    animate={{ x: 0 }}
                  >
                    <AlertCircle size={14} />
                  </motion.div>
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Hover Overlay Effect */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: isHovered ? 1 : 0 }}
          className="absolute inset-0 bg-gradient-to-t from-blue-600/20 via-transparent to-transparent pointer-events-none"
        />
      </div>

      {/* Project Content */}
      <div className="p-5 relative">
        {/* Title and Description */}
        <div className="mb-4">
          <motion.h3
            className="text-xl font-bold text-gray-900 mb-2 line-clamp-1 group-hover:text-blue-600 transition-colors"
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.2 }}
          >
            {projectData.name}
          </motion.h3>
          <motion.p
            className="text-sm text-gray-600 line-clamp-2 leading-relaxed"
            initial={{ opacity: 0.8 }}
            whileHover={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            {projectData.description || 'No description available'}
          </motion.p>
        </div>

        {/* Progress Bar */}
        {projectData.progress !== undefined && (
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                <Activity size={14} />
                Progress
              </span>
              <span className="text-sm font-bold text-gray-900">{projectData.progress}%</span>
            </div>
            <div className="relative w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${projectData.progress}%` }}
                transition={{ duration: 1.5, ease: "easeOut", delay: 0.3 }}
                className={`h-full rounded-full bg-gradient-to-r ${getProgressColor(projectData.progress)} relative overflow-hidden`}
              >
                {/* Shimmer Effect */}
                <motion.div
                  animate={{
                    x: ['-100%', '200%']
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "linear"
                  }}
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                />
              </motion.div>
            </div>
          </div>
        )}

        {/* Project Meta Information */}
        <div className="flex flex-wrap gap-2 mb-4">
          {projectData.dueDate && (
            <motion.div
              whileHover={{
                scale: 1.08,
                y: -2,
                boxShadow: "0 8px 25px rgba(59, 130, 246, 0.15)"
              }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-1.5 bg-gradient-to-r from-blue-50 to-cyan-50 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-700 border border-blue-100 hover:border-blue-200 transition-all duration-200 cursor-pointer"
            >
              <motion.div
                whileHover={{ rotate: 360 }}
                transition={{ duration: 0.6 }}
              >
                <Calendar size={14} />
              </motion.div>
              <span>{new Date(projectData.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </motion.div>
          )}

          {projectData.team && (
            <motion.div
              whileHover={{
                scale: 1.08,
                y: -2,
                boxShadow: "0 8px 25px rgba(147, 51, 234, 0.15)"
              }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-1.5 bg-gradient-to-r from-purple-50 to-pink-50 px-3 py-1.5 rounded-lg text-xs font-medium text-purple-700 border border-purple-100 hover:border-purple-200 transition-all duration-200 cursor-pointer"
            >
              <motion.div
                whileHover={{ scale: 1.2 }}
                transition={{ duration: 0.3 }}
              >
                <Users size={14} />
              </motion.div>
              <span>{projectData.team}</span>
            </motion.div>
          )}

          {projectData.totalCards !== undefined && (
            <motion.div
              whileHover={{
                scale: 1.08,
                y: -2,
                boxShadow: "0 8px 25px rgba(34, 197, 94, 0.15)"
              }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-1.5 bg-gradient-to-r from-green-50 to-emerald-50 px-3 py-1.5 rounded-lg text-xs font-medium text-green-700 border border-green-100 hover:border-green-200 transition-all duration-200 cursor-pointer"
            >
              <motion.div
                whileHover={{ rotate: 180 }}
                transition={{ duration: 0.5 }}
              >
                <Layers size={14} />
              </motion.div>
              <span>{projectData.completedCards || 0}/{projectData.totalCards} Tasks</span>
            </motion.div>
          )}
        </div>

        {/* Department Badge */}
        {projectData.department && (
          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 font-medium flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                {projectData.department?.name || projectData.department}
              </span>
              
              {/* View Project Arrow */}
              <motion.div
                animate={{ x: isHovered ? 5 : 0 }}
                transition={{ duration: 0.3 }}
                className="flex items-center gap-1 text-blue-600 text-xs font-semibold"
              >
                <span>View</span>
                <ArrowRight size={14} />
              </motion.div>
            </div>
          </div>
        )}

        {/* Featured/New Badge */}
        {projectData.isFeatured && (
          <motion.div
            initial={{ rotate: -12 }}
            animate={{ rotate: 0 }}
            className="absolute -top-2 -right-2"
          >
            <div className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg flex items-center gap-1">
              <Sparkles size={12} />
              Featured
            </div>
          </motion.div>
        )}

        {/* Completion Indicator */}
        {projectData.progress === 100 && (
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className="absolute top-4 right-4"
          >
            <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center shadow-lg">
              <CheckCircle2 size={20} className="text-white" />
            </div>
          </motion.div>
        )}
      </div>

      {/* Card Border Glow Effect on Hover */}
      <motion.div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        animate={{
          boxShadow: isHovered
            ? '0 0 0 2px rgba(59, 130, 246, 0.3)'
            : '0 0 0 0px rgba(59, 130, 246, 0)'
        }}
        transition={{ duration: 0.3 }}
      />
    </motion.div>
  );
};

export default memo(ProjectCard);
