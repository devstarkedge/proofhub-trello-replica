import React from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { leaveApprovalRedirect } from '../../utils/leaveNavigation';

// Keep bookmarked approval links, using the same list and details interface.
export default function ApprovalQueuePage() {
  const { search } = useLocation();
  const { requestId } = useParams();
  return <Navigate to={leaveApprovalRedirect({ search, requestId })} replace />;
}
