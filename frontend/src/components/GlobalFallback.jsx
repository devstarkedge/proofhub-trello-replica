import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Construction, AlertTriangle, FileQuestion, ArrowLeft, Home, Sparkles } from "lucide-react";

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
      icon: Sparkles,
      color: "text-indigo-600",
      bgColor: "bg-indigo-50",
      borderColor: "border-indigo-100",
      defaultTitle: "Coming Soon",
      defaultMessage: "Our team is working passionately to bring this feature to life. We’re building something great for you. Thank you for your patience!",
      subText: "This feature is currently under development. Stay tuned — great things are on the way!"
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
  const displayMessage = message || currentConfig.defaultMessage; // Handles the main primary text

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-indigo-50/50 via-white to-indigo-50/50 animate-fade-in">
      <div className={`w-full max-w-lg p-10 rounded-3xl shadow-2xl bg-white border ${currentConfig.borderColor} text-center transform transition-all hover:scale-[1.01] duration-500 relative overflow-hidden`}>
        
        {/* Decorative background element */}
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-20"></div>

        {/* Icon Container */}
        <div className={`mx-auto w-24 h-24 rounded-full flex items-center justify-center mb-8 shadow-inner ${currentConfig.bgColor} relative group`}>
           <div className={`absolute inset-0 rounded-full opacity-0 group-hover:opacity-20 transition-opacity duration-700 bg-current text-current ${currentConfig.color}`}></div>
          <Icon className={`w-12 h-12 ${currentConfig.color} drop-shadow-sm transition-transform duration-700 group-hover:rotate-12`} strokeWidth={1.5} />
        </div>

        {/* Content */}
        <h1 className="text-4xl font-extrabold text-gray-900 mb-4 tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600">
          {displayTitle === "Coming Soon" ? (
             <>
               <span className="mr-2">✨</span>
               {displayTitle}
             </>
          ) : displayTitle}
        </h1>
        
        <p className="text-lg text-gray-600 mb-4 leading-relaxed font-medium">
          {displayMessage}
        </p>

        {currentConfig.subText && !message && (
             <p className="text-gray-500 mb-10 text-sm">
                {currentConfig.subText}
             </p>
        )}

        {/* Error Details */}
        {error && (
             <div className="mb-8 block mt-4 text-xs text-red-500 bg-red-50 p-4 rounded-xl border border-red-100 font-mono text-left overflow-auto max-h-40 shadow-inner">
               <span className="font-bold block mb-1">Error Details:</span>
               {error.toString()}
             </div>
          )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <button
            onClick={() => navigate(-1)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 rounded-xl border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 focus:ring-2 focus:ring-gray-200 focus:outline-none active:scale-95"
          >
            <ArrowLeft size={18} />
            Go Back
          </button>

          <Link
            to="/"
            className={`w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-300 focus:ring-4 focus:ring-offset-2 focus:outline-none active:scale-95 ${
              type === 'error' ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 focus:ring-red-200' :
              type === '404' ? 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 focus:ring-indigo-200' :
              'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 focus:ring-amber-200'
            }`}
          >
            <Home size={18} />
            Return to Dashboard
          </Link>
        </div>

        {/* Footer Note */}
        <div className="mt-10 pt-6 border-t border-gray-100">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">
            FlowTask System
          </p>
        </div>
      </div>
    </div>
  );
};

export default GlobalFallback;
