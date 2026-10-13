import React, { useEffect, useContext, useCallback, useState } from 'react';
import SearchableSelect from '../ui/SearchableSelect';
import useSalesStore from '../../store/salesStore';
import { toast } from 'react-toastify';
import AuthContext from '../../context/AuthContext';
import DeletePopup from '../ui/DeletePopup';

/**
 * Sales-specific dropdown — thin wrapper around SearchableSelect.
 * Fetches options from the sales store, handles add/delete with permissions,
 * and forwards prioritizedValues for intelligent suggestions.
 */
const SalesDropdown = React.memo(({
  columnName,
  value,
  onChange,
  placeholder,
  disabled,
  error,
  clearable = false,
  autoOpenOnFocus = true,
  autoSelectOnTab = true,
  prioritizedValues = [],
}) => {
  const { fetchDropdownOptions, addDropdownOption, deleteDropdownOption, dropdownOptions } = useSalesStore();
  const { user } = useContext(AuthContext);
  const isAdmin = user?.role?.toLowerCase() === 'admin';
  const options = dropdownOptions[columnName] || [];

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (columnName) fetchDropdownOptions(columnName);
  }, [columnName, fetchDropdownOptions]);

  // ── Add option handler ─────────────────────────────────
  const handleAddOption = useCallback(async (val) => {
    if (options.some(opt => opt.value.toLowerCase() === val.toLowerCase())) {
      toast.error('Option already exists');
      throw new Error('duplicate');
    }
    const optionData = { label: val, value: val };
    await addDropdownOption(columnName, optionData);
    toast.success('Option added!');
  }, [options, addDropdownOption, columnName]);

  // ── Delete permission check ────────────────────────────
  const canDeleteOption = useCallback((opt) => {
    const createdById = typeof opt.createdBy === 'object' ? opt.createdBy?._id : opt.createdBy;
    return isAdmin || (createdById && user?._id && createdById.toString() === user._id.toString());
  }, [isAdmin, user]);

  // ── Delete handlers ────────────────────────────────────
  const handleDeleteRequest = useCallback((opt) => {
    setDeleteTarget(opt);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteDropdownOption(columnName, deleteTarget._id);
      setDeleteTarget(null);
    } catch (err) {
      const message = err?.response?.data?.message || 'Failed to delete option';
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, deleteDropdownOption, columnName]);

  return (
    <>
      <SearchableSelect
        value={value}
        onChange={onChange}
        options={options}
        placeholder={placeholder || 'Select...'}
        searchable
        clearable={clearable}
        autoOpenOnFocus={autoOpenOnFocus}
        autoSelectOnTab={autoSelectOnTab}
        disabled={disabled}
        error={error}
        prioritizedValues={prioritizedValues}
        onAddOption={handleAddOption}
        onDeleteOption={handleDeleteRequest}
        canDeleteOption={canDeleteOption}
        maxHeight="max-h-[300px]"
      />
      <DeletePopup
        isOpen={Boolean(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title="Delete option?"
        description="Are you sure you want to delete this option?"
        confirmLabel="Delete Option"
        isLoading={isDeleting}
      />
    </>
  );
});

SalesDropdown.displayName = 'SalesDropdown';

export default SalesDropdown;
