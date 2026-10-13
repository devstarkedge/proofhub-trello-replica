
import React, { useState, useCallback, useEffect, useMemo, useContext } from 'react';
import { X, Upload, AlertCircle, Plus, Check } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import useSalesStore from '../../store/salesStore';
import * as salesApi from '../../services/salesApi';
import { toast } from 'react-toastify';
import { parseSalesDate } from '../../utils/dateUtils';
import { validateImportRows, SALES_REQUIRED_FIELDS, SALES_FIELD_LABELS } from '../../utils/salesValidation';
import { SALES_MAPPING_FIELDS } from '../../config/salesFieldConfig';
import AuthContext from '../../context/AuthContext';

const ImportDataModal = ({ isOpen, onClose }) => {
  const { importRows, customColumns, fetchCustomColumns, fetchRows, fetchDropdownOptions } = useSalesStore();
  const { user } = useContext(AuthContext);
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
  const [importStats, setImportStats] = useState({ success: 0, failed: 0, newColumns: 0, newOptions: 0 });

  // Hyperlink metadata extracted from Excel cells (keyed by "rowIdx-colIdx")
  const [cellHyperlinks, setCellHyperlinks] = useState({});

  // New columns to auto-create during import
  const [newColumnsToCreate, setNewColumnsToCreate] = useState([]);

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
    reader.onload = async (e) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array', cellDates: false, raw: true });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // =============================================
      // HYPERLINK EXTRACTION
      // .xlsx files are ZIP archives where hyperlinks live in XML
      // relationship files that SheetJS community edition DOES NOT parse.
      // We use JSZip to extract them directly from the OOXML structure.
      // =============================================
      const hyperlinkMap = {};

      // Detect file type: ZIP (.xlsx) starts with "PK" (0x50, 0x4B)
      const isXlsx = data.length >= 2 && data[0] === 0x50 && data[1] === 0x4B;
      console.log(`[Import] File type: ${isXlsx ? '.xlsx (ZIP)' : 'CSV/other (not ZIP)'}, size: ${data.length} bytes`);

      if (isXlsx) {
        // ---- Direct OOXML ZIP parsing (the ONLY reliable method) ----
        try {
          const zip = await JSZip.loadAsync(data);
          const zipFiles = Object.keys(zip.files);
          console.log('[Import] ZIP contents:', zipFiles.filter(f => f.includes('sheet') || f.includes('rels')));

          // Find sheet XML path
          let sheetXmlPath = null;
          const wbRelsFile = zip.file('xl/_rels/workbook.xml.rels');
          if (wbRelsFile) {
            const wbRelsXml = await wbRelsFile.async('text');
            const wbRelsDoc = new DOMParser().parseFromString(wbRelsXml, 'application/xml');
            const wsRel = Array.from(wbRelsDoc.querySelectorAll('Relationship')).find(r =>
              (r.getAttribute('Type') || '').includes('/worksheet')
            );
            if (wsRel) {
              const target = wsRel.getAttribute('Target');
              sheetXmlPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
            }
          }
          if (!sheetXmlPath) {
            // Fallback: scan ZIP for any sheet XML
            const sheetFiles = zipFiles.filter(f => /^xl\/worksheets\/sheet\d*\.xml$/i.test(f));
            if (sheetFiles.length > 0) sheetXmlPath = sheetFiles[0];
          }
          console.log('[Import] Sheet XML path:', sheetXmlPath);

          if (sheetXmlPath) {
            const sheetXml = await zip.file(sheetXmlPath)?.async('text');
            const sheetFileName = sheetXmlPath.split('/').pop();
            const sheetDir = sheetXmlPath.substring(0, sheetXmlPath.lastIndexOf('/'));
            const relsPath = `${sheetDir}/_rels/${sheetFileName}.rels`;
            const relsFile = zip.file(relsPath);
            console.log('[Import] Rels path:', relsPath, 'exists:', !!relsFile);

            if (sheetXml && relsFile) {
              const relsXml = await relsFile.async('text');
              const parser = new DOMParser();

              // Parse .rels → rId → URL map
              const relsDoc = parser.parseFromString(relsXml, 'application/xml');
              const relMap = {};
              relsDoc.querySelectorAll('Relationship').forEach(rel => {
                const id = rel.getAttribute('Id');
                const target = rel.getAttribute('Target');
                const type = rel.getAttribute('Type') || '';
                if (id && target) relMap[id] = target;
              });
              console.log('[Import] Relationship map:', relMap);

              // Parse sheet XML → <hyperlink> elements
              const sheetDoc = parser.parseFromString(sheetXml, 'application/xml');

              // Collect hyperlinks using multiple selector strategies
              let hyperlinks = [];
              // Strategy 1: Namespaced
              hyperlinks = Array.from(sheetDoc.getElementsByTagNameNS(
                'http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'hyperlink'
              ));
              // Strategy 2: Non-namespaced fallback
              if (hyperlinks.length === 0) {
                hyperlinks = Array.from(sheetDoc.querySelectorAll('hyperlink'));
              }
              // Strategy 3: Regex parse the raw XML (most reliable across all browsers)
              if (hyperlinks.length === 0) {
                const hlRegex = /<hyperlink[^>]+ref="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/?>/gi;
                let match;
                while ((match = hlRegex.exec(sheetXml)) !== null) {
                  const ref = match[1];
                  const rId = match[2];
                  if (relMap[rId]) {
                    hyperlinkMap[ref] = relMap[rId];
                  }
                }
                // Also try id without r: prefix
                const hlRegex2 = /<hyperlink[^>]+ref="([^"]+)"[^>]*\s+id="([^"]+)"[^>]*\/?>/gi;
                while ((match = hlRegex2.exec(sheetXml)) !== null) {
                  const ref = match[1];
                  const rId = match[2];
                  if (relMap[rId] && !hyperlinkMap[ref]) {
                    hyperlinkMap[ref] = relMap[rId];
                  }
                }
              }

              console.log(`[Import] Found ${hyperlinks.length} hyperlink elements via DOM`);

              // Process DOM-found hyperlinks
              hyperlinks.forEach(hl => {
                const ref = hl.getAttribute('ref');
                if (!ref || hyperlinkMap[ref]) return;
                // Try all possible attribute names for the relationship ID
                const rId = hl.getAttribute('r:id')
                  || hl.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')
                  || hl.getAttribute('id');
                if (rId && relMap[rId]) {
                  hyperlinkMap[ref] = relMap[rId];
                }
                // Some hyperlinks have inline location (no relationship)
                const location = hl.getAttribute('location');
                if (!hyperlinkMap[ref] && location) {
                  hyperlinkMap[ref] = location;
                }
              });

              const ooxmlCount = Object.keys(hyperlinkMap).length;
              console.log(`[Import] OOXML result: ${ooxmlCount} hyperlinks extracted`);
              if (ooxmlCount > 0) {
                console.log('[Import] ✅ Hyperlinks:', hyperlinkMap);
              } else {
                // Log a snippet of sheet XML around "hyperlink" for debugging
                const hlIdx = sheetXml.toLowerCase().indexOf('hyperlink');
                if (hlIdx >= 0) {
                  console.warn('[Import] "hyperlink" found in XML but not parsed. Context:', sheetXml.substring(Math.max(0, hlIdx - 100), hlIdx + 200));
                } else {
                  console.warn('[Import] No "hyperlink" text found in sheet XML. The file may not contain hyperlinks.');
                }
              }
            } else {
              console.warn('[Import] Sheet XML or .rels missing.', { hasSheetXml: !!sheetXml, relsPath });
              // If no .rels file, the sheet might not have any hyperlinks
            }
          } else {
            console.warn('[Import] Could not find sheet XML path in ZIP.');
          }
        } catch (zipErr) {
          console.error('[Import] OOXML extraction error:', zipErr);
        }
      }

      // ---- Fallback: SheetJS cell-level extraction (for CSV, or XLSX edge cases) ----
      const extractHyperlinkFormula = (formula) => {
        if (!formula) return null;
        const m = formula.match(/^HYPERLINK\s*\(\s*["']([^"']+)["']/i);
        return m ? m[1] : null;
      };

      Object.keys(worksheet).forEach(addr => {
        if (addr[0] === '!' || hyperlinkMap[addr]) return;
        const cell = worksheet[addr];
        if (!cell) return;
        if (cell.l && typeof cell.l === 'object' && (cell.l.Target || cell.l.target)) {
          hyperlinkMap[addr] = cell.l.Target || cell.l.target; return;
        }
        if (cell.l && typeof cell.l === 'string') { hyperlinkMap[addr] = cell.l; return; }
        if (cell.f) {
          const url = extractHyperlinkFormula(cell.f);
          if (url) { hyperlinkMap[addr] = url; return; }
        }
        if (cell.v && typeof cell.v === 'string' && cell.w && cell.w !== cell.v) {
          if (/^https?:\/\//i.test(cell.v) && !/^https?:\/\//i.test(cell.w)) {
            hyperlinkMap[addr] = cell.v;
          }
        }
      });

      if (Array.isArray(worksheet['!hyperlinks'])) {
        worksheet['!hyperlinks'].forEach(hl => {
          if (hl.ref && hl.Target && !hyperlinkMap[hl.ref]) {
            hyperlinkMap[hl.ref] = hl.Target;
          }
        });
      }

      // Final summary
      const hlCount = Object.keys(hyperlinkMap).length;
      if (hlCount > 0) {
        console.log(`[Import] ✅ Total hyperlinks: ${hlCount}`, hyperlinkMap);
      } else {
        console.warn(`[Import] ⚠️ No hyperlinks found. File type: ${isXlsx ? 'xlsx' : 'CSV'}. If your spreadsheet has hyperlinks, make sure to download as .xlsx (not CSV).`);
      }

      // =============================================
      // FIX: Force all cells to their text representation.
      // XLSX auto-converts date-like strings (e.g. "06-01-2025") into Excel
      // serial numbers using US locale (MM-DD-YYYY), which swaps day/month
      // when day ≤ 12. We convert ALL numeric cells that have a date format
      // back to plain strings so our DD-MM-YYYY parser handles them.
      // We also keep the formatted text (cell.w) when available.
      // =============================================
      Object.keys(worksheet).forEach(addr => {
        if (addr[0] === '!') return;
        const cell = worksheet[addr];
        if (!cell) return;

        // For any cell, prefer the formatted text representation
        // This preserves exactly what was in the file
        if (cell.w !== undefined && cell.w !== null) {
          cell.t = 's';
          cell.v = String(cell.w);
        }
      });

      const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });
      if (!json.length) {
        setError('No data found in file.');
        return;
      }
      const [header, ...body] = json;

      const normalizeHeader = (s) => (s === null || s === undefined) ? '' : String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
      const seen = new Set();
      const filteredHeader = [];
      const filteredBody = body.map(() => []);
      const hyperlinkData = {};

      header.forEach((h, idx) => {
        const norm = normalizeHeader(h);
        if (norm && seen.has(norm)) {
          return;
        }
        if (norm) seen.add(norm);
        const filteredColIdx = filteredHeader.length;
        filteredHeader.push(h);
        filteredBody.forEach((row, rIdx) => {
          row.push(body[rIdx]?.[idx]);
          // Translate hyperlink from cell address to filtered row/col index
          const cellAddr = XLSX.utils.encode_cell({ r: rIdx + 1, c: idx }); // +1 for header row
          if (hyperlinkMap[cellAddr]) {
            hyperlinkData[`${rIdx}-${filteredColIdx}`] = hyperlinkMap[cellAddr];
          }
        });
      });

      setColumns(filteredHeader);
      setRows(filteredBody);
      setCellHyperlinks(hyperlinkData);

      // Log hyperlink mapping results
      const mappedHlCount = Object.keys(hyperlinkData).length;
      if (mappedHlCount > 0) {
        console.log(`[Import] ✅ ${mappedHlCount} hyperlinks mapped to row-col indices:`, hyperlinkData);
      } else if (hlCount > 0) {
        console.warn('[Import] ⚠️ Hyperlinks found but none mapped to data cells. Check column filtering.');
      }
      
      // Auto-map columns after a small delay to ensure salesFields is populated
      setTimeout(() => {
        try {
          const normalize = (s) => (s === null || s === undefined) ? '' : String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
          const fieldByNorm = {};
          
          // Standard fields from config
          const standardFieldsList = SALES_MAPPING_FIELDS;
          const customFieldsList = (useSalesStore.getState().customColumns || []).map(col => ({ key: col.key, label: col.name }));
          const currentSalesFields = [...standardFieldsList, ...customFieldsList];
          
          currentSalesFields.forEach(f => {
            fieldByNorm[normalize(f.key)] = f.key;
            fieldByNorm[normalize(f.label)] = f.key;
          });

          const autoMap = {};
          const unmappedHeaders = [];

          // Pass 1: Exact matches only (by normalized key or label)
          // This ensures exact name matches always win before partial matching runs
          filteredHeader.forEach((h) => {
            const n = normalize(h);
            const exactMatch = fieldByNorm[n];
            if (exactMatch && !Object.values(autoMap).includes(exactMatch)) {
              autoMap[h] = exactMatch;
            }
          });

          // Pass 2: Partial/contains matches for remaining unmapped headers
          filteredHeader.forEach((h) => {
            if (autoMap[h]) return; // Already mapped exactly in pass 1
            const n = normalize(h);
            let mapped = null;
            for (const f of currentSalesFields) {
              const nk = normalize(f.key);
              const nl = normalize(f.label);
              if (nk && (nk.includes(n) || n.includes(nk)) || (nl && (nl.includes(n) || n.includes(nl)))) {
                mapped = f.key;
                break;
              }
            }
            if (mapped && !Object.values(autoMap).includes(mapped)) {
              autoMap[h] = mapped;
            } else {
              // No match found, or matched field already taken → treat as unmapped
              unmappedHeaders.push(h);
            }
          });

          if (Object.keys(autoMap).length > 0) {
            setColumnMap(autoMap);
          }

          // Auto-detect new columns from unmapped headers (exclude system-like columns)
          const skipHeaders = new Set(['_id', 'id', '__v', 'createdat', 'updatedat', 'deletedat', 'deletedby', 'isdeleted', 'lockedby', 'lockedat', 'createdby', 'updatedby', 'monthname', 'month']);
          const detectedNewCols = unmappedHeaders
            .filter(h => !skipHeaders.has(normalize(h)))
            .map(h => ({
              name: h,
              type: 'text', // Default type; user can change
              enabled: true
            }));
          setNewColumnsToCreate(detectedNewCols);
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
    const standardFields = SALES_MAPPING_FIELDS;

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
    // Build extended column map that includes new columns (mapped as their generated key)
    const extendedMap = { ...columnMap };
    newColumnsToCreate.filter(c => c.enabled).forEach(c => {
      const key = c.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      if (key && !Object.values(extendedMap).includes(key)) {
        // Map the file column header to the generated key
        extendedMap[c.name] = key;
      }
    });

    // Detect month column index for date validation
    const monthColIdx = columns.findIndex(col => {
      const norm = String(col).toLowerCase().replace(/[^a-z0-9]/g, '');
      return norm === 'month' || norm === 'monthname';
    });

    // Map columns to sales fields
    const mapped = rows.map((row, rowIdx) => {
      const obj = {};
      columns.forEach((col, idx) => {
        const field = extendedMap[col];
        if (field) {
          obj[field] = row[idx];
          // Attach hyperlink for bidLink column
          if (field === 'bidLink' && cellHyperlinks[`${rowIdx}-${idx}`]) {
            obj._bidLinkHyperlink = cellHyperlinks[`${rowIdx}-${idx}`];
          }
        }
      });
      // Attach imported month name for date validation
      if (monthColIdx >= 0 && row[monthColIdx]) {
        obj._importedMonthName = String(row[monthColIdx]).trim();
      }
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
      // Build extended column map that includes new columns
      const extendedMap = { ...columnMap };
      const enabledNewCols = newColumnsToCreate.filter(c => c.enabled);
      enabledNewCols.forEach(c => {
        const key = c.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        if (key && !Object.values(extendedMap).includes(key)) {
          extendedMap[c.name] = key;
        }
      });

      // Check if required fields are mapped — block import if any required field is unmapped
      // Skip monthName — it is auto-derived from date, not user-mapped
      const mappedValues = Object.values(extendedMap);
      const unmappedRequired = SALES_REQUIRED_FIELDS.filter(f => f !== 'monthName').filter(f => !mappedValues.includes(f));
      
      if (unmappedRequired.length > 0) {
        const labels = unmappedRequired.map(f => SALES_FIELD_LABELS[f] || f).join(', ');
        setError(`Required fields not mapped: ${labels}. Please map all required fields before importing.`);
        toast.error(`Map required fields: ${labels}`);
        setImporting(false);
        return;
      }

      // Detect month column index for date validation
      const monthColIdx = columns.findIndex(col => {
        const norm = String(col).toLowerCase().replace(/[^a-z0-9]/g, '');
        return norm === 'month' || norm === 'monthname';
      });

      // Map all rows using extendedMap
      const mapped = rows.map((row, originalIndex) => {
        const obj = { _originalIndex: originalIndex };
        columns.forEach((col, idx) => {
          const field = extendedMap[col];
          if (field) {
            obj[field] = row[idx];
            // Attach hyperlink for bidLink column
            if (field === 'bidLink' && cellHyperlinks[`${originalIndex}-${idx}`]) {
              obj._bidLinkHyperlink = cellHyperlinks[`${originalIndex}-${idx}`];
            }
          }
        });
        // Attach imported month name for date validation
        if (monthColIdx >= 0 && row[monthColIdx]) {
          obj._importedMonthName = String(row[monthColIdx]).trim();
        }
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

      // Month name → month number mapping (0-indexed)
      const monthNameToNum = {
        january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
        july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
        jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
      };

      // Normalization helpers
      const normalizeRow = (obj) => {
        const out = { ...obj };
        const originalIndex = out._originalIndex;
        delete out._originalIndex;

        // Extract the imported month name — used for date validation and as monthName fallback
        const importedMonth = out._importedMonthName;
        delete out._importedMonthName;

        // Standard date fields - enhanced parsing with month-name validation
        if (out.date !== undefined && out.date !== null && out.date !== '') {
          let d = parseSalesDate(out.date);

          // Validate parsed date against the imported Month Name column
          if (d && importedMonth) {
            const expectedMonthNum = monthNameToNum[importedMonth.toLowerCase()];
            if (expectedMonthNum !== undefined && d.getUTCMonth() !== expectedMonthNum) {
              // Month mismatch — the date was likely swapped (DD↔MM).
              // Reconstruct by swapping day and month in the parsed date.
              const wrongMonth = d.getUTCMonth();    // 0-indexed
              const wrongDay = d.getUTCDate();
              const year = d.getUTCFullYear();
              // wrongMonth+1 should actually be the day, wrongDay should be the month
              // Only swap if the swapped values make a valid date
              if (wrongMonth + 1 <= 31 && wrongDay >= 1 && wrongDay <= 12) {
                const reconstructed = new Date(Date.UTC(year, wrongDay - 1, wrongMonth + 1));
                if (!isNaN(reconstructed.getTime()) && reconstructed.getUTCMonth() === wrongDay - 1) {
                  d = reconstructed;
                  console.warn(`[Import] Date corrected using month column: parsed month=${wrongMonth + 1}, expected="${importedMonth}", swapped to ${reconstructed.toISOString()}`);
                }
              }
              // If swap didn't work, try to build from the original string + expected month
              if (d.getUTCMonth() !== expectedMonthNum) {
                const rawStr = String(out.date);
                const parts = rawStr.match(/(\d{1,2})[\-\/\.](\d{1,2})[\-\/\.](\d{2,4})/);
                if (parts) {
                  // Try DD-MM-YYYY where MM = expectedMonthNum+1
                  const dayCandidate = parseInt(parts[1], 10);
                  const yr = parts[3].length === 2 ? 2000 + parseInt(parts[3], 10) : parseInt(parts[3], 10);
                  const rebuilt = new Date(Date.UTC(yr, expectedMonthNum, dayCandidate));
                  if (!isNaN(rebuilt.getTime()) && rebuilt.getUTCMonth() === expectedMonthNum && rebuilt.getUTCDate() === dayCandidate) {
                    d = rebuilt;
                    console.warn(`[Import] Date rebuilt from raw string + month column: "${rawStr}" → ${rebuilt.toISOString()}`);
                  }
                }
              }
            }
          }

          out.date = d ? d.toISOString() : null;
        }

        // Set monthName: if date exists the backend pre-validate hook derives it,
        // but if date is missing and a Month column was provided, pass it through
        // so the backend can use it directly.
        if (importedMonth && (!out.date || out.date === null)) {
          out.monthName = importedMonth;
        }

        if (out.followUpDate !== undefined && out.followUpDate !== null && out.followUpDate !== '') {
          const d = parseSalesDate(out.followUpDate);
          out.followUpDate = d ? d.toISOString() : null;
        }
        
        // =========================================
        // NORMALIZE BIDLINK — smart detection: URL→link, invite→invite, direct/empty→direct
        // Also uses hyperlink metadata extracted from Excel cells (if available)
        // =========================================
        const bidLinkHyperlink = out._bidLinkHyperlink || null;
        delete out._bidLinkHyperlink;

        if (out.bidLink !== undefined) {
          const raw = String(out.bidLink || '').trim();
          if (!raw && !bidLinkHyperlink) {
            out.bidLink = { type: 'direct', url: null };
          } else {
            const lower = raw.toLowerCase();
            const urlMatch = raw.match(/https?:\/\/[^\s]+/i);
            if (lower === 'direct') {
              out.bidLink = { type: 'direct', url: null };
            } else if (lower === 'invite' || lower.startsWith('invite')) {
              // Prefer hidden hyperlink over text-embedded URL
              out.bidLink = { type: 'invite', url: bidLinkHyperlink || (urlMatch ? urlMatch[0] : null) };
            } else if (/^https?:\/\//i.test(raw)) {
              out.bidLink = { type: 'link', url: raw };
            } else if (/^[\w.-]+\.\w{2,}/.test(raw)) {
              // Domain-like string
              out.bidLink = { type: 'link', url: 'https://' + raw };
            } else if (urlMatch) {
              // Text with embedded URL
              out.bidLink = { type: 'link', url: urlMatch[0] };
            } else if (bidLinkHyperlink) {
              // Cell text is not a URL/invite/direct but has a hidden hyperlink
              out.bidLink = { type: 'link', url: bidLinkHyperlink };
            } else {
              out.bidLink = { type: 'link', url: raw };
            }
          }

          // Debug log for bidLink processing (remove after verification)
          if (bidLinkHyperlink) {
            console.log('[Import BidLink] ✅ Hyperlink found:', { text: raw, hyperlink: bidLinkHyperlink, result: out.bidLink });
          } else if (raw && (raw.toLowerCase().includes('invite'))) {
            console.warn('[Import BidLink] ⚠️ Invite without hyperlink:', { text: raw, hyperlink: null, result: out.bidLink });
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
        // Note: clientBudget and clientSpending are text fields, not numeric — keep original values
        ['clientRating', 'clientHireRate', 'connects', 'rate'].forEach(k => {
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

        // Auto-fill missing Name with logged-in user's name (before validation)
        if (!out.name && user?.name) {
          out.name = user.name;
        }
        
        return { row: out, originalIndex };
      };

      const normalizedWithIndex = nonEmptyMapped.map(normalizeRow);
      
      // Strict pre-import validation using validateImportRows
      const normalizedRows = normalizedWithIndex.map(({ row }) => row);
      const originalIndices = normalizedWithIndex.map(({ originalIndex }) => originalIndex);
      const { valid: validatedValid, invalid: validatedInvalid } = validateImportRows(normalizedRows);
      
      // Re-map invalid rows with their original spreadsheet indices
      const invalidRows = validatedInvalid.map(item => ({
        ...item,
        index: originalIndices[item.index] ?? item.index,
      }));
      const validRows = validatedValid;

      // If all rows are invalid after validation
      if (validRows.length === 0 && invalidRows.length > 0) {
        setError(`All ${invalidRows.length} rows have validation errors. No data was imported.`);
        setFailedResults({ failed: invalidRows, success: [] });
        toast.error(`All ${invalidRows.length} rows failed validation. Check required fields: Date, Name, Platform, Technology, Status.`);
        setImporting(false);
        setStep(3);
        return;
      }

      // Show summary toast when some rows are invalid
      if (invalidRows.length > 0) {
        toast.warning(`${invalidRows.length} row(s) skipped due to validation errors. Importing ${validRows.length} valid rows.`);
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
      setImportStats({ success: 0, failed: 0, newColumns: 0, newOptions: 0 });
      
      // Split into batches
      const batches = [];
      for (let i = 0; i < totalRows; i += BATCH_SIZE) {
        batches.push(validRows.slice(i, i + BATCH_SIZE));
      }
      
      let totalSuccess = 0;
      let totalBackendFailed = 0;
      let totalNewColumns = 0;
      let totalNewOptions = 0;
      const allFailed = [...invalidRows];
      const allSuccessful = [];
      const allNewColumns = [];
      
      // Process batches sequentially with progress updates
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const batchStartIndex = batchIndex * BATCH_SIZE;
        
        setProgressMessage(`Processing batch ${batchIndex + 1} of ${batches.length}...`);
        
        try {
          // For the first batch, include new columns to create
          const importPayload = batchIndex === 0 && enabledNewCols.length > 0
            ? { data: batch, newColumns: enabledNewCols.map(c => ({ name: c.name, type: c.type })) }
            : batch;
          
          const result = batchIndex === 0 && enabledNewCols.length > 0
            ? await salesApi.importRows(importPayload.data, importPayload.newColumns)
            : await importRows(batch);
          
          if (result && result.results) {
            const batchSuccess = result.results.success?.length || 0;
            totalSuccess += batchSuccess;
            
            if (result.results.success) {
              allSuccessful.push(...result.results.success);
            }

            // Track new columns and options created
            if (result.results.newColumnsCreated) {
              totalNewColumns += result.results.newColumnsCreated.length;
              allNewColumns.push(...result.results.newColumnsCreated);
            }
            if (result.results.newDropdownOptionsCreated) {
              totalNewOptions += result.results.newDropdownOptionsCreated.length;
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
        setImportStats({ success: totalSuccess, failed: allFailed.length, newColumns: totalNewColumns, newOptions: totalNewOptions });
        setProgressMessage(`Processed ${processedSoFar.toLocaleString()} of ${totalRows.toLocaleString()} rows...`);
        
        // Small delay to ensure UI updates render
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      // Refresh the data after import completes
      await fetchRows();
      
      // Also refresh custom columns and dropdown options if new ones were created
      if (totalNewColumns > 0) {
        await fetchCustomColumns();
      }
      if (totalNewOptions > 0) {
        // Refresh dropdown options for affected columns
        const dropdownStandard = ['platform', 'technology', 'status', 'clientLocation', 'clientBudget', 'profile', 'replyFromClient', 'followUps'];
        for (const col of dropdownStandard) {
          await fetchDropdownOptions(col).catch(() => {});
        }
      }
      
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
    setImportStats({ success: 0, failed: 0, newColumns: 0, newOptions: 0 });
    setNewColumnsToCreate([]);
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

              {/* New Columns Detected */}
              {newColumnsToCreate.length > 0 && (
                <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    <h4 className="font-semibold text-amber-700 dark:text-amber-400 text-sm">
                      New Columns Detected ({newColumnsToCreate.length})
                    </h4>
                  </div>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
                    These file columns don't match any existing fields and will be created as new custom columns.
                  </p>
                  <div className="space-y-2">
                    {newColumnsToCreate.map((nc, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-2 bg-white dark:bg-gray-800 rounded border border-amber-100 dark:border-amber-900">
                        <button
                          type="button"
                          onClick={() => {
                            setNewColumnsToCreate(prev => prev.map((c, i) => i === idx ? { ...c, enabled: !c.enabled } : c));
                          }}
                          className={`shrink-0 w-6 h-6 rounded flex items-center justify-center border transition-colors ${
                            nc.enabled
                              ? 'bg-amber-500 border-amber-500 text-white'
                              : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600'
                          }`}
                        >
                          {nc.enabled && <Check className="w-4 h-4" />}
                        </button>
                        <span className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{nc.name}</span>
                        <select
                          className="input text-xs py-1 px-2 w-28"
                          value={nc.type}
                          disabled={!nc.enabled}
                          onChange={e => {
                            setNewColumnsToCreate(prev => prev.map((c, i) => i === idx ? { ...c, type: e.target.value } : c));
                          }}
                        >
                          <option value="text">Text</option>
                          <option value="number">Number</option>
                          <option value="date">Date</option>
                          <option value="dropdown">Dropdown</option>
                          <option value="link">Link</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 mt-4">
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
                        const failedData = failedResults.failed;
                        const allKeys = [...new Set(failedData.flatMap(f => Object.keys(f.data || {})))];
                        const csvHeader = ['Row #', 'Error', ...allKeys].map(h => `"${String(h).replace(/"/g, '""')}"`).join(',');
                        const csvRows = failedData.map(f => {
                          const row = [f.index + 1, f.error, ...allKeys.map(k => f.data?.[k] ?? '')];
                          return row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
                        });
                        const csv = [csvHeader, ...csvRows].join('\n');
                        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'failed_import_rows.csv';
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="text-xs px-2 py-1 bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-700 transition-colors"
                    >
                      Download Failed Rows (CSV)
                    </button>
                  </div>
                  <div className="text-xs text-red-600 dark:text-red-400 mb-2">
                    Showing first 10 failed rows. Download CSV for complete list.
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

              {/* New columns & options created */}
              {(importStats.newColumns > 0 || importStats.newOptions > 0) && (
                <div className="grid grid-cols-2 gap-4 mb-6">
                  {importStats.newColumns > 0 && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 text-center border border-amber-200 dark:border-amber-800">
                      <div className="flex items-center justify-center gap-1">
                        <Plus className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                        <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                          {importStats.newColumns}
                        </span>
                      </div>
                      <div className="text-sm text-amber-600 dark:text-amber-400 mt-1">New Columns Created</div>
                    </div>
                  )}
                  {importStats.newOptions > 0 && (
                    <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 text-center border border-purple-200 dark:border-purple-800">
                      <div className="flex items-center justify-center gap-1">
                        <Plus className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                        <span className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                          {importStats.newOptions}
                        </span>
                      </div>
                      <div className="text-sm text-purple-600 dark:text-purple-400 mt-1">New Dropdown Options</div>
                    </div>
                  )}
                </div>
              )}

              {/* Failed Rows Details */}
              {failedResults && failedResults.failed && failedResults.failed.length > 0 && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-red-700 dark:text-red-400">
                      Failed rows ({failedResults.failed.length.toLocaleString()})
                    </div>
                    <button 
                      onClick={() => {
                        const failedData = failedResults.failed;
                        const allKeys = [...new Set(failedData.flatMap(f => Object.keys(f.data || {})))];
                        const csvHeader = ['Row #', 'Error', ...allKeys].map(h => `"${String(h).replace(/"/g, '""')}"`).join(',');
                        const csvRows = failedData.map(f => {
                          const row = [f.index + 1, f.error, ...allKeys.map(k => f.data?.[k] ?? '')];
                          return row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
                        });
                        const csv = [csvHeader, ...csvRows].join('\n');
                        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'failed_import_rows.csv';
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="text-xs px-3 py-1.5 bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300 rounded-md hover:bg-red-200 dark:hover:bg-red-700 transition-colors font-medium"
                    >
                      Download Failed Rows (CSV)
                    </button>
                  </div>
                  <div className="text-xs text-red-600 dark:text-red-400 mb-3">
                    Showing first 5 failed rows. Download CSV for complete list.
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
