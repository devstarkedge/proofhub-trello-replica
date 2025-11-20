import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { motion } from 'framer-motion';

/**
 * Error Boundary component for handling errors in TeamManagement sections
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error,
      errorInfo
    });
    // Log error for debugging
    console.error('Error caught by boundary:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl shadow-sm p-8 border border-gray-100 text-center"
        >
          <motion.div
            animate={{ 
              y: [0, -5, 0],
              rotate: [0, 2, -2, 0]
            }}
            transition={{ 
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="mb-6 inline-flex"
          >
            <div className="p-4 bg-red-100 rounded-full">
              <AlertCircle size={40} className="text-red-600" />
            </div>
          </motion.div>
          
          <h3 className="text-2xl font-bold text-gray-900 mb-2">
            Something Went Wrong
          </h3>
          <p className="text-gray-600 mb-4">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>

          {this.state.errorInfo && (
            <details className="mb-6 text-left bg-gray-50 p-4 rounded-lg max-h-48 overflow-y-auto">
              <summary className="cursor-pointer font-semibold text-gray-700 mb-2">
                Error Details
              </summary>
              <pre className="text-xs text-gray-600 whitespace-pre-wrap break-words">
                {this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={this.handleRetry}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold inline-flex items-center gap-2 shadow-lg"
          >
            <RotateCcw size={18} />
            Try Again
          </motion.button>
        </motion.div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
