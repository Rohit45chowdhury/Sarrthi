import React, { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

import { SocketContext } from '../context/SocketContext'
import { UserDataContext } from '../context/UserContext'
import RatingPopUp from './RatingPopUp'

const BASE_URL =
    import.meta.env.VITE_API_URL ||
    'http://localhost:3000'

const DISMISSED_KEY = 'ratingDismissedRide'

const RideEndRating = () => {

    const { socket } = useContext(SocketContext)
    const userCtx = useContext(UserDataContext)
    const user = userCtx?.user
    const navigate = useNavigate()

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

    if (!endedRide) return null

    return (
        <RatingPopUp
            ride={endedRide}
            onClose={() => {
                localStorage.setItem(DISMISSED_KEY, endedRide._id)
                setEndedRide(null)
                navigate('/home')   // change if your user home route is different
            }}
        />
    )
}

export default RideEndRating