import React, { useState, useContext, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import AuthContext from '../context/AuthContext';
import axios from 'axios';
import { FaUser, FaEnvelope, FaLock, FaBuilding, FaCheckCircle, FaExclamationTriangle, FaShieldAlt } from 'react-icons/fa';
import { AiFillEye, AiFillEyeInvisible } from 'react-icons/ai';

const RegisterPage = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    department: '',
    acceptTerms: false
  });
  const [departments, setDepartments] = useState([]);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [emailChecking, setEmailChecking] = useState(false);
  const [emailAvailable, setEmailAvailable] = useState(null);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const { register } = useContext(AuthContext);
  const navigate = useNavigate();

  const { name, email, password, confirmPassword, department, acceptTerms } = formData;

  useEffect(() => {
    setIsVisible(true);
    const fetchDepartments = async () => {
      try {
        const res = await axios.get('/api/departments');
        setDepartments(res.data.data);
      } catch (err) {
        console.error('Failed to fetch departments:', err);
      }
    };
    fetchDepartments();
  }, []);

  const checkEmailAvailability = async (emailValue) => {
    if (!emailValue || !/\S+@\S+\.\S+/.test(emailValue)) return;
    setEmailChecking(true);
    try {
      const res = await axios.post('/api/auth/check-email', { email: emailValue });
      setEmailAvailable(res.data.available);
    } catch (err) {
      setEmailAvailable(false);
    } finally {
      setEmailChecking(false);
    }
  };

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (email) {
        checkEmailAvailability(email);
      }
    }, 500);
    return () => clearTimeout(debounceTimer);
  }, [email]);

  const calculatePasswordStrength = (pwd) => {
    let strength = 0;
    if (pwd.length >= 8) strength++;
    if (/[A-Z]/.test(pwd)) strength++;
    if (/[a-z]/.test(pwd)) strength++;
    if (/[0-9]/.test(pwd)) strength++;
    if (/[^A-Za-z0-9]/.test(pwd)) strength++;
    return strength;
  };

  const validateField = (name, value) => {
    let error = '';
    switch (name) {
      case 'name':
        if (!value) {
          error = 'Full name is required';
        } else if (value.length < 2) {
          error = 'Name must be at least 2 characters';
        }
        break;
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
        } else if (value.length < 8) {
          error = 'Password must be at least 8 characters';
        } else if (calculatePasswordStrength(value) < 3) {
          error = 'Password is too weak';
        }
        break;
      case 'confirmPassword':
        if (!value) {
          error = 'Please confirm your password';
        } else if (value !== password) {
          error = 'Passwords do not match';
        }
        break;
      case 'acceptTerms':
        if (!value) {
          error = 'You must accept the terms and conditions';
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

    if (name === 'password') {
      setPasswordStrength(calculatePasswordStrength(value));
    }

    const error = validateField(name, value);
    setErrors({ ...errors, [name]: error });
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const newErrors = {};
    Object.keys(formData).forEach(key => {
      if (key !== 'department') { // department is optional
        const error = validateField(key, formData[key]);
        if (error) newErrors[key] = error;
      }
    });
    setErrors(newErrors);

    if (Object.keys(newErrors).length === 0) {
      setLoading(true);
      try {
        await register(name, email, password, department);
        setErrors({ success: 'Registration successful! Please wait for an administrator to verify your account.' });
        setShowSuccessAnimation(true);
        setTimeout(() => setShowSuccessAnimation(false), 3000);
      } catch (err) {
        setErrors({ general: err.response?.data?.message || 'Registration failed. Please try again.' });
      } finally {
        setLoading(false);
      }
    }
  };

  const getPasswordStrengthColor = () => {
    if (passwordStrength <= 1) return 'bg-red-500';
    if (passwordStrength <= 2) return 'bg-yellow-500';
    if (passwordStrength <= 3) return 'bg-blue-500';
    return 'bg-green-500';
  };

  const getPasswordStrengthText = () => {
    if (passwordStrength <= 1) return 'Weak';
    if (passwordStrength <= 2) return 'Fair';
    if (passwordStrength <= 3) return 'Good';
    return 'Strong';
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-purple-900 via-pink-900 to-red-900 relative overflow-hidden">
      <div className="absolute inset-0 bg-black opacity-20"></div>
      <div className={`w-full max-w-md p-8 space-y-6 bg-white rounded-xl shadow-2xl transform transition-all duration-700 ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'} hover:shadow-3xl hover:scale-105`}>
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Create Account</h2>
          <p className="text-gray-600">Join your team and start collaborating</p>
        </div>

        {errors.success && (
          <div className="p-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg flex items-center space-x-2 animate-pulse">
            <FaCheckCircle />
            <span>{errors.success}</span>
          </div>
        )}

        {showSuccessAnimation && (
          <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
            <div className="text-6xl animate-bounce">🎉</div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-32 h-32 border-4 border-green-500 rounded-full animate-ping"></div>
            </div>
          </div>
        )}

        {errors.general && (
          <div className="p-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2 animate-pulse">
            <FaExclamationTriangle />
            <span>{errors.general}</span>
          </div>
        )}

        <form className="space-y-6" onSubmit={onSubmit}>
          <div className="relative">
            <FaUser className="absolute top-4 left-3 text-gray-400 transition-colors" />
            <input
              type="text"
              name="name"
              value={name}
              onChange={onChange}
              className={`w-full pl-10 pr-3 py-3 border rounded-lg shadow-sm focus:outline-none focus:ring-2 transition-all duration-300 ${
                errors.name ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-purple-500 focus:border-transparent'
              }`}
              placeholder="Full Name"
            />
            {name && !errors.name && (
              <FaCheckCircle className="absolute top-4 right-3 text-green-500" />
            )}
            {errors.name && (
              <FaExclamationTriangle className="absolute top-4 right-3 text-red-500" />
            )}
            {errors.name && (
              <p className="text-red-500 text-xs mt-1">{errors.name}</p>
            )}
          </div>

          <div className="relative">
            <FaEnvelope className="absolute top-4 left-3 text-gray-400 transition-colors" />
            <input
              type="email"
              name="email"
              value={email}
              onChange={onChange}
              className={`w-full pl-10 pr-3 py-3 border rounded-lg shadow-sm focus:outline-none focus:ring-2 transition-all duration-300 ${
                errors.email ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-purple-500 focus:border-transparent'
              }`}
              placeholder="Email Address"
            />
            {email && !errors.email && (
              <FaCheckCircle className="absolute top-4 right-3 text-green-500" />
            )}
            {errors.email && (
              <FaExclamationTriangle className="absolute top-4 right-3 text-red-500" />
            )}
            {emailChecking && (
              <div className="absolute top-4 right-3">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
              </div>
            )}
            {email && !emailChecking && emailAvailable !== null && (
              <div className="absolute top-4 right-3">
                {emailAvailable ? (
                  <FaCheckCircle className="text-green-500" />
                ) : (
                  <FaExclamationTriangle className="text-red-500" />
                )}
              </div>
            )}
            {errors.email && (
              <p className="text-red-500 text-xs mt-1">{errors.email}</p>
            )}
            {email && !errors.email && emailAvailable === false && (
              <p className="text-red-500 text-xs mt-1">This email is already registered</p>
            )}
            {email && !errors.email && emailAvailable === true && (
              <p className="text-green-500 text-xs mt-1">Email is available</p>
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
                errors.password ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-purple-500 focus:border-transparent'
              }`}
              placeholder="Password"
            />
            <div className="absolute top-4 right-3 cursor-pointer transition-colors hover:text-purple-600" onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? <AiFillEyeInvisible /> : <AiFillEye />}
            </div>
            {password && !errors.password && (
              <FaCheckCircle className="absolute top-4 right-10 text-green-500" />
            )}
            {errors.password && (
              <FaExclamationTriangle className="absolute top-4 right-10 text-red-500" />
            )}
            {password && (
              <div className="mt-2">
                <div className="flex items-center space-x-2">
                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                    <div className={`h-2 rounded-full transition-all duration-300 ${getPasswordStrengthColor()}`} style={{ width: `${(passwordStrength / 5) * 100}%` }}></div>
                  </div>
                  <span className={`text-xs font-medium ${passwordStrength <= 2 ? 'text-red-500' : passwordStrength <= 3 ? 'text-yellow-500' : 'text-green-500'}`}>
                    {getPasswordStrengthText()}
                  </span>
                </div>
              </div>
            )}
            {errors.password && (
              <p className="text-red-500 text-xs mt-1">{errors.password}</p>
            )}
          </div>

          <div className="relative">
            <FaShieldAlt className="absolute top-4 left-3 text-gray-400 transition-colors" />
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              name="confirmPassword"
              value={confirmPassword}
              onChange={onChange}
              className={`w-full pl-10 pr-12 py-3 border rounded-lg shadow-sm focus:outline-none focus:ring-2 transition-all duration-300 ${
                errors.confirmPassword ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-purple-500 focus:border-transparent'
              }`}
              placeholder="Confirm Password"
            />
            <div className="absolute top-4 right-3 cursor-pointer transition-colors hover:text-purple-600" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
              {showConfirmPassword ? <AiFillEyeInvisible /> : <AiFillEye />}
            </div>
            {confirmPassword && !errors.confirmPassword && password === confirmPassword && (
              <FaCheckCircle className="absolute top-4 right-10 text-green-500" />
            )}
            {errors.confirmPassword && (
              <FaExclamationTriangle className="absolute top-4 right-10 text-red-500" />
            )}
            {errors.confirmPassword && (
              <p className="text-red-500 text-xs mt-1">{errors.confirmPassword}</p>
            )}
          </div>

          <div className="relative">
            <FaBuilding className="absolute top-4 left-3 text-gray-400 transition-colors" />
            <select
              name="department"
              value={department}
              onChange={onChange}
              className="w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300"
            >
              <option value="">Select a department (optional)</option>
              {departments.map((dept) => (
                <option key={dept._id} value={dept._id}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-start space-x-3">
            <input
              type="checkbox"
              name="acceptTerms"
              checked={acceptTerms}
              onChange={(e) => setFormData({ ...formData, acceptTerms: e.target.checked })}
              className="mt-1 h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
            />
            <div className="text-sm">
              <label htmlFor="acceptTerms" className="text-gray-700">
                I agree to the{' '}
                <a href="https://www.starkedge.com/" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:text-purple-500 underline">
                  Terms and Conditions
                </a>{' '}
                and{' '}
                <a href="https://www.starkedge.com/" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:text-purple-500 underline">
                  Privacy Policy
                </a>
              </label>
              {errors.acceptTerms && (
                <p className="text-red-500 text-xs mt-1">{errors.acceptTerms}</p>
              )}
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-3 font-medium text-white bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg hover:from-purple-700 hover:to-pink-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 active:scale-95"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Creating Account...
                </div>
              ) : (
                'Create Account'
              )}
            </button>
          </div>
        </form>

        <div className="text-center">
          <p className="text-sm text-gray-600">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-purple-600 hover:text-purple-500 transition-colors">
              Sign in here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
