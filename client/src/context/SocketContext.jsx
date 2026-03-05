import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used within SocketProvider');
  return context;
};

const SOCKET_URL  = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
const SESSION_KEY = 'vmeet_current_room'; // sessionStorage key

// ─── Room session helpers (survive page refresh, cleared on tab close) ────────

export const saveRoomSession = (roomId, userId, username, avatar) => {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ roomId, userId, username, avatar }));
  } catch (_) {}
};

export const loadRoomSession = () => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
};

export const clearRoomSession = () => {
  try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export const SocketProvider = ({ children }) => {
  const [socket,      setSocket]      = useState(null);
  const [connected,   setConnected]   = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);

  const { user, isAuthenticated } = useAuth();

  // Keep a stable ref so callbacks always see the latest socket
  const socketRef = useRef(null);

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection:         true,
      reconnectionAttempts: Infinity,   // keep trying — don't give up on slow networks
      reconnectionDelay:    500,
      reconnectionDelayMax: 3000,
    });

    socketRef.current = newSocket;

    // ── connect (fires on first connect AND after each reconnect) ──────────
    newSocket.on('connect', () => {
      console.log('✅ Socket connected', newSocket.id);
      setConnected(true);

      // Always announce ourselves — server uses this to cancel grace period
      newSocket.emit('user-online', user._id);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('❌ Socket disconnected:', reason);
      setConnected(false);
    });

    newSocket.on('connect_error', (err) => {
      console.error('Socket connect_error:', err.message);
      setConnected(false);
    });

    // ── online-users-list (sent by server after user-online) ───────────────
    newSocket.on('online-users-list', ({ users }) => {
      setOnlineUsers(users.filter(id => id !== user._id));
    });

    // ── individual status changes ──────────────────────────────────────────
    newSocket.on('user-status-change', ({ userId, status }) => {
      if (userId === user._id) return; // ignore self
      setOnlineUsers(prev =>
        status === 'online'
          ? prev.includes(userId) ? prev : [...prev, userId]
          : prev.filter(id => id !== userId)
      );
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, user]);

  // ── stable helpers ─────────────────────────────────────────────────────────

  const emit = useCallback((event, data) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    }
  }, []);

  const on = useCallback((event, cb) => {
    socketRef.current?.on(event, cb);
  }, []);

  const off = useCallback((event, cb) => {
    socketRef.current?.off(event, cb);
  }, []);

  // ── room session wrappers (expose to VideoRoom) ────────────────────────────

  const setCurrentRoom = useCallback((roomId, username, avatar) => {
    if (user) saveRoomSession(roomId, user._id, username, avatar);
  }, [user]);

  const clearCurrentRoom = useCallback(() => {
    clearRoomSession();
  }, []);

  return (
    <SocketContext.Provider value={{
      socket,
      connected,
      onlineUsers,
      emit,
      on,
      off,
      setCurrentRoom,
      clearCurrentRoom,
    }}>
      {children}
    </SocketContext.Provider>
  );
};
