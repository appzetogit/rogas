import React, { createContext, useContext } from 'react';
import { useRestaurantNotifications } from '../hooks/useRestaurantNotifications';

export const RestaurantNotificationContext = createContext(null);

export const useRestaurantNotificationContext = () => {
  const context = useContext(RestaurantNotificationContext);
  if (!context) {
    return null;
  }
  return context;
};

export const RestaurantNotificationProvider = ({ children }) => {
  const notifications = useRestaurantNotifications();

  return (
    <RestaurantNotificationContext.Provider value={notifications}>
      {children}
    </RestaurantNotificationContext.Provider>
  );
};
