import React, { useContext, useEffect, useState } from 'react'
import axios from 'axios'

import { SocketContext } from '../context/SocketContext'
import { UserDataContext } from '../context/UserContext'
import RatingPopUp from './RatingPopUp'

const BASE_URL =
    import.meta.env.VITE_API_URL ||
    'http://localhost:3000'

const DISMISSED_KEY = 'ratingDismissedRide'

// App.jsx ke <Route path="..."> se exact match karo
const HOME_ROUTE = '/home'

const RideEndRating = () => {

    const { socket } = useContext(SocketContext)
    const userCtx = useContext(UserDataContext)
    const user = userCtx?.user

    const [endedRide, setEndedRide] = useState(null)

    // 1) keep the USER socket joined on every page (backend needs the
    //    saved socketId to deliver "ride-ended")
    useEffect(() => {

        if (!socket || !user?._id) return

        const joinUser = () => {
            socket.emit('join', {
                userId: user._id,
                userType: 'user'
            })
        }

        if (socket.connected) joinUser()

        socket.on('connect', joinUser)

        return () => {
            socket.off('connect', joinUser)
        }

    }, [socket, user?._id])

    // 2) live event: captain finished the ride
    useEffect(() => {

        if (!socket) return

        const handleRideEnded = data => {

            console.log('RIDE ENDED RECEIVED:', data)

            const ride = data?.ride || data

            if (!ride?._id) {
                console.error('Invalid ride-ended payload:', data)
                return
            }

            setEndedRide(ride)
        }

        socket.on('ride-ended', handleRideEnded)

        return () => {
            socket.off('ride-ended', handleRideEnded)
        }

    }, [socket])

    // 3) backup: if the socket event was missed, ask the server for a
    //    completed ride that is still unrated (on load and on reconnect)
    useEffect(() => {

        if (!user?._id) return

        const token = localStorage.getItem('token')
        if (!token) return

        let cancelled = false

        const checkPending = async () => {

            try {

                const { data } = await axios.get(
                    `${BASE_URL}/rides/pending-rating`,
                    { headers: { Authorization: `Bearer ${token}` } }
                )

                const ride = data?.ride

                if (cancelled || !ride?._id) return
                if (localStorage.getItem(DISMISSED_KEY) === ride._id) return

                setEndedRide(prev => prev || ride)

            } catch (error) {
                // not a user session / network problem -> ignore
            }
        }

        checkPending()

        socket?.on('connect', checkPending)

        return () => {
            cancelled = true
            socket?.off('connect', checkPending)
        }

    }, [socket, user?._id])

    // Rating submit ya skip, dono ke baad yahi chalta hai.
    // Full reload ke saath home par jao: ye refresh jaisa hai, isse purani
    // ride state saaf ho jaati hai aur Home fresh render hota hai.
    const handleClose = () => {

        if (endedRide?._id) {
            localStorage.setItem(DISMISSED_KEY, endedRide._id)
        }

        setEndedRide(null)

        window.location.replace(HOME_ROUTE)
    }

    if (!endedRide) return null

    return (
        <RatingPopUp
            ride={endedRide}
            onClose={handleClose}
        />
    )
}

export default RideEndRating