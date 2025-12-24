import React, { useState, useRef, useEffect, memo, useContext } from 'react';
import useThemeStore from '../store/themeStore';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar, Users, TrendingUp, Clock,
  CheckCircle2, AlertCircle, MoreVertical,
  Edit, Trash2, Eye, Target, Star,
  Activity, Layers, Sparkles, ArrowRight,
  Briefcase, MapPin, Zap, Shield, Crown, Building2,
  ImageIcon, Pencil
} from 'lucide-react';
import AuthContext from '../context/AuthContext';

const ProjectCard = ({
  project,
  title,
  subtitle,
  color,
  image,
  deptId,
  projectId,
  departmentManager,
  departmentName,
  showManager = false,
  onEdit,
  onDelete,
  onView,
  onEditCover // New prop for cover image editing
}) => {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const { themeColor } = useThemeStore();
  const [showMenu, setShowMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const menuRef = useRef(null);

  // Check if user can edit/delete projects (admin or manager only)
  const canEditProject = user && (user.role === 'admin' || user.role === 'manager');

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

  // Reset image loading states when cover image URL changes
  useEffect(() => {
    const coverUrl = project?.coverImage?.url || image;
    if (coverUrl) {
      setImageLoaded(false);
      setImageError(false);
    }
  }, [project?.coverImage?.url, image]);

  const getStatusConfig = (status) => {
    // Normalize status to handle both formats (database vs display)
    const normalizedStatus = status?.toLowerCase().replace(/\s+/g, '-');

    const configs = {
      'planning': {
        bg: 'bg-gradient-to-r from-amber-50 to-yellow-50',
        text: 'text-amber-700',
        border: 'border-amber-200',
        icon: <Target size={14} className="text-amber-600" />,
        gradient: 'from-amber-500 to-yellow-500',
        label: 'Planning',
        description: 'Project is in planning phase'
      },
      'in-progress': {
        bg: '!bg-blue-50',
        text: 'text-blue-800',
        border: '!border-blue-200',
        icon: <Clock size={14} className="text-blue-600" />,
        gradient: 'from-blue-500 to-cyan-500',
        label: 'In Progress',
        description: 'Project is actively being worked on'
      },
      'completed': {
        bg: 'bg-gradient-to-r from-emerald-50 to-green-50',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
        icon: <CheckCircle2 size={14} className="text-emerald-600" />,
        gradient: 'from-emerald-500 to-green-500',
        label: 'Completed',
        description: 'Project has been finished'
      },
      'on-hold': {
        bg: 'bg-gradient-to-r from-slate-50 to-gray-50',
        text: 'text-slate-700',
        border: 'border-slate-200',
        icon: <AlertCircle size={14} className="text-slate-600" />,
        gradient: 'from-slate-500 to-gray-500',
        label: 'On Hold',
        description: 'Project is temporarily paused'
      }
    };
    return configs[normalizedStatus] || configs['planning'];
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
    // Don't navigate if project is optimistic (temp ID)
    if (projectData.isOptimistic || String(projectData.id).startsWith('temp-')) {
      return;
    }
    const departmentId = projectData.departmentId || deptId;
    const projectId = projectData.id;
    if (departmentId && projectId) {
      navigate(`/workflow/${departmentId}/${projectId}`);
    }
  };

  const statusConfig = getStatusConfig(projectData.status);
  const priorityConfig = getPriorityBadge(projectData.priority);
  const isOptimistic = projectData.isOptimistic || String(projectData.id).startsWith('temp-');

  // Theme-based gradient mappings
  const themeGradients = {
    blue: {
      bg: 'bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600',
      glow: 'rgba(59, 130, 246, 0.3)',
      subtle: 'linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(147, 51, 234, 0.05) 100%)'
    },
    purple: {
      bg: 'bg-gradient-to-br from-purple-500 via-fuchsia-500 to-pink-600',
      glow: 'rgba(168, 85, 247, 0.3)',
      subtle: 'linear-gradient(135deg, rgba(168, 85, 247, 0.05) 0%, rgba(236, 72, 153, 0.05) 100%)'
    },
    emerald: {
      bg: 'bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600',
      glow: 'rgba(16, 185, 129, 0.3)',
      subtle: 'linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(20, 184, 166, 0.05) 100%)'
    },
    rose: {
      bg: 'bg-gradient-to-br from-rose-500 via-red-500 to-orange-600',
      glow: 'rgba(244, 63, 94, 0.3)',
      subtle: 'linear-gradient(135deg, rgba(244, 63, 94, 0.05) 0%, rgba(249, 115, 22, 0.05) 100%)'
    },
    amber: {
      bg: 'bg-gradient-to-br from-amber-500 via-orange-500 to-yellow-600',
      glow: 'rgba(245, 158, 11, 0.3)',
      subtle: 'linear-gradient(135deg, rgba(245, 158, 11, 0.05) 0%, rgba(234, 179, 8, 0.05) 100%)'
    },
    cyan: {
      bg: 'bg-gradient-to-br from-cyan-500 via-sky-500 to-blue-600',
      glow: 'rgba(6, 182, 212, 0.3)',
      subtle: 'linear-gradient(135deg, rgba(6, 182, 212, 0.05) 0%, rgba(14, 165, 233, 0.05) 100%)'
    },
    indigo: {
      bg: 'bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600',
      glow: 'rgba(99, 102, 241, 0.3)',
      subtle: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.05) 100%)'
    },
    slate: {
      bg: 'bg-gradient-to-br from-slate-600 via-gray-600 to-zinc-700',
      glow: 'rgba(100, 116, 139, 0.3)',
      subtle: 'linear-gradient(135deg, rgba(100, 116, 139, 0.05) 0%, rgba(71, 85, 105, 0.05) 100%)'
    }
  };

  const currentTheme = themeGradients[themeColor] || themeGradients['blue'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: isOptimistic ? 0.7 : 1, y: 0 }}
      whileHover={{ 
        y: isOptimistic ? 0 : -8, 
        transition: { duration: 0.3, ease: "easeOut" } 
      }}
      onHoverStart={() => !isOptimistic && setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className={`bg-white rounded-2xl shadow-md hover:shadow-2xl transition-all duration-300 border border-gray-100 overflow-hidden group relative ${isOptimistic ? 'cursor-wait' : 'cursor-pointer'}`}
      onClick={handleCardClick}
    >
      {/* Optimistic Loading Indicator */}
      {isOptimistic && (
        <div className="absolute inset-0 bg-white/50 z-20 flex items-center justify-center">
          <div className="flex items-center gap-2 text-blue-600">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent"></div>
            <span className="text-sm font-medium">Creating...</span>
          </div>
        </div>
      )}
      
      {/* Animated Background Gradient */}
      <motion.div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background: currentTheme.subtle
        }}
        // initial={{ opacity: 0 }}
      />

      {/* Project Image/Header */}
      <div className="relative h-40 overflow-hidden">
        {/* Background: Dominant color or theme gradient */}
        <div 
          className={`absolute inset-0 transition-all duration-500`}
          style={{
            background: projectData.coverImage?.dominantColor 
              ? `linear-gradient(135deg, ${projectData.coverImage.dominantColor} 0%, ${projectData.coverImage.dominantColor}88 100%)`
              : undefined
          }}
        >
          {!projectData.coverImage?.dominantColor && (
            <div className={`absolute inset-0 ${color || currentTheme.bg}`} />
          )}
        </div>

        {/* Cover Image with progressive loading */}
        {(image || projectData.coverImage?.url) && !imageError ? (
          <>
            {/* Skeleton loader */}
            {!imageLoaded && (
              <div className="absolute inset-0 animate-pulse">
                <div className="w-full h-full bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%] animate-shimmer" />
              </div>
            )}
            
            {/* Blur placeholder (tiny thumbnail) */}
            {projectData.coverImage?.thumbnailUrl && !imageLoaded && (
              <img
                src={projectData.coverImage.thumbnailUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-cover filter blur-xl scale-110"
              />
            )}
            
            {/* Main image */}
            <motion.img 
              src={image || projectData.coverImage?.url}
              alt={projectData.name}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
              initial={{ opacity: 0 }}
              animate={{ 
                opacity: imageLoaded ? 1 : 0,
                scale: isHovered ? 1.08 : 1
              }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="relative w-full h-full object-cover"
            />
          </>
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

        {/* Gradient Overlay for text readability (WCAG) */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/20 to-transparent" />

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
              <span>{statusConfig.label}</span>
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
        {canEditProject && (
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
        )}

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
              <span>Due:{new Date(projectData.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </motion.div>
          )}

          {projectData.totalLoggedTime && (projectData.totalLoggedTime.hours > 0 || projectData.totalLoggedTime.minutes > 0) && (
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
                whileHover={{ scale: 1.2 }}
                transition={{ duration: 0.3 }}
              >
                <Clock size={14} />
              </motion.div>
              <span>{projectData.totalLoggedTime.hours}h {projectData.totalLoggedTime.minutes}m</span>
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
        {(projectData.department || departmentManager || departmentName) && (
          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 font-medium flex items-center gap-1.5">
                {showManager ? (
                  <>
                    <Crown size={12} className="text-purple-500" />
                    <span>Manager: {departmentManager || projectData.department?.name || projectData.department}</span>
                  </>
                ) : (
                  <>
                    <Building2 size={12} className="text-blue-500" />
                    <span>Department: {departmentName || projectData.department?.name || projectData.department}</span>
                  </>
                )}
              </span>
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
            ? `0 0 0 2px ${currentTheme.glow}`
            : `0 0 0 0px ${currentTheme.glow.replace('0.3', '0')}`
        }}
        transition={{ duration: 0.3 }}
      />
    </motion.div>
  );
};

export default memo(ProjectCard);
