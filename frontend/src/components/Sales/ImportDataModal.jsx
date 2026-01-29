
import React, { useState, useCallback } from 'react';
import { X, Upload } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import useSalesStore from '../../store/salesStore';
import { toast } from 'react-toastify';

const ImportDataModal = ({ isOpen, onClose }) => {
  const { importRows } = useSalesStore();
  const [step, setStep] = useState(1); // 1: Upload, 2: Map, 3: Preview, 4: Importing
  const [fileName, setFileName] = useState('');
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [columnMap, setColumnMap] = useState({});
  const [previewRows, setPreviewRows] = useState([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [failedResults, setFailedResults] = useState(null);

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
      setColumns(header);
      // Auto-map columns by header names using simple heuristics
      try {
        const normalize = (s) => (s === null || s === undefined) ? '' : String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
        const fieldByNorm = {};
        salesFields.forEach(f => {
          fieldByNorm[normalize(f.key)] = f.key;
          fieldByNorm[normalize(f.label)] = f.key;
        });

        const autoMap = {};
        header.forEach((h) => {
          const n = normalize(h);
          let mapped = null;
          if (fieldByNorm[n]) mapped = fieldByNorm[n];
          else {
            // try partial/contains match
            for (const f of salesFields) {
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
      setRows(body);
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

  // Predefined sales fields for mapping
  const salesFields = [
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
      // Ensure required fields are mapped
      const requiredFields = ['date', 'platform', 'technology', 'status'];
      const missing = requiredFields.filter(f => !Object.values(columnMap).includes(f));
      if (missing.length > 0) {
        setError(`Please map required fields: ${missing.join(', ')}`);
        setImporting(false);
        return;
      }
      // Map all rows
      const mapped = rows.map((row) => {
        const obj = {};
        columns.forEach((col, idx) => {
          const field = columnMap[col];
          if (field) obj[field] = row[idx];
        });
        return obj;
      });

      // Normalization helpers
      const parseDateString = (val) => {
        if (val === null || val === undefined) return null;
        if (val instanceof Date) return val.toISOString();
        const s = String(val).trim();
        if (!s) return null;
        // Try ISO / native parse first
        const native = new Date(s);
        if (!isNaN(native.getTime())) return native.toISOString();
        // dd/mm/yyyy or d/m/yyyy or dd-mm-yyyy
        const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
        if (dmy) {
          const day = parseInt(dmy[1], 10);
          const month = parseInt(dmy[2], 10);
          const year = parseInt(dmy[3], 10);
          const dt = new Date(year, month - 1, day);
          if (!isNaN(dt.getTime())) return dt.toISOString();
        }
        // mm/dd/yyyy
        const mdy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
        if (mdy) {
          const p1 = parseInt(mdy[1], 10);
          const p2 = parseInt(mdy[2], 10);
          const y = parseInt(mdy[3], 10);
          const year = y < 100 ? 2000 + y : y;
          const dt = new Date(year, p1 - 1, p2);
          if (!isNaN(dt.getTime())) return dt.toISOString();
        }
        return null;
      };

      const normalizeRow = (obj) => {
        const out = { ...obj };
        // Dates
        if (out.date) {
          const d = parseDateString(out.date);
          out.date = d;
        }
        if (out.followUpDate) {
          const d = parseDateString(out.followUpDate);
          out.followUpDate = d;
        }
        // Numeric fields
        ['clientRating', 'clientHireRate', 'connects', 'rate'].forEach(k => {
          if (out[k] !== undefined && out[k] !== null && out[k] !== '') {
            const n = Number(String(out[k]).replace(/,/g, '').trim());
            out[k] = isNaN(n) ? out[k] : n;
          }
        });
        // Trim strings
        Object.keys(out).forEach(k => {
          if (typeof out[k] === 'string') out[k] = out[k].trim();
          if (out[k] === '') delete out[k];
        });
        return out;
      };

      const normalized = mapped.map(normalizeRow);

      // Reject early if any row misses required values after normalization
      const missingRows = normalized
        .map((r, idx) => ({ r, idx }))
        .filter(({ r }) => !r.date || !r.platform || !r.technology || !r.status);
      if (missingRows.length > 0) {
        setError(`Found ${missingRows.length} rows missing required fields (date/platform/technology/status).`);
        setFailedResults({ failed: missingRows.map(m => ({ index: m.idx, data: m.r, error: 'Missing required fields' })), success: [] });
        setImporting(false);
        setStep(3);
        return;
      }

      const result = await importRows(normalized);
      // If backend returned failures, show details
      if (result && result.results && result.results.failed && result.results.failed.length > 0) {
        const msg = `Imported ${result.results.success.length} rows, ${result.results.failed.length} failed. First error: ${result.results.failed[0].error}`;
        setError(msg);
        setFailedResults(result.results);
        toast.error(msg);
        // Keep user at preview so they can adjust
        setStep(3);
      } else {
        const msg = result?.message || 'Import completed successfully!';
        setSuccess(msg);
        setFailedResults(null);
        toast.success(msg);
        setStep(4);
      }
    } catch (err) {
      setError('Import failed. Please check your data.');
      toast.error('Import failed. Please check your data.');
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
              {error && <p className="text-red-500 mt-2">{error}</p>}
              {failedResults && failedResults.failed && failedResults.failed.length > 0 && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                  <div className="font-semibold">Failed rows ({failedResults.failed.length})</div>
                  <ul className="mt-2 list-disc pl-5 max-h-40 overflow-auto">
                    {failedResults.failed.slice(0, 10).map((f, i) => (
                      <li key={i} className="mb-2">
                        <div><strong>Error:</strong> {f.error}</div>
                        <div className="truncate"><strong>Row index:</strong> {f.index}</div>
                        <div className="truncate"><strong>Data:</strong> {JSON.stringify(f.data)}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-2 text-green-600">{success}</h3>
              <button onClick={() => { handleReset(); onClose(); }} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg">Close</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImportDataModal;
