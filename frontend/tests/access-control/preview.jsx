// Isolated browser fixture. Every API is mocked; no production providers are mounted.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import '../../src/index.css';
import AuthContext from '../../src/context/AuthContext';
import WorkspaceContext from '../../src/context/WorkspaceContext';
import api from '../../src/services/api';
import useAccessControlStore from '../../src/store/accessControlStore';
import useRoleStore from '../../src/store/roleStore';
import useDepartmentStore from '../../src/store/departmentStore';
import UserAccessDialog from '../../src/components/AccessControl/UserAccessDialog';
import PermissionConfirmModal from '../../src/components/AccessControl/PermissionConfirmModal';
import ResourceAccessPanel from '../../src/components/AccessControl/ResourceAccessPanel';
import CreateRoleModal from '../../src/components/TeamManagement/modals/CreateRoleModal';
import EditRoleModal from '../../src/components/TeamManagement/modals/EditRoleModal';
import { RESOURCES } from '../../../backend/config/permissionRegistry.js';

const departments = [{ _id: 'department-1', name: 'Engineering' }, { _id: 'department-2', name: 'Operations' }];
const projects = [{ _id: 'project-1', name: 'Customer portal', department: departments[0] }, { _id: 'project-2', name: 'Internal reporting', department: departments[0] }];
const roles = ['admin', 'manager', 'employee', 'hr'].map((slug) => ({ _id: slug, slug, name: slug[0].toUpperCase() + slug.slice(1), isSystem: true, isActive: true }));
const allOff = () => Object.fromEntries(Object.entries(RESOURCES).map(([key, definition]) => [key, Object.fromEntries(definition.actions.map((action) => [action.key, false]))]));
const fixture = window.__accessControlTest = {
  calls: [], failEffective: false, failProfile: false, failOverride: false, normalizeNext: false,
  holdMy: false, permissionResolvers: [], profileRefreshes: 0,
  user: { _id: 'member-1', name: 'Anish Singh', email: 'anish@example.test', role: 'manager', department: [departments[0]], team: { _id: 'team-1', name: 'Platform' }, accessType: 'selected_projects', allowedProjects: [projects[0]] },
  resources: { ...allOff(), sales: { ...allOff().sales, view: true, create: true, export: true } },
  resourceDetails: {}
};
const envelope = (data) => ({ data: { success: true, data: structuredClone(data) } });
const ownSnapshot = (role = 'admin') => ({ role, isAdmin: role === 'admin', canManageAccessControl: role === 'admin', resources: allOff(), roleChecklist: {}, accessScope: { type: 'full_department', allowedProjects: [] } });
const fail = (message) => Promise.reject(new Error(message));
api.get = async (url) => {
  fixture.calls.push({ method: 'GET', url });
  if (url === '/api/roles') return envelope(roles);
  if (url === '/api/boards') return envelope(projects);
  if (url === '/api/users') return envelope([fixture.user, { _id: 'other-member', name: 'Priya Kumar', email: 'priya@example.test', role: 'employee' }]);
  if (url === '/api/users/member-1') return envelope(fixture.user);
  if (url === '/api/access-control/registry') return envelope({ resources: RESOURCES });
  if (url === '/api/access-control/my-permissions') {
    if (fixture.holdMy) return new Promise((resolve, reject) => fixture.permissionResolvers.push({ resolve: (data) => resolve(envelope(data)), reject }));
    return envelope(ownSnapshot());
  }
  if (url.endsWith('/effective')) {
    if (fixture.failEffective || (fixture.failOtherMember && url.includes('other-member'))) return fail('Simulated permission read failure');
    return envelope({ role: fixture.user.role, resources: fixture.resources, resourceDetails: fixture.resourceDetails });
  }
  throw new Error(`Unexpected test API read: ${url}`);
};
api.put = async (url, body) => {
  fixture.calls.push({ method: 'PUT', url, body: structuredClone(body) });
  if (url.endsWith('/role')) { fixture.user.role = body.role; return envelope(fixture.user); }
  if (url.endsWith('/assign')) {
    if (fixture.failProfile) return fail('Simulated profile save failure');
    fixture.user = { ...fixture.user, department: departments.filter((department) => body.departments.includes(department._id)), accessType: body.accessType, allowedProjects: body.allowedProjects.map((id) => projects.find((project) => project._id === id) || id) };
    return envelope(fixture.user);
  }
  if (url.includes('/overrides/')) {
    if (fixture.failOverride) return fail('Simulated permission save failure');
    const resource = url.split('/').at(-1);
    const actions = { ...body.actions };
    if (fixture.normalizeNext) { actions.export = false; fixture.normalizeNext = false; }
    fixture.resources[resource] = actions;
    return envelope({ effective: { actions } });
  }
  throw new Error(`Unexpected test API write: ${url}`);
};
useRoleStore.setState({ roles, myRole: 'admin', initialized: true });
useDepartmentStore.setState({ departments, loadDepartments: async () => { useDepartmentStore.setState({ departments, loading: false, error: null }); return departments; } });
useAccessControlStore.setState({ myPermissions: ownSnapshot(), registry: { resources: RESOURCES } });
fixture.store = useAccessControlStore;

export function Preview() {
  const [mode, setMode] = useState('closed');
  const [actor, setActor] = useState({ _id: 'actor-1', role: 'admin', name: 'Administrator' });
  const [workspace, setWorkspace] = useState({ _id: 'workspace-1', name: 'Demo workspace', type: 'organization', owner: 'owner-1' });
  fixture.close = () => setMode('closed');
  fixture.setActor = (role, id = 'actor-1') => { setActor({ _id: id, role }); useAccessControlStore.setState({ myPermissions: ownSnapshot(role) }); };
  fixture.switchWorkspace = () => { setWorkspace({ ...workspace, _id: 'workspace-2', name: 'Other workspace' }); fixture.user.name = 'New workspace member'; };
  const role = { _id: 'custom-role', name: 'Coordinator', slug: 'coordinator', isSystem: false, permissions: { canCreateTask: true } };
  return <AuthContext.Provider value={{ user: actor }}><WorkspaceContext.Provider value={{ currentWorkspace: workspace }}>
    <main className="min-h-screen p-8" style={{ backgroundColor: 'var(--color-bg-base)', color: 'var(--color-text-primary)' }}>
      <h1 className="text-xl font-semibold mb-4">Isolated access-control preview</h1>
      <div className="flex flex-wrap gap-3">
        <button onClick={() => setMode('user')}>Open member access</button>
        <button onClick={() => setMode('resource')}>Open module matrix</button>
        <button onClick={() => setMode('create')}>Create role</button>
        <button onClick={() => setMode('edit')}>Edit role</button>
      </div>
      {mode === 'user' && <UserAccessDialog user={fixture.user} currentUserId={actor._id} onClose={() => setMode('closed')} onUserUpdated={() => { fixture.profileRefreshes += 1; }} />}
      {mode === 'resource' && <div className="mt-6"><ResourceAccessPanel resource="sales" title="Sales access" /></div>}
      <CreateRoleModal isOpen={mode === 'create'} isLoading={false} onClose={() => setMode('closed')} onSubmit={(data) => { fixture.createdRole = data; setMode('closed'); }} />
      <EditRoleModal isOpen={mode === 'edit'} isLoading={false} role={mode === 'edit' ? role : null} onClose={() => setMode('closed')} onSubmit={(data) => { fixture.editedRole = data; setMode('closed'); }} />
    </main>
    <PermissionConfirmModal /><ToastContainer />
  </WorkspaceContext.Provider></AuthContext.Provider>;
}
createRoot(document.getElementById('root')).render(<Preview />);
