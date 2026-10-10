import React, {
    createContext,
    useEffect,
    useState
} from 'react'

import { io } from 'socket.io-client'

export const SocketContext = createContext({ socket: null })

const SocketProvider = ({ children }) => {

    const [socket, setSocket] = useState(null)

    useEffect(() => {

        const newSocket = io(
            import.meta.env.VITE_API_URL || 'http://localhost:3000',
            {
                transports: ['websocket'],
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000
            }
        )

        setSocket(newSocket)

        const handleConnect = () => {
            console.log('Socket connected:', newSocket.id)
        }

        const handleDisconnect = reason => {
            console.log('Socket disconnected:', reason)
        }

        const handleError = error => {
            console.error('Socket connection error:', error.message)
        }

        // Phone / browser can freeze the tab in the background and the
        // reconnect timer may not run. When the app comes back to the
        // foreground, reconnect right away. Home / CaptainHome re-join their
        // room on every "connect" event, so events start flowing again.
        const handleVisibility = () => {

            if (
                document.visibilityState === 'visible' &&
                !newSocket.connected
            ) {
                newSocket.connect()
            }
        }

        // DEV ONLY: logs every event the server sends to this browser.
        // If "new-ride" never shows here on the captain's page, the backend
        // is not sending it to this socket (not joined / not in radius).
        const handleAny = (event, ...args) => {
            console.log('SOCKET EVENT:', event, ...args)
        }

        newSocket.on('connect', handleConnect)
        newSocket.on('disconnect', handleDisconnect)
        newSocket.on('connect_error', handleError)

        document.addEventListener('visibilitychange', handleVisibility)

        if (import.meta.env.DEV) {
            newSocket.onAny(handleAny)
        }

        return () => {

            newSocket.off('connect', handleConnect)
            newSocket.off('disconnect', handleDisconnect)
            newSocket.off('connect_error', handleError)
            newSocket.offAny(handleAny)

            document.removeEventListener('visibilitychange', handleVisibility)

            newSocket.disconnect()
        }

    }, [])

    return (
        <SocketContext.Provider value={{ socket }}>
            {children}
        </SocketContext.Provider>
    )
}

export default SocketProvider