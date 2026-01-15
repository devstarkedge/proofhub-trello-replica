import React, { lazy, Suspense } from 'react';
import { ListViewSkeleton } from '../components/LoadingSkeleton';

const TeamLoggedTimeView = lazy(() => import('../components/TeamAnalytics/TeamLoggedTimeView'));

/**
 * ListViewTeams - Teams section for the List View page
 * Renders the TeamLoggedTimeView component
 * Accessible via /list-view/teams route
 */
const ListViewTeams = () => {
  return (
    <Suspense fallback={<ListViewSkeleton />}>
      <TeamLoggedTimeView />
    </Suspense>
  );
};

export default ListViewTeams;
