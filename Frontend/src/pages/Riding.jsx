import React, { useContext, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import LiveTracking from '../components/LiveTracking'

import { SocketContext } from '../context/SocketContext'
import { UserDataContext } from '../context/UserContext'

// sessionStorage keeps the ride alive after a page refresh
const readStoredRide = () => {
    try {
        return JSON.parse(sessionStorage.getItem('activeRide') || 'null')
    } catch {
        return null
    }
}

const Riding = () => {

    const location = useLocation()
    const navigate = useNavigate()

    const { socket } = useContext(SocketContext)
    const { user } = useContext(UserDataContext)

    // ride comes from navigate('/riding', { state: { ride } }) in Home.jsx
    const [ride] = useState(
        () => location.state?.ride || readStoredRide()
    )

    useEffect(() => {
        if (ride) {
            sessionStorage.setItem('activeRide', JSON.stringify(ride))
        }
    }, [ride])

    // Home.jsx is not mounted on this page, so join the socket here
    // (needed to receive "ride-ended", also after a refresh)
    useEffect(() => {

        if (!socket || !user?._id) return

        const joinUser = () => {
            socket.emit('join', {
                userId: user._id,
                userType: 'user'
            })
        }

        if (socket.connected) {
            joinUser()
        }

        socket.on('connect', joinUser)

        return () => {
            socket.off('connect', joinUser)
        }

    }, [socket, user?._id])

    // captain pressed "Finish Ride"
    useEffect(() => {

        if (!socket) return

        const handleRideEnded = () => {
            sessionStorage.removeItem('activeRide')
            navigate('/home')
        }

        socket.on('ride-ended', handleRideEnded)

        return () => {
            socket.off('ride-ended', handleRideEnded)
        }

    }, [socket, navigate])

    // ================= NO ACTIVE RIDE =================

    if (!ride) {

        return (
            <div className='h-screen w-full flex items-center justify-center p-5'>

                <div className='text-center'>

                    <i className='ri-error-warning-line text-5xl text-red-500'></i>

                    <h2 className='text-xl font-bold mt-3'>
                        No active ride
                    </h2>

                    <Link
                        to='/home'
                        className='inline-block mt-5 bg-black text-white px-6 py-3 rounded-lg'
                    >
                        Back to Home
                    </Link>

                </div>

            </div>
        )
    }

    return (
        <div className='h-screen w-full bg-white overflow-hidden relative'>

            {/* ================= MAP ================= */}

            <div className='h-[50vh] w-full relative'>
                <LiveTracking />
            </div>

            {/* ================= HOME BUTTON ================= */}

            <Link
                to='/home'
                className='fixed z-50 right-4 top-4 h-10 w-10 bg-white shadow-lg flex items-center justify-center rounded-full'
            >
                <i className='text-lg font-medium ri-home-5-line'></i>
            </Link>

            {/* ================= RIDE DETAILS ================= */}

            <div className='h-[50vh] bg-white p-4 overflow-y-auto'>

                {/* Captain Details */}

                <div className='flex items-center justify-between'>

                    <img
                        className='h-12 w-16 object-cover rounded-lg'
                        src='https://swyft.pl/wp-content/uploads/2023/05/how-many-people-can-a-uberx-take.jpg'
                        alt='Vehicle'
                    />

                    <div className='text-right'>

                        <h2 className='text-lg font-medium capitalize'>
                            {ride?.captain?.fullname?.firstname || 'Captain'}
                        </h2>

                        <h4 className='text-xl font-semibold'>
                            {ride?.captain?.vehicle?.plate || 'WB-00-XX-0000'}
                        </h4>

                        <p className='text-sm text-gray-600 capitalize'>
                            {ride?.captain?.vehicle?.vehicleType ||
                                ride?.vehicleType ||
                                'Car'}
                        </p>

                    </div>

                </div>

                {/* ================= LOCATION ================= */}

                <div className='w-full mt-5'>

                    {/* Pickup */}

                    <div className='flex items-center gap-5 p-3 border-b-2'>

                        <i className='text-lg ri-map-pin-user-fill'></i>

                        <div className='min-w-0'>
                            <h3 className='text-lg font-medium'>
                                Pickup
                            </h3>
                            <p className='text-sm mt-1 text-gray-600'>
                                {ride?.pickup || 'Pickup not available'}
                            </p>
                        </div>

                    </div>

                    {/* Destination */}

                    <div className='flex items-center gap-5 p-3 border-b-2'>

                        <i className='text-lg ri-map-pin-2-fill'></i>

                        <div className='min-w-0'>
                            <h3 className='text-lg font-medium'>
                                Destination
                            </h3>
                            <p className='text-sm mt-1 text-gray-600'>
                                {ride?.destination || 'Destination not available'}
                            </p>
                        </div>

                    </div>

                    {/* Fare */}

                    <div className='flex items-center gap-5 p-3'>

                        <i className='text-lg ri-currency-line'></i>

                        <div>
                            <h3 className='text-lg font-medium'>
                                ₹{ride?.fare ?? 0}
                            </h3>
                            <p className='text-sm mt-1 text-gray-600'>
                                Cash Payment
                            </p>
                        </div>

                    </div>

                </div>

                {/* Payment Button */}

                <button
                    type='button'
                    className='w-full mt-5 bg-green-600 hover:bg-green-700 text-white font-semibold p-3 rounded-lg'
                >
                    Make a Payment
                </button>

            </div>

        </div>
    )
}

export default Riding