import React, {
    createContext,
    useEffect,
    useState
} from 'react'

import { io } from 'socket.io-client'

export const SocketContext =
    createContext()

const SocketProvider = ({ children }) => {

    const [socket, setSocket] =
        useState(null)

    useEffect(() => {

        const newSocket = io(
            import.meta.env.VITE_API_URL ||
            'http://localhost:3000',
            {
                transports: ['websocket']
            }
        )

        setSocket(newSocket)

        const handleConnect = () => {

            console.log(
                'Socket connected:',
                newSocket.id
            )

        }

        const handleDisconnect = () => {

            console.log(
                'Socket disconnected'
            )

        }

        const handleError = error => {

            console.error(
                'Socket connection error:',
                error.message
            )

        }

        newSocket.on(
            'connect',
            handleConnect
        )

        newSocket.on(
            'disconnect',
            handleDisconnect
        )

        newSocket.on(
            'connect_error',
            handleError
        )

        return () => {

            newSocket.off(
                'connect',
                handleConnect
            )

            newSocket.off(
                'disconnect',
                handleDisconnect
            )

            newSocket.off(
                'connect_error',
                handleError
            )

            newSocket.disconnect()

        }

    }, [])

    return (
        <SocketContext.Provider
            value={{ socket }}
        >
            {children}
        </SocketContext.Provider>
    )
}

export default SocketProvider