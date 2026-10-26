import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastContainer } from 'react-toastify';
import WorkspaceContext from '../../../frontend/src/context/WorkspaceContext';
import WorkspaceConfigsPage from '../../../frontend/src/pages/WorkspaceConfigsPage';
import WorkspaceSettingsTabs from '../../../frontend/src/components/Workspace/WorkspaceSettingsTabs';
import '../../../frontend/src/index.css';

const session = await (await fetch('/test/hubspot/session')).json();
localStorage.setItem('token', session.token); localStorage.setItem('workspaceId', session.workspace._id);
const queryClient = new QueryClient();
function Fixture() {
  const navigate = useNavigate();
  const [workspace, setWorkspace] = useState(session.workspace);
  window.hubspotFixture = {
    key: session.serviceKey, password: session.password,
    async state() { return (await fetch('/test/hubspot/state')).json(); },
    async source(body) { return (await fetch('/test/hubspot/source', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json(); },
    member() { localStorage.setItem('token', session.memberToken); setWorkspace({ ...session.workspace, role: 'employee', isOwner: false }); navigate('/workspace-settings/configs'); },
  };
  return <WorkspaceContext.Provider value={{ currentWorkspace: workspace }}><Routes>
    <Route path="/workspace-settings/configs" element={<WorkspaceConfigsPage />} />
    <Route path="/workspace-settings" element={<><WorkspaceSettingsTabs /><p>General workspace settings</p></>} />
  </Routes><ToastContainer /></WorkspaceContext.Provider>;
}
createRoot(document.getElementById('root')).render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/workspace-settings/configs']}><Fixture /></MemoryRouter></QueryClientProvider>);
