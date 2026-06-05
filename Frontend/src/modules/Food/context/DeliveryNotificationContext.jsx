import React, { createContext, useContext } from 'react';
import { useDeliveryNotifications } from '../hooks/useDeliveryNotifications';

export const DeliveryNotificationContext = createContext(null);

export const useDeliveryNotificationContext = () => {
  const context = useContext(DeliveryNotificationContext);
  if (!context) {
    // Fallback to calling the hook directly if provider is missing (e.g. in tests or isolated components)
    // However, the goal is to use the provider to avoid duplicate connections.
    return useDeliveryNotifications();
  }
  return context;
};

export const DeliveryNotificationProvider = ({ children }) => {
  const notifications = useDeliveryNotifications();

  return (
    <DeliveryNotificationContext.Provider value={notifications}>
      {children}
    </DeliveryNotificationContext.Provider>
  );
};
