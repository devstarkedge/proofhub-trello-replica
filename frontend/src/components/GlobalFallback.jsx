import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Construction, AlertTriangle, FileQuestion, ArrowLeft, Home } from "lucide-react";

/**
 * A reusable global fallback component for error pages, 404s, and maintenance messages.
 * 
 * @param {string} type - The type of fallback: '404', 'error', 'maintenance'
 * @param {string} title - Optional custom title
 * @param {string} message - Optional custom message
 * @param {function} onAction - Optional custom action handler
 */
const GlobalFallback = ({ 
  type = "maintenance", 
  title, 
  message,
  error 
}) => {
  const navigate = useNavigate();

  // Configuration based on type
  const config = {
    maintenance: {
      icon: Construction,
      color: "text-amber-500",
      bgColor: "bg-amber-50",
      borderColor: "border-amber-100",
      defaultTitle: "Under Maintenance",
      defaultMessage: "This page is under maintenance and our developers are working on it. Thank you for your patience."
    },
    "404": {
      icon: FileQuestion,
      color: "text-blue-500",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-100",
      defaultTitle: "Page Not Found",
      defaultMessage: "The page you are looking for might have been removed, had its name changed, or is temporarily unavailable."
    },
    error: {
      icon: AlertTriangle,
      color: "text-red-500",
      bgColor: "bg-red-50",
      borderColor: "border-red-100",
      defaultTitle: "Something Went Wrong",
      defaultMessage: "An unexpected error occurred. Please try again later."
    }
  };

  const currentConfig = config[type] || config.maintenance;
  const Icon = currentConfig.icon;
  const displayTitle = title || currentConfig.defaultTitle;
  const displayMessage = message || currentConfig.defaultMessage;

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50 animate-fade-in">
      <div className={`w-full max-w-md p-8 rounded-2xl shadow-xl bg-white border ${currentConfig.borderColor} text-center transform transition-all hover:scale-[1.01] duration-300`}>
        
        {/* Icon Container */}
        <div className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-sm ${currentConfig.bgColor}`}>
          <Icon className={`w-10 h-10 ${currentConfig.color}`} strokeWidth={1.5} />
        </div>

        {/* Content */}
        <h1 className="text-2xl font-bold text-gray-800 mb-3 tracking-tight">
          {displayTitle}
        </h1>
        
        <p className="text-gray-500 mb-8 leading-relaxed">
          {displayMessage}
          {error && (
             <span className="block mt-2 text-xs text-red-400 bg-red-50 p-2 rounded border border-red-100 font-mono text-left overflow-auto max-h-32">
               {error.toString()}
             </span>
          )}
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors focus:ring-2 focus:ring-gray-200 focus:outline-none"
          >
            <ArrowLeft size={18} />
            Go Back
          </button>

          <Link
            to="/"
            className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-white font-medium shadow-md transition-all hover:shadow-lg focus:ring-2 focus:ring-offset-2 focus:outline-none ${
              type === 'error' ? 'bg-red-500 hover:bg-red-600 focus:ring-red-200' :
              type === '404' ? 'bg-blue-500 hover:bg-blue-600 focus:ring-blue-200' :
              'bg-amber-500 hover:bg-amber-600 focus:ring-amber-200'
            }`}
          >
            <Home size={18} />
            Home
          </Link>
        </div>

        {/* Footer Note */}
        <div className="mt-8 pt-6 border-t border-gray-50">
          <p className="text-xs text-gray-400">
            FlowTask System
          </p>
        </div>
      </div>
    </div>
  );
};

export default GlobalFallback;
