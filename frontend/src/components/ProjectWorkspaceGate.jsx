import { useContext, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import WorkspaceContext from '../context/WorkspaceContext';

// Email links name their workspace explicitly. Do not mount the project or
// start its reads until the normal, server-authorized workspace switch completes.
export default function ProjectWorkspaceGate({ children, resource = 'project', backLabel = 'Back to projects' }) {
  const [params] = useSearchParams();
  const workspaceId = params.get('workspaceId');
  const { currentWorkspace, workspaces, switchWorkspace, loading } = useContext(WorkspaceContext);
  const target = workspaces.find((workspace) => String(workspace._id) === workspaceId);
  const valid = !workspaceId || /^[a-f\d]{24}$/i.test(workspaceId);
  const ready = !workspaceId || String(currentWorkspace?._id) === workspaceId;
  const pending = useRef(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!valid || ready || !target) return;
    let active = true;
    setError('');
    if (pending.current?.id !== workspaceId) {
      const task = switchWorkspace(target);
      pending.current = { id: workspaceId, task };
      task.finally(() => {
        if (pending.current?.task === task) pending.current = null;
      }).catch(() => {});
    }
    pending.current.task.catch(() => {
      if (active) setError(`Unable to open the ${resource} workspace.`);
    });
    return () => { active = false; };
  }, [valid, ready, target, workspaceId, switchWorkspace, attempt, resource]);

  if (workspaceId && loading && !ready) return <p role="status" className="p-6">Opening {resource} workspace…</p>;
  const message = !valid ? 'This workspace link is invalid.'
    : workspaceId && !target ? `You do not have access to the ${resource} workspace.` : error;
  if (message) return <div className="p-6 space-y-3">
    <p role="alert">{message}</p>
    {error && <button type="button" className="underline" onClick={() => setAttempt((value) => value + 1)}>Retry</button>}
    <Link to="/" className="block underline">{backLabel}</Link>
  </div>;
  if (!ready) return <p role="status" className="p-6">Opening {resource} workspace…</p>;
  return children;
}
