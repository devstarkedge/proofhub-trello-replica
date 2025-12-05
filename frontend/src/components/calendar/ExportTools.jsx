import React, { memo, useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Download, FileSpreadsheet, FileText, Printer,
  Loader, Check, X, ChevronDown
} from 'lucide-react';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx';

/**
 * ExportTools - Export and print functionality for reminders
 * Supports Excel, PDF export and printing
 */
const ExportTools = memo(({
  reminders = [],
  selectedDate = null,
  dateRange = null,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [exporting, setExporting] = useState(null);
  const dropdownRef = useRef(null);

  // Format reminder data for export
  const formatRemindersForExport = useCallback(() => {
    return reminders.map(reminder => ({
      'Project Name': reminder.project?.name || 'N/A',
      'Client Name': reminder.client?.name || 'N/A',
      'Client Email': reminder.client?.email || 'N/A',
      'Client Phone': reminder.client?.phone || 'N/A',
      'Scheduled Date': new Date(reminder.scheduledDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      'Scheduled Time': new Date(reminder.scheduledDate).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      }),
      'Status': reminder.status?.charAt(0).toUpperCase() + reminder.status?.slice(1) || 'N/A',
      'Frequency': reminder.frequency || 'One-time',
      'Priority': reminder.priority || 'Medium',
      'Notes': reminder.notes || '',
      'Created At': new Date(reminder.createdAt).toLocaleDateString('en-US')
    }));
  }, [reminders]);

  // Export to Excel
  const handleExportExcel = async () => {
    if (reminders.length === 0) {
      toast.warning('No reminders to export');
      return;
    }

    setExporting('excel');
    try {
      const data = formatRemindersForExport();
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      
      // Set column widths
      const colWidths = [
        { wch: 25 }, // Project Name
        { wch: 20 }, // Client Name
        { wch: 25 }, // Client Email
        { wch: 15 }, // Client Phone
        { wch: 18 }, // Scheduled Date
        { wch: 12 }, // Scheduled Time
        { wch: 12 }, // Status
        { wch: 12 }, // Frequency
        { wch: 10 }, // Priority
        { wch: 40 }, // Notes
        { wch: 15 }, // Created At
      ];
      worksheet['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Reminders');
      
      const fileName = selectedDate 
        ? `reminders_${selectedDate}.xlsx`
        : dateRange
          ? `reminders_${dateRange.start}_to_${dateRange.end}.xlsx`
          : `reminders_${new Date().toISOString().split('T')[0]}.xlsx`;
      
      XLSX.writeFile(workbook, fileName);
      toast.success('Excel file downloaded successfully!');
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      toast.error('Failed to export Excel file');
    } finally {
      setExporting(null);
      setIsOpen(false);
    }
  };

  // Export to PDF (using browser print)
  const handleExportPDF = async () => {
    if (reminders.length === 0) {
      toast.warning('No reminders to export');
      return;
    }

    setExporting('pdf');
    try {
      const data = formatRemindersForExport();
      
      // Create printable HTML content
      const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Reminder Report</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
              padding: 40px; 
              color: #333;
            }
            .header { 
              text-align: center; 
              margin-bottom: 30px; 
              border-bottom: 2px solid #4F46E5; 
              padding-bottom: 20px;
            }
            .header h1 { color: #4F46E5; font-size: 28px; margin-bottom: 8px; }
            .header p { color: #666; font-size: 14px; }
            .summary { 
              display: flex; 
              gap: 20px; 
              margin-bottom: 30px; 
              flex-wrap: wrap;
            }
            .summary-item { 
              background: #F3F4F6; 
              padding: 15px 20px; 
              border-radius: 8px; 
              min-width: 120px;
            }
            .summary-item .label { font-size: 12px; color: #666; }
            .summary-item .value { font-size: 24px; font-weight: bold; color: #4F46E5; }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin-top: 20px;
              font-size: 12px;
            }
            th { 
              background: #4F46E5; 
              color: white; 
              padding: 12px 8px; 
              text-align: left;
              font-weight: 600;
            }
            td { 
              padding: 10px 8px; 
              border-bottom: 1px solid #E5E7EB;
            }
            tr:nth-child(even) { background: #F9FAFB; }
            tr:hover { background: #EEF2FF; }
            .status { 
              padding: 4px 8px; 
              border-radius: 12px; 
              font-size: 11px; 
              font-weight: 500;
            }
            .status-pending { background: #DBEAFE; color: #1E40AF; }
            .status-completed { background: #D1FAE5; color: #065F46; }
            .status-overdue { background: #FEE2E2; color: #991B1B; }
            .status-cancelled { background: #E5E7EB; color: #374151; }
            .footer { 
              margin-top: 30px; 
              text-align: center; 
              color: #999; 
              font-size: 11px;
              border-top: 1px solid #E5E7EB;
              padding-top: 15px;
            }
            @media print {
              body { padding: 20px; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>📋 Reminder Report</h1>
            <p>Generated on ${new Date().toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}</p>
            ${selectedDate ? `<p>Date: ${new Date(selectedDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>` : ''}
          </div>
          
          <div class="summary">
            <div class="summary-item">
              <div class="label">Total Reminders</div>
              <div class="value">${reminders.length}</div>
            </div>
            <div class="summary-item">
              <div class="label">Pending</div>
              <div class="value">${reminders.filter(r => r.status === 'pending').length}</div>
            </div>
            <div class="summary-item">
              <div class="label">Completed</div>
              <div class="value">${reminders.filter(r => r.status === 'completed').length}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Client</th>
                <th>Contact</th>
                <th>Date & Time</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${data.map(item => `
                <tr>
                  <td><strong>${item['Project Name']}</strong></td>
                  <td>${item['Client Name']}</td>
                  <td>
                    ${item['Client Email'] !== 'N/A' ? `📧 ${item['Client Email']}<br>` : ''}
                    ${item['Client Phone'] !== 'N/A' ? `📱 ${item['Client Phone']}` : ''}
                  </td>
                  <td>${item['Scheduled Date']}<br><small>${item['Scheduled Time']}</small></td>
                  <td>
                    <span class="status status-${item['Status'].toLowerCase()}">${item['Status']}</span>
                  </td>
                  <td>${item['Notes'] || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="footer">
            <p>FlowTask - Client Reminder Management System</p>
          </div>
        </body>
        </html>
      `;

      // Open print dialog
      const printWindow = window.open('', '_blank');
      printWindow.document.write(printContent);
      printWindow.document.close();
      
      setTimeout(() => {
        printWindow.print();
        toast.success('PDF export ready - use Save as PDF in print dialog');
      }, 250);
    } catch (error) {
      console.error('Error exporting to PDF:', error);
      toast.error('Failed to export PDF');
    } finally {
      setExporting(null);
      setIsOpen(false);
    }
  };

  // Print current view
  const handlePrint = () => {
    handleExportPDF(); // Reuse PDF export which opens print dialog
  };

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      {/* Export Button */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 px-4 py-2.5
          bg-white border border-gray-200
          rounded-xl font-medium text-sm text-gray-700
          shadow-sm hover:shadow-md hover:border-indigo-300
          transition-all duration-200
          ${isOpen ? 'ring-2 ring-indigo-500 ring-opacity-50' : ''}
        `}
      >
        <Download className="h-4 w-4" />
        <span>Export</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </motion.button>

      {/* Dropdown Menu */}
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="
            absolute right-0 mt-2 w-56
            bg-white rounded-xl shadow-xl
            border border-gray-100
            overflow-hidden z-50
          "
        >
          {/* Excel Export */}
          <button
            onClick={handleExportExcel}
            disabled={exporting === 'excel'}
            className="
              w-full flex items-center gap-3 px-4 py-3
              text-left text-sm text-gray-700
              hover:bg-green-50 hover:text-green-700
              transition-colors disabled:opacity-50
            "
          >
            {exporting === 'excel' ? (
              <Loader className="h-5 w-5 animate-spin text-green-600" />
            ) : (
              <FileSpreadsheet className="h-5 w-5 text-green-600" />
            )}
            <div>
              <div className="font-medium">Export to Excel</div>
              <div className="text-xs text-gray-500">Download as .xlsx file</div>
            </div>
          </button>

          {/* PDF Export */}
          <button
            onClick={handleExportPDF}
            disabled={exporting === 'pdf'}
            className="
              w-full flex items-center gap-3 px-4 py-3
              text-left text-sm text-gray-700
              hover:bg-red-50 hover:text-red-700
              transition-colors border-t border-gray-100
              disabled:opacity-50
            "
          >
            {exporting === 'pdf' ? (
              <Loader className="h-5 w-5 animate-spin text-red-600" />
            ) : (
              <FileText className="h-5 w-5 text-red-600" />
            )}
            <div>
              <div className="font-medium">Export to PDF</div>
              <div className="text-xs text-gray-500">Generate PDF report</div>
            </div>
          </button>

          {/* Print */}
          <button
            onClick={handlePrint}
            className="
              w-full flex items-center gap-3 px-4 py-3
              text-left text-sm text-gray-700
              hover:bg-indigo-50 hover:text-indigo-700
              transition-colors border-t border-gray-100
            "
          >
            <Printer className="h-5 w-5 text-indigo-600" />
            <div>
              <div className="font-medium">Print</div>
              <div className="text-xs text-gray-500">Print reminder list</div>
            </div>
          </button>

          {/* Reminder Count */}
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500 text-center">
            {reminders.length} reminder{reminders.length !== 1 ? 's' : ''} will be exported
          </div>
        </motion.div>
      )}
    </div>
  );
});

ExportTools.displayName = 'ExportTools';

export default ExportTools;
