import { useCallback } from 'react';
import useConfirmModalStore from '../store/confirmModalStore';

/**
 * The one way any component asks the user to confirm a permission change.
 *
 * Usage:
 *   const confirmChange = useConfirmPermissionChange();
 *   const ok = await confirmChange({
 *     targetUserName: 'Mohit Gahlyan',
 *     targetUserRole: 'employee',
 *     actionVerb: 'grant',            // 'grant' | 'revoke' | 'update' | 'enable' | 'disable'
 *     changes: [{ label: 'Finance Page Access', previous: false, next: true }]
 *   });
 *   if (!ok) return;
 *   // ...perform the change
 *
 * Every permission-editing surface in the app (Sales/Finance/Access Control
 * toggles, role assignment, access-scope changes, role-permission edits)
 * calls this same hook instead of building its own dialog.
 */
const useConfirmPermissionChange = () => {
  const request = useConfirmModalStore((state) => state.request);
  return useCallback((details) => request(details), [request]);
};

export default useConfirmPermissionChange;
