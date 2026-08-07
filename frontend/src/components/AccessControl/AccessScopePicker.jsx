import React, { useEffect, useMemo, useState } from 'react';
import { Building2, ChevronDown, ChevronRight, FolderOpen, ListChecks, Loader2, Lock, Search, Shield, X } from 'lucide-react';
import api from '../../services/api';

/**
 * Full Dept / Selected / My Tasks access-scope picker, with the project
 * multi-select for "Selected". This used to be ~250 lines hand-rolled
 * directly inside HRPanel's "Assign Role & Access" modal — the only place
 * in the app that implemented this pattern. It's now a self-contained,
 * reusable component: give it a role + department list, and it fetches its
 * own project options and manages its own search/accordion state. Used by
 * both HRPanel (via UserAccessEditor) and the centralized Access &
 * Permissions module's Users tab — one implementation, not two.
 */
const AccessScopePicker = ({
  role,
  departmentIds = [],
  accessType,
  onAccessTypeChange,
  allowedProjects = [],
  onAllowedProjectsChange,
  disabled = false
}) => {
  const [departmentProjects, setDepartmentProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [expandedDepts, setExpandedDepts] = useState({});

  const isEmployee = role === 'employee';
  const isLocked = isEmployee || disabled;
  const deptKey = useMemo(() => [...departmentIds].sort().join(','), [departmentIds]);

  useEffect(() => {
    if (!departmentIds || departmentIds.length === 0) {
      setDepartmentProjects([]);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        setProjectsLoading(true);
        const res = await api.get(`/api/boards?departmentIds=${departmentIds.join(',')}`);
        if (mounted) setDepartmentProjects(res.data.data || []);
      } catch (err) {
        console.error('Failed to load projects for departments:', err);
        if (mounted) setDepartmentProjects([]);
      } finally {
        if (mounted) setProjectsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptKey]);

  // Employees are always assignment-scoped — enforce it the moment the role
  // picker above this component reports 'employee' (mirrors the backend's
  // own enforcement in userController.assignUser/changeUserRole).
  useEffect(() => {
    if (isEmployee && accessType !== 'assigned_tasks') {
      onAccessTypeChange('assigned_tasks');
      if (allowedProjects.length > 0) onAllowedProjectsChange([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmployee]);

  const groupedProjects = useMemo(() => {
    const map = {};
    for (const project of departmentProjects) {
      const deptId = project.department?._id || project.department || 'unknown';
      const deptName = project.department?.name || 'Unknown Department';
      if (!map[deptId]) map[deptId] = { deptId, deptName, projects: [] };
      map[deptId].projects.push(project);
    }
    return Object.values(map);
  }, [departmentProjects]);

  const toggleProject = (projectId) => {
    onAllowedProjectsChange(
      allowedProjects.includes(projectId)
        ? allowedProjects.filter((id) => id !== projectId)
        : [...allowedProjects, projectId]
    );
  };

  return (
    <div>
      <label className="block text-sm font-semibold mb-3 flex items-center gap-1.5" style={{ color: 'var(--color-text-primary)' }}>
        <Lock className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
        Access Scope
      </label>

      {isEmployee && (
        <div className="flex items-start gap-2 p-3 mb-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
          <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>Employees automatically use <strong>assignment-based scope</strong> — they only see projects where they're assigned to tasks, subtasks, or nano-subtasks.</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          disabled={isLocked}
          onClick={() => !isLocked && onAccessTypeChange('full_department')}
          className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 text-center transition-all duration-200 ${
            isLocked
              ? 'border-gray-100 bg-gray-50 opacity-40 cursor-not-allowed'
              : accessType === 'full_department'
                ? 'border-blue-500 bg-blue-50 shadow-sm'
                : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/40'
          }`}
        >
          <div className={`p-2 rounded-lg ${accessType === 'full_department' && !isLocked ? 'bg-blue-100' : 'bg-gray-100'}`}>
            <Building2 className={`w-5 h-5 ${accessType === 'full_department' && !isLocked ? 'text-blue-600' : 'text-gray-500'}`} />
          </div>
          <div>
            <p className={`text-xs font-semibold leading-tight ${accessType === 'full_department' && !isLocked ? 'text-blue-700' : 'text-gray-700'}`}>Full Dept</p>
            <p className="text-[10px] text-gray-400 leading-tight mt-0.5">All projects</p>
          </div>
        </button>

        <button
          type="button"
          disabled={isLocked}
          onClick={() => !isLocked && onAccessTypeChange('selected_projects')}
          className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 text-center transition-all duration-200 ${
            isLocked
              ? 'border-gray-100 bg-gray-50 opacity-40 cursor-not-allowed'
              : accessType === 'selected_projects'
                ? 'border-purple-500 bg-purple-50 shadow-sm'
                : 'border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-50/40'
          }`}
        >
          <div className={`p-2 rounded-lg ${accessType === 'selected_projects' && !isLocked ? 'bg-purple-100' : 'bg-gray-100'}`}>
            <FolderOpen className={`w-5 h-5 ${accessType === 'selected_projects' && !isLocked ? 'text-purple-600' : 'text-gray-500'}`} />
          </div>
          <div>
            <p className={`text-xs font-semibold leading-tight ${accessType === 'selected_projects' && !isLocked ? 'text-purple-700' : 'text-gray-700'}`}>Selected</p>
            <p className="text-[10px] text-gray-400 leading-tight mt-0.5">Pick projects</p>
          </div>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && onAccessTypeChange('assigned_tasks')}
          className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 text-center transition-all duration-200 ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${
            accessType === 'assigned_tasks'
              ? 'border-green-500 bg-green-50 shadow-sm'
              : 'border-gray-200 bg-white hover:border-green-300 hover:bg-green-50/40'
          }`}
        >
          <div className={`p-2 rounded-lg ${accessType === 'assigned_tasks' ? 'bg-green-100' : 'bg-gray-100'}`}>
            <ListChecks className={`w-5 h-5 ${accessType === 'assigned_tasks' ? 'text-green-600' : 'text-gray-500'}`} />
          </div>
          <div>
            <p className={`text-xs font-semibold leading-tight ${accessType === 'assigned_tasks' ? 'text-green-700' : 'text-gray-700'}`}>My Tasks</p>
            <p className="text-[10px] text-gray-400 leading-tight mt-0.5">Assigned only</p>
          </div>
        </button>
      </div>

      <p className="text-xs text-gray-500 mt-2 px-1">
        {accessType === 'full_department' && 'User can access all projects within their assigned department(s).'}
        {accessType === 'selected_projects' && 'User can only access the specific projects you select below.'}
        {accessType === 'assigned_tasks' && 'User only sees projects where they are directly assigned to tasks, subtasks, or nano-subtasks.'}
      </p>

      {accessType === 'selected_projects' && (
        <div className="mt-3">
          <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
            <FolderOpen className="w-4 h-4 text-purple-500" />
            Select Projects
            {allowedProjects.length > 0 && (
              <span className="ml-1 px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full font-medium">
                {allowedProjects.length} selected
              </span>
            )}
          </label>

          {departmentIds.length === 0 ? (
            <div className="flex items-center gap-2 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
              <Building2 className="w-4 h-4 flex-shrink-0" />
              Select a department first to see its projects.
            </div>
          ) : projectsLoading ? (
            <div className="flex items-center justify-center p-6 bg-gray-50 rounded-lg border border-gray-200">
              <Loader2 className="w-5 h-5 text-purple-500 animate-spin mr-2" />
              <span className="text-sm text-gray-500">Loading projects...</span>
            </div>
          ) : (
            <>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search projects..."
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100">
                {groupedProjects.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-500">No projects found.</div>
                ) : (
                  groupedProjects.map(({ deptId, deptName, projects }) => {
                    const filtered = projects.filter((p) => p.name?.toLowerCase().includes(projectSearch.toLowerCase()));
                    if (projectSearch && filtered.length === 0) return null;

                    const isExpanded = expandedDepts[deptId] !== false;
                    const selectedInDept = filtered.filter((p) => allowedProjects.includes(p._id)).length;

                    return (
                      <div key={deptId}>
                        <button
                          type="button"
                          onClick={() => setExpandedDepts((prev) => ({ ...prev, [deptId]: !isExpanded }))}
                          className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors duration-150"
                        >
                          <div className="flex items-center gap-2">
                            {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                            <Building2 className="w-4 h-4 text-blue-500" />
                            <span className="text-sm font-semibold text-gray-700">{deptName}</span>
                            <span className="text-xs text-gray-400 bg-white border border-gray-200 px-1.5 py-0.5 rounded-full">{filtered.length}</span>
                          </div>
                          {selectedInDept > 0 && (
                            <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full font-medium">{selectedInDept} selected</span>
                          )}
                        </button>

                        {isExpanded && (
                          <div className="divide-y divide-gray-50">
                            {filtered.map((project) => {
                              const isSelected = allowedProjects.includes(project._id);
                              return (
                                <label
                                  key={project._id}
                                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors duration-150 ${isSelected ? 'bg-purple-50' : 'hover:bg-gray-50'}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    disabled={disabled}
                                    onChange={() => !disabled && toggleProject(project._id)}
                                    className="w-4 h-4 rounded text-purple-600 border-gray-300 focus:ring-purple-400 disabled:cursor-not-allowed"
                                  />
                                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                                    <span className="text-white text-xs font-bold">{project.name?.charAt(0).toUpperCase()}</span>
                                  </div>
                                  <span className={`text-sm font-medium truncate ${isSelected ? 'text-purple-700' : 'text-gray-700'}`}>{project.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {allowedProjects.length > 0 && (
                <div className="mt-3 p-3 bg-purple-50 border border-purple-100 rounded-lg">
                  <p className="text-xs font-semibold text-purple-700 mb-2">
                    {allowedProjects.length} project{allowedProjects.length !== 1 ? 's' : ''} selected:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {departmentProjects
                      .filter((p) => allowedProjects.includes(p._id))
                      .map((project) => (
                        <span key={project._id} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                          {project.name}
                          <button type="button" onClick={() => toggleProject(project._id)} className="hover:text-purple-900">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default AccessScopePicker;
