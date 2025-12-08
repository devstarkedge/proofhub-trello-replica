import { useContext } from 'react';
import { NetworkStatusContext } from '../context/NetworkStatusContext';

/**
 * Custom hook to access network status from any component
 * @returns {Object} Network status object containing:
 *   - isOnline: boolean - true if connected to internet
 *   - isOffline: boolean - true if not connected to internet
 *   - lastOfflineTime: Date|null - timestamp of last offline event
 *   - lastOnlineTime: Date|null - timestamp of last online event
 *   - showOfflineToast: boolean - whether to show offline toast
 *   - showOnlineToast: boolean - whether to show online toast
 *   - dismissOfflineToast: function - dismiss the offline toast
 *   - dismissOnlineToast: function - dismiss the online toast
 */
export const useNetworkStatus = () => {
  const context = useContext(NetworkStatusContext);
  
  if (context === undefined) {
    throw new Error('useNetworkStatus must be used within a NetworkStatusProvider');
  }
  
  return context;
};

export default useNetworkStatus;
