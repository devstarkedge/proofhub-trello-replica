
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { X, Upload } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import useSalesStore from '../../store/salesStore';
import { toast } from 'react-toastify';
import { parseSalesDate } from '../../utils/dateUtils';

const ImportDataModal = ({ isOpen, onClose }) => {
  const { importRows, customColumns, fetchCustomColumns, fetchRows } = useSalesStore();
  const [step, setStep] = useState(1); // 1: Upload, 2: Map, 3: Preview, 4: Importing, 5: Complete
  const [fileName, setFileName] = useState('');
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [columnMap, setColumnMap] = useState({});
  const [previewRows, setPreviewRows] = useState([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [failedResults, setFailedResults] = useState(null);
  
  // Progress tracking state
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [processedCount, setProcessedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [importStats, setImportStats] = useState({ success: 0, failed: 0 });

  // Fetch custom columns when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchCustomColumns();
    }
  }, [isOpen, fetchCustomColumns]);

  const onDrop = useCallback((acceptedFiles) => {
    setError('');
    setSuccess('');
    if (!acceptedFiles.length) return;
    const file = acceptedFiles[0];
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      if (!json.length) {
        setError('No data found in file.');
        return;
      }
      const [header, ...body] = json;

      const normalizeHeader = (s) => (s === null || s === undefined) ? '' : String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
      const seen = new Set();
      const filteredHeader = [];
      const filteredBody = body.map(() => []);

      header.forEach((h, idx) => {
        const norm = normalizeHeader(h);
        if (norm && seen.has(norm)) {
          return;
        }
        if (norm) seen.add(norm);
        filteredHeader.push(h);
        filteredBody.forEach((row, rIdx) => {
          row.push(body[rIdx]?.[idx]);
        });
      });

      setColumns(filteredHeader);
      setRows(filteredBody);
      
      // Auto-map columns after a small delay to ensure salesFields is populated
      setTimeout(() => {
        try {
          const normalize = (s) => (s === null || s === undefined) ? '' : String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
          const fieldByNorm = {};
          
          // Get current salesFields (standard + custom)
          const currentSalesFields = useSalesStore.getState().customColumns.length > 0
            ? [
                { key: 'date', label: 'Date' },
                { key: 'bidLink', label: 'Bid Link' },
                { key: 'platform', label: 'Platform' },
                { key: 'profile', label: 'Profile' },
                { key: 'technology', label: 'Technology' },
                { key: 'clientRating', label: 'Client Rating' },
                { key: 'clientHireRate', label: 'Client % Hire Rate' },
                { key: 'clientBudget', label: 'Client Budget' },
                { key: 'clientSpending', label: 'Client Spending' },
                { key: 'clientLocation', label: 'Client Location' },
                { key: 'replyFromClient', label: 'Reply From Client' },
                { key: 'followUps', label: 'Follow Ups' },
                { key: 'followUpDate', label: 'Follow Up Date' },
                { key: 'connects', label: 'Connects' },
                { key: 'rate', label: 'Rate' },
                { key: 'proposalScreenshot', label: 'Proposal Screenshot' },
                { key: 'status', label: 'Status' },
                { key: 'comments', label: 'Comments' },
                { key: 'rowColor', label: 'Row Color' },
                ...useSalesStore.getState().customColumns.map(col => ({ key: col.key, label: col.name }))
              ]
            : [];
          
          currentSalesFields.forEach(f => {
            fieldByNorm[normalize(f.key)] = f.key;
            fieldByNorm[normalize(f.label)] = f.key;
          });

          const autoMap = {};
          filteredHeader.forEach((h) => {
            const n = normalize(h);
            let mapped = null;
            if (fieldByNorm[n]) mapped = fieldByNorm[n];
            else {
              // try partial/contains match
              for (const f of currentSalesFields) {
                const nk = normalize(f.key);
                const nl = normalize(f.label);
                if (nk && nk.includes(n) || n.includes(nk) || (nl && nl.includes(n)) || n.includes(nl)) {
                  mapped = f.key;
                  break;
                }
              }
            }
            // avoid mapping multiple headers to same field; prefer first match
            if (mapped && !Object.values(autoMap).includes(mapped)) {
              autoMap[h] = mapped;
            }
          });

          if (Object.keys(autoMap).length > 0) {
            setColumnMap(autoMap);
          }
        } catch (e) {
          // ignore mapping errors and allow manual mapping
        }
      }, 100);
      
      setStep(2);
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/csv': ['.csv']
    },
    multiple: false
  });

  // Predefined sales fields for mapping (standard + custom columns)
  const salesFields = useMemo(() => {
    const standardFields = [
      { key: 'date', label: 'Date' },
      { key: 'bidLink', label: 'Bid Link' },
      { key: 'platform', label: 'Platform' },
      { key: 'profile', label: 'Profile' },
      { key: 'technology', label: 'Technology' },
      { key: 'clientRating', label: 'Client Rating' },
      { key: 'clientHireRate', label: 'Client % Hire Rate' },
      { key: 'clientBudget', label: 'Client Budget' },
      { key: 'clientSpending', label: 'Client Spending' },
      { key: 'clientLocation', label: 'Client Location' },
      { key: 'replyFromClient', label: 'Reply From Client' },
      { key: 'followUps', label: 'Follow Ups' },
      { key: 'followUpDate', label: 'Follow Up Date' },
      { key: 'connects', label: 'Connects' },
      { key: 'rate', label: 'Rate' },
      { key: 'proposalScreenshot', label: 'Proposal Screenshot' },
      { key: 'status', label: 'Status' },
      { key: 'comments', label: 'Comments' },
      { key: 'rowColor', label: 'Row Color' },
    ];

    // Add custom columns to the mapping list
    const customFields = customColumns.map(col => ({
      key: col.key,
      label: col.name
    }));

    return [...standardFields, ...customFields];
  }, [customColumns]);

  const handleMapChange = (col, value) => {
    setColumnMap((prev) => ({ ...prev, [col]: value }));
  };

  const handlePreview = () => {
    // Map columns to sales fields
    const mapped = rows.map((row) => {
      const obj = {};
      columns.forEach((col, idx) => {
        const field = columnMap[col];
        if (field) obj[field] = row[idx];
      });
      return obj;
    });
    setPreviewRows(mapped.slice(0, 10)); // Preview first 10
    setStep(3);
  };

  const handleImport = async () => {
    setImporting(true);
    setError('');
    setSuccess('');
    setFailedResults(null);
    try {
      // Check if required fields are mapped (for user guidance only)
      const requiredFields = ['date', 'platform', 'technology', 'status'];
      const mappedRequiredFields = requiredFields.filter(f => Object.values(columnMap).includes(f));
      const unmappedFields = requiredFields.filter(f => !Object.values(columnMap).includes(f));
      
      // Warn user if no required fields are mapped, but allow import
      if (mappedRequiredFields.length === 0 && unmappedFields.length === requiredFields.length) {
        setError(`Warning: No required fields mapped (${requiredFields.join(', ')}). Consider mapping at least some fields.`);
        setImporting(false);
        return;
      }

      // Map all rows
      const mapped = rows.map((row, originalIndex) => {
        const obj = { _originalIndex: originalIndex };
        columns.forEach((col, idx) => {
          const field = columnMap[col];
          if (field) obj[field] = row[idx];
        });
        return obj;
      });

      // Filter out completely empty rows (rows where all mapped fields are empty/null/undefined)
      const nonEmptyMapped = mapped.filter(obj => {
        const keys = Object.keys(obj).filter(k => k !== '_originalIndex');
        return keys.some(k => obj[k] !== null && obj[k] !== undefined && String(obj[k]).trim() !== '');
      });

      if (nonEmptyMapped.length === 0) {
        setError('No valid data rows found in the file. All rows appear to be empty.');
        setImporting(false);
        return;
      }

      // Normalization helpers
      const normalizeRow = (obj) => {
        const out = { ...obj };
        const originalIndex = out._originalIndex;
        delete out._originalIndex;
        
        // Standard date fields - enhanced parsing
        if (out.date !== undefined && out.date !== null && out.date !== '') {
          const d = parseSalesDate(out.date);
          out.date = d ? d.toISOString() : null;
        }
        if (out.followUpDate !== undefined && out.followUpDate !== null && out.followUpDate !== '') {
          const d = parseSalesDate(out.followUpDate);
          out.followUpDate = d ? d.toISOString() : null;
        }
        
        // =========================================
        // URL VALIDATION FOR BIDLINK
        // =========================================
        // Helper to validate URL
        const isValidUrl = (urlString) => {
          if (!urlString || typeof urlString !== 'string') return false;
          const trimmed = urlString.trim();
          if (!trimmed) return false;
          
          // Check for common placeholder values
          const placeholders = ['-', '--', 'N/A', 'n/a', 'NA', 'na', 'null', 'none', 'None', '#', '0'];
          if (placeholders.includes(trimmed)) return false;
          
          // Try to parse as URL
          try {
            const url = new URL(trimmed);
            // Must be http or https
            return url.protocol === 'http:' || url.protocol === 'https:';
          } catch {
            // If it starts with http:// or https://, it's a malformed URL
            if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
              return false;
            }
            // Try prepending https:// and check again
            try {
              const url = new URL('https://' + trimmed);
              // Only accept if it looks like a real domain
              return url.hostname.includes('.');
            } catch {
              return false;
            }
          }
        };
        
        // Validate and normalize bidLink
        if (out.bidLink !== undefined) {
          const bidLinkVal = String(out.bidLink || '').trim();
          if (!bidLinkVal || !isValidUrl(bidLinkVal)) {
            // Invalid URL - remove the field so it imports as empty
            delete out.bidLink;
          } else {
            // Valid URL - ensure it has protocol
            if (!bidLinkVal.startsWith('http://') && !bidLinkVal.startsWith('https://')) {
              out.bidLink = 'https://' + bidLinkVal;
            } else {
              out.bidLink = bidLinkVal;
            }
          }
        }
        
        // Handle custom columns based on their types
        customColumns.forEach(col => {
          const key = col.key;
          if (out[key] !== undefined && out[key] !== null && out[key] !== '') {
            switch (col.type) {
              case 'date':
                // Parse date custom fields
                const d = parseSalesDate(out[key]);
                out[key] = d ? d.toISOString() : null;
                break;
              case 'number':
                // Parse numeric custom fields
                const n = Number(String(out[key]).replace(/,/g, '').trim());
                out[key] = isNaN(n) ? out[key] : n;
                break;
              case 'dropdown':
              case 'text':
              case 'link':
              default:
                // Keep as string, just trim
                if (typeof out[key] === 'string') {
                  out[key] = out[key].trim();
                }
                break;
            }
          }
        });
        
        // =========================================
        // COMPREHENSIVE NUMERIC FIELD NORMALIZATION
        // =========================================
        // Helper to clean and parse numeric values
        const parseNumericValue = (value) => {
          if (value === undefined || value === null) return null;
          
          const strVal = String(value).trim();
          
          // Check for placeholder/empty values that should be treated as null
          const emptyPlaceholders = ['-', '--', '---', 'N/A', 'n/a', 'NA', 'na', 'null', 'NULL', 'none', 'None', 'NONE', '', ' '];
          if (emptyPlaceholders.includes(strVal)) return null;
          
          // Check for percentage-only placeholders like '--%', '-%'
          if (/^-+%?$/.test(strVal)) return null;
          
          // Remove common formatting: currency symbols, commas, spaces, percentage signs
          let cleanedVal = strVal
            .replace(/[$€£¥₹]/g, '')      // Remove currency symbols
            .replace(/,/g, '')             // Remove commas
            .replace(/\s/g, '')            // Remove spaces
            .replace(/%$/g, '')            // Remove trailing percentage
            .trim();
          
          // If nothing left after cleaning, return null
          if (!cleanedVal || cleanedVal === '-') return null;
          
          // Try to parse as number
          const num = Number(cleanedVal);
          
          // Return the number if valid, otherwise return null (don't keep invalid strings)
          return isNaN(num) ? null : num;
        };
        
        // Standard numeric fields - apply comprehensive parsing
        ['clientRating', 'clientHireRate', 'connects', 'rate', 'clientBudget', 'clientSpending'].forEach(k => {
          if (out[k] !== undefined) {
            const parsed = parseNumericValue(out[k]);
            if (parsed === null) {
              delete out[k]; // Remove invalid numeric values instead of keeping them
            } else {
              out[k] = parsed;
            }
          }
        });
        
        // Trim all string fields and remove empty values
        Object.keys(out).forEach(k => {
          if (typeof out[k] === 'string') out[k] = out[k].trim();
          if (out[k] === '') delete out[k];
        });
        
        return { row: out, originalIndex };
      };

      const normalizedWithIndex = nonEmptyMapped.map(normalizeRow);
      
      // Apply default values for optional fields and separate valid/invalid rows
      const validRows = [];
      const invalidRows = [];
      
      // Default values for optional fields (enterprise-level: allow import with sensible defaults)
      const defaultValues = {
        status: '',
        platform: '',
        technology: '',
        profile: ''
      };
      
      normalizedWithIndex.forEach(({ row, originalIndex }) => {
        const missingFields = [];
        const rowWithDefaults = { ...row };
        
        // Only date is strictly required - apply defaults for other fields
        if (Object.values(columnMap).includes('date') && !row.date) {
          missingFields.push('date');
        }
        
        // Apply default values for optional fields if they're mapped but empty
        if (Object.values(columnMap).includes('platform') && !row.platform) {
          rowWithDefaults.platform = defaultValues.platform;
        }
        if (Object.values(columnMap).includes('technology') && !row.technology) {
          rowWithDefaults.technology = defaultValues.technology;
        }
        if (Object.values(columnMap).includes('status') && !row.status) {
          rowWithDefaults.status = defaultValues.status;
        }
        if (Object.values(columnMap).includes('profile') && !row.profile) {
          rowWithDefaults.profile = defaultValues.profile;
        }
        
        if (missingFields.length > 0) {
          invalidRows.push({
            index: originalIndex,
            data: row,
            error: `Missing or invalid: ${missingFields.join(', ')}`
          });
        } else {
          validRows.push(rowWithDefaults);
        }
      });

      // If all rows are invalid after validation
      if (validRows.length === 0 && invalidRows.length > 0) {
        setError(`All ${invalidRows.length} rows have validation errors. No data was imported.`);
        setFailedResults({ failed: invalidRows, success: [] });
        setImporting(false);
        setStep(3);
        return;
      }

      // =========================================
      // BATCH IMPORT WITH REAL-TIME PROGRESS
      // =========================================
      const BATCH_SIZE = 100; // Process 100 rows per batch
      const totalRows = validRows.length;
      const skippedEmpty = rows.length - nonEmptyMapped.length;
      
      // Initialize progress tracking
      setStep(4); // Switch to importing step with progress bar
      setTotalCount(totalRows);
      setProcessedCount(0);
      setProgress(0);
      setProgressMessage('Starting import...');
      setImportStats({ success: 0, failed: 0 });
      
      // Split into batches
      const batches = [];
      for (let i = 0; i < totalRows; i += BATCH_SIZE) {
        batches.push(validRows.slice(i, i + BATCH_SIZE));
      }
      
      let totalSuccess = 0;
      let totalBackendFailed = 0;
      const allFailed = [...invalidRows];
      const allSuccessful = [];
      
      // Process batches sequentially with progress updates
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const batchStartIndex = batchIndex * BATCH_SIZE;
        
        setProgressMessage(`Processing batch ${batchIndex + 1} of ${batches.length}...`);
        
        try {
          const result = await importRows(batch);
          
          if (result && result.results) {
            const batchSuccess = result.results.success?.length || 0;
            totalSuccess += batchSuccess;
            
            if (result.results.success) {
              allSuccessful.push(...result.results.success);
            }
            
            if (result.results.failed && result.results.failed.length > 0) {
              totalBackendFailed += result.results.failed.length;
              result.results.failed.forEach(f => {
                allFailed.push({
                  index: (f.index ?? 0) + batchStartIndex,
                  data: f.data || {},
                  error: f.error || 'Backend validation failed'
                });
              });
            }
          }
        } catch (batchError) {
          // If entire batch fails, count all as failed
          totalBackendFailed += batch.length;
          batch.forEach((row, idx) => {
            allFailed.push({
              index: batchStartIndex + idx,
              data: row,
              error: batchError.message || 'Batch import failed'
            });
          });
        }
        
        // Update progress after each batch
        const processedSoFar = Math.min((batchIndex + 1) * BATCH_SIZE, totalRows);
        const progressPercent = Math.round((processedSoFar / totalRows) * 100);
        
        setProcessedCount(processedSoFar);
        setProgress(progressPercent);
        setImportStats({ success: totalSuccess, failed: allFailed.length });
        setProgressMessage(`Processed ${processedSoFar.toLocaleString()} of ${totalRows.toLocaleString()} rows...`);
        
        // Small delay to ensure UI updates render
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      // Refresh the data after import completes
      await fetchRows();
      
      // Final results
      const totalFailed = allFailed.length;
      const totalImported = totalSuccess;

      // Update final state
      setProgress(100);
      setProcessedCount(totalRows);
      setProgressMessage('Import complete!');

      // Show appropriate message based on results
      if (totalFailed > 0 && totalImported > 0) {
        const msg = `Partially imported: ${totalImported.toLocaleString()} rows succeeded, ${totalFailed.toLocaleString()} failed.${skippedEmpty > 0 ? ` (${skippedEmpty.toLocaleString()} empty rows skipped)` : ''}`;
        setError(msg);
        setSuccess(`${totalImported.toLocaleString()} rows imported successfully.`);
        setFailedResults({ failed: allFailed, success: allSuccessful });
        toast.warning(msg);
        setStep(5); // Complete step with results
      } else if (totalFailed > 0 && totalImported === 0) {
        const msg = `Import failed: All ${totalFailed.toLocaleString()} rows have errors.${skippedEmpty > 0 ? ` (${skippedEmpty.toLocaleString()} empty rows skipped)` : ''}`;
        setError(msg);
        setFailedResults({ failed: allFailed, success: [] });
        toast.error(msg);
        setStep(5);
      } else {
        const msg = `Import completed successfully! ${totalImported.toLocaleString()} rows imported.${skippedEmpty > 0 ? ` (${skippedEmpty.toLocaleString()} empty rows skipped)` : ''}`;
        setSuccess(msg);
        setFailedResults(null);
        toast.success(msg);
        setStep(5);
      }
    } catch (err) {
      console.error('Import error:', err);
      setError(`Import failed: ${err.message || 'Please check your data and try again.'}`);
      setProgress(0);
      setProgressMessage('');
      toast.error('Import failed. Please check your data.');
      setStep(3); // Back to preview on error
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setFileName('');
    setColumns([]);
    setRows([]);
    setColumnMap({});
    setPreviewRows([]);
    setError('');
    setSuccess('');
    setFailedResults(null);
    setProgress(0);
    setProgressMessage('');
    setProcessedCount(0);
    setTotalCount(0);
    setImportStats({ success: 0, failed: 0 });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full m-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Import Sales Data</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              <X className="w-6 h-6" />
            </button>
          </div>

          {step === 1 && (
            <div>
              <div {...getRootProps()} className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 dark:border-gray-600'}`}>
                <input {...getInputProps()} />
                <Upload className="mx-auto mb-2 w-8 h-8 text-blue-600" />
                <p className="text-gray-700 dark:text-gray-300">Drag & drop a CSV or Excel file here, or click to select</p>
                {fileName && <p className="mt-2 text-sm text-gray-500">Selected: {fileName}</p>}
              </div>
              {error && <p className="text-red-500 mt-2">{error}</p>}
            </div>
          )}

          {step === 2 && (
            <div>
              <h3 className="text-lg font-semibold mb-2">Map Columns</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm mb-4">
                  <thead>
                    <tr>
                      <th className="px-2 py-1 text-left">File Column</th>
                      <th className="px-2 py-1 text-left">Map To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {columns.map((col, idx) => (
                      <tr key={col + idx}>
                        <td className="px-2 py-1 font-medium">{col}</td>
                        <td className="px-2 py-1">
                          <select
                            className="input"
                            value={columnMap[col] || ''}
                            onChange={e => handleMapChange(col, e.target.value)}
                          >
                            <option value="">-- Ignore --</option>
                            {salesFields.map(f => (
                              <option key={f.key} value={f.key}>{f.label}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={handleReset} className="px-4 py-2 border rounded-lg">Back</button>
                <button onClick={handlePreview} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Preview</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h3 className="text-lg font-semibold mb-2">Preview Data</h3>
              <div className="overflow-x-auto max-h-64 mb-4">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr>
                      {Object.keys(previewRows[0] || {}).map((col, idx) => (
                        <th key={col + idx} className="px-2 py-1 text-left">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i}>
                        {Object.values(row).map((val, j) => (
                          <td key={j} className="px-2 py-1">{val}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={handleReset} className="px-4 py-2 border rounded-lg">Back</button>
                <button onClick={handleImport} className="px-4 py-2 bg-green-600 text-white rounded-lg" disabled={importing}>{importing ? 'Importing...' : 'Import'}</button>
              </div>
              {success && <p className="text-green-600 mt-2 font-medium">{success}</p>}
              {error && <p className="text-red-500 mt-2">{error}</p>}
              {failedResults && failedResults.failed && failedResults.failed.length > 0 && (
                <div className="mt-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-red-700 dark:text-red-400">
                      Failed rows ({failedResults.failed.length})
                    </div>
                    <button 
                      onClick={() => {
                        const dataStr = JSON.stringify(failedResults.failed, null, 2);
                        const blob = new Blob([dataStr], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'failed_import_rows.json';
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="text-xs px-2 py-1 bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-700 transition-colors"
                    >
                      Download Failed Rows
                    </button>
                  </div>
                  <div className="text-xs text-red-600 dark:text-red-400 mb-2">
                    Showing first 10 failed rows. Download for complete list.
                  </div>
                  <ul className="space-y-2 max-h-48 overflow-auto">
                    {failedResults.failed.slice(0, 10).map((f, i) => (
                      <li key={i} className="p-2 bg-white dark:bg-gray-800 rounded border border-red-100 dark:border-red-900">
                        <div className="flex items-start gap-2">
                          <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-medium bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300 rounded-full shrink-0">
                            {f.index + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-red-700 dark:text-red-400 font-medium">{f.error}</div>
                            <div className="text-gray-500 dark:text-gray-400 text-xs mt-1 truncate" title={JSON.stringify(f.data)}>
                              {Object.keys(f.data).length > 0 
                                ? Object.entries(f.data).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(', ') + (Object.keys(f.data).length > 3 ? '...' : '')
                                : 'No data'
                              }
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Importing with Progress Bar */}
          {step === 4 && (
            <div className="py-8">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-4">
                  <svg className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Importing Data...</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{progressMessage}</p>
              </div>
              
              {/* Progress Bar */}
              <div className="mb-6">
                <div className="flex justify-between text-sm mb-2">
                  <span className="font-medium text-gray-700 dark:text-gray-300">Progress</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">{progress}%</span>
                </div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600 rounded-full transition-all duration-300 ease-out relative"
                    style={{ width: `${progress}%` }}
                  >
                    <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                  </div>
                </div>
              </div>
              
              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    {processedCount.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    of {totalCount.toLocaleString()} Processed
                  </div>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {importStats.success.toLocaleString()}
                  </div>
                  <div className="text-xs text-green-600 dark:text-green-400 mt-1">Successful</div>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                    {importStats.failed.toLocaleString()}
                  </div>
                  <div className="text-xs text-red-600 dark:text-red-400 mt-1">Failed</div>
                </div>
              </div>
              
              <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-6">
                Please do not close this window while importing...
              </p>
            </div>
          )}

          {/* Step 5: Import Complete */}
          {step === 5 && (
            <div>
              <div className="text-center mb-6">
                {importStats.failed === 0 ? (
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
                    <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : (
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-yellow-100 dark:bg-yellow-900/30 mb-4">
                    <svg className="w-8 h-8 text-yellow-600 dark:text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                )}
                <h3 className={`text-xl font-semibold mb-2 ${importStats.failed === 0 ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                  {importStats.failed === 0 ? 'Import Complete!' : 'Import Completed with Errors'}
                </h3>
                {success && <p className="text-green-600 dark:text-green-400 text-sm">{success}</p>}
                {error && <p className="text-red-500 dark:text-red-400 text-sm mt-1">{error}</p>}
              </div>

              {/* Final Stats */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-center border border-green-200 dark:border-green-800">
                  <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                    {importStats.success.toLocaleString()}
                  </div>
                  <div className="text-sm text-green-600 dark:text-green-400 mt-1">Rows Imported</div>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 text-center border border-red-200 dark:border-red-800">
                  <div className="text-3xl font-bold text-red-600 dark:text-red-400">
                    {importStats.failed.toLocaleString()}
                  </div>
                  <div className="text-sm text-red-600 dark:text-red-400 mt-1">Rows Failed</div>
                </div>
              </div>

              {/* Failed Rows Details */}
              {failedResults && failedResults.failed && failedResults.failed.length > 0 && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-red-700 dark:text-red-400">
                      Failed rows ({failedResults.failed.length.toLocaleString()})
                    </div>
                    <button 
                      onClick={() => {
                        const dataStr = JSON.stringify(failedResults.failed, null, 2);
                        const blob = new Blob([dataStr], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'failed_import_rows.json';
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="text-xs px-3 py-1.5 bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300 rounded-md hover:bg-red-200 dark:hover:bg-red-700 transition-colors font-medium"
                    >
                      Download Failed Rows
                    </button>
                  </div>
                  <div className="text-xs text-red-600 dark:text-red-400 mb-3">
                    Showing first 5 failed rows. Download for complete list.
                  </div>
                  <ul className="space-y-2 max-h-40 overflow-auto">
                    {failedResults.failed.slice(0, 5).map((f, i) => (
                      <li key={i} className="p-2 bg-white dark:bg-gray-800 rounded border border-red-100 dark:border-red-900">
                        <div className="flex items-start gap-2">
                          <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-medium bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300 rounded-full shrink-0">
                            {f.index + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-red-700 dark:text-red-400 font-medium text-xs">{f.error}</div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex justify-center gap-3">
                <button 
                  onClick={() => { handleReset(); }} 
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Import More
                </button>
                <button 
                  onClick={() => { handleReset(); onClose(); }} 
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImportDataModal;
