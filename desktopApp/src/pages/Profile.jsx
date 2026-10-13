import React, { useState, useEffect, useContext, useRef, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import {
  User, Mail, Briefcase, Save, Loader2, Camera,
  CheckCircle, XCircle, Edit3, Eye, EyeOff, Trash2, ImagePlus
} from 'lucide-react';
import api from '../services/api';
import AuthContext from '../context/AuthContext';
import Loading from '../components/Loading';
import Avatar from '../components/Avatar';
import useAvatar from '../hooks/useAvatar';
import useThemeStore from '../store/themeStore';
import { validateField, validateForm as validateFormUtil, debouncedEmailCheck, validationRules } from '../utils/validationUtils';

// Lazy load the upload modal
const AvatarUploadModal = lazy(() => import('../components/AvatarUploadModal'));


const Profile = () => {
  const { user, setUser } = useContext(AuthContext);
  const { effectiveMode } = useThemeStore();
  const isDarkMode = effectiveMode === 'dark';
  const { avatar, remove: removeAvatar, removing } = useAvatar();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileData, setProfileData] = useState({
    name: '',
    email: '',
    title: ''
  });
  const [errors, setErrors] = useState({});
  const [emailAvailable, setEmailAvailable] = useState(true);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);
  const avatarMenuRef = useRef(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  // Close avatar menu on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target)) {
        setShowAvatarMenu(false);
      }
    };
    if (showAvatarMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAvatarMenu]);

  const fetchProfile = async () => {
    try {
      const response = await api.get('/api/users/profile');
      const userData = response.data.data;
      setProfileData({
        name: userData.name || '',
        email: userData.email || '',
        title: userData.title || ''
      });
      
      // Update AuthContext user with avatar (for global sync on refresh)
      if (setUser && userData.avatar !== undefined) {
        setUser(prev => ({
          ...prev,
          avatar: userData.avatar,
          avatarMetadata: userData.avatarMetadata
        }));
      }
    } catch (error) {
      toast.error('Failed to load profile data');
      console.error('Profile fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const fieldsToValidate = ['name', 'email', 'title'];
    const { isValid, errors: validationErrors } = validateFormUtil(profileData, fieldsToValidate);

    // Additional email uniqueness check
    if (profileData.email && !emailAvailable) {
      validationErrors.email = validationRules.email.messages.unique;
    }

    setErrors(validationErrors);
    return isValid && Object.keys(validationErrors).length === 0;
  };

  const handleInputChange = (field, value) => {
    setProfileData(prev => ({ ...prev, [field]: value }));

    // Real-time validation
    const error = validateField(field, value);
    setErrors(prev => ({ ...prev, [field]: error }));

    // Email uniqueness check with debouncing
    if (field === 'email') {
      setCheckingEmail(true);
      debouncedEmailCheck(value, user?._id, (isAvailable) => {
        setEmailAvailable(isAvailable);
        setCheckingEmail(false);
        if (!isAvailable) {
          setErrors(prev => ({ ...prev, email: validationRules.email.messages.unique }));
        }
      });
    }
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      const response = await api.put('/api/users/profile', profileData);
      const updatedUser = response.data.data;

      // Update context
      setUser && setUser(prev => ({ ...prev, ...updatedUser }));

      toast.success('Profile updated successfully!');
    } catch (error) {
      console.error('Profile update error:', error);
      if (error.response?.data?.message) {
        toast.error(error.response.data.message);
      } else {
        toast.error('Failed to update profile');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setShowAvatarMenu(false);
    await removeAvatar();
  };

  if (loading) {
    return (
      <div className="min-h-full bg-gray-50">
        <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
          <Loading size="lg" text="Loading profile..." />
        </div>
      </div>
    );
  }

  return (
    <div className={`
      min-h-full transition-colors duration-500
      ${isDarkMode 
        ? 'bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-[#0a0a0a] to-black text-gray-100' 
        : 'bg-gradient-to-br from-gray-50 via-blue-50/30 to-gray-100'}
    `}>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">My Profile</h1>
            <p className="text-gray-600">Manage your personal information and preferences</p>
          </div>

          {/* Profile Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="relative bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.8) 100%)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.05)'
            }}
          >
            {/* Avatar Section */}
            <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-8 text-white">
              <div className="flex items-center gap-6">
                <div className="relative" ref={avatarMenuRef}>
                  {/* Avatar with click handler */}
                  <Avatar
                    src={user?.avatar || avatar}
                    name={profileData.name}
                    role={user?.role}
                    isVerified={user?.isVerified}
                    size="2xl"
                    showBadge={false}
                  />
                  
                  {/* Camera Edit Button */}
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setShowAvatarMenu(!showAvatarMenu)}
                    className="absolute -bottom-2 -right-2 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all"
                    aria-label="Edit profile photo"
                  >
                    {removing ? (
                      <Loader2 size={18} className="text-gray-600 animate-spin" />
                    ) : (
                      <Camera size={18} className="text-gray-600" />
                    )}
                  </motion.button>

                  {/* Avatar Menu Dropdown */}
                  <AnimatePresence>
                    {showAvatarMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        className="absolute top-full left-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50"
                      >
                        <button
                          onClick={() => {
                            setShowAvatarMenu(false);
                            setShowAvatarModal(true);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          <ImagePlus size={18} />
                          <span>{avatar ? 'Change Photo' : 'Add Photo'}</span>
                        </button>
                        {avatar && (
                          <button
                            onClick={handleRemoveAvatar}
                            disabled={removing}
                            className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 transition-colors border-t border-gray-100"
                          >
                            <Trash2 size={18} />
                            <span>Remove Photo</span>
                          </button>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <div>
                  <h2 className="text-2xl font-bold mb-1">{profileData.name || 'User'}</h2>
                  <p className="text-blue-100">{profileData.title || 'No title set'}</p>
                  <p className="text-sm text-blue-100 mt-1 capitalize">{user?.role || 'Member'}</p>
                </div>
              </div>
            </div>

            {/* Form Section */}
            <div className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Name Field */}
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className="space-y-2"
                >
                  <label className={`block text-sm font-medium ${isDarkMode ? 'text-black' : 'text-gray-700'}`}>
                    Full Name *
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                    <input
                      type="text"
                      value={profileData.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                        errors.name ? 'border-red-300 bg-red-50' : 'border-gray-300'
                      }`}
                      placeholder="Enter your full name"
                    />
                  </div>
                  {errors.name && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-sm text-red-600 flex items-center gap-1"
                    >
                      <XCircle size={14} />
                      {errors.name}
                    </motion.p>
                  )}
                </motion.div>

                {/* Email Field */}
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  className="space-y-2"
                >
                  <label className={`block text-sm font-medium ${isDarkMode ? 'text-black' : 'text-gray-700'}`}>
                    Email Address *
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                    <input
                      type="email"
                      value={profileData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      className={`w-full pl-10 pr-12 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                        errors.email ? 'border-red-300 bg-red-50' : 'border-gray-300'
                      }`}
                      placeholder="Enter your email"
                    />
                    {checkingEmail && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        <Loader2 size={16} className="animate-spin text-gray-400" />
                      </div>
                    )}
                    {!checkingEmail && profileData.email && !errors.email && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        <CheckCircle size={16} className="text-green-500" />
                      </div>
                    )}
                  </div>
                  {errors.email && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-sm text-red-600 flex items-center gap-1"
                    >
                      <XCircle size={14} />
                      {errors.email}
                    </motion.p>
                  )}
                </motion.div>

                {/* Title Field */}
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                  className="space-y-2 md:col-span-2"
                >
                  <label className={`block text-sm font-medium ${isDarkMode ? 'text-black' : 'text-gray-700'}`}>
                    Job Title
                  </label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                    <input
                      type="text"
                      value={profileData.title}
                      onChange={(e) => handleInputChange('title', e.target.value)}
                      className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                        errors.title ? 'border-red-300 bg-red-50' : 'border-gray-300'
                      }`}
                      placeholder="Enter your job title"
                    />
                  </div>
                  {errors.title && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-sm text-red-600 flex items-center gap-1"
                    >
                      <XCircle size={14} />
                      {errors.title}
                    </motion.p>
                  )}
                </motion.div>
              </div>

              {/* Save Button */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.5 }}
                className="mt-8 flex justify-end"
              >
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <Save size={20} />
                  )}
                  {saving ? 'Saving...' : 'Save Changes'}
                </motion.button>
              </motion.div>
            </div>
          </motion.div>

          {/* Additional Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="mt-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <User size={20} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Role</p>
                  <p className="font-medium capitalize">{user?.role || 'Member'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Briefcase size={20} className="text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Job Title</p>
                  <p className="font-medium">{profileData.title || 'Not set'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <CheckCircle size={20} className="text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Status</p>
                  <p className="font-medium">{user?.isVerified ? 'Verified' : 'Pending Verification'}</p>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* Background Ambience for Dark Mode (Blurish effect) */}
      {isDarkMode && (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
           <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-blue-900/10 rounded-full blur-[120px]" />
           <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-indigo-900/10 rounded-full blur-[120px]" />
        </div>
      )}

      {/* Avatar Upload Modal */}
      <Suspense fallback={null}>
        <AvatarUploadModal 
          isOpen={showAvatarModal} 
          onClose={() => setShowAvatarModal(false)} 
        />
      </Suspense>
    </div>
  );
};

export default Profile;
