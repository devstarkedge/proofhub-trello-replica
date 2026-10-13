import { useMemo, useContext } from 'react';
import AuthContext from '../context/AuthContext';

/**
 * Hook to determine if the current user can access the Billed Time section.
 * 
 * Access is granted only when:
 * 1. The project has client information (clientName, clientEmail, or clientWhatsappNumber)
 * 2. The user has Admin or Manager role
 * 
 * Priority: First checks client info, then checks user role.
 * 
 * @param {Object} projectClientInfo - The project's clientDetails object
 * @returns {{ canAccessBilledTime: boolean, hiddenReason: string | null }}
 */
const useBilledTimeAccess = (projectClientInfo) => {
  const { user } = useContext(AuthContext);

  const result = useMemo(() => {
    // Priority 1: Check if project has client information
    const hasClientInfo = Boolean(
      projectClientInfo?.clientName ||
      projectClientInfo?.clientEmail ||
      projectClientInfo?.clientWhatsappNumber
    );

    if (!hasClientInfo) {
      return {
        canAccessBilledTime: false,
        hiddenReason: 'Billed time is unavailable because no client information is associated with this project.'
      };
    }

    // Priority 2: Check user role
    const userRole = user?.role?.toLowerCase();
    const hasPermission = userRole === 'admin' || userRole === 'manager';

    if (!hasPermission) {
      return {
        canAccessBilledTime: false,
        hiddenReason: 'You do not have permission to view billed time.'
      };
    }

    // Both conditions satisfied
    return {
      canAccessBilledTime: true,
      hiddenReason: null
    };
  }, [projectClientInfo, user?.role]);

  return result;
};

export default useBilledTimeAccess;
