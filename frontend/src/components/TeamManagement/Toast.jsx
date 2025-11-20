import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle,
  AlertCircle,
  Info,
  X
} from 'lucide-react';

/**
 * Reusable Toast Notification Component
 */
const Toast = ({ message, type = 'info', onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const icons = {
    success: <CheckCircle className="text-green-500" size={20} />,
    error: <AlertCircle className="text-red-500" size={20} />,
    info: <Info className="text-blue-500" size={20} />,
    warning: <AlertCircle className="text-yellow-500" size={20} />
  };

  const colors = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800'
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.9 }}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg ${colors[type]} backdrop-blur-sm`}
    >
      {icons[type]}
      <p className="font-medium flex-1">{message}</p>
      <button onClick={onClose} className="hover:opacity-70 transition-opacity">
        <X size={16} />
      </button>
    </motion.div>
  );
};

export default Toast;
