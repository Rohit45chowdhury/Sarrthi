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
import LiveTracking from '../components/LiveTracking'

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

    // bottom sheet: compact (map visible) / expanded (more details)
    const [expanded, setExpanded] = useState(false)

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
            // AFTER join finished.
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

    /* ================= UI =================
        Same look as the user Home page:
        full screen map, plain logo top-left, round logout button top-right,
        white bottom sheet with an orange bar heading and grey rows.
        Works the same on mobile and laptop; on laptop the rows sit side by side.
    */

    const popupBase =
        'fixed inset-x-0 bottom-0 flex max-h-[88dvh] flex-col overflow-hidden ' +
        'rounded-t-[28px] bg-white shadow-2xl ' +
        'transition-[transform,visibility] duration-300 ease-out ' +
        'lg:mx-auto lg:max-w-xl'

    const popupState = open =>
        open
            ? 'visible translate-y-0'
            : 'invisible pointer-events-none translate-y-full'

    return (

    <div className="relative h-[100dvh] w-full overflow-hidden bg-gray-100">

        {/* ================= LIVE MAP BACKGROUND ================= */}
        <div className="absolute inset-0 z-0">
            <LiveTracking />
        </div>


        {/* ================= TOP BAR ================= */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 sm:pt-[max(1.5rem,env(safe-area-inset-top))]">

            {/* LOGO (same as Home: logo image + wordmark, no card) */}
            <div className="pointer-events-auto flex items-center gap-2">
                <img
                    src={logo}
                    alt="Saarthi"
                    className="h-9 w-9 object-contain sm:h-10 sm:w-10"
                />
                <h1 className="text-2xl font-extrabold leading-none tracking-tight text-[#12334A] sm:text-3xl">
                    Saarthi<span className="text-[#F15A24]">.</span>
                </h1>
            </div>

            {/* LOGOUT */}
            <Link
                to="/captain/logout"
                aria-label="Logout"
                className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#12334A] shadow-lg transition-all duration-200 hover:bg-[#F15A24] hover:text-white active:scale-95 sm:h-12 sm:w-12"
            >
                <i className="text-xl ri-logout-box-r-line"></i>
            </Link>

        </div>


        {/* ================= BOTTOM SHEET ================= */}
        <div className="absolute inset-x-0 bottom-0 z-20">

            <div
                className={`flex flex-col overflow-hidden rounded-t-[28px] bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.15)] transition-[max-height] duration-300 ease-out ${
                    expanded ? 'max-h-[80dvh]' : 'max-h-[44dvh]'
                }`}
            >

                
                {/* ================= DRAG / EXPAND BUTTON ================= */}
                <button
                    type="button"
                    onClick={() => setExpanded(v => !v)}
                    aria-label={
                        expanded
                            ? 'Collapse dashboard'
                            : 'Show full dashboard'
                    }
                    aria-expanded={expanded}
                    className="
                        group
                        relative
                        flex
                        w-full
                        shrink-0
                        items-center
                        justify-center
                        pb-2
                        pt-2
                        active:scale-95
                    "
                >
                    {/* small horizontal handle */}
                    <span
                        className="
                            absolute
                            top-2
                            h-1
                            w-12
                            rounded-full
                            bg-gray-300
                            transition-colors
                            duration-200
                            group-hover:bg-[#F15A24]/50
                        "
                    />

                    {/* arrow button */}
                    <span
                        className="
                            mt-2
                            flex
                            h-9
                            w-9
                            items-center
                            justify-center
                            rounded-full
                            border
                            border-gray-200
                            bg-white
                            text-[#12334A]
                            shadow-md
                            transition-all
                            duration-300
                            group-hover:border-[#F15A24]/40
                            group-hover:text-[#F15A24]
                            group-active:scale-90
                        "
                    >
                        <i
                            className={`
                                text-xl
                                transition-transform
                                duration-300
                                ${
                                    expanded
                                        ? 'ri-arrow-down-s-line'
                                        : 'ri-arrow-up-s-line'
                                }
                            `}
                        />
                    </span>
                </button>

                {/* min-h-0 so this area scrolls inside the flex column */}
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 sm:px-8">

                    {/* HEADING with orange bar (same as "Find a trip") */}
                    <div className="mb-4 flex items-center gap-3">
                        <span className="h-7 w-2 rounded-full bg-[#F15A24]" />
                        <h2 className="text-2xl font-extrabold text-[#12334A] sm:text-3xl">
                            Captain dashboard
                        </h2>
                    </div>

                    {/* rows: stacked on mobile, 2 columns on tablet, 3 on laptop */}
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">

                        {/* ONLINE / OFFLINE ROW (grey, like the input rows) */}
                        <div
                            className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 transition-colors duration-300 ${
                                online
                                    ? 'bg-[#F15A24]/10 ring-1 ring-[#F15A24]/30'
                                    : 'bg-gray-100'
                            }`}
                        >
                            <div className="flex min-w-0 items-center gap-3">
                                <div
                                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                                        online
                                            ? 'bg-[#F15A24] text-white'
                                            : 'bg-white text-gray-400'
                                    }`}
                                >
                                    <i className="text-2xl ri-steering-2-line"></i>
                                </div>

                                <div className="min-w-0">
                                    <h3 className="truncate font-semibold text-[#12334A]">
                                        {loading
                                            ? 'Updating status...'
                                            : online
                                                ? 'You are online'
                                                : 'You are offline'}
                                    </h3>
                                    <p className="truncate text-xs text-gray-500">
                                        {online
                                            ? 'Waiting for ride requests nearby'
                                            : 'Go online to start receiving rides'}
                                    </p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={toggleOnlineStatus}
                                disabled={loading}
                                role="switch"
                                aria-checked={online}
                                aria-label="Toggle online status"
                                className={`h-8 w-14 shrink-0 rounded-full p-1 transition-colors duration-300 ${
                                    online ? 'bg-[#12334A]' : 'bg-gray-300'
                                } ${
                                    loading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                                }`}
                            >
                                <div
                                    className={`h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-300 ${
                                        online ? 'translate-x-6' : 'translate-x-0'
                                    }`}
                                />
                            </button>
                        </div>


                        {/* EARNINGS ROW */}
                        <div
                            className="relative overflow-hidden rounded-xl px-4 py-3 text-white"
                            style={{
                                backgroundImage:
                                    'linear-gradient(135deg, #12334A, #1d4e6e)'
                            }}
                        >
                            <div className="absolute -right-6 -top-8 h-24 w-24 rounded-full bg-[#F15A24]/20" />

                            <div className="relative flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="text-xs text-white/70">Today's earnings</p>
                                    <h2 className="text-2xl font-extrabold">₹295.20</h2>
                                </div>

                                <div className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium">
                                    <i className="ri-arrow-up-line text-[#F15A24]"></i>
                                    12% vs yesterday
                                </div>
                            </div>

                            <div className="relative mt-2 h-1.5 w-full rounded-full bg-white/15">
                                <div className="h-1.5 w-[59%] rounded-full bg-[#F15A24]" />
                            </div>

                            <p className="relative mt-1.5 text-[11px] text-white/70">
                                Daily goal ₹500 · 59% done
                            </p>
                        </div>


                        {/* QUICK STATS ROW */}
                        <div className="grid grid-cols-3 gap-2 md:col-span-2 lg:col-span-1">

                            {[
                                { icon: 'ri-route-line', label: 'Trips', value: '8' },
                                { icon: 'ri-time-line', label: 'Online', value: '5.2h' },
                                { icon: 'ri-star-smile-line', label: 'Rating', value: '4.8' }
                            ].map(stat => (
                                <div
                                    key={stat.label}
                                    className="flex flex-col items-center justify-center rounded-xl bg-gray-100 px-2 py-3 text-center"
                                >
                                    <i className={`text-xl text-[#F15A24] ${stat.icon}`}></i>
                                    <h4 className="mt-1 text-lg font-bold leading-none text-[#12334A]">
                                        {stat.value}
                                    </h4>
                                    <p className="mt-1 text-xs text-gray-500">
                                        {stat.label}
                                    </p>
                                </div>
                            ))}

                        </div>

                    </div>


                    {/* CAPTAIN DETAILS */}
                    <div className="mt-3">
                        <CaptainDetails />
                    </div>

                </div>

            </div>

        </div>


        {/* ================= DIM BACKDROP (behind popups) ================= */}
        <div
            aria-hidden="true"
            className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 ${
                ridePopupPanel || confirmRidePopupPanel
                    ? 'opacity-100'
                    : 'pointer-events-none opacity-0'
            }`}
        />


        {/* ================= RIDE REQUEST POPUP ================= */}
        <div
            aria-hidden={!ridePopupPanel}
            className={`${popupBase} z-50 ${popupState(ridePopupPanel)}`}
        >
            <span className="mx-auto mt-3 h-1 w-12 shrink-0 rounded-full bg-gray-300" />
            <div className="overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-8">
                <RidePopUp
                    ride={ride}
                    confirming={confirming}
                    setRidePopupPanel={setRidePopupPanel}
                    setConfirmRidePopupPanel={setConfirmRidePopupPanel}
                    confirmRide={confirmRide}
                />
            </div>
        </div>


        {/* ================= CONFIRM RIDE - OTP POPUP ================= */}
        <div
            aria-hidden={!confirmRidePopupPanel}
            className={`${popupBase} z-[60] ${popupState(confirmRidePopupPanel)}`}
        >
            <span className="mx-auto mt-3 h-1 w-12 shrink-0 rounded-full bg-gray-300" />
            <div className="overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-8">
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

    </div>
    )
}

export default CaptainHome