import React, { useState, useContext, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { Eye, EyeOff, Mail, Lock, User, Building, UserPlus, AlertCircle, CheckCircle, Check } from 'lucide-react';
import AuthContext from '../context/AuthContext';
import api from '../services/api';
import { validateForm, validateField, debouncedEmailCheck, validatePasswordMatch } from '../utils/validationUtils';

const RegisterPage = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    department: ''
  });
  const [departments, setDepartments] = useState([]);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [touched, setTouched] = useState({});
  const [emailAvailable, setEmailAvailable] = useState(null);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const { register } = useContext(AuthContext);
  const navigate = useNavigate();

  const { name, email, password, confirmPassword, department } = formData;

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });

    // Real-time validation for non-email fields
    if (touched[name] && name !== 'email') {
      const error = validateField(name, value);
      setErrors(prev => ({ ...prev, [name]: error }));
    }

    // Special handling for email
    if (name === 'email') {
      setEmailAvailable(null);
      if (touched.email) {
        const emailError = validateField('email', value);
        setErrors(prev => ({ ...prev, email: emailError }));

        // Check email uniqueness if format is valid
        if (!emailError && value) {
          setCheckingEmail(true);
          debouncedEmailCheck(value, null, (available) => {
            setEmailAvailable(available);
            setCheckingEmail(false);
            if (!available) {
              setErrors(prev => ({ ...prev, email: 'This email address is already registered' }));
            }
          });
        }
      }
    }

    // Password confirmation validation
    if (name === 'confirmPassword' && touched.confirmPassword) {
      const matchError = validatePasswordMatch(formData.password, value);
      setErrors(prev => ({ ...prev, confirmPassword: matchError }));
    }
  };

  const handleBlur = (field) => {
    setTouched(prev => ({ ...prev, [field]: true }));

    if (field === 'email' && email && !errors.email) {
      setCheckingEmail(true);
      debouncedEmailCheck(email, null, (available) => {
        setEmailAvailable(available);
        setCheckingEmail(false);
        if (!available) {
          setErrors(prev => ({ ...prev, email: 'This email address is already registered' }));
        }
      });
    } else {
      const error = validateField(field, formData[field]);
      setErrors(prev => ({ ...prev, [field]: error }));
    }
  };

  const validateFormData = () => {
    const { isValid, errors: validationErrors } = validateForm(formData, ['name', 'email', 'password', 'confirmPassword']);
    setErrors(validationErrors);
    setTouched({ name: true, email: true, password: true, confirmPassword: true });

    // Additional email uniqueness check
    if (isValid && emailAvailable === false) {
      setErrors(prev => ({ ...prev, email: 'This email address is already registered' }));
      return false;
    }

    return isValid;
  };

  // Fetch departments on component mount
  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const res = await api.get('/api/departments/public');
        setDepartments(res.data.data);
      } catch (err) {
        console.error('Failed to fetch departments:', err);
      }
    };
    fetchDepartments();
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();

    if (!validateFormData()) {
      return;
    }

    setLoading(true);

    try {
      await register(name, email, password, department);
      setLoading(false); // Stop loading immediately after response
      
      toast.success('Registration successful! Please wait for an administrator to verify your account.', {
        icon: <CheckCircle className="text-green-500" size={20} />,
        autoClose: 3000
      });

      // Clear form on success
      setFormData({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        department: ''
      });
      setTouched({});
      setErrors({});
      setEmailAvailable(null);

      // Navigate to login after shorter delay
      setTimeout(() => {
        navigate('/login');
      }, 1000);
    } catch (err) {
      setLoading(false); // Stop loading immediately on error
      
      // Provide user-friendly error messages
      let errorMessage = 'Registration failed. Please try again.';
      
      if (err.response?.status === 409 || err.response?.status === 400) {
        errorMessage = err.response?.data?.message || 'Email already registered. Please use a different email.';
      } else if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      }
      
      toast.error(errorMessage, {
        icon: <AlertCircle className="text-red-500" size={20} />,
        autoClose: 3000
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute top-40 left-40 w-80 h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-md"
      >
        {/* Glassmorphism card */}
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl shadow-2xl p-6 max-h-[calc(100vh-2rem)] overflow-y-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-center mb-6"
          >
            <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <UserPlus className="text-white" size={28} />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Create Account</h2>
            <p className="text-white/70">Join your team and start collaborating</p>
          </motion.div>

          <form onSubmit={onSubmit} className="space-y-3 sm:space-y-4">
            {/* Name Field */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
            >
              <label className="block text-sm font-medium text-white/90 mb-2">
                Full Name *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                  <User className="text-white" size={20} style={{ filter: 'drop-shadow(0 0 4px rgba(255, 255, 255, 0.5))' }} />
                </div>
                <input
                  type="text"
                  name="name"
                  value={name}
                  onChange={handleInputChange}
                  onBlur={() => handleBlur('name')}
                  className={`w-full pl-12 pr-4 py-3 bg-white/10 border rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent backdrop-blur-sm transition-all ${
                    errors.name ? 'border-red-400 bg-red-500/10' : 'border-white/20'
                  }`}
                  placeholder="Enter your full name"
                />
              </div>
              {errors.name && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 text-sm text-red-400 flex items-center gap-1"
                >
                  <AlertCircle size={14} />
                  {errors.name}
                </motion.p>
              )}
            </motion.div>

            {/* Email Field */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
            >
              <label className="block text-sm font-medium text-white/90 mb-2">
                Email Address *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                  <Mail className="text-white" size={20} style={{ filter: 'drop-shadow(0 0 4px rgba(255, 255, 255, 0.5))' }} />
                </div>
                <input
                  type="email"
                  name="email"
                  value={email}
                  onChange={handleInputChange}
                  onBlur={() => handleBlur('email')}
                  className={`w-full pl-12 pr-12 py-3 bg-white/10 border rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent backdrop-blur-sm transition-all ${
                    errors.email ? 'border-red-400 bg-red-500/10' : 'border-white/20'
                  }`}
                  placeholder="Enter your email address"
                />
                <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
                  {checkingEmail ? (
                    <div className="w-5 h-5 border-2 border-white/50 border-t-transparent rounded-full animate-spin"></div>
                  ) : emailAvailable === true ? (
                    <Check className="text-green-400" size={20} />
                  ) : emailAvailable === false ? (
                    <AlertCircle className="text-red-400" size={20} />
                  ) : null}
                </div>
              </div>
              {errors.email && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 text-sm text-red-400 flex items-center gap-1"
                >
                  <AlertCircle size={14} />
                  {errors.email}
                </motion.p>
              )}
            </motion.div>

            {/* Password Field */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 }}
            >
              <label className="block text-sm font-medium text-white/90 mb-2">
                Password *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                  <Lock className="text-white" size={20} style={{ filter: 'drop-shadow(0 0 4px rgba(255, 255, 255, 0.5))' }} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={password}
                  onChange={handleInputChange}
                  onBlur={() => handleBlur('password')}
                  className={`w-full pl-12 pr-12 py-3 bg-white/10 border rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent backdrop-blur-sm transition-all ${
                    errors.password ? 'border-red-400 bg-red-500/10' : 'border-white/20'
                  }`}
                  placeholder="Create a strong password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-white/50 hover:text-white/70 transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              <p className="mt-2 text-xs text-white/60">
                Must be at least 6 characters with uppercase, lowercase, and number
              </p>
              {errors.password && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 text-sm text-red-400 flex items-center gap-1"
                >
                  <AlertCircle size={14} />
                  {errors.password}
                </motion.p>
              )}
            </motion.div>

            {/* Confirm Password Field */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 }}
            >
              <label className="block text-sm font-medium text-white/90 mb-2">
                Confirm Password *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                  <Lock className="text-white" size={20} style={{ filter: 'drop-shadow(0 0 4px rgba(255, 255, 255, 0.5))' }} />
                </div>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  value={confirmPassword}
                  onChange={handleInputChange}
                  onBlur={() => handleBlur('confirmPassword')}
                  className={`w-full pl-12 pr-12 py-3 bg-white/10 border rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent backdrop-blur-sm transition-all ${
                    errors.confirmPassword ? 'border-red-400 bg-red-500/10' : 'border-white/20'
                  }`}
                  placeholder="Confirm your password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-white/50 hover:text-white/70 transition-colors"
                >
                  {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {errors.confirmPassword && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 text-sm text-red-400 flex items-center gap-1"
                >
                  <AlertCircle size={14} />
                  {errors.confirmPassword}
                </motion.p>
              )}
            </motion.div>

            {/* Department Field */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
            >
              <label className="block text-sm font-medium text-white/90 mb-2">
                Department
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                  <Building className="text-white" size={20} style={{ filter: 'drop-shadow(0 0 4px rgba(255, 255, 255, 0.5))' }} />
                </div>
                <select
                  name="department"
                  value={department}
                  onChange={handleInputChange}
                  className="w-full pl-12 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent backdrop-blur-sm transition-all appearance-none"
                >
                  <option value="" className="bg-slate-800">Select a department (optional)</option>
                  {departments.map((dept) => (
                    <option key={dept._id} value={dept._id} className="bg-slate-800">
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-2 text-xs text-white/60">Choose your department for better organization</p>
            </motion.div>

            {/* Submit Button */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
            >
              <button
                type="submit"
                disabled={loading || checkingEmail}
                className="w-full py-4 px-6 bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white font-semibold rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-2 focus:ring-offset-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:hover:transform-none"
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Creating Account...
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <UserPlus size={20} />
                    Register
                  </div>
                )}
              </button>
            </motion.div>
          </form>

          {/* Footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
            className="text-center mt-6"
          >
            <p className="text-white/70">
              Already have an account?{' '}
              <Link
                to="/login"
                className="font-semibold text-green-300 hover:text-green-200 transition-colors"
              >
                Sign in here
              </Link>
            </p>
          </motion.div>
        </div>
      </motion.div>

      <style jsx="true">{`
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  );
};

export default RegisterPage;
