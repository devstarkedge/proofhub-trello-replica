import React, { useState, useRef, useEffect } from 'react';
import { 
  Download, 
  FileSpreadsheet, 
  FileText, 
  FileType,
  ChevronDown,
  Loader2
} from 'lucide-react';
import { toast } from 'react-toastify';

/**
 * ExportButton - Finance data export functionality
 * Supports Excel, CSV, and PDF formats
 * Respects current filters and department grouping
 */
const ExportButton = ({ 
  data, 
  columns, 
  filename = 'finance-report',
  title = 'Finance Report',
  filters = {},
  groupByDepartment = true
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [exporting, setExporting] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Format date for filename
  const formatDateForFilename = () => {
    const now = new Date();
    return now.toISOString().split('T')[0];
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount || 0);
  };

  // Format time
  const formatTime = (time) => {
    if (!time) return '0h 0m';
    const hours = time.hours || Math.floor((time.totalMinutes || 0) / 60);
    const minutes = time.minutes || (time.totalMinutes || 0) % 60;
    return `${hours}h ${minutes}m`;
  };

  // Get cell value for export
  const getCellValue = (item, col) => {
    const value = item[col.key];
    if (col.key.includes('Time') || col.key.includes('time')) {
      return formatTime(value);
    }
    if (col.key === 'payment' || col.key.includes('Payment') || col.key.includes('Revenue')) {
      return typeof value === 'number' ? formatCurrency(value) : value;
    }
    if (typeof value === 'object' && value !== null) {
      return value.name || value.title || JSON.stringify(value);
    }
    return value || '-';
  };

  // Export to CSV
  const exportToCSV = async () => {
    setExporting('csv');
    try {
      const headers = columns.map(col => col.label || col.key).join(',');
      const rows = data.map(item => 
        columns.map(col => {
          const value = getCellValue(item, col);
          // Escape quotes and wrap in quotes if contains comma
          const escaped = String(value).replace(/"/g, '""');
          return escaped.includes(',') ? `"${escaped}"` : escaped;
        }).join(',')
      );
      
      const csvContent = [headers, ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}-${formatDateForFilename()}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      
      toast.success('CSV exported successfully');
    } catch (error) {
      console.error('CSV export error:', error);
      toast.error('Failed to export CSV');
    } finally {
      setExporting(null);
      setShowMenu(false);
    }
  };

  // Export to Excel (using XLSX library via CDN)
  const exportToExcel = async () => {
    setExporting('excel');
    try {
      // Check if XLSX is available, if not load it
      if (!window.XLSX) {
        await loadScript('https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js');
      }
      
      const XLSX = window.XLSX;
      
      // Create worksheet data
      const wsData = [
        columns.map(col => col.label || col.key),
        ...data.map(item => columns.map(col => getCellValue(item, col)))
      ];
      
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Finance Report');
      
      // Style header row (basic)
      const range = XLSX.utils.decode_range(ws['!ref']);
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cell = ws[XLSX.utils.encode_cell({ r: 0, c: col })];
        if (cell) {
          cell.s = { font: { bold: true }, fill: { fgColor: { rgb: "10b981" } } };
        }
      }
      
      XLSX.writeFile(wb, `${filename}-${formatDateForFilename()}.xlsx`);
      toast.success('Excel exported successfully');
    } catch (error) {
      console.error('Excel export error:', error);
      toast.error('Failed to export Excel');
    } finally {
      setExporting(null);
      setShowMenu(false);
    }
  };

  // Export to PDF
  const exportToPDF = async () => {
    setExporting('pdf');
    try {
      // Check if jsPDF is available
      if (!window.jspdf) {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js');
      }
      
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF('landscape');
      
      // Add title
      doc.setFontSize(16);
      doc.text(title, 14, 15);
      
      // Add date range if filtered
      doc.setFontSize(10);
      let dateInfo = '';
      if (filters.startDate && filters.endDate) {
        dateInfo = `Date Range: ${new Date(filters.startDate).toLocaleDateString()} - ${new Date(filters.endDate).toLocaleDateString()}`;
      }
      if (dateInfo) {
        doc.text(dateInfo, 14, 22);
      }
      
      // Add table
      doc.autoTable({
        head: [columns.map(col => col.label || col.key)],
        body: data.map(item => columns.map(col => getCellValue(item, col))),
        startY: dateInfo ? 28 : 22,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [16, 185, 129], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 245, 245] }
      });
      
      // Add footer
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.text(
          `Page ${i} of ${pageCount} | Generated on ${new Date().toLocaleString()}`,
          doc.internal.pageSize.width / 2,
          doc.internal.pageSize.height - 10,
          { align: 'center' }
        );
      }
      
      doc.save(`${filename}-${formatDateForFilename()}.pdf`);
      toast.success('PDF exported successfully');
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error('Failed to export PDF');
    } finally {
      setExporting(null);
      setShowMenu(false);
    }
  };

  // Helper to load external script
  const loadScript = (src) => {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  };

  const exportOptions = [
    { 
      id: 'excel', 
      label: 'Excel (.xlsx)', 
      icon: FileSpreadsheet, 
      color: '#10b981',
      action: exportToExcel 
    },
    { 
      id: 'csv', 
      label: 'CSV', 
      icon: FileText, 
      color: '#3b82f6',
      action: exportToCSV 
    },
    { 
      id: 'pdf', 
      label: 'PDF', 
      icon: FileType, 
      color: '#ef4444',
      action: exportToPDF 
    }
  ];

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        disabled={!data || data.length === 0}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          color: 'var(--color-text-secondary)',
          border: `1px solid ${showMenu ? '#10b981' : 'var(--color-border-subtle)'}`
        }}
      >
        <Download className="w-4 h-4" />
        Export
        <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showMenu ? 'rotate-180' : ''}`} />
      </button>

      {showMenu && (
        <div 
          className="absolute top-full right-0 mt-2 py-2 rounded-xl border z-[100]"
          style={{
            backgroundColor: '#ffffff',
            borderColor: '#e5e7eb',
            minWidth: '180px',
            boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.2), 0 4px 20px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.05)'
          }}
        >
          {exportOptions.map((option) => (
            <button
              key={option.id}
              onClick={option.action}
              disabled={exporting}
              className="w-full flex items-center gap-3 px-3 py-2.5 mx-1.5 rounded-lg text-sm font-medium transition-all duration-150"
              style={{
                color: 'var(--color-text-secondary)',
                backgroundColor: exporting === option.id ? 'var(--color-bg-muted)' : 'transparent',
                width: 'calc(100% - 12px)'
              }}
              onMouseEnter={(e) => {
                if (exporting !== option.id) e.currentTarget.style.backgroundColor = '#f3f4f6';
              }}
              onMouseLeave={(e) => {
                if (exporting !== option.id) e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {exporting === option.id ? (
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: option.color }} />
              ) : (
                <option.icon className="w-4 h-4" style={{ color: option.color }} />
              )}
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ExportButton;
