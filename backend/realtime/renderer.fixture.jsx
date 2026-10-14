// Integration fixture: real header, provider, socket client, board and task modal.
// Only session bootstrap and auxiliary empty collections are test fixtures.
import React, { useContext, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastContainer } from 'react-toastify';
import AuthContext from '../../desktopApp/src/context/AuthContext';
import WorkspaceContext from '../../desktopApp/src/context/WorkspaceContext';
import DepartmentContext from '../../desktopApp/src/context/DepartmentContext';
import { NotificationProvider } from '../../desktopApp/src/context/NotificationContext';
import NotificationContext from '../../desktopApp/src/context/NotificationContext';
import { ThemeProvider } from '../../desktopApp/src/context/ThemeProvider';
import Header from '../../desktopApp/src/components/Header';
import WorkFlow from '../../desktopApp/src/pages/WorkFlow';
import socket from '../../desktopApp/src/services/socket';
import useRealtimeSync from '../../desktopApp/src/hooks/useRealtimeSync';
import useWorkflowStore from '../../desktopApp/src/store/workflowStore';
import useModalHierarchyStore from '../../desktopApp/src/store/modalHierarchyStore';
import '../../desktopApp/src/index.css';

const session = await (await fetch('/test/session')).json();
localStorage.setItem('token', session.token); localStorage.setItem('workspaceId', session.workspace._id);

function Screen() {
  const inbox = useContext(NotificationContext), location = useLocation(), navigate = useNavigate();
  useRealtimeSync();
  useEffect(() => { socket.connect(session.user._id, session.token, session.workspace._id); return () => socket.disconnect(); }, []);
  window.flowtaskTest = {
    state: () => ({ unread: inbox.unreadCount, ids: inbox.notifications.map(item => item._id), open: inbox.isOpen,
      route: location.pathname, socket: socket.isConnected(), modal: useModalHierarchyStore.getState().stack.map(item => ({ type: item.type, id: item.entityId })),
      titles: Object.values(useWorkflowStore.getState().cardsById).map(item => item.title) }),
    open: inbox.togglePanel, navigate, disconnect: () => { socket.getSocket().io.engine.close(); },
    changeTheme: color => document.documentElement.style.setProperty('--color-primary', color),
  };
  return <><Header /><Routes><Route path="/workflow/:deptId/:projectId/:taskId?" element={<WorkFlow />} /><Route path="*" element={<div>Integration home</div>} /></Routes><ToastContainer /></>;
}
function Fixture() {
  const [user, setUser] = useState(session.user);
  return <ThemeProvider><QueryClientProvider client={new QueryClient()}><AuthContext.Provider value={{ user, setUser, isAuthenticated: true, token: session.token }}>
    <WorkspaceContext.Provider value={{ currentWorkspace: session.workspace, workspaces: [session.workspace] }}>
      <DepartmentContext.Provider value={{ currentTeam: null, currentDepartment: session.department, departments: [session.department], teams: [], loading: false, setCurrentDepartment() {} }}>
        <MemoryRouter><NotificationProvider><Screen /></NotificationProvider></MemoryRouter>
      </DepartmentContext.Provider>
    </WorkspaceContext.Provider></AuthContext.Provider></QueryClientProvider></ThemeProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
