import { useState, useEffect, useContext } from 'react';
import Database from '../services/database';
import useRoleStore from '../store/roleStore';
import AuthContext from '../context/AuthContext';
import usePermissions from '../hooks/usePermissions';
import { 
  User, 
  Mail, 
  Briefcase, 
  CheckCircle2, 
  XCircle, 
  Calendar, 
  Building2, 
  AlertTriangle, 
  Info, 
  Loader2 
} from 'lucide-react';

const UserVerificationModal = ({ notification, request, onClose, onAction }) => {
  const { user: currentUser } = useContext(AuthContext);
  const { can } = usePermissions();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [approveLoading, setApproveLoading] = useState(false);
  const [declineLoading, setDeclineLoading] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [selectedRole, setSelectedRole] = useState('employee');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [restrictedAction, setRestrictedAction] = useState({ show: false, x: 0, y: 0, message: '' });

  const canApprove = currentUser?.role === 'admin' || can('canApproveJoinRequests');

  const handleRestrictedClick = (e, message) => {
    if (!canApprove) {
      e.preventDefault();
      e.stopPropagation();
      
      const rect = e.currentTarget.getBoundingClientRect();
      const x = rect.left + rect.width / 2; // Center horizontally
      const y = rect.top; // Position above the element

      setRestrictedAction({ show: true, x, y, message });

      setTimeout(() => {
        setRestrictedAction(prev => ({ ...prev, show: false }));
      }, 3000);
    }
  };

  // Use reactive selectors for roles
  const roles = useRoleStore((state) => state.roles);
  const loadRoles = useRoleStore((state) => state.loadRoles);
  const initialized = useRoleStore((state) => state.initialized);

  useEffect(() => {
    if (request) {
      if (currentUser && !canApprove && currentUser.role !== 'manager') {
        setError("You don't have permission to perform verification.");
        setLoading(false);
        return;
      }
      const initialRole = request.requestedRoleId?.slug || request.requestedRole || 'employee';
      setSelectedRole(initialRole);
      const initialDept = request.requestedDepartment?.[0]?._id || request.requestedDepartment?.[0] || '';
      setSelectedDepartment(initialDept);

      loadUserDataForRequest(request);
      loadDepartments();
    } else if (notification && notification.sender) {
      // Permission check
      if (currentUser && !canApprove && currentUser.role !== 'manager') {
        setError("You don't have permission to perform verification.");
        setLoading(false);
        return;
      }
      loadUserData();
      loadDepartments();
    }
  }, [request, notification, currentUser, canApprove]);

  // Load roles when component mounts
  useEffect(() => {
    if (!initialized) {
      loadRoles().catch(console.error);
    }
  }, [initialized, loadRoles]);

  // Normalize department name for display (handles array or populated object)
  const departmentName = (() => {
    if (!user || !user.department) return null;
    // department stored as array on User model
    if (Array.isArray(user.department)) {
      if (user.department.length === 0) return null;
      // department may be populated object or id
      const first = user.department[0];
      if (first && typeof first === 'object' && first.name) return first.name;
      // if department is an id (string), try to resolve from loaded departments
      if (typeof first === 'string' && departments && departments.length) {
        const found = departments.find(d => d._id === first || d._id === String(first));
        return found ? found.name : null;
      }
      return null;
    }
    // If populated as object
    if (typeof user.department === 'object' && user.department.name) return user.department.name;
    return null;
  })();

  const loadUserDataForRequest = async (req) => {
    try {
      setLoading(true);
      setError(null);
      const targetUserId = req.user?._id || req.user;
      if (targetUserId && typeof targetUserId === 'string') {
        try {
          const userData = await Database.getUser(targetUserId);
          if (userData?.data) {
            setUser({
              ...userData.data,
              department: req.requestedDepartment?.length ? req.requestedDepartment : userData.data.department,
            });
            return;
          }
        } catch (fetchErr) {
          console.warn('Could not fetch user details from database, falling back to request data:', fetchErr);
        }
      }
      if (req.user && typeof req.user === 'object') {
        setUser({
          _id: req.user._id,
          name: req.user.name,
          email: req.user.email,
          avatar: req.user.avatar,
          role: req.requestedRole || 'employee',
          department: req.requestedDepartment || [],
          createdAt: req.createdAt,
          isVerified: false,
          isActive: true,
        });
      }
    } catch (err) {
      console.error('Error loading request user data:', err);
      if (req.user && typeof req.user === 'object') {
        setUser({
          _id: req.user._id,
          name: req.user.name,
          email: req.user.email,
          avatar: req.user.avatar,
          role: req.requestedRole || 'employee',
          department: req.requestedDepartment || [],
          createdAt: req.createdAt,
          isVerified: false,
          isActive: true,
        });
      } else {
        setError('Failed to load user data. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadUserData = async () => {
    try {
      setLoading(true);
      setError(null);
      const senderId = typeof notification.sender === 'object' ? notification.sender._id : notification.sender;
      const userData = await Database.getUser(senderId);
      setUser(userData.data);
    } catch (error) {
      console.error('Error loading user data:', error);
      setError('Failed to load user data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadDepartments = async () => {
    try {
      const deptData = await Database.getDepartments();
      setDepartments(deptData.data);
    } catch (error) {
      console.error('Error loading departments:', error);
      setError('Failed to load departments. Department assignment will be unavailable.');
    }
  };

  const validateForm = () => {
    const errors = {};

    if (!selectedRole) {
      errors.role = 'Role is required';
    }

    return errors;
  };

  const handleApprove = async () => {
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setValidationErrors(validationErrors);
      return;
    }

    if (!user) return;

    setApproveLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const userData = {
        userId: user._id,
        role: selectedRole,
        department: selectedDepartment || null,
        requestId: request?._id,
      };
      await onAction('verify', userData);
      setSuccessMessage('User approved and verified successfully!');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Error approving user:', error);
      setError(error?.response?.data?.message || error?.message || 'Failed to approve user. Please try again.');
    } finally {
      setApproveLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!user) return;

    const confirmMessage = request
      ? 'Are you sure you want to decline this join request?'
      : 'Are you sure you want to decline this user registration? This will permanently delete their data.';
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setDeclineLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const userData = {
        userId: user._id,
        requestId: request?._id,
      };
      await onAction('decline', userData);
      setSuccessMessage('User declined and deleted successfully!');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Error declining user:', error);
      setError(error?.response?.data?.message || error?.message || 'Failed to decline user. Please try again.');
    } finally {
      setDeclineLoading(false);
    }
  };

  const handleClose = () => {
    if (!approveLoading && !declineLoading) {
      onClose();
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60]">
        <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-700 font-medium">Loading user details...</p>
            <p className="text-sm text-gray-500 mt-2">Please wait while we fetch the user information</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60]">
        <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl">
          <div className="text-center">
            <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-red-600 mb-2">User Not Found</h3>
            <p className="text-gray-600 mb-6">The requested user could not be loaded.</p>
            <button
              onClick={handleClose}
              className="w-full bg-gray-600 text-white py-3 px-4 rounded-lg hover:bg-gray-700 transition-colors duration-200 font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl p-6 max-w-3xl w-full mx-auto max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex justify-between items-start mb-6 border-b pb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center">
              <User className="w-6 h-6 mr-3 text-blue-600" />
              User Verification
            </h2>
            {user.department && (
              <div className="mt-3 bg-blue-50 p-3 rounded-lg">
                <p className="text-sm text-gray-700 flex items-center">
                  <Building2 className="w-4 h-4 mr-2 text-blue-600 inline" />
                  <span className="font-medium">Department selected during registration:</span>
                  <span className="ml-2 text-blue-600 font-semibold">{departmentName || 'Department name not available'}</span>
                </p>
              </div>
            )}
          </div>
          <button
            onClick={handleClose}
            disabled={approveLoading || declineLoading}
            className={`text-gray-400 hover:text-gray-600 text-2xl transition-colors duration-200 ${approveLoading || declineLoading ? 'cursor-not-allowed' : ''}`}
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        {/* Error and Success Messages */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-500 rounded-md flex items-center">
            <AlertTriangle className="w-4 h-4 text-red-500 mr-2 flex-shrink-0" />
            <span className="text-red-700 text-sm">{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-3 bg-green-50 border-l-4 border-green-500 rounded-md flex items-center">
            <CheckCircle2 className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
            <span className="text-green-700 text-sm">{successMessage}</span>
          </div>
        )}

        <div className="space-y-6">
          {/* User Details Section */}
          <div className="bg-gray-50 p-6 rounded-lg border">
            <h3 className="text-xl font-semibold mb-6 flex items-center text-gray-800 border-b pb-4">
              <Info className="w-5 h-5 mr-3 text-blue-600" />
              User Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              
              {/* Full Name */}
              <div className="flex items-start">
                <div className="p-2 bg-white rounded-lg shadow-sm mr-4 border border-gray-100">
                  <User className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Full Name</label>
                  <p className="text-gray-900 font-bold text-lg">{user.name}</p>
                </div>
              </div>

              {/* Current Role */}
              <div className="flex items-start">
                <div className="p-2 bg-white rounded-lg shadow-sm mr-4 border border-gray-100">
                  <Briefcase className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Current Role</label>
                  <p className="text-gray-900 font-bold text-lg capitalize">{user.role}</p>
                </div>
              </div>

              {/* Email Address - Spans Full Width */}
              <div className="flex items-start md:col-span-2">
                <div className="p-2 bg-white rounded-lg shadow-sm mr-4 border border-gray-100">
                  <Mail className="w-5 h-5 text-indigo-500" />
                </div>
                <div className="w-full">
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Email Address</label>
                  <p className="text-gray-900 font-bold text-lg break-words">{user.email}</p>
                </div>
              </div>

              {/* Registration Date */}
              <div className="flex items-start">
                <div className="p-2 bg-white rounded-lg shadow-sm mr-4 border border-gray-100">
                  <Calendar className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Registration Date</label>
                  <p className="text-gray-900 font-medium">
                    {new Date(user.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </div>
              </div>

              {/* Status Section */}
              <div className="flex items-start">
                <div className={`p-2 rounded-lg shadow-sm mr-4 border border-gray-100 ${(!request && user.isVerified) || (request && request.status !== 'pending') ? 'bg-green-50' : 'bg-yellow-50'}`}>
                  {(!request && user.isVerified) || (request && request.status !== 'pending') ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-yellow-500" />
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                    {request ? 'Request Status' : 'Verification Status'}
                  </label>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    (!request && user.isVerified) || (request && request.status !== 'pending')
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {request
                      ? (request.status === 'pending' ? 'Pending Review' : (request.status === 'approved' ? 'Approved' : 'Rejected'))
                      : (user.isVerified ? 'Verified' : 'Pending Verification')}
                  </span>
                </div>
              </div>

              {/* Account Status */}
              <div className="flex items-start">
                <div className={`p-2 rounded-lg shadow-sm mr-4 border border-gray-100 ${user.isActive ? 'bg-green-50' : 'bg-red-50'}`}>
                   {user.isActive ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500" />
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Account Status</label>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {user.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>

              {/* Personal message if from join request */}
              {request?.message && (
                <div className="flex items-start md:col-span-2">
                  <div className="w-full bg-blue-50/70 border border-blue-200/70 p-3.5 rounded-xl">
                    <label className="block text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Personal Message</label>
                    <p className="text-gray-800 text-sm italic">&quot;{request.message}&quot;</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Restricted Access Tooltip */}
          {restrictedAction.show && (
            <div 
              className="absolute z-50 bg-gray-800 text-white text-xs py-2 px-3 rounded shadow-lg transition-opacity duration-300"
              style={{ 
                top: restrictedAction.y, 
                left: restrictedAction.x,
                transform: 'translate(-50%, -120%)',
                pointerEvents: 'none'
              }}
            >
              {restrictedAction.message}
              <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1 w-2 h-2 bg-gray-800 rotate-45"></div>
            </div>
          )}

          {/* Approval Settings Section */}
          <div className="bg-blue-50 p-6 rounded-lg border border-blue-100 relative">
            <h3 className="text-xl font-semibold mb-5 flex items-center text-gray-800">
              <CheckCircle2 className="w-5 h-5 mr-2 text-blue-600" />
              Approval Settings
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div 
                className="relative"
                onClick={(e) => handleRestrictedClick(e, "Only authorized reviewers can assign roles.")}
              >
                {/* Overlay for unauthorized users to capture clicks */}
                {!canApprove && (
                  <div className="absolute inset-0 z-10 cursor-not-allowed bg-transparent" />
                )}
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assign Role <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedRole}
                  onChange={(e) => {
                    setSelectedRole(e.target.value);
                    setValidationErrors({...validationErrors, role: ''});
                  }}
                  className={`w-full px-4 py-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200 bg-white text-gray-900 ${validationErrors.role ? 'border-red-500' : 'border-gray-300'} ${!canApprove ? 'cursor-not-allowed opacity-70' : ''}`}
                  disabled={approveLoading || declineLoading || !canApprove}
                >
                  {roles.length === 0 ? (
                    <option value="employee" disabled className="bg-white text-gray-500">Loading roles...</option>
                  ) : (
                    <>
                      <option value="" disabled className="bg-white text-gray-500">Select a role</option>
                      {/* Exclude admin role from assignment dropdown */}
                      {roles
                        .filter(role => role.slug !== 'admin' && role.isActive !== false)
                        .map(role => (
                          <option key={role._id} value={role.slug} className="bg-white text-gray-900">
                            {role.name}
                          </option>
                        ))
                      }
                    </>
                  )}
                </select>
                {validationErrors.role && (
                  <p className="mt-1 text-xs text-red-600 flex items-center">
                    <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                    {validationErrors.role}
                  </p>
                )}
              </div>
              <div 
                className="relative"
                onClick={(e) => handleRestrictedClick(e, "Only authorized reviewers can assign departments.")}
              >
                {/* Overlay for unauthorized users to capture clicks */}
                {!canApprove && (
                  <div className="absolute inset-0 z-10 cursor-not-allowed bg-transparent" />
                )}
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assign Department (Optional)
                </label>
                <select
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                  className={`w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200 bg-white text-gray-900 ${!canApprove ? 'cursor-not-allowed opacity-70' : ''}`}
                  disabled={(approveLoading || declineLoading) || departments.length === 0 || !canApprove}
                >
                  <option value="" className="bg-white text-gray-900">No Department</option>
                  {departments.map((dept) => (
                    <option key={dept._id} value={dept._id} className="bg-white text-gray-900">
                      {dept.name}
                    </option>
                  ))}
                </select>
                {departments.length === 0 && (
                  <p className="mt-1 text-xs text-gray-500">No departments available</p>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons Section */}
          <div className="bg-gray-50 p-6 rounded-lg border-t relative">
            {(!request && user.isVerified) || (request && request.status !== 'pending') ? (
              <div className="text-center py-2">
                <div className="bg-green-50 text-green-700 p-6 rounded-lg border border-green-200 shadow-sm">
                  <div className="flex flex-col items-center justify-center">
                    <div className="p-3 bg-green-100 rounded-full mb-3">
                      <CheckCircle2 className="w-8 h-8 text-green-600" />
                    </div>
                    <h4 className="text-xl font-bold mb-2 text-green-800">
                      {request ? 'Join Request Already Reviewed' : 'User Already Verified'}
                    </h4>
                    <p className="text-green-700 max-w-md">
                      {request
                        ? 'This request has already been processed.'
                        : 'This user has successfully been verified and already has access to the system. No further action is required.'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div 
                    className="w-full relative"
                    onClick={(e) => handleRestrictedClick(e, "Only authorized reviewers can decline requests.")}
                  >
                    {!canApprove && (
                      <div className="absolute inset-0 z-10 cursor-not-allowed bg-transparent" />
                    )}
                  <button
                    onClick={handleDecline}
                    disabled={declineLoading || !canApprove}
                    className={`w-full bg-red-600 text-white py-3 px-4 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 font-medium flex items-center justify-center space-x-2 ${declineLoading || !canApprove ? 'cursor-not-allowed' : 'hover:shadow-md'}`}
                  >
                    {declineLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Processing...</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4" />
                        <span>{request ? 'Decline Request' : 'Decline & Delete'}</span>
                      </>
                    )}
                  </button>
                  </div>
                  <div 
                    className="w-full relative"
                    onClick={(e) => handleRestrictedClick(e, "Only authorized reviewers can approve requests.")}
                  >
                    {!canApprove && (
                      <div className="absolute inset-0 z-10 cursor-not-allowed bg-transparent" />
                    )}
                  <button
                    onClick={handleApprove}
                    disabled={approveLoading || !canApprove}
                    className={`w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 font-medium flex items-center justify-center space-x-2 ${approveLoading || !canApprove ? 'cursor-not-allowed' : 'hover:shadow-md'}`}
                  >
                    {approveLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Processing...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{request ? 'Approve Member' : 'Approve & Verify'}</span>
                      </>
                    )}
                  </button>
                  </div>
                </div>

                <div className="mt-4 text-center">
                  <p className="text-xs text-gray-500">
                    <Info className="w-3.5 h-3.5 inline mr-1" />
                    {request
                      ? 'Approving will grant access to this workspace with the selected role and department.'
                      : 'Approving will verify the user and grant access. Declining will permanently delete the user account.'}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserVerificationModal;
