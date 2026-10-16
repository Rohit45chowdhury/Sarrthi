
import React, {
    createContext,
    useEffect,
    useState
} from 'react';

import { io } from 'socket.io-client';

export const SocketContext = createContext({
    socket: null
});

const API_URL =
    import.meta.env.VITE_API_URL || 'http://localhost:3000';

const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);

    useEffect(() => {
        const newSocket = io(API_URL, {
            path: '/socket.io/',

            // WebSocket-only: use after confirming Nginx
            // correctly forwards WebSocket connections.
            transports: ['websocket'],

            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000
        });

        setSocket(newSocket);

        const handleConnect = () => {
            console.log('Socket connected:', newSocket.id);
        };

        const handleDisconnect = (reason) => {
            console.log('Socket disconnected:', reason);
        };

        const handleError = (error) => {
            console.error('Socket connection error:', error.message);
        };

        const handleVisibility = () => {
            if (
                document.visibilityState === 'visible' &&
                !newSocket.connected
            ) {
                newSocket.connect();
            }
        };

        const handleAny = (event, ...args) => {
            console.log('SOCKET EVENT:', event, ...args);
        };

        newSocket.on('connect', handleConnect);
        newSocket.on('disconnect', handleDisconnect);
        newSocket.on('connect_error', handleError);

        if (import.meta.env.DEV) {
            newSocket.onAny(handleAny);
        }

        document.addEventListener(
            'visibilitychange',
            handleVisibility
        );

        return () => {
            newSocket.off('connect', handleConnect);
            newSocket.off('disconnect', handleDisconnect);
            newSocket.off('connect_error', handleError);
            newSocket.offAny(handleAny);

            document.removeEventListener(
                'visibilitychange',
                handleVisibility
            );

            newSocket.disconnect();
        };
    }, []);

    return (
        <SocketContext.Provider value={{ socket }}>
            {children}
        </SocketContext.Provider>
    );
};

export default SocketProvider;
