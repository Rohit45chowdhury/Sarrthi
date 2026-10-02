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
                transports: ['websocket']
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

        // DEV ONLY: logs every event the server sends to this browser.
        // If "new-ride" never shows here on the captain's page, the backend
        // is not sending it to this socket (not joined / not in radius).
        const handleAny = (event, ...args) => {
            console.log('SOCKET EVENT:', event, ...args)
        }

        newSocket.on('connect', handleConnect)
        newSocket.on('disconnect', handleDisconnect)
        newSocket.on('connect_error', handleError)

        if (import.meta.env.DEV) {
            newSocket.onAny(handleAny)
        }

        return () => {

            newSocket.off('connect', handleConnect)
            newSocket.off('disconnect', handleDisconnect)
            newSocket.off('connect_error', handleError)
            newSocket.offAny(handleAny)

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