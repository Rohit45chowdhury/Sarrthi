import React, {
    useEffect,
    useRef,
    useState,
    useContext
} from 'react'

import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'

import CaptainDetails from '../components/CaptainDetails'
import RidePopUp from '../components/RidePopUp'
import ConfirmRidePopUp from '../components/ConfirmRidePopUp'

import { useGSAP } from '@gsap/react'
import gsap from 'gsap'

import { CaptainDataContext } from '../context/CapatainContext'
import { SocketContext } from '../context/SocketContext'

const BASE_URL =
    import.meta.env.VITE_API_URL ||
    'http://localhost:3000'

const CaptainHome = () => {

    const navigate = useNavigate()

    const { captain, updateCaptain } =
        useContext(CaptainDataContext)

    const { socket } =
        useContext(SocketContext)

    const [ridePopupPanel, setRidePopupPanel] =
        useState(false)

    const [confirmRidePopupPanel, setConfirmRidePopupPanel] =
        useState(false)

    const [ride, setRide] = useState(null)

    // FIX 1: OTP state (ConfirmRidePopUp ko yeh props chahiye)
    const [otp, setOtp] = useState('')
    const [verifyingOtp, setVerifyingOtp] = useState(false)

    const [online, setOnline] =
        useState(captain?.status === 'active')

    const [loading, setLoading] =
        useState(false)

    const ridePopupPanelRef = useRef(null)
    const confirmRidePopupPanelRef = useRef(null)
    const locationWatchIdRef = useRef(null)

    /* ================= CAPTAIN STATUS ================= */

    useEffect(() => {
        if (captain) {
            setOnline(captain.status === 'active')
        }
    }, [captain])

    /* ================= SOCKET JOIN ================= */

    useEffect(() => {

        if (!socket || !captain?._id) return

        const joinCaptain = () => {

            console.log(
                'Captain socket connected:',
                socket.id
            )

            socket.emit('join', {
                userId: captain._id,
                userType: 'captain'
            })

        }

        if (socket.connected) {
            joinCaptain()
        }

        socket.on('connect', joinCaptain)

        return () => {
            socket.off('connect', joinCaptain)
        }

    }, [socket, captain?._id])

    /* ================= LOCATION TRACKING ================= */

    const startLocationTracking = () => {

        if (
            !socket ||
            !captain?._id ||
            !navigator.geolocation ||
            locationWatchIdRef.current !== null
        ) {
            return
        }

        locationWatchIdRef.current =
            navigator.geolocation.watchPosition(

                position => {

                    const {
                        latitude,
                        longitude
                    } = position.coords

                    console.log(
                        'Captain location:',
                        latitude,
                        longitude
                    )

                    socket.emit(
                        'update-location-captain',
                        {
                            userId: captain._id,
                            location: {
                                ltd: latitude,
                                lng: longitude
                            }
                        }
                    )
                },

                error => {
                    console.error(
                        'Location error:',
                        error.message
                    )
                },

                {
                    enableHighAccuracy: true,
                    maximumAge: 5000,
                    timeout: 10000
                }
            )
    }

    const stopLocationTracking = () => {

        if (
            locationWatchIdRef.current !== null
        ) {

            navigator.geolocation.clearWatch(
                locationWatchIdRef.current
            )

            locationWatchIdRef.current = null

        }
    }

    /* ================= ONLINE / OFFLINE ================= */

    const toggleOnlineStatus = async () => {

        if (loading) return

        const token =
            localStorage.getItem('token')

        if (!token) {
            console.error('Token not found')
            return
        }

        const newStatus =
            online ? 'inactive' : 'active'

        setLoading(true)

        try {

            const response = await axios.patch(
                `${BASE_URL}/captains/status`,
                {
                    status: newStatus
                },
                {
                    headers: {
                        Authorization:
                            `Bearer ${token}`,
                        'Content-Type':
                            'application/json'
                    }
                }
            )

            if (response.status === 200) {

                const updatedCaptain =
                    response.data.captain

                updateCaptain(updatedCaptain)

                setOnline(
                    updatedCaptain.status === 'active'
                )

            }

        } catch (error) {

            console.error(
                'STATUS ERROR:',
                error.response?.data ||
                error.message
            )

        } finally {

            setLoading(false)

        }
    }

    /* ================= AUTO LOCATION ================= */

    useEffect(() => {

        if (!socket || !captain?._id) return

        if (online) {
            startLocationTracking()
        } else {
            stopLocationTracking()
        }

        return () => {
            stopLocationTracking()
        }

    }, [
        socket,
        captain?._id,
        online
    ])

    /* ================= NEW RIDE ================= */

    useEffect(() => {

        if (!socket) return

        const handleNewRide = data => {

            console.log(
                'NEW RIDE RECEIVED:',
                data
            )

            setRide(data)
            setRidePopupPanel(true)

        }

        socket.on(
            'new-ride',
            handleNewRide
        )

        return () => {

            socket.off(
                'new-ride',
                handleNewRide
            )

        }

    }, [socket])

    /* ================= CONFIRM RIDE ================= */

    const confirmRide = async () => {

        if (!ride?.rideId) {

            console.error(
                'Ride ID missing'
            )

            return

        }

        const token =
            localStorage.getItem('token')

        if (!token) {

            console.error(
                'Captain token missing'
            )

            return

        }

        try {

            setLoading(true)

            const response = await axios.post(

                `${BASE_URL}/rides/confirm`,

                {
                    rideId: ride.rideId
                },

                {
                    headers: {
                        Authorization:
                            `Bearer ${token}`,
                        'Content-Type':
                            'application/json'
                    }
                }

            )

            console.log(
                'RIDE CONFIRMED:',
                response.data
            )

            if (response.status === 200) {

                // FIX 2: backend ride ko seedha return karta hai (response.data),
                // response.data.ride nahi. Purana distance bhi rakhte hain.
                const confirmedRide =
                    response.data.ride || response.data

                setRide(prev => ({
                    ...prev,
                    ...confirmedRide
                }))

                setRidePopupPanel(false)

                setConfirmRidePopupPanel(true)

            }

        } catch (error) {

            console.error(
                'CONFIRM RIDE ERROR:',
                error.response?.data ||
                error.message
            )

            if (
                error.response?.status === 400
            ) {

                alert(
                    error.response?.data?.message ||
                    'Ride is no longer available'
                )

                setRidePopupPanel(false)
                setRide(null)

            }

        } finally {

            setLoading(false)

        }
    }

    /* ================= VERIFY OTP / START RIDE ================= */

    // FIX 3: ConfirmRidePopUp ke liye verifyOtp function
    const verifyOtp = async () => {

        const rideId = ride?._id || ride?.rideId

        if (!rideId || otp.length !== 6) return

        const token =
            localStorage.getItem('token')

        if (!token) {

            console.error(
                'Captain token missing'
            )

            return

        }

        try {

            setVerifyingOtp(true)

            // Backend startRide req.query use karta hai, isliye GET + params
            const response = await axios.get(

                `${BASE_URL}/rides/start-ride`,

                {
                    params: {
                        rideId,
                        otp
                    },
                    headers: {
                        Authorization:
                            `Bearer ${token}`
                    }
                }

            )

            if (response.status === 200) {

                setConfirmRidePopupPanel(false)
                setRidePopupPanel(false)
                setOtp('')

                // Apna riding page ka route yahan daalo
                navigate('/captain-riding', {
                    state: { ride: response.data }
                })

            }

        } catch (error) {

            console.error(
                'VERIFY OTP ERROR:',
                error.response?.data ||
                error.message
            )

            alert(
                error.response?.data?.message ||
                'Invalid OTP'
            )

        } finally {

            setVerifyingOtp(false)

        }
    }

    /* ================= RIDE POPUP ANIMATION ================= */

    useGSAP(() => {

        if (!ridePopupPanel) {

            gsap.to(
                ridePopupPanelRef.current,
                {
                    y: '100%',
                    duration: 0.4,
                    ease: 'power3.in'
                }
            )

            return
        }

        gsap.to(
            ridePopupPanelRef.current,
            {
                y: 0,
                duration: 0.4,
                ease: 'power3.out'
            }
        )

    }, [ridePopupPanel])

    /* ================= CONFIRM POPUP ANIMATION ================= */

    useGSAP(() => {

        if (!confirmRidePopupPanel) {

            gsap.to(
                confirmRidePopupPanelRef.current,
                {
                    y: '100%',
                    duration: 0.4,
                    ease: 'power3.in'
                }
            )

            return
        }

        gsap.to(
            confirmRidePopupPanelRef.current,
            {
                y: 0,
                duration: 0.4,
                ease: 'power3.out'
            }
        )

    }, [confirmRidePopupPanel])

    /* ================= UI ================= */

    return (

        <div className='h-screen w-full overflow-hidden bg-gray-100 relative'>

            {/* TOP BAR */}

            <div className='absolute top-0 left-0 right-0 z-30 p-4 sm:p-6'>

                <div className='flex items-center justify-between'>

                    <div className='bg-white rounded-xl px-4 py-2 shadow-md'>

                        <h1 className='text-xl sm:text-2xl font-bold'>
                            Saarthi
                        </h1>

                    </div>

                    <Link
                        to='/captain/logout'
                        className='h-11 w-11 bg-white rounded-full shadow-md flex items-center justify-center'
                    >
                        <i className='text-xl ri-logout-box-r-line'></i>
                    </Link>

                </div>

            </div>

            {/* MAP */}

            <div className='absolute inset-0'>

                <img
                    src='https://thumbs.dreamstime.com/b/city-map-any-kind-digital-info-graphics-print-publication-vector-city-map-267879449.jpg'
                    alt='Map'
                    className='w-full h-full object-cover'
                />

            </div>

            {/* ONLINE STATUS */}

            <div className='absolute top-20 left-4 right-4 z-20'>

                <div className='bg-white rounded-2xl shadow-lg p-4'>

                    <div className='flex items-center justify-between'>

                        <div className='flex items-center gap-3'>

                            <div
                                className={`w-3 h-3 rounded-full ${
                                    online
                                        ? 'bg-green-500'
                                        : 'bg-gray-400'
                                }`}
                            />

                            <div>

                                <h3 className='font-semibold'>

                                    {loading
                                        ? 'Updating status...'
                                        : online
                                            ? 'You are online'
                                            : 'You are offline'}

                                </h3>

                                <p className='text-xs text-gray-500'>

                                    {online
                                        ? 'You can receive ride requests'
                                        : 'Go online to receive rides'}

                                </p>

                            </div>

                        </div>

                        <button
                            type='button'
                            onClick={toggleOnlineStatus}
                            disabled={loading}
                            className={`w-14 h-8 rounded-full p-1 transition ${
                                online
                                    ? 'bg-black'
                                    : 'bg-gray-300'
                            } ${
                                loading
                                    ? 'opacity-50 cursor-not-allowed'
                                    : 'cursor-pointer'
                            }`}
                        >

                            <div
                                className={`w-6 h-6 bg-white rounded-full transition-transform ${
                                    online
                                        ? 'translate-x-6'
                                        : 'translate-x-0'
                                }`}
                            />

                        </button>

                    </div>

                </div>

            </div>

            {/* DRIVER CARD */}

            <div className='absolute bottom-0 left-0 right-0 z-20'>

                <div className='bg-white rounded-t-[28px] shadow-2xl px-4 pt-4 pb-6 sm:px-6'>

                    <div className='w-12 h-1 bg-gray-300 rounded-full mx-auto mb-5' />

                    <div className='mb-5'>

                        <p className='text-sm text-gray-500'>
                            Today's earnings
                        </p>

                        <h2 className='text-2xl sm:text-3xl font-bold'>
                            ₹295.20
                        </h2>

                    </div>

                    <CaptainDetails />

                </div>

            </div>

            {/* RIDE REQUEST */}

            {/* FIX 4: translate-y-full class hata diya (Tailwind v4 + GSAP clash),
                ab inline style se initial position set hai */}
            <div
                ref={ridePopupPanelRef}
                style={{ transform: 'translateY(100%)' }}
                className='fixed left-0 right-0 bottom-0 z-50 bg-white rounded-t-[28px] shadow-2xl px-4 sm:px-6 py-6 max-h-[90vh] overflow-y-auto'
            >

                <RidePopUp
                    ride={ride}
                    setRidePopupPanel={
                        setRidePopupPanel
                    }
                    setConfirmRidePopupPanel={
                        setConfirmRidePopupPanel
                    }
                    confirmRide={confirmRide}
                />

            </div>

            {/* CONFIRM RIDE */}

            <div
                ref={confirmRidePopupPanelRef}
                style={{ transform: 'translateY(100%)' }}
                className='fixed left-0 right-0 bottom-0 z-[60] bg-white rounded-t-[28px] shadow-2xl px-4 sm:px-6 py-6 h-[90vh] overflow-y-auto'
            >

                <ConfirmRidePopUp
                    ride={ride}
                    otp={otp}
                    setOtp={setOtp}
                    verifyOtp={verifyOtp}
                    verifyingOtp={verifyingOtp}
                    setConfirmRidePopupPanel={
                        setConfirmRidePopupPanel
                    }
                    setRidePopupPanel={
                        setRidePopupPanel
                    }
                />

            </div>

        </div>

    )
}

export default CaptainHome