import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authRequest } from './api';
import { socket } from './socket';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);

  const loadNotifications = useCallback((token) => {
    authRequest('/notifications', token)
      .then((res) => setNotifications(res.notifications || []))
      .catch(() => {});
  }, []);

  const connect = useCallback((token) => {
    const authenticate = () => {
      socket.emit('authenticate', { token });
    };
    // Ensure authentication is sent on initial connect and automatic reconnects.
    socket.off('connect');
    socket.on('connect', authenticate);
    socket.connect();
    if (socket.connected) authenticate();
    loadNotifications(token);
  }, [loadNotifications]);

  const disconnect = useCallback(() => {
    socket.off('connect');
    socket.disconnect();
    setNotifications([]);
  }, []);

  const markRead = useCallback((id, token) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    authRequest(`/notifications/${id}/read`, token, { method: 'PATCH' }).catch(() => {});
  }, []);

  const markAllRead = useCallback((token) => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    authRequest('/notifications/read-all', token, { method: 'PATCH' }).catch(() => {});
  }, []);

  useEffect(() => {
    const onNotification = (notif) => {
      setNotifications((prev) => [notif, ...prev]);
    };
    socket.on('notification', onNotification);
    return () => socket.off('notification', onNotification);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, connect, disconnect, markRead, markAllRead, loadNotifications }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
