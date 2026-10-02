import React, { useContext, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'

import FinishRide from '../components/FinishRide'
import LiveTracking from '../components/LiveTracking'

import { SocketContext } from '../context/SocketContext'
import { CaptainDataContext } from '../context/CapatainContext'

// sessionStorage keeps the ride alive after a page refresh
const readStoredRide = () => {
    try {
        return JSON.parse(sessionStorage.getItem('activeRide') || 'null')
    } catch {
        return null
    }
}

const CaptainRiding = () => {

    const location = useLocation()
    const navigate = useNavigate()

    const { socket } = useContext(SocketContext)
    const { captain } = useContext(CaptainDataContext)

    const [finishRidePanel, setFinishRidePanel] = useState(false)
    const finishRidePanelRef = useRef(null)

    const lastPosRef = useRef(null)

    // ride comes from navigate('/captain-riding', { state: { ride } })
    const [rideData] = useState(
        () => location.state?.ride || readStoredRide()
    )

    useEffect(() => {
        if (rideData) {
            sessionStorage.setItem('activeRide', JSON.stringify(rideData))
        }
    }, [rideData])

    // ==========================================
    // LIVE LOCATION -> server -> passenger
    // (CaptainHome stops tracking when it unmounts, so this page
    //  has to keep sending during the ride)
    // ==========================================

    const rideId = rideData?._id

    useEffect(() => {

        if (!socket || !captain?._id || !rideId || !navigator.geolocation) return

        const send = () => {

            if (!lastPosRef.current) return

            // keeps the DB location fresh for future ride matching
            socket.emit('update-location-captain', {
                userId: captain._id,
                location: lastPosRef.current
            })

            // relayed to the passenger (server checks the ride itself)
            socket.emit('captain-live-location', {
                rideId,
                location: lastPosRef.current
            })
        }

        // re-join, because a page refresh creates a new socket.id
        const join = () => {

            socket.emit(
                'join',
                { userId: captain._id, userType: 'captain' },
                res => {
                    if (res?.ok) send()
                }
            )
        }

        if (socket.connected) join()

        socket.on('connect', join)

        const watchId = navigator.geolocation.watchPosition(
            pos => {

                lastPosRef.current = {
                    ltd: pos.coords.latitude,
                    lng: pos.coords.longitude
                }

                send()
            },
            err => console.error('Captain GPS error:', err.code, err.message),
            {
                enableHighAccuracy: true,
                maximumAge: 2000,
                timeout: 30000
            }
        )

        // watchPosition is silent while standing still
        const heartbeat = setInterval(send, 5000)

        return () => {
            socket.off('connect', join)
            navigator.geolocation.clearWatch(watchId)
            clearInterval(heartbeat)
        }

    }, [socket, captain?._id, rideId])

    // ==========================================
    // FINISH RIDE PANEL ANIMATION
    // ==========================================

    useGSAP(() => {

        if (!finishRidePanelRef.current) return

        gsap.to(finishRidePanelRef.current, {
            y: finishRidePanel ? 0 : '100%',
            duration: 0.4,
            ease: finishRidePanel ? 'power3.out' : 'power3.inOut'
        })

    }, [finishRidePanel, rideData])

    // ==========================================
    // NO ACTIVE RIDE
    // ==========================================

    if (!rideData) {

        return (
            <div className='h-screen w-full flex items-center justify-center p-5'>

                <div className='text-center'>

                    <i className='ri-error-warning-line text-5xl text-red-500'></i>

                    <h2 className='text-xl font-bold mt-3'>
                        No active ride
                    </h2>

                    <p className='text-gray-500 mt-2'>
                        Accept a ride and enter the OTP to start one.
                    </p>

                    <button
                        type='button'
                        onClick={() => navigate('/captain-home')}
                        className='mt-5 bg-black text-white px-6 py-3 rounded-lg'
                    >
                        Back to Home
                    </button>

                </div>

            </div>
        )
    }

    const distanceKm =
        rideData?.distance != null &&
        Number.isFinite(Number(rideData.distance))
            ? (Number(rideData.distance) / 1000).toFixed(1)
            : null

    return (

    <div className="relative h-[100dvh] w-full overflow-hidden bg-gray-100">

        {/* MAP */}
        <div className="absolute inset-0 z-0">
            <LiveTracking />
        </div>

        {/* soft top fade so the top bar stays readable on the map */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-28 bg-gradient-to-b from-[#12334A]/40 to-transparent" />


        {/* TOP BAR */}
        <div className="absolute inset-x-0 top-0 z-30 p-4 sm:p-6">
            <div className="flex items-center justify-between">

                <div className="rounded-xl bg-white px-4 py-2 shadow-lg">
                    <h1 className="text-xl font-extrabold leading-none tracking-tight text-[#12334A] sm:text-2xl">
                        Saarthi<span className="text-[#F15A24]">.</span>
                    </h1>
                </div>

                {/* TRIP STATUS PILL */}
                <div className="flex h-10 items-center gap-2 rounded-full bg-white px-4 shadow-lg">
                    <span className="relative flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#F15A24] opacity-60" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#F15A24]" />
                    </span>
                    <span className="text-xs font-semibold text-[#12334A]">
                        Trip in progress
                    </span>
                </div>

                <Link
                    to="/captain-home"
                    aria-label="Go to captain home"
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#12334A] shadow-lg transition-all duration-200 hover:bg-[#F15A24] hover:text-white active:scale-95"
                >
                    <i className="text-xl ri-home-5-line"></i>
                </Link>

            </div>
        </div>


        {/* RIDE CARD
            mobile: bottom sheet | laptop: floating card on the left */}
        <div className="absolute inset-x-0 bottom-0 z-20 lg:inset-x-auto lg:bottom-6 lg:left-6 lg:w-[26rem]">

            <div className="max-h-[70dvh] overflow-y-auto rounded-t-[28px] bg-white px-4 pb-6 pt-3 shadow-[0_-10px_40px_rgba(0,0,0,0.2)] sm:px-6 lg:rounded-3xl lg:shadow-2xl">

                <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-gray-300 lg:hidden" />

                {/* PASSENGER + FARE CARD */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#12334A] to-[#1d4e6e] p-4 text-white shadow-lg">

                    <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[#F15A24]/20" />
                    <div className="absolute -bottom-10 -left-6 h-24 w-24 rounded-full bg-white/5" />

                    <div className="relative flex items-center justify-between gap-3">

                        <div className="flex min-w-0 items-center gap-3">

                            {/* PROFILE IMAGE */}
                            <div className="relative shrink-0">

                                <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-white text-xl font-extrabold text-[#12334A] ring-4 ring-[#F15A24] ring-offset-2 ring-offset-[#12334A]">

                                    <span>
                                        {String(rideData?.user?.fullname?.firstname || 'P')
                                            .charAt(0)
                                            .toUpperCase()}
                                    </span>

                                    {(rideData?.user?.profileImage ||
                                        rideData?.user?.profilePhoto ||
                                        rideData?.user?.avatar ||
                                        rideData?.user?.image ||
                                        rideData?.user?.photo) && (
                                        <img
                                            src={
                                                rideData?.user?.profileImage ||
                                                rideData?.user?.profilePhoto ||
                                                rideData?.user?.avatar ||
                                                rideData?.user?.image ||
                                                rideData?.user?.photo
                                            }
                                            alt={rideData?.user?.fullname?.firstname || 'Passenger'}
                                            className="absolute inset-0 h-full w-full object-cover"
                                            onError={e => {
                                                e.currentTarget.style.display = 'none'
                                            }}
                                        />
                                    )}

                                </div>

                                <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#12334A] bg-[#F15A24] text-[10px] text-white">
                                    <i className="ri-user-3-fill"></i>
                                </div>

                            </div>

                            <div className="min-w-0">
                                <p className="text-xs uppercase tracking-wide text-white/60">
                                    Passenger
                                </p>
                                <h2 className="truncate text-lg font-extrabold capitalize">
                                    {rideData?.user?.fullname?.firstname || 'Passenger'}
                                </h2>
                            </div>

                        </div>

                        <div className="shrink-0 text-right">
                            <p className="text-xs text-white/70">Fare</p>
                            <h2 className="text-2xl font-extrabold">
                                ₹{rideData?.fare ?? 0}
                            </h2>
                        </div>

                    </div>

                    {/* chips */}
                    <div className="relative mt-4 flex items-center gap-2">

                        {distanceKm && (
                            <div className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
                                <i className="ri-route-line text-[#F15A24]"></i>
                                {distanceKm} km trip
                            </div>
                        )}

                        <div className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
                            <i className="ri-money-rupee-circle-line text-[#F15A24]"></i>
                            Cash
                        </div>

                    </div>
                </div>


                {/* ROUTE CARD */}
                <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">

                    <div className="flex gap-4">

                        {/* timeline */}
                        <div className="flex flex-col items-center pt-1">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#12334A]/10 text-[#12334A]">
                                <i className="ri-map-pin-user-fill text-sm"></i>
                            </span>
                            <span className="my-1 w-px flex-1 border-l-2 border-dashed border-gray-300" />
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#F15A24]/10 text-[#F15A24]">
                                <i className="ri-map-pin-2-fill text-sm"></i>
                            </span>
                        </div>

                        {/* addresses */}
                        <div className="min-w-0 flex-1 space-y-4">

                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                                    Pickup
                                </p>
                                <p className="mt-0.5 break-words text-sm font-medium text-[#12334A]">
                                    {rideData?.pickup || 'Pickup location'}
                                </p>
                            </div>

                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                                    Destination
                                </p>
                                <p className="mt-0.5 break-words text-sm font-medium text-[#12334A]">
                                    {rideData?.destination || 'Destination location'}
                                </p>
                            </div>

                        </div>

                    </div>
                </div>


                {/* COMPLETE RIDE */}
                <button
                    type="button"
                    onClick={() => setFinishRidePanel(true)}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#F15A24] p-4 text-base font-bold text-white shadow-lg shadow-[#F15A24]/30 transition-all duration-200 hover:bg-[#d94d1c] active:scale-[0.98]"
                >
                    Complete ride
                    <i className="ri-check-double-line text-xl"></i>
                </button>

            </div>

        </div>


        {/* FINISH RIDE
            Initial position is inline (not the Tailwind translate-y-full
            class) so GSAP's transform never clashes with Tailwind v4. */}
        <div
            ref={finishRidePanelRef}
            style={{ transform: 'translateY(100%)' }}
            className="fixed bottom-0 left-0 right-0 z-[100] max-h-[90vh] overflow-y-auto rounded-t-[28px] bg-white px-4 py-6 shadow-2xl sm:px-6"
        >
            <FinishRide
                ride={rideData}
                setFinishRidePanel={setFinishRidePanel}
            />
        </div>

    </div>
)
}

export default CaptainRiding