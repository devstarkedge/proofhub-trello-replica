import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { toast } from 'react-toastify';
import { Upload, ArrowRight } from 'lucide-react';
import { EMAIL_REGEX } from '../../ProjectModals/shared/constants';

const MAX_EMAILS = 200;
const EMAIL_SEARCH_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

// Accepts either a clean address or something like `Jane Doe <jane@x.com>` —
// pulls the email out either way rather than rejecting anything that isn't
// a bare address, since pasted lists commonly come from an email client.
const extractEmail = (raw) => {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  if (EMAIL_REGEX.test(trimmed)) return trimmed.toLowerCase();
  const match = trimmed.match(EMAIL_SEARCH_REGEX);
  return match ? match[0].toLowerCase() : null;
};

/**
 * Step 1 of Bulk Invite: collect raw email candidates by paste and/or CSV/
 * Excel upload, and hand the still-unvalidated token list up to the parent
 * step. Validation/dedup happens in BulkInvitePreview, not here — this step
 * is purely about getting text in, matching the "Upload CSV / Enter
 * multiple emails" first stage of the spec's bulk-invite flow.
 */
const BulkInviteEmailInput = ({ onContinue, onCancel }) => {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');

  const onDrop = useCallback((acceptedFiles) => {
    if (!acceptedFiles.length) return;
    const file = acceptedFiles[0];
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

        const found = new Set();
        grid.forEach((row) => {
          (row || []).forEach((cell) => {
            const email = extractEmail(cell);
            if (email) found.add(email);
          });
        });

        if (found.size === 0) {
          toast.warning('No email addresses found in that file.');
          return;
        }

        setText((prev) => [prev.trim(), ...found].filter(Boolean).join('\n'));
        toast.success(`${found.size} email address${found.size === 1 ? '' : 'es'} found in ${file.name}`);
      } catch {
        toast.error('Could not read that file — try a CSV or Excel export.');
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    multiple: false,
  });

  const handleContinue = () => {
    const tokens = text.split(/[,;\n\r\t]+/).map((t) => t.trim()).filter(Boolean);
    if (tokens.length === 0) {
      toast.warning('Enter or upload at least one email address');
      return;
    }
    if (tokens.length > MAX_EMAILS) {
      toast.warning(`You can invite up to ${MAX_EMAILS} people in one batch — ${tokens.length} entered`);
      return;
    }

    const seen = new Set();
    const rows = tokens.map((token) => {
      const email = extractEmail(token);
      if (!email) return { raw: token, email: token, status: 'invalid' };
      if (seen.has(email)) return { raw: token, email, status: 'duplicate' };
      seen.add(email);
      return { raw: token, email, status: 'valid' };
    });

    onContinue(rows);
  };

  return (
    <div className="p-6 space-y-4">
      <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        Paste a list of email addresses, or upload a CSV/Excel file.
      </p>

      <div>
        <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--color-text-secondary)' }}>
          Email addresses
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder={'jane@company.com\njohn@company.com, sam@company.com'}
          className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-emerald-500/30 resize-none"
          style={{ backgroundColor: 'var(--color-bg-muted)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' }}
        />
        <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Separate with commas, semicolons, or new lines — up to {MAX_EMAILS} at once.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border-subtle)' }} />
        <span className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--color-text-muted)' }}>or</span>
        <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border-subtle)' }} />
      </div>

      <div
        {...getRootProps()}
        className="border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors"
        style={{ borderColor: isDragActive ? '#10b981' : 'var(--color-border-default)' }}
      >
        <input {...getInputProps()} />
        <Upload size={20} className="mx-auto mb-2" style={{ color: 'var(--color-text-muted)' }} />
        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          {fileName ? `Loaded: ${fileName}` : 'Drag & drop a CSV or Excel file, or click to browse'}
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 text-sm font-semibold rounded-xl border"
          style={{ borderColor: 'var(--color-border-default)', color: 'var(--color-text-secondary)' }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleContinue}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 transition-all"
        >
          Continue <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default BulkInviteEmailInput;
