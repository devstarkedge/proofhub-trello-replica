import { lazy, Suspense, useContext } from 'react';
import { ListViewSkeleton } from '../components/LoadingSkeleton';
import WorkspaceContext from '../context/WorkspaceContext';

const TeamLoggedTimeView = lazy(() => import('../components/TeamAnalytics/TeamLoggedTimeView'));

/**
 * ListViewTeams - Teams section for the List View page
 * Renders the TeamLoggedTimeView component
 * Accessible via /list-view/teams route
 */
const ListViewTeams = () => {
  const { currentWorkspace } = useContext(WorkspaceContext);
  return (
    <Suspense fallback={<ListViewSkeleton />}>
      <TeamLoggedTimeView key={currentWorkspace?._id} />
    </Suspense>
  );
};

export default ListViewTeams;
