import ProjectWorkspaceGate from './ProjectWorkspaceGate';

// Reuse the server-authorized switch and existing cache/socket resets for all
// Windows destinations, including announcements and attendance, not just tasks.
export default function DesktopWorkspaceGate({ children }) {
  return window.flowtaskDesktop?.platform === 'win32'
    ? <ProjectWorkspaceGate resource="linked page" backLabel="Back to Home">{children}</ProjectWorkspaceGate>
    : children;
}
