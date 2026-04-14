import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { Mail, ArrowLeft, AlertCircle, CheckCircle, Send } from 'lucide-react';
import api from '../services/api';
import useThemeStore from '../store/themeStore';
import { validateField } from '../utils/validationUtils';

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [touched, setTouched] = useState(false);
  const effectiveMode = useThemeStore((state) => state.effectiveMode);

  // Resend countdown timer
  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => {
      setResendTimer((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  const handleInputChange = (e) => {
    const value = e.target.value;
    setEmail(value);
    if (touched) {
      setError(validateField('email', value));
    }
  };

  const handleBlur = () => {
    setTouched(true);
    setError(validateField('email', email));
  };

  const handleSubmit = useCallback(async (e) => {
    if (e) e.preventDefault();

    const emailError = validateField('email', email);
    setError(emailError);
    setTouched(true);
    if (emailError) return;

    setLoading(true);
    try {
      await api.post('/api/auth/forgot-password', { email });
      setSubmitted(true);
      setResendTimer(30);
      toast.success('Password reset link sent successfully!', {
        icon: <CheckCircle className="text-green-500" size={20} />,
        autoClose: 4000
      });
    } catch (err) {
      let msg = 'Something went wrong. Please try again.';

      if (err.response?.status === 429) {
        msg = 'Too many requests. Please try again later.';
      } else if (err.response?.data?.message) {
        msg = err.response.data.message;
      }

      toast.error(msg, {
        icon: <AlertCircle className="text-red-500" size={20} />,
        autoClose: 4000
      });
    } finally {
      setLoading(false);
    }
  }, [email]);

  const handleResend = () => {
    if (resendTimer > 0) return;
    handleSubmit();
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
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl shadow-2xl p-6 sm:p-8">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-center mb-8"
          >
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
                <Mail className="text-white" size={28} />
              </div>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Forgot Password?</h2>
            <p className="text-white/70 text-sm">
              No worries! Enter your email and we'll send you a reset link.
            </p>
          </motion.div>

          {!submitted ? (
            <form onSubmit={handleSubmit} className="space-y-5">
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
                    onBlur={handleBlur}
                    autoComplete="email"
                    className={`w-full pl-12 pr-4 py-4 bg-white/10 border rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent backdrop-blur-sm transition-all ${
                      error ? 'border-red-400 bg-red-500/10' : 'border-white/20'
                    }`}
                    placeholder="Enter your email address"
                  />
                </div>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2 text-sm text-red-400 flex items-center gap-1"
                  >
                    <AlertCircle size={14} />
                    {error}
                  </motion.p>
                )}
              </motion.div>

              {/* Submit Button */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 px-6 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:hover:transform-none"
                >
                  {loading ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Sending...
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <Send size={20} />
                      Send Reset Link
                    </div>
                  )}
                </button>
              </motion.div>
            </form>
          ) : (
            /* Success State */
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-5"
            >
              <div className="text-center">
                <div className="flex justify-center mb-4">
                  <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
                    <CheckCircle className="text-green-400" size={28} />
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Check your email</h3>
                <p className="text-white/70 text-sm mb-1">
                  We've sent a password reset link to <span className="text-purple-300 font-medium">{email}</span>
                </p>
                <p className="text-white/50 text-xs">
                  Please also check your spam or junk folder.
                </p>
              </div>

              {/* Resend Button */}
              <div className="text-center">
                <button
                  onClick={handleResend}
                  disabled={resendTimer > 0 || loading}
                  className="text-sm font-medium text-purple-300 hover:text-purple-200 disabled:text-white/30 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? (
                    'Sending...'
                  ) : resendTimer > 0 ? (
                    `Resend in ${resendTimer}s`
                  ) : (
                    'Resend email'
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {/* Back to Login */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-center mt-8"
          >
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors"
            >
              <ArrowLeft size={16} />
              Back to Sign In
            </Link>
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

export default ForgotPasswordPage;
