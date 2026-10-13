import React from 'react';
import { Link } from 'react-router-dom';

const VerifyPending = () => {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-purple-800 to-pink-400">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-2xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">Account Verification Pending</h2>
          <p className="mt-2 text-sm text-gray-600">
            Your account has been created successfully, but it needs to be verified by an administrator before you can access the application.
          </p>
        </div>
        <div className="text-center">
          <p className="text-sm text-gray-600">
            Please contact an administrator or check back later.
          </p>
        </div>
        <div className="text-center">
          <Link to="/login" className="font-medium text-purple-600 hover:text-purple-500">
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default VerifyPending;
