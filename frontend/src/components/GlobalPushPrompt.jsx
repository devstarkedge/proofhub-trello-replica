import React, { useContext } from 'react';
import NotificationContext from '../context/NotificationContext';
import PushNotificationPrompt from './PushNotificationPrompt';

export default function GlobalPushPrompt() {
  const { pushPrompt } = useContext(NotificationContext);
  return <PushNotificationPrompt prompt={pushPrompt} />;
}
