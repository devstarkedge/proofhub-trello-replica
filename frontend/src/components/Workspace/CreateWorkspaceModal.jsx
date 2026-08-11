import React, { useState, useContext, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Briefcase, Loader, ImagePlus, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import WorkspaceContext from '../../context/WorkspaceContext';
import { validateWorkspaceIconFile } from '../../utils/workspaceIcon';

const CreateWorkspaceModal = ({ isOpen, onClose, onCreated }) => {
  const { createWorkspace, uploadWorkspaceIcon } = useContext(WorkspaceContext);
  const [name, setName] = useState('');
  const [iconFile, setIconFile] = useState(null);
  const [iconPreview, setIconPreview] = useState(null);
  const [iconError, setIconError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const resetIcon = () => {
    setIconFile(null);
    if (iconPreview) URL.revokeObjectURL(iconPreview);
    setIconPreview(null);
    setIconError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    if (saving) return;
    setName('');
    setError('');
    resetIcon();
    onClose();
  };

  const handleIconChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validationError = validateWorkspaceIconFile(file);
    if (validationError) {
      setIconError(validationError);
      return;
    }
    setIconError('');
    setIconFile(file);
    if (iconPreview) URL.revokeObjectURL(iconPreview);
    setIconPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Workspace name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const created = await createWorkspace(trimmed);
      if (iconFile) {
        try {
          await uploadWorkspaceIcon(created._id, iconFile);
        } catch (iconErr) {
          // The workspace itself was created successfully — a failed icon
          // upload shouldn't block that. Surface it separately; the icon
          // can always be added later from Workspace Settings.
          toast.warning('Workspace created, but the icon failed to upload. You can add it from Workspace Settings.');
        }
      }
      toast.success(`Workspace "${created.name}" created`);
      setName('');
      resetIcon();
      onCreated?.(created);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create workspace');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
          style={{ backgroundColor: 'var(--color-card-bg)' }}
        >
          <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-emerald-600 to-teal-600">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                <Briefcase size={18} className="text-white" />
              </div>
              <h2 className="text-lg font-bold text-white">Create Workspace</h2>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              A workspace is an isolated space with its own departments, projects, and members. You'll be its admin.
            </p>

            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-16 h-16 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden flex-shrink-0 transition-colors hover:border-emerald-500"
                style={{ borderColor: 'var(--color-border-default)', backgroundColor: 'var(--color-bg-muted)' }}
                title="Upload workspace icon (optional)"
              >
                {iconPreview ? (
                  <img src={iconPreview} alt="Icon preview" className="w-full h-full object-contain" />
                ) : (
                  <ImagePlus size={22} style={{ color: 'var(--color-text-muted)' }} />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                onChange={handleIconChange}
                className="hidden"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>Workspace icon (optional)</p>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>PNG, JPG, WEBP or SVG, up to 2MB</p>
                {iconFile && (
                  <button type="button" onClick={resetIcon} className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1 mt-1">
                    <Trash2 size={11} /> Remove
                  </button>
                )}
                {iconError && <p className="text-xs text-red-500 mt-1">{iconError}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
                Workspace name
              </label>
              <input
                type="text"
                autoFocus
                value={name}
                onChange={(e) => { setName(e.target.value); setError(''); }}
                placeholder="e.g. Acme Corp"
                maxLength={100}
                className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none transition-colors focus:ring-2 focus:ring-emerald-500/30"
                style={{
                  backgroundColor: 'var(--color-bg-muted)',
                  borderColor: error ? '#ef4444' : 'var(--color-border-default)',
                  color: 'var(--color-text-primary)',
                }}
              />
              {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium rounded-xl border transition-colors disabled:opacity-50"
                style={{ borderColor: 'var(--color-border-default)', color: 'var(--color-text-secondary)' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60 transition-all"
              >
                {saving ? <Loader size={16} className="animate-spin" /> : <Briefcase size={16} />}
                {saving ? 'Creating...' : 'Create Workspace'}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};

export default CreateWorkspaceModal;
