import React, { createContext, useContext } from 'react';
import { useUserNotifications } from '../hooks/useUserNotifications';

export const UserNotificationContext = createContext(null);

export const useUserNotificationContext = () => {
  const context = useContext(UserNotificationContext);
  if (!context) {
    return null;
  }
  return context;
};

export const UserNotificationProvider = ({ children }) => {
  const notifications = useUserNotifications();

  return (
    <UserNotificationContext.Provider value={notifications}>
      {children}
    </UserNotificationContext.Provider>
  );
};
