import { useContext } from 'react';
import { NavLink } from 'react-router-dom';
import WorkspaceContext from '../../context/WorkspaceContext';
import { canConfigureWorkspace } from '../../utils/workspaceConfigAccess';

export default function WorkspaceSettingsTabs() {
  const { currentWorkspace } = useContext(WorkspaceContext);
  const tabClass = ({ isActive }) => `px-4 py-3 text-sm font-semibold border-b-2 ${isActive ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-[var(--color-text-secondary)]'}`;
  return <nav aria-label="Workspace settings" className="flex gap-2 border-b mb-6" style={{ borderColor: 'var(--color-border-subtle)' }}>
    <NavLink to="/workspace-settings" end className={tabClass}>General</NavLink>
    {canConfigureWorkspace(currentWorkspace) && <NavLink to="/workspace-settings/configs" className={tabClass}>Configs</NavLink>}
  </nav>;
}
