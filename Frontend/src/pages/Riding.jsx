import React, { useContext, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import LiveTracking from '../components/LiveTracking'

import { SocketContext } from '../context/SocketContext'
import { UserDataContext } from '../context/UserContext'


// Restore ride after refresh
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

    const [ride] = useState(
        () => location.state?.ride || readStoredRide()
    )

    const [captainLocation, setCaptainLocation] = useState(null)


    // Save ride
    useEffect(() => {

        if (ride) {
            sessionStorage.setItem('activeRide', JSON.stringify(ride))
        }

    }, [ride])


    // Join user socket room
    useEffect(() => {

        if (!socket || !user?._id) return

        const joinUser = () => {

            socket.emit('join', {
                userId: user._id,
                userType: 'user'
            })

            console.log('User joined socket:', user._id)
        }

        if (socket.connected) {
            joinUser()
        }

        socket.on('connect', joinUser)

        return () => {
            socket.off('connect', joinUser)
        }

    }, [socket, user?._id])


    // Receive captain live location
    useEffect(() => {

        if (!socket) return

        const handleCaptainLocation = (data) => {

            const loc = data?.location || data

            const lat = Number(loc?.lat ?? loc?.latitude ?? loc?.ltd)
            const lng = Number(loc?.lng ?? loc?.longitude)

            if (
                Number.isFinite(lat) &&
                Number.isFinite(lng)
            ) {
                setCaptainLocation([lat, lng])
            }
        }

        socket.on('captain-location', handleCaptainLocation)

        return () => {
            socket.off('captain-location', handleCaptainLocation)
        }

    }, [socket])


    // Ride ended
    useEffect(() => {

        if (!socket) return

        const handleRideEnded = () => {

            console.log('Ride ended')

            sessionStorage.removeItem('activeRide')

            navigate('/home', { replace: true })
        }

        socket.on('ride-ended', handleRideEnded)

        return () => {
            socket.off('ride-ended', handleRideEnded)
        }

    }, [socket, navigate])


    // No active ride
    if (!ride) {

        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100 p-5">

                <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-xl">

                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50">

                        <i className="ri-error-warning-line text-3xl text-red-500" />

                    </div>

                    <h2 className="mt-4 text-xl font-bold text-[#12334A]">
                        No active ride
                    </h2>

                    <p className="mt-2 text-sm text-gray-500">
                        Please book a ride to continue.
                    </p>

                    <Link
                        to="/home"
                        className="mt-6 inline-flex w-full justify-center rounded-xl bg-[#12334A] px-5 py-3 font-semibold text-white"
                    >
                        Back to Home
                    </Link>

                </div>

            </div>
        )
    }


    const captain = ride?.captain

    const captainName =
        captain?.fullname?.firstname || 'Captain'

    const vehicleType =
        captain?.vehicle?.vehicleType ||
        ride?.vehicleType ||
        'Car'

    const vehiclePlate =
        captain?.vehicle?.plate || 'WB-00-XX-0000'


    return (

        <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-gray-100 lg:flex-row">

            {/* ================= MAP ================= */}

            <div className="relative h-[48dvh] min-h-[280px] w-full shrink-0 overflow-hidden bg-gray-200 sm:h-[55dvh] lg:h-full lg:flex-1">

                <LiveTracking
                    captainLocation={captainLocation}
                />

                {/* Map top gradient */}

                <div className="pointer-events-none absolute inset-x-0 top-0 z-[400] h-28 bg-gradient-to-b from-[#12334A]/50 to-transparent" />

                {/* Saarthi logo */}

                <div className="absolute left-4 top-4 z-[500] rounded-xl bg-white px-4 py-2 shadow-lg">

                    <h1 className="text-xl font-extrabold tracking-tight text-[#12334A]">

                        Saarthi<span className="text-[#F15A24]">.</span>

                    </h1>

                </div>

                {/* Home button */}

                <Link
                    to="/home"
                    aria-label="Go to home"
                    className="absolute right-4 top-4 z-[500] flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#12334A] shadow-lg transition hover:bg-[#F15A24] hover:text-white"
                >
                    <i className="ri-home-5-line text-xl" />
                </Link>

                {/* Live status */}

                <div className="absolute bottom-4 left-4 z-[500] flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-lg">

                    <span className="relative flex h-2.5 w-2.5">

                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60" />

                        <span className="relative h-2.5 w-2.5 rounded-full bg-green-500" />

                    </span>

                    <span className="text-xs font-semibold text-[#12334A]">

                        {captainLocation
                            ? 'Captain location received'
                            : 'Waiting for captain location'}

                    </span>

                </div>

            </div>


            {/* ================= RIDE DETAILS ================= */}

            <div className="relative z-[450] flex min-h-0 w-full flex-1 flex-col overflow-y-auto rounded-t-[28px] bg-white px-4 pb-6 pt-4 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] sm:px-6 lg:h-full lg:max-h-full lg:w-[420px] lg:flex-none lg:rounded-none lg:border-l lg:border-gray-100 lg:px-6 lg:pt-8 lg:shadow-none xl:w-[460px]">

                {/* Drag indicator */}

                <div className="mx-auto mb-5 h-1 w-12 shrink-0 rounded-full bg-gray-300 lg:hidden" />


                {/* Header */}

                <div className="mb-5 flex items-center justify-between">

                    <div>

                        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                            Your journey
                        </p>

                        <h2 className="mt-1 text-xl font-extrabold text-[#12334A]">
                            Ride in progress
                        </h2>

                    </div>

                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50">

                        <i className="ri-taxi-fill text-2xl text-[#F15A24]" />

                    </div>

                </div>


                {/* Captain card */}

                <div className="rounded-2xl bg-gradient-to-br from-[#12334A] to-[#1d4e6e] p-4 text-white shadow-lg">

                    <div className="flex items-center justify-between gap-3">

                        <div className="flex min-w-0 items-center gap-3">

                            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-2xl font-extrabold text-[#12334A] ring-2 ring-[#F15A24]">

                                {String(captainName).charAt(0).toUpperCase()}

                            </div>

                            <div className="min-w-0">

                                <p className="text-xs text-white/60">
                                    Your Captain
                                </p>

                                <h3 className="truncate text-lg font-bold capitalize">
                                    {captainName}
                                </h3>

                                <p className="text-xs capitalize text-white/70">
                                    {vehicleType}
                                </p>

                            </div>

                        </div>

                        <div className="shrink-0 text-right">

                            <p className="text-xs text-white/60">
                                Total fare
                            </p>

                            <h3 className="text-2xl font-extrabold">
                                ₹{ride?.fare ?? 0}
                            </h3>

                        </div>

                    </div>

                    <div className="mt-4 flex items-center justify-between rounded-xl bg-white/10 px-4 py-3">

                        <div>

                            <p className="text-[10px] uppercase tracking-wider text-white/60">
                                Vehicle number
                            </p>

                            <p className="mt-1 text-lg font-bold tracking-wider">
                                {vehiclePlate}
                            </p>

                        </div>

                        <i className="ri-car-line text-3xl text-[#F15A24]" />

                    </div>

                </div>


                {/* Route details */}

                <div className="mt-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">

                    <div className="flex gap-4">

                        {/* Timeline */}

                        <div className="flex flex-col items-center pt-1">

                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#12334A]/10 text-[#12334A]">

                                <i className="ri-map-pin-user-fill" />

                            </div>

                            <div className="my-1 min-h-12 flex-1 border-l-2 border-dashed border-gray-300" />

                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-50 text-[#F15A24]">

                                <i className="ri-map-pin-2-fill" />

                            </div>

                        </div>


                        {/* Addresses */}

                        <div className="min-w-0 flex-1">

                            <div className="pb-5">

                                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                    Pickup location
                                </p>

                                <p className="mt-1 break-words text-sm font-semibold leading-relaxed text-[#12334A]">
                                    {ride?.pickup || 'Pickup not available'}
                                </p>

                            </div>

                            <div>

                                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                    Destination
                                </p>

                                <p className="mt-1 break-words text-sm font-semibold leading-relaxed text-[#12334A]">
                                    {ride?.destination || 'Destination not available'}
                                </p>

                            </div>

                        </div>

                    </div>

                </div>


                {/* Payment */}

                <div className="mt-5 rounded-2xl border border-gray-100 p-4">

                    <div className="flex items-center justify-between">

                        <div className="flex items-center gap-3">

                            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-50">

                                <i className="ri-wallet-3-line text-xl text-green-600" />

                            </div>

                            <div>

                                <h3 className="font-semibold text-[#12334A]">
                                    Cash Payment
                                </h3>

                                <p className="text-xs text-gray-500">
                                    Pay after reaching destination
                                </p>

                            </div>

                        </div>

                        <h3 className="text-lg font-bold text-[#12334A]">
                            ₹{ride?.fare ?? 0}
                        </h3>

                    </div>

                </div>


                {/* Bottom info */}

                <div className="mt-5 rounded-xl bg-[#12334A]/5 p-3 text-center">

                    <i className="ri-shield-check-line mr-1 text-[#F15A24]" />

                    <span className="text-xs font-medium text-[#12334A]">
                        Have a safe and comfortable journey with Saarthi.
                    </span>

                </div>

            </div>

        </div>
    )
}

export default Riding