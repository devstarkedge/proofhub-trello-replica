import { useContext } from 'react';
import AuthContext from '../context/AuthContext';
import WorkspaceContext from '../context/WorkspaceContext';
import usePermissions from './usePermissions';

// AuthContext carries the current workspace membership overlay. Never use a
// global identity role, or permission results from a different role, here.
export default function useProjectAccess(project) {
  const { user } = useContext(AuthContext);
  const workspace = useContext(WorkspaceContext);
  const { role, canCreateProject } = usePermissions();
  const isEmployee = !user?.role || user.role === 'employee';
  const ownerId = project?.owner?._id || project?.owner;
  return {
    isEmployee,
    canCreate: !isEmployee && role === user.role && canCreateProject,
    canEdit: !isEmployee && (project?.canEdit ?? (['admin', 'manager'].includes(user.role) || Boolean(ownerId && String(ownerId) === String(user._id || user.id)))),
    scopeKey: `${workspace?.currentWorkspace?._id || user?.workspaceId || ''}:${user?._id || user?.id || ''}:${user?.role || ''}`
  };
}
