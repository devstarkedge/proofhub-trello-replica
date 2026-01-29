import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, Upload, Download, Settings, Columns, History, 
  ChevronDown, FileSpreadsheet, FileText
} from 'lucide-react';
import useSalesStore from '../../store/salesStore';

const SalesToolbar = ({
  onAddRow,
  onImport,
  onManageDropdowns,
  onCreateColumn,
  onViewActivityLog,
  onBack,
  permissions
}) => {
  const { exportRows, selectedRows, pagination } = useSalesStore();
  const [exportOpen, setExportOpen] = useState(false);

  const handleExport = async (format) => {
    try {
      await exportRows(format);
      setExportOpen(false);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const buttonVariants = {
    idle: { scale: 1 },
    hover: { scale: 1.03 },
    tap: { scale: 0.97 }
  };

  const baseButtonClass = "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all shadow-sm";
  const primaryButtonClass = `${baseButtonClass} bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-blue-200 dark:shadow-blue-900/30`;
  const secondaryButtonClass = `${baseButtonClass} bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 hover:border-gray-300 dark:hover:border-gray-500`;

  return (
    <div className="bg-gradient-to-r from-white to-gray-50 dark:from-gray-800 dark:to-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="px-4 sm:px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Left Side - Back Button, Stats & Title */}
          <div className="flex items-center gap-4">
            {onBack && (
              <button
                onClick={onBack}
                aria-label="Go back"
                className="inline-flex items-center px-3 py-2 rounded-md text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 shadow-sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}

            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                Sales
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {pagination.total} total records
                {selectedRows.size > 0 && (
                  <span className="ml-2 text-blue-600 dark:text-blue-400 font-medium">
                    • {selectedRows.size} selected
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Right Side - Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Add Row - Primary Action */}
            {permissions?.canCreate && (
              <motion.button
                variants={buttonVariants}
                initial="idle"
                whileHover="hover"
                whileTap="tap"
                onClick={onAddRow}
                className={primaryButtonClass}
              >
                <Plus className="w-4 h-4" />
                Add Data
              </motion.button>
            )}

            {/* Import */}
            {permissions?.canImport && (
              <motion.button
                variants={buttonVariants}
                initial="idle"
                whileHover="hover"
                whileTap="tap"
                onClick={onImport}
                className={secondaryButtonClass}
              >
                <Upload className="w-4 h-4" />
                Import
              </motion.button>
            )}

            {/* Export Dropdown */}
            {permissions?.canExport && (
              <div className="relative">
                <motion.button
                  variants={buttonVariants}
                  initial="idle"
                  whileHover="hover"
                  whileTap="tap"
                  onClick={() => setExportOpen(!exportOpen)}
                  className={secondaryButtonClass}
                >
                  <Download className="w-4 h-4" />
                  Export
                  <ChevronDown className={`w-3 h-3 transition-transform ${exportOpen ? 'rotate-180' : ''}`} />
                </motion.button>
                
                <AnimatePresence>
                  {exportOpen && (
                    <>
                      <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setExportOpen(false)} 
                      />
                      <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 mt-2 w-44 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl shadow-xl z-50 overflow-hidden"
                      >
                        <button
                          onClick={() => handleExport('csv')}
                          className="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 flex items-center gap-3 transition-colors"
                        >
                          <FileText className="w-4 h-4 text-green-600" />
                          Export as CSV
                        </button>
                        <button
                          onClick={() => handleExport('xlsx')}
                          className="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 flex items-center gap-3 transition-colors"
                        >
                          <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                          Export as Excel
                        </button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Divider */}
            <div className="hidden sm:block w-px h-8 bg-gray-200 dark:bg-gray-700 mx-1" />



            {/* Create Column */}
            {permissions?.canManageDropdowns && (
              <motion.button
                variants={buttonVariants}
                initial="idle"
                whileHover="hover"
                whileTap="tap"
                onClick={onCreateColumn}
                className={secondaryButtonClass}
              >
                <Columns className="w-4 h-4" />
                <span className="hidden sm:inline">Columns</span>
              </motion.button>
            )}

            {/* Activity Log */}
            {permissions?.canViewActivityLog && onViewActivityLog && (
              <motion.button
                variants={buttonVariants}
                initial="idle"
                whileHover="hover"
                whileTap="tap"
                onClick={onViewActivityLog}
                className={secondaryButtonClass}
              >
                <History className="w-4 h-4" />
                <span className="hidden sm:inline">History</span>
              </motion.button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SalesToolbar;
