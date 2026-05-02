// src/context/SocketContext.js
//
// Phase B: the backend Socket.io handshake now requires a valid JWT in
// `auth.token`. We pass the token via a function callback so socket.io
// re-reads `getAccessToken()` on every (re)connect — that means a token
// refreshed by the axios interceptor is automatically picked up the next
// time the socket has to reconnect, without us tearing the connection
// down on every refresh.
//
// We DO NOT emit a client-side 'join' anymore — the server forces every
// socket to join its own user-room on connect. That closes a privilege
// escalation hole where the old code let any client subscribe to any
// user's notifications.
import React, { createContext, useEffect, useState, useContext } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { API_BASE_URL } from '../config';
import { getAccessToken } from '../api/tokenStore';

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!user) {
      setSocket(null);
      return undefined;
    }

    const newSocket = io(API_BASE_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      withCredentials: true,
      auth: (cb) => cb({ token: getAccessToken() }),
    });

    newSocket.on('connect', () => {
      // Server-side: socket.join(user.id) is forced in `io.on('connection')`.
      // No client-emitted 'join' needed — the old emit was a security hole.
    });

    newSocket.on('connect_error', (err) => {
      // Surface auth failures so a stale token gets a fresh handshake on
      // the next reconnection attempt (the auth callback re-reads memory).
      // eslint-disable-next-line no-console
      console.warn('Socket connect_error:', err?.message);
    });

    setSocket(newSocket);
    return () => newSocket.close();
  }, [user]);

  return (
    <SocketContext.Provider value={{ socket }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
