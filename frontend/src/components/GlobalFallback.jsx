import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Construction, AlertTriangle, FileQuestion, ArrowLeft, Home, Sparkles, Bell, Send } from "lucide-react";
import { motion } from "framer-motion";

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
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [isNotified, setIsNotified] = useState(false);

  // Derive feature name from URL path for 404 pages
  // Only use if type is 404 and no explicit title provided
  const getFeatureName = () => {
    if (type !== '404') return null;
    
    const path = location.pathname.substring(1); // Remove leading slash
    if (!path) return "Coming Soon";
    
    // Split by slash or dash, capitalize, and join
    return path
      .split(/[-/]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const featureName = getFeatureName();

  // Configuration based on type
  const config = {
    maintenance: {
      icon: Construction,
      color: "text-amber-500",
      bgColor: "bg-amber-50",
      gradient: "from-amber-500/20 to-orange-500/20",
      borderColor: "border-amber-100",
      accentColor: "amber",
      defaultTitle: "Under Maintenance",
      defaultMessage: "We are currently improving our system. Please check back shortly."
    },
    "404": {
      icon: Sparkles,
      color: "text-violet-600",
      bgColor: "bg-violet-50",
      gradient: "from-violet-600/20 to-fuchsia-600/20",
      borderColor: "border-violet-100",
      accentColor: "violet",
      defaultTitle: featureName ? `${featureName} Page` : "Coming Soon",
      defaultMessage: `We're crafting the ${featureName || 'platform'} experience. This feature is currently in the workshop.`,
      subText: "Stay tuned! Great things are on the way."
    },
    error: {
      icon: AlertTriangle,
      color: "text-red-500",
      bgColor: "bg-red-50",
      gradient: "from-red-500/20 to-rose-500/20",
      borderColor: "border-red-100",
      accentColor: "red",
      defaultTitle: "Something Went Wrong",
      defaultMessage: "An unexpected error occurred. Please try again later."
    }
  };

  const currentConfig = config[type] || config.maintenance;
  const Icon = currentConfig.icon;
  // If we have a derived feature name, prefer it for 404s unless a custom title is passed
  const displayTitle = title || currentConfig.defaultTitle;
  const displayMessage = message || currentConfig.defaultMessage;

  const handleNotify = async (e) => {
    e.preventDefault();
    if (email) {
      try {
        setIsNotified("loading");
        
        // Dynamic import to avoid circular dependencies or load issues
        const { subscribeToFeature } = await import("../services/notificationService");
        await subscribeToFeature(email, displayTitle);
        
        setIsNotified(true);
        // Reset after 3 seconds to allow another email if needed, or just keep success state
        // For better UX, we keep success state longer or permanent for this session
        setEmail("");
      } catch (err) {
        console.error("Subscription failed:", err);
        // Ideally show a toast error here
        setIsNotified(false); // Reset to allow retry
        alert("Failed to subscribe. Please try again."); // Fallback if no toast
      }
    }
  };

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { 
        staggerChildren: 0.1,
        delayChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { 
      y: 0, 
      opacity: 1,
      transition: { type: "spring", stiffness: 100 }
    }
  };

  return (
    <div className="global-fallback-page min-h-screen relative flex items-center justify-center p-6 overflow-hidden bg-slate-50 transition-all duration-300">
      
      {/* Animated Background Blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div 
          animate={{ x: [0, 100, 0], y: [0, -50, 0], rotate: [0, 180, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className={`absolute top-0 left-0 w-[500px] h-[500px] rounded-full mix-blend-multiply filter blur-3xl opacity-30 bg-gradient-to-r ${currentConfig.gradient}`}
        />
        <motion.div 
          animate={{ x: [0, -100, 0], y: [0, 100, 0], rotate: [0, -180, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full mix-blend-multiply filter blur-3xl opacity-30 bg-gradient-to-r from-blue-400/30 to-cyan-300/30"
        />
      </div>

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative w-full max-w-2xl"
      >
        <div className={`backdrop-blur-xl bg-white/70 rounded-3xl shadow-2xl border border-white/50 p-8 sm:p-12 text-center overflow-hidden relative z-10 transition-all duration-300`}>
           {/* Decorative shine effect */}
           <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-50"></div>

          <motion.div variants={itemVariants} className="flex justify-center mb-8">
            <div className={`relative w-24 h-24 rounded-2xl flex items-center justify-center ${currentConfig.bgColor} shadow-inner group`}>
               <motion.div 
                 animate={{ rotate: [0, 10, -10, 0] }}
                 transition={{ duration: 4, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
               >
                 <Icon className={`w-12 h-12 ${currentConfig.color}`} strokeWidth={1.5} />
               </motion.div>
               {/* Pulsing ring */}
               <div className={`absolute inset-0 rounded-2xl border-2 ${currentConfig.color} opacity-20 animate-ping`} />
            </div>
          </motion.div>

          <motion.h1 variants={itemVariants} className="text-4xl sm:text-5xl font-extrabold text-slate-800 mb-6 tracking-tight">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-600">
              {displayTitle}
            </span>
          </motion.h1>

          <motion.p variants={itemVariants} className="text-lg text-slate-600 mb-8 max-w-lg mx-auto leading-relaxed">
            {displayMessage}
          </motion.p>
          
          {currentConfig.subText && !message && (
             <motion.p variants={itemVariants} className="text-slate-500 mb-10 text-sm font-medium">
                {currentConfig.subText}
             </motion.p>
          )}

          {/* Notify Me Section for Coming Soon */}
          {type === '404' && !isNotified && (
            <motion.form variants={itemVariants} onSubmit={handleNotify} className="max-w-md mx-auto mb-10 relative group">
              <div className="flex items-center bg-white rounded-full shadow-lg border border-slate-100 p-1.5 focus-within:ring-2 focus-within:ring-violet-200 transition-all duration-300">
                <div className="pl-4 text-slate-400">
                  <Bell size={18} />
                </div>
                <input 
                  type="email" 
                  placeholder="Enter your email to get notified" 
                  className="flex-1 px-4 py-2 bg-transparent border-none outline-none text-slate-700 placeholder:text-slate-400"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <button 
                  type="submit"
                  disabled={isNotified === "loading"}
                  className="bg-slate-900 text-white px-6 py-2.5 rounded-full font-medium hover:bg-slate-800 transition-colors flex items-center gap-2 shadow-md hover:shadow-lg active:scale-95 duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isNotified === "loading" ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      <span>Sending...</span>
                    </span>
                  ) : (
                    <>
                      <span>Notify Me</span>
                      <Send size={14} />
                    </>
                  )}
                </button>
              </div>
            </motion.form>
          )}

          {type === '404' && isNotified && (
             <motion.div 
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               className="mb-10 text-green-600 font-medium items-center justify-center gap-2 bg-green-50 py-3 px-6 rounded-full inline-flex mx-auto border border-green-100"
             >
               <Sparkles size={16} />
               <span>You're on the list! We'll allow you know.</span>
             </motion.div>
          )}

          {/* Error Details */}
          {error && (
             <motion.div variants={itemVariants} className="mb-8 block text-left bg-red-50/80 backdrop-blur-sm p-4 rounded-xl border border-red-100 text-xs font-mono text-red-600 overflow-auto max-h-40">
               <span className="font-bold block mb-1">Error Trace:</span>
               {error.toString()}
             </motion.div>
          )}

          {/* Action Buttons */}
          <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button
              onClick={() => navigate(-1)}
              className="group flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-slate-600 font-semibold hover:bg-slate-50 transition-all duration-200 focus:outline-none"
            >
              <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
              Go Back
            </button>

            <Link
              to="/"
              className={`relative overflow-hidden flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-300 active:scale-95 ${
                type === 'error' ? 'bg-gradient-to-r from-red-500 to-rose-600' :
                type === '404' ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600' :
                'bg-gradient-to-r from-amber-500 to-orange-600'
              }`}
            >
              <span className="relative z-10 flex items-center gap-2">
                <Home size={18} />
                Return to Home
              </span>
              <div className="absolute inset-0 bg-white/20 translate-y-full hover:translate-y-0 transition-transform duration-300" />
            </Link>
          </motion.div>

        </div>
      </motion.div>
    </div>
  );
};

export default GlobalFallback;
