import React, { useState, useEffect, memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Crown, BadgeCheck } from 'lucide-react';

/**
 * Avatar Component - Centralized avatar display for the entire application
 * 
 * Features:
 * - Image display with lazy loading
 * - Skeleton loader while loading
 * - Fallback to first letter with gradient
 * - Role badges (Admin, Manager, Verified)
 * - Size variants (xs, sm, md, lg, xl)
 * - Accessibility support
 * - Smooth animations
 */

// Size configurations
const SIZES = {
  xs: { container: 'w-6 h-6', text: 'text-[10px]', badge: 'w-3 h-3', badgeIcon: 8 },
  sm: { container: 'w-8 h-8', text: 'text-xs', badge: 'w-4 h-4', badgeIcon: 10 },
  md: { container: 'w-10 h-10', text: 'text-sm', badge: 'w-5 h-5', badgeIcon: 12 },
  lg: { container: 'w-12 h-12', text: 'text-base', badge: 'w-6 h-6', badgeIcon: 14 },
  xl: { container: 'w-16 h-16', text: 'text-xl', badge: 'w-7 h-7', badgeIcon: 16 },
  '2xl': { container: 'w-24 h-24', text: 'text-3xl', badge: 'w-8 h-8', badgeIcon: 18 }
};

// Gradient backgrounds for fallback avatars (consistent based on name)
const GRADIENTS = [
  'from-blue-500 via-indigo-500 to-purple-600',
  'from-green-400 via-emerald-500 to-teal-600',
  'from-orange-400 via-red-500 to-pink-600',
  'from-cyan-400 via-blue-500 to-indigo-600',
  'from-violet-400 via-purple-500 to-fuchsia-600',
  'from-amber-400 via-orange-500 to-red-600',
  'from-teal-400 via-cyan-500 to-blue-600',
  'from-rose-400 via-pink-500 to-purple-600'
];

/**
 * Get consistent gradient based on name
 */
const getGradient = (name) => {
  if (!name) return GRADIENTS[0];
  const charCode = name.charCodeAt(0) + (name.length > 1 ? name.charCodeAt(1) : 0);
  return GRADIENTS[charCode % GRADIENTS.length];
};

/**
 * Get role badge configuration
 */
const getRoleBadge = (role, isVerified) => {
  if (role === 'admin') {
    return { icon: Crown, color: 'bg-yellow-400', title: 'Admin' };
  }
  if (role === 'manager') {
    return { icon: Shield, color: 'bg-blue-500', title: 'Manager' };
  }
  if (isVerified) {
    return { icon: BadgeCheck, color: 'bg-green-500', title: 'Verified' };
  }
  return null;
};

/**
 * Skeleton loader component
 */
const AvatarSkeleton = memo(({ size = 'md' }) => {
  const sizeConfig = SIZES[size] || SIZES.md;
  
  return (
    <div 
      className={`${sizeConfig.container} rounded-full bg-gray-200 animate-pulse`}
      aria-hidden="true"
    />
  );
});

AvatarSkeleton.displayName = 'AvatarSkeleton';

/**
 * Main Avatar Component
 */
const Avatar = memo(({
  src,
  name = '',
  role,
  isVerified = false,
  size = 'md',
  showBadge = true,
  className = '',
  onClick,
  alt,
  loading = false
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isLoading, setIsLoading] = useState(!!src);

  const sizeConfig = SIZES[size] || SIZES.md;
  const gradient = getGradient(name);
  const badge = showBadge ? getRoleBadge(role, isVerified) : null;
  const initial = name ? name.charAt(0).toUpperCase() : '?';
  const altText = alt || `${name || 'User'}'s avatar`;

  // Reset state when src changes and check for cached images
  useEffect(() => {
    if (src) {
      // Create a new image to check if already cached
      const img = new Image();
      img.src = src;
      
      if (img.complete && img.naturalWidth > 0) {
        // Image is already cached/loaded
        setImageLoaded(true);
        setImageError(false);
        setIsLoading(false);
      } else {
        // Image needs to load
        setImageLoaded(false);
        setImageError(false);
        setIsLoading(true);
      }
    } else {
      setImageLoaded(false);
      setImageError(false);
      setIsLoading(false);
    }
  }, [src]);

  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
    setIsLoading(false);
  }, []);

  const handleImageError = useCallback(() => {
    setImageError(true);
    setIsLoading(false);
  }, []);

  // Show skeleton if externally loading
  if (loading) {
    return <AvatarSkeleton size={size} />;
  }

  const showImage = src && !imageError && imageLoaded;
  const showFallback = !src || imageError || !imageLoaded;

  return (
    <div className={`relative inline-flex ${className}`}>
      {/* Main Avatar Container */}
      <motion.div
        className={`${sizeConfig.container} rounded-full overflow-hidden flex items-center justify-center 
          ${!showImage ? `bg-gradient-to-br ${gradient}` : 'bg-gray-100'}
          ${onClick ? 'cursor-pointer hover:ring-2 hover:ring-blue-400 hover:ring-offset-2' : ''}
          transition-all shadow-lg flex-shrink-0`}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick(e) : undefined}
        aria-label={altText}
        whileHover={onClick ? { scale: 1.05 } : undefined}
        whileTap={onClick ? { scale: 0.95 } : undefined}
      >
        {/* Loading skeleton overlay */}
        <AnimatePresence>
          {isLoading && (
            <motion.div 
              className="absolute inset-0 bg-gray-200 animate-pulse rounded-full"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
          )}
        </AnimatePresence>

        {/* Image (hidden until loaded) */}
        {src && !imageError && (
          <motion.img
            src={src}
            alt={altText}
            className={`w-full h-full object-cover ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={handleImageLoad}
            onError={handleImageError}
            loading="lazy"
            initial={{ opacity: 0 }}
            animate={{ opacity: imageLoaded ? 1 : 0 }}
            transition={{ duration: 0.3 }}
          />
        )}

        {/* Fallback initial */}
        {showFallback && (
          <motion.span
            className={`${sizeConfig.text} font-bold text-white select-none`}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            {initial}
          </motion.span>
        )}
      </motion.div>

      {/* Role Badge */}
      {badge && (
        <motion.div
          className={`absolute -bottom-0.5 -right-0.5 ${sizeConfig.badge} ${badge.color} 
            rounded-full flex items-center justify-center shadow-lg border-2 border-white`}
          title={badge.title}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 500 }}
        >
          <badge.icon size={sizeConfig.badgeIcon} className="text-white" />
        </motion.div>
      )}
    </div>
  );
});

Avatar.displayName = 'Avatar';

// Export skeleton for standalone use
export { AvatarSkeleton };
export default Avatar;
