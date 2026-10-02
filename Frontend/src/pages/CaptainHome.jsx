import React, {
    useEffect,
    useRef,
    useState,
    useContext
} from 'react'

import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import logo from '../assets/logo.png'

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

    <div className="h-[100dvh] w-full flex flex-col bg-[#F5F7FA] overflow-hidden relative">

        {/* ================= HEADER ================= */}
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-[#12334A] to-[#1d4e6e] px-4 pt-5 pb-12 sm:px-6">

            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#F15A24]/20 blur-2xl" />
            <div className="absolute -left-10 bottom-0 h-28 w-28 rounded-full bg-white/5" />

            <div className="relative flex items-center justify-between">

                {/* LOGO + BRAND */}
                <div className="flex items-center gap-3">

                    <div className="h-14 w-14 rounded-2xl bg-white p-1.5 shadow-lg flex items-center justify-center">
                        <img
                            src={logo}
                            alt="Saarthi"
                            className="h-full w-full object-contain"
                        />
                    </div>

                    <div>
                        <h1 className="text-2xl font-extrabold tracking-tight text-white leading-none">
                            Saarthi<span className="text-[#F15A24]">.</span>
                        </h1>
                        <p className="mt-1 text-xs text-white/70">
                            Captain Dashboard
                        </p>
                    </div>

                </div>

                {/* STATUS + LOGOUT */}
                <div className="flex items-center gap-2">

                    <div className="bg-white/10 backdrop-blur rounded-full px-3 h-10 flex items-center gap-2">
                        <span className="relative flex h-2.5 w-2.5">
                            {online && (
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F15A24] opacity-60" />
                            )}
                            <span
                                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                                    online ? "bg-[#F15A24]" : "bg-gray-400"
                                }`}
                            />
                        </span>
                        <span className="text-xs font-semibold text-white">
                            {online ? "Online" : "Offline"}
                        </span>
                    </div>

                    <Link
                        to="/captain/logout"
                        className="h-10 w-10 bg-white rounded-full shadow-md flex items-center justify-center text-[#12334A] transition-all duration-200 hover:bg-[#F15A24] hover:text-white active:scale-95"
                    >
                        <i className="text-xl ri-logout-box-r-line"></i>
                    </Link>

                </div>

            </div>
        </div>


        {/* ================= SCROLLABLE DASHBOARD ================= */}
        <div className="relative z-10 -mt-6 flex-1 overflow-y-auto rounded-t-[28px] bg-[#F5F7FA] px-4 pt-5 pb-8 sm:px-6">

            <div className="mx-auto w-full max-w-xl space-y-4">

                {/* ONLINE / OFFLINE TOGGLE */}
                <div
                    className={`rounded-2xl p-4 shadow-sm transition-colors duration-300 ${
                        online
                            ? "bg-[#F15A24]/10 border border-[#F15A24]/30"
                            : "bg-white border border-gray-100"
                    }`}
                >
                    <div className="flex items-center justify-between gap-3">

                        <div className="flex items-center gap-3 min-w-0">
                            <div
                                className={`h-11 w-11 shrink-0 rounded-xl flex items-center justify-center ${
                                    online
                                        ? "bg-[#F15A24] text-white"
                                        : "bg-gray-100 text-gray-400"
                                }`}
                            >
                                <i className="text-2xl ri-steering-2-line"></i>
                            </div>

                            <div className="min-w-0">
                                <h3 className="font-semibold text-[#12334A] truncate">
                                    {loading
                                        ? "Updating status..."
                                        : online
                                            ? "You are online"
                                            : "You are offline"}
                                </h3>
                                <p className="text-xs text-gray-500 truncate">
                                    {online
                                        ? "Waiting for ride requests nearby"
                                        : "Go online to start receiving rides"}
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={toggleOnlineStatus}
                            disabled={loading}
                            className={`w-14 h-8 shrink-0 rounded-full p-1 transition-all duration-300 ${
                                online ? "bg-[#12334A]" : "bg-gray-300"
                            } ${
                                loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                            }`}
                        >
                            <div
                                className={`w-6 h-6 bg-white rounded-full shadow-sm transition-transform duration-300 ${
                                    online ? "translate-x-6" : "translate-x-0"
                                }`}
                            />
                        </button>

                    </div>
                </div>


                {/* EARNINGS HERO */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#12334A] to-[#1d4e6e] p-5 text-white shadow-lg">

                    <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[#F15A24]/20" />
                    <div className="absolute -right-2 -bottom-10 h-24 w-24 rounded-full bg-white/5" />

                    <div className="relative flex items-start justify-between">
                        <div>
                            <p className="text-sm text-white/70">Today's earnings</p>
                            <h2 className="mt-1 text-3xl font-extrabold">₹295.20</h2>
                        </div>

                        <div className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
                            <i className="ri-arrow-up-line text-[#F15A24]"></i>
                            12% vs yesterday
                        </div>
                    </div>

                    <div className="relative mt-4 h-1.5 w-full rounded-full bg-white/15">
                        <div className="h-1.5 w-[59%] rounded-full bg-[#F15A24]" />
                    </div>

                    <p className="relative mt-2 text-xs text-white/70">
                        Daily goal ₹500 · 59% done
                    </p>
                </div>


                {/* QUICK STATS */}
                <div className="grid grid-cols-3 gap-3">

                    {[
                        { icon: "ri-route-line", label: "Trips", value: "8" },
                        { icon: "ri-time-line", label: "Online", value: "5.2h" },
                        { icon: "ri-star-smile-line", label: "Rating", value: "4.8" }
                    ].map(stat => (
                        <div
                            key={stat.label}
                            className="bg-white rounded-2xl p-3 shadow-sm text-center"
                        >
                            <div className="mx-auto mb-2 h-9 w-9 rounded-full bg-[#F15A24]/10 text-[#F15A24] flex items-center justify-center">
                                <i className={`text-lg ${stat.icon}`}></i>
                            </div>
                            <h4 className="text-lg font-bold text-[#12334A] leading-none">
                                {stat.value}
                            </h4>
                            <p className="mt-1 text-xs text-gray-500">
                                {stat.label}
                            </p>
                        </div>
                    ))}

                </div>


                {/* CAPTAIN DETAILS */}
                <CaptainDetails />

            </div>
        </div>


        {/* ================= RIDE REQUEST POPUP ================= */}
        <div
            ref={ridePopupPanelRef}
            style={{ transform: "translateY(100%)" }}
            className="fixed left-0 right-0 bottom-0 z-50 bg-white rounded-t-[28px] shadow-2xl px-4 sm:px-6 py-6 max-h-[90vh] overflow-y-auto border-t-4 border-[#F15A24]"
        >
            <RidePopUp
                ride={ride}
                confirming={confirming}
                setRidePopupPanel={setRidePopupPanel}
                setConfirmRidePopupPanel={setConfirmRidePopupPanel}
                confirmRide={confirmRide}
            />
        </div>


        {/* ================= CONFIRM RIDE - OTP POPUP ================= */}
        <div
            ref={confirmRidePopupPanelRef}
            style={{ transform: "translateY(100%)" }}
            className="fixed left-0 right-0 bottom-0 z-[60] bg-white rounded-t-[28px] shadow-2xl px-4 sm:px-6 py-6 h-[90vh] overflow-y-auto border-t-4 border-[#F15A24]"
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