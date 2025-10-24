import React, { useState, useContext, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import AuthContext from '../context/AuthContext';
import { FaEnvelope, FaLock, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';
import { AiFillEye, AiFillEyeInvisible } from 'react-icons/ai';

const LoginPage = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const { email, password } = formData;

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const validateField = (name, value) => {
    let error = '';
    switch (name) {
      case 'email':
        if (!value) {
          error = 'Email is required';
        } else if (!/\S+@\S+\.\S+/.test(value)) {
          error = 'Please enter a valid email address';
        }
        break;
      case 'password':
        if (!value) {
          error = 'Password is required';
        }
        break;
      default:
        break;
    }
    return error;
  };

  const onChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    const error = validateField(name, value);
    setErrors({ ...errors, [name]: error });
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const newErrors = {};
    Object.keys(formData).forEach(key => {
      const error = validateField(key, formData[key]);
      if (error) newErrors[key] = error;
    });
    setErrors(newErrors);

    if (Object.keys(newErrors).length === 0) {
      setLoading(true);
      try {
        const { user } = await login(email, password);
        if (user.role === 'admin' || user.isVerified) {
          navigate('/');
        } else {
          navigate('/verify-pending');
        }
      } catch (err) {
        setErrors({ general: err.response?.data?.message || 'Login failed. Please try again.' });
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 relative overflow-hidden">
      <div className="absolute inset-0 bg-black opacity-20"></div>
      <div className={`w-full max-w-md p-8 space-y-6 bg-white rounded-xl shadow-2xl transform transition-all duration-700 ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'} hover:shadow-3xl hover:scale-105`}>
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Welcome Back!</h2>
          <p className="text-gray-600">Sign in to your account</p>
        </div>

        {errors.general && (
          <div className="p-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2 animate-pulse">
            <FaExclamationTriangle />
            <span>{errors.general}</span>
          </div>
        )}

        <form className="space-y-6" onSubmit={onSubmit}>
          <div className="relative">
            <FaEnvelope className="absolute top-4 left-3 text-gray-400 transition-colors" />
            <input
              type="email"
              name="email"
              value={email}
              onChange={onChange}
              className={`w-full pl-10 pr-3 py-3 border rounded-lg shadow-sm focus:outline-none focus:ring-2 transition-all duration-300 ${
                errors.email ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-indigo-500 focus:border-transparent'
              }`}
              placeholder="Email Address"
            />
            {email && !errors.email && (
              <FaCheckCircle className="absolute top-4 right-3 text-green-500" />
            )}
            {errors.email && (
              <FaExclamationTriangle className="absolute top-4 right-3 text-red-500" />
            )}
            {errors.email && (
              <p className="text-red-500 text-xs mt-1">{errors.email}</p>
            )}
          </div>

          <div className="relative">
            <FaLock className="absolute top-4 left-3 text-gray-400 transition-colors" />
            <input
              type={showPassword ? 'text' : 'password'}
              name="password"
              value={password}
              onChange={onChange}
              className={`w-full pl-10 pr-12 py-3 border rounded-lg shadow-sm focus:outline-none focus:ring-2 transition-all duration-300 ${
                errors.password ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-indigo-500 focus:border-transparent'
              }`}
              placeholder="Password"
            />
            <div className="absolute top-4 right-3 cursor-pointer transition-colors hover:text-indigo-600" onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? <AiFillEyeInvisible /> : <AiFillEye />}
            </div>
            {password && !errors.password && (
              <FaCheckCircle className="absolute top-4 right-10 text-green-500" />
            )}
            {errors.password && (
              <FaExclamationTriangle className="absolute top-4 right-10 text-red-500" />
            )}
            {errors.password && (
              <p className="text-red-500 text-xs mt-1">{errors.password}</p>
            )}
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-3 font-medium text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 active:scale-95"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Signing In...
                </div>
              ) : (
                'Sign In'
              )}
            </button>
          </div>

          <div className="text-center">
            <Link to="/forgot-password" className="text-sm text-indigo-600 hover:text-indigo-500 transition-colors">
              Forgot your password?
            </Link>
          </div>
        </form>

        <div className="text-center">
          <p className="text-sm text-gray-600">
            Don't have an account?{' '}
            <Link to="/register" className="font-medium text-indigo-600 hover:text-indigo-500 transition-colors">
              Create one here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
