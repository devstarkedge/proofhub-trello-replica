import { useContext, useEffect, useId, useMemo, useState } from 'react';
import { Building2, ChevronDown, ChevronRight, FolderOpen, Loader2, Lock } from 'lucide-react';
import api from '../../services/api';
import WorkspaceContext from '../../context/WorkspaceContext';
import PermissionCheckbox from './PermissionCheckbox';

const SCOPES = [
  { key: 'full_department', label: 'Department projects', description: 'All projects in the assigned departments.' },
  { key: 'selected_projects', label: 'Selected projects', description: 'Only the projects selected below.' },
  { key: 'assigned_tasks', label: 'Assigned work', description: 'Projects containing work assigned to this member.' }
];
const theme = { backgroundColor: 'var(--color-bg-base)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' };

export default function AccessScopePicker({ role, departmentIds = [], accessType, onAccessTypeChange, allowedProjects = [], onAllowedProjectsChange, disabled = false }) {
  const { currentWorkspace } = useContext(WorkspaceContext);
  const scopeId = useId();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});
  const deptKey = [...departmentIds].sort().join(',');
  const isLocked = disabled || role === 'admin';

  useEffect(() => {
    let active = true;
    setProjects([]);
    setError('');
    setLoading(false);
    if (!deptKey || accessType !== 'selected_projects') return;
    setLoading(true);
    api.get('/api/boards', { params: { departmentIds: deptKey }, skipOfflineQueue: true }).then((response) => {
      if (!Array.isArray(response.data?.data)) throw new Error('Projects could not be loaded.');
      if (active) setProjects(response.data.data);
    }).catch(() => {
      if (active) setError('Projects could not be loaded. Existing selections have been kept.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [deptKey, accessType, currentWorkspace?._id, retry]);

  const groups = useMemo(() => {
    const result = new Map();
    projects.forEach((project) => {
      const id = String(project.department?._id || project.department || 'unknown');
      if (!result.has(id)) result.set(id, { id, name: project.department?.name || 'Department projects', projects: [] });
      result.get(id).projects.push(project);
    });
    return [...result.values()];
  }, [projects]);
  const toggleProject = (id, checked) => {
    if (isLocked || loading || error) return;
    onAllowedProjectsChange(checked ? [...allowedProjects, id] : allowedProjects.filter((value) => value !== id));
  };
  const matches = projects.filter((project) => project.name?.toLowerCase().includes(search.toLowerCase()));
  const unavailable = !loading && !error && allowedProjects.filter((id) => !projects.some((project) => String(project._id) === id)).length;

  return <fieldset>
    <legend className="flex gap-2 items-center mb-2 text-sm font-semibold"><Lock className="w-4 h-4" />Project access</legend>
    <p className="text-xs mb-3" style={{ color: 'var(--color-text-secondary)' }}>Choose one scope. Module permissions are managed separately below.</p>
    {role === 'admin' && <p className="text-xs mb-3" style={{ color: 'var(--color-text-secondary)' }}>Administrator project access cannot be restricted here.</p>}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {SCOPES.map((scope) => <label key={scope.key} className={`flex gap-3 items-start rounded-lg border p-3 focus-within:ring-2 focus-within:ring-purple-500 ${isLocked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
        style={{ ...theme, borderColor: accessType === scope.key ? '#7c3aed' : theme.borderColor }}>
        <input type="radio" name={scopeId} value={scope.key} checked={accessType === scope.key} disabled={isLocked}
          onChange={() => { if (!isLocked) { onAccessTypeChange(scope.key); if (scope.key !== 'selected_projects') onAllowedProjectsChange([]); } }}
          className="mt-0.5 h-4 w-4 shrink-0" style={{ accentColor: '#7c3aed' }} />
        <span><span className="block text-sm font-medium">{scope.label}</span><span className="block text-xs mt-1 leading-4" style={{ color: 'var(--color-text-secondary)' }}>{scope.description}</span></span>
      </label>)}
    </div>
    {accessType === 'selected_projects' && <div className="mt-4 space-y-3">
      <div className="flex gap-2 items-center text-sm font-semibold"><FolderOpen className="w-4 h-4" />Projects <span className="text-xs font-normal">({allowedProjects.length} selected)</span></div>
      {!deptKey ? <p className="text-xs">Select a department to see its projects.</p> : loading ? <p role="status" className="text-xs flex gap-2 items-center"><Loader2 className="h-4 w-4 animate-spin" />Loading projects…</p> : error ?
        <div role="alert" className="text-xs"><p>{error}</p><button type="button" className="mt-2 text-purple-600 underline" onClick={() => setRetry((value) => value + 1)}>Retry projects</button></div> : <>
          <input type="search" aria-label="Search projects" placeholder="Search projects…" value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={theme} />
          <div className="max-h-64 overflow-y-auto rounded-lg border p-1" style={{ borderColor: theme.borderColor }}>
            {matches.length === 0 && <p className="p-3 text-xs">No matching projects.</p>}
            {groups.map((group) => {
              const filtered = group.projects.filter((project) => project.name?.toLowerCase().includes(search.toLowerCase()));
              if (!filtered.length) return null;
              const open = expanded[group.id] !== false;
              return <div key={group.id}>
                <button type="button" aria-expanded={open} className="flex w-full items-center gap-2 p-3 text-left text-xs font-semibold" onClick={() => setExpanded((previous) => ({ ...previous, [group.id]: !open }))}>
                  {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}<Building2 className="w-4 h-4" />{group.name}
                </button>
                {open && <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2">{filtered.map((project) => <PermissionCheckbox key={project._id} label={project.name} checked={allowedProjects.includes(String(project._id))} disabled={isLocked} onChange={(checked) => toggleProject(String(project._id), checked)} />)}</div>}
              </div>;
            })}
          </div>
          {unavailable > 0 && <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{unavailable} existing selection(s) outside this list are preserved. To clear all selections, choose another scope.</p>}
          {!allowedProjects.length && <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>No projects selected. This member will have no access through selected-project scope.</p>}
        </>}
    </div>}
  </fieldset>;
}
