import React, { memo } from 'react';

/**
 * EditableField - Enterprise SaaS permission-gated field wrapper
 * 
 * Renders the editable children when canEdit is true,
 * otherwise renders a clean read-only display.
 * 
 * Key principle: NO disabled inputs. Either show the full editor
 * or render a completely separate read-only component.
 * 
 * @param {boolean} canEdit - Whether the user has edit permission
 * @param {React.ReactNode} children - Editable content (dropdown, datepicker, etc.)
 * @param {React.ReactNode} readOnly - Read-only content (static text, label, etc.)
 */
const EditableField = memo(({ canEdit, children, readOnly }) => {
  if (!canEdit) {
    return readOnly || null;
  }
  return children;
});

EditableField.displayName = 'EditableField';

export default EditableField;
