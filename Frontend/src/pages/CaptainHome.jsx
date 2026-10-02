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

const LOCATION_HEARTBEAT_MS = 15000

const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json'
})

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

    const [otp, setOtp] = useState('')
    const [verifyingOtp, setVerifyingOtp] = useState(false)

    const [online, setOnline] =
        useState(captain?.status === 'active')

    // separate loaders so one action does not disable the other
    const [loading, setLoading] = useState(false)
    const [confirming, setConfirming] = useState(false)

    const ridePopupPanelRef = useRef(null)
    const confirmRidePopupPanelRef = useRef(null)

    const locationWatchIdRef = useRef(null)
    const heartbeatRef = useRef(null)
    const lastPositionRef = useRef(null)

    // lets the socket handler read the latest value without re-subscribing
    const confirmOpenRef = useRef(false)

    useEffect(() => {
        confirmOpenRef.current = confirmRidePopupPanel
    }, [confirmRidePopupPanel])

    /* ================= CAPTAIN STATUS ================= */

    useEffect(() => {
        if (captain) {
            setOnline(captain.status === 'active')
        }
    }, [captain])

    /* ================= LOCATION TRACKING ================= */

    const sendLocation = () => {

        if (!socket || !captain?._id || !lastPositionRef.current) return
        
        socket.emit('update-location-captain', {
            userId: captain._id,
            location: lastPositionRef.current   // { ltd, lng }
        })
    }

    /* ================= SOCKET JOIN ================= */

    useEffect(() => {

        if (!socket || !captain?._id) return

        const joinCaptain = () => {

            console.log('Captain socket connected:', socket.id)

            // backend saves socket.id on this captain -> needed for "new-ride".
            // We wait for the ack: the server only accepts location updates
            // AFTER join finished, so the first (cached) GPS fix used to be
            // rejected with "Join as a captain first".
            socket.emit(
                'join',
                {
                    userId: captain._id,
                    userType: 'captain'
                },
                (res) => {

                    if (res?.ok) {
                        sendLocation()   // join is saved, server accepts it now
                    } else {
                        console.error('Join failed:', res?.message)
                    }
                }
            )
        }

        if (socket.connected) {
            joinCaptain()
        }

        // runs again after every reconnect (new socket.id)
        socket.on('connect', joinCaptain)

        return () => {
            socket.off('connect', joinCaptain)
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [socket, captain?._id])

    const startLocationTracking = () => {

        if (
            !socket ||
            !captain?._id ||
            !navigator.geolocation ||
            locationWatchIdRef.current !== null
        ) {
            return
        }

        const onSuccess = position => {

            const { latitude, longitude } = position.coords

            console.log('Captain location:', latitude, longitude)

            lastPositionRef.current = {
                ltd: latitude,
                lng: longitude
            }

            sendLocation()
        }

        const onError = error => {
            // code 1 = permission denied (or http:// on a phone, geolocation needs https)
            console.error('Location error:', error.code, error.message)
        }

        // 1) quick first fix (low accuracy) so the backend has a location immediately
        navigator.geolocation.getCurrentPosition(
            onSuccess,
            onError,
            {
                enableHighAccuracy: false,
                maximumAge: 60000,
                timeout: 15000
            }
        )

        // 2) continuous high accuracy updates
        locationWatchIdRef.current =
            navigator.geolocation.watchPosition(
                onSuccess,
                onError,
                {
                    enableHighAccuracy: true,
                    maximumAge: 5000,
                    timeout: 30000
                }
            )

        // 3) heartbeat: watchPosition does not fire while standing still
        heartbeatRef.current =
            setInterval(sendLocation, LOCATION_HEARTBEAT_MS)
    }

    const stopLocationTracking = () => {

        if (locationWatchIdRef.current !== null) {
            navigator.geolocation.clearWatch(
                locationWatchIdRef.current
            )
            locationWatchIdRef.current = null
        }

        if (heartbeatRef.current !== null) {
            clearInterval(heartbeatRef.current)
            heartbeatRef.current = null
        }
    }

    /* ================= ONLINE / OFFLINE ================= */

    const toggleOnlineStatus = async () => {

        if (loading) return

        const token = localStorage.getItem('token')

        if (!token) {
            console.error('Token not found')
            return
        }

        const newStatus = online ? 'inactive' : 'active'

        setLoading(true)

        try {

            const response = await axios.patch(
                `${BASE_URL}/captains/status`,
                { status: newStatus },
                { headers: authHeaders() }
            )

            if (response.status === 200) {

                const updatedCaptain = response.data.captain

                // set UI first, so a missing context helper cannot block it
                setOnline(updatedCaptain.status === 'active')

                updateCaptain?.(updatedCaptain)
            }

        } catch (error) {

            console.error(
                'STATUS ERROR:',
                error.response?.data || error.message
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

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [socket, captain?._id, online])

    /* ================= NEW RIDE ================= */

    useEffect(() => {

        if (!socket) return

        const handleNewRide = data => {

            console.log('NEW RIDE RECEIVED:', data)

            // backend may send the ride directly or wrapped in { ride }
            const incoming = data?.ride || data

            if (!incoming) return

            // do not replace the ride while captain is already entering OTP
            if (confirmOpenRef.current) return

            setRide(incoming)
            setRidePopupPanel(true)
        }

        socket.on('new-ride', handleNewRide)

        return () => {
            socket.off('new-ride', handleNewRide)
        }

    }, [socket])

    /* ================= CONFIRM RIDE ================= */

    const confirmRide = async () => {

        if (confirming) return

        // the ride object from Mongo has `_id`, not `rideId`
        const rideId = ride?._id || ride?.rideId

        if (!rideId) {
            console.error('Ride ID missing', ride)
            return
        }

        if (!localStorage.getItem('token')) {
            console.error('Captain token missing')
            return
        }

        try {

            setConfirming(true)

            const response = await axios.post(
                `${BASE_URL}/rides/confirm`,
                { rideId },
                { headers: authHeaders() }
            )

            console.log('RIDE CONFIRMED:', response.data)

            if (response.status === 200) {

                const confirmedRide =
                    response.data.ride || response.data

                setRide(prev => ({
                    ...prev,
                    ...confirmedRide,
                    // keep the populated user if backend returned only an id
                    user:
                        confirmedRide?.user &&
                        typeof confirmedRide.user === 'object'
                            ? confirmedRide.user
                            : prev?.user
                }))

                setRidePopupPanel(false)
                setConfirmRidePopupPanel(true)
            }

        } catch (error) {

            console.error(
                'CONFIRM RIDE ERROR:',
                error.response?.data || error.message
            )

            const status = error.response?.status

            if (status === 400 || status === 404 || status === 409) {

                alert(
                    error.response?.data?.message ||
                    'Ride is no longer available'
                )

                setRidePopupPanel(false)
                setRide(null)

            } else {

                alert('Unable to confirm ride. Please try again.')
            }

        } finally {

            setConfirming(false)
        }
    }

    /* ================= VERIFY OTP / START RIDE ================= */

    const verifyOtp = async () => {

        const rideId = ride?._id || ride?.rideId

        if (!rideId || otp.length !== 6 || verifyingOtp) return

        if (!localStorage.getItem('token')) {
            console.error('Captain token missing')
            return
        }

        try {

            setVerifyingOtp(true)

            // backend startRide reads req.query -> GET + params
            const response = await axios.get(
                `${BASE_URL}/rides/start-ride`,
                {
                    params: { rideId, otp },
                    headers: authHeaders()
                }
            )

            if (response.status === 200) {

                setConfirmRidePopupPanel(false)
                setRidePopupPanel(false)
                setOtp('')

                sessionStorage.setItem('activeRide', JSON.stringify(response.data))

                navigate('/captain-riding', {
                    state: { ride: response.data }
                })
            }

        } catch (error) {

            console.error(
                'VERIFY OTP ERROR:',
                error.response?.data || error.message
            )

            alert(
                error.response?.data?.message || 'Invalid OTP'
            )

        } finally {

            setVerifyingOtp(false)
        }
    }

    /* ================= POPUP ANIMATIONS ================= */

    useGSAP(() => {

        gsap.to(ridePopupPanelRef.current, {
            y: ridePopupPanel ? 0 : '100%',
            duration: 0.4,
            ease: ridePopupPanel ? 'power3.out' : 'power3.in'
        })

    }, [ridePopupPanel])

    useGSAP(() => {

        gsap.to(confirmRidePopupPanelRef.current, {
            y: confirmRidePopupPanel ? 0 : '100%',
            duration: 0.4,
            ease: confirmRidePopupPanel ? 'power3.out' : 'power3.in'
        })

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
                                    online ? 'bg-green-500' : 'bg-gray-400'
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
                                online ? 'bg-black' : 'bg-gray-300'
                            } ${
                                loading
                                    ? 'opacity-50 cursor-not-allowed'
                                    : 'cursor-pointer'
                            }`}
                        >
                            <div
                                className={`w-6 h-6 bg-white rounded-full transition-transform ${
                                    online ? 'translate-x-6' : 'translate-x-0'
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

            {/* RIDE REQUEST
                Initial position is inline (not a Tailwind class) so GSAP's
                transform and Tailwind v4's `translate` property never clash. */}

            <div
                ref={ridePopupPanelRef}
                style={{ transform: 'translateY(100%)' }}
                className='fixed left-0 right-0 bottom-0 z-50 bg-white rounded-t-[28px] shadow-2xl px-4 sm:px-6 py-6 max-h-[90vh] overflow-y-auto'
            >
                <RidePopUp
                    ride={ride}
                    confirming={confirming}
                    setRidePopupPanel={setRidePopupPanel}
                    setConfirmRidePopupPanel={setConfirmRidePopupPanel}
                    confirmRide={confirmRide}
                />
            </div>

            {/* CONFIRM RIDE (OTP) */}

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
                    setConfirmRidePopupPanel={setConfirmRidePopupPanel}
                    setRidePopupPanel={setRidePopupPanel}
                />
            </div>

        </div>
    )
}

export default CaptainHome