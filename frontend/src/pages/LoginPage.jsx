import React, { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { Eye, EyeOff, Mail, Lock, LogIn, AlertCircle, CheckCircle } from 'lucide-react';
import AuthContext from '../context/AuthContext';
import useThemeStore from '../store/themeStore';
import { validateForm, validateField } from '../utils/validationUtils';

const LoginPage = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({});
  const { login } = useContext(AuthContext);
  const effectiveMode = useThemeStore((state) => state.effectiveMode);
  const navigate = useNavigate();

  const { email, password } = formData;

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });

    // Real-time validation
    if (touched[name]) {
      const error = validateField(name, value);
      setErrors(prev => ({ ...prev, [name]: error }));
    }
  };

  const handleBlur = (field) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    const error = validateField(field, formData[field]);
    setErrors(prev => ({ ...prev, [field]: error }));
  };

  const validateFormData = () => {
    const { isValid, errors: validationErrors } = validateForm(formData, ['email', 'password']);
    setErrors(validationErrors);
    setTouched({ email: true, password: true });
    return isValid;
  };

  const onSubmit = async (e) => {
    e.preventDefault();

    if (!validateFormData()) {
      return;
    }

    setLoading(true);
    try {
      const { user } = await login(email, password);
      setLoading(false); // Stop loading immediately after response
      
      toast.success('Login successful! Welcome back.', {
        icon: <CheckCircle className="text-green-500" size={20} />,
        autoClose: 2000
      });

      // Navigate after showing toast (delayed to let toast display)
      setTimeout(() => {
        if (user.role === 'admin' || user.isVerified) {
          navigate('/');
        } else {
          navigate('/verify-pending');
        }
      }, 1500);
    } catch (err) {
      setLoading(false); // Stop loading immediately on error
      
      // Provide user-friendly error messages
      let errorMessage = 'Invalid email or password. Please try again.';
      
      // Check for server error message first
      if (err.response?.data?.message) {
        const serverMessage = err.response.data.message.toLowerCase();
        
        // Map server messages to friendly messages
        if (serverMessage.includes('invalid credentials') || serverMessage.includes('no account found') || serverMessage.includes('password')) {
          errorMessage = 'Invalid email or password. Please try again.';
        } else if (serverMessage.includes('deactivated')) {
          errorMessage = 'Your account has been deactivated. Please contact support.';
        } else {
          errorMessage = err.response.data.message;
        }
      } else if (err.response?.status === 401) {
        errorMessage = 'Invalid email or password. Please try again.';
      } else if (err.response?.status === 400) {
        errorMessage = 'Please provide valid email and password.';
      }
      
      toast.error(errorMessage, {
        icon: <AlertCircle className="text-red-500" size={20} />,
        autoClose: 4000
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-60 h-60 sm:w-80 sm:h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-60 h-60 sm:w-80 sm:h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute top-40 left-40 w-60 h-60 sm:w-80 sm:h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-md"
      >
        {/* Glassmorphism card */}
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl shadow-2xl p-6 sm:p-8">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-center mb-8"
          >
            <div className="flex justify-center mb-8">
              <img 
                src="/footer-logo-new.webp" 
                alt="Logo" 
                className="w-24 h-24 object-contain transition-all duration-300 logo-image"
                style={{
                  filter: effectiveMode === 'dark' 
                    ? 'brightness(1.15) contrast(1.1) drop-shadow(0 0 20px rgba(197, 217, 255, 0.8))' 
                    : 'drop-shadow(0 0 15px rgba(192,132,252,0.6))',
                }}
              />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Welcome Back</h2>
            <p className="text-white/70">Sign in to your account</p>
          </motion.div>

          <form onSubmit={onSubmit} className="space-y-4 sm:space-y-6" autoComplete="off">
            {/* 
              Hack to prevent browser autofill:
              Browsers often ignore autoComplete="off" for login fields.
              We add hidden dummy inputs to "trap" the browser's initial autofill attempt.
            */}
            <div style={{ position: 'absolute', opacity: 0, zIndex: -1, width: 0, height: 0, overflow: 'hidden' }}>
              <input type="text" name="dummy-email" autoComplete="username" tabIndex={-1} />
              <input type="password" name="dummy-password" autoComplete="current-password" tabIndex={-1} />
            </div>

            {/* Email Field */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
            >
              <label className="block text-sm font-medium text-white/90 mb-2">
                Email Address *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                  <Mail className={effectiveMode === 'dark' ? "text-white" : "text-gray-500"} size={20} style={{ filter: effectiveMode === 'dark' ? 'drop-shadow(0 0 4px rgba(255, 255, 255, 0.5))' : 'none' }} />
                </div>
                <input
                  type="email"
                  name="email"
                  value={email}
                  onChange={handleInputChange}
                  onBlur={() => handleBlur('email')}
                  onFocus={(e) => {
                    e.target.readOnly = false;
                  }}
                  readOnly={true} // Start as readOnly to prevent autofill on load
                  autoComplete="off" // Explicitly off for this field
                  className={`w-full pl-12 pr-4 py-4 bg-white/10 border rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent backdrop-blur-sm transition-all ${
                    errors.email ? 'border-red-400 bg-red-500/10' : 'border-white/20'
                  }`}
                  placeholder="Enter your email address"
                />
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
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
            >
              <label className="block text-sm font-medium text-white/90 mb-2">
                Password *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                  <Lock className={effectiveMode === 'dark' ? "text-white" : "text-gray-500"} size={20} style={{ filter: effectiveMode === 'dark' ? 'drop-shadow(0 0 4px rgba(255, 255, 255, 0.5))' : 'none' }} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={password}
                  onChange={handleInputChange}
                  onBlur={() => handleBlur('password')}
                  onFocus={(e) => {
                    e.target.readOnly = false;
                  }}
                  readOnly={true} // Start as readOnly to prevent autofill on load
                  autoComplete="new-password" // "new-password" often works better than "off" for passwords
                  className={`w-full pl-12 pr-12 py-3 sm:py-4 bg-white/10 border rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent backdrop-blur-sm transition-all ${
                    errors.password ? 'border-red-400 bg-red-500/10' : 'border-white/20'
                  }`}
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-white/50 hover:text-white/70 transition-colors"
                >
                  {showPassword ? <EyeOff size={20} className={effectiveMode === 'dark' ? "text-white/50" : "text-gray-500"} /> : <Eye size={20} className={effectiveMode === 'dark' ? "text-white/50" : "text-gray-500"} />}
                </button>
              </div>
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

            {/* Submit Button */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 px-6 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:hover:transform-none"
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Signing in...
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <LogIn size={20} />
                    Sign In
                  </div>
                )}
              </button>
            </motion.div>
          </form>

          {/* Footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-center mt-8"
          >
            <p className="text-white/70">
              Don't have an account?{' '}
              <Link
                to="/register"
                className="font-semibold text-purple-300 hover:text-purple-200 transition-colors"
              >
                Register here
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

export default LoginPage;
