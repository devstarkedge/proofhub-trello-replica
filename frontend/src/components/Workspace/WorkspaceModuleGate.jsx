import { Link } from 'react-router-dom';
import useWorkspaceModules from '../../hooks/useWorkspaceModules';

export default function WorkspaceModuleGate({ module, children }) {
  const { data, isPending, isError } = useWorkspaceModules();
  if (isPending) return <p role="status" className="p-8">Checking workspace modules…</p>;
  if (isError) return <p role="alert" className="p-8">Workspace module availability could not be loaded. Refresh to try again.</p>;
  if (!data?.[module]) return <div className="p-8 space-y-3"><h1 className="text-xl font-semibold">{module[0].toUpperCase() + module.slice(1)} is disabled</h1>
    <p>A workspace Owner or Admin can enable this module in Workspace Settings → Configs.</p><Link className="text-emerald-600 underline" to="/workspace-settings">Workspace Settings</Link></div>;
  return children;
}
