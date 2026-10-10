import React, {
    useEffect,
    useRef,
    useState,
    useContext,
    useCallback
} from 'react'

import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import logo from '../assets/logo.png'

import CaptainDetails from '../components/CaptainDetails'
import RidePopUp from '../components/RidePopUp'
import ConfirmRidePopUp from '../components/ConfirmRidePopUp'
import LiveTracking from '../components/LiveTracking'
import CaptainStats from '../components/CaptainStats'
import RideHistory from '../components/RideHistory'

import { CaptainDataContext } from '../context/CapatainContext'
import { SocketContext } from '../context/SocketContext'

const BASE_URL =
    import.meta.env.VITE_API_URL ||
    'http://localhost:3000'

// captain location goes to the server once every 5 seconds
// (server -> Kafka -> bulk write in captain-service)
const LOCATION_SEND_MS = 5000

// false -> after "Accept" the captain sees the live map first and opens the
//          OTP popup with the "Reached pickup" button.
// true  -> the OTP popup opens right after "Accept" (old behaviour), the live
//          map is visible behind it and after closing it.
const OPEN_OTP_AFTER_CONFIRM = false

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

    // live tracking: opens after this captain confirmed a ride
    const [showLiveTracking, setShowLiveTracking] = useState(false)

    const [otp, setOtp] = useState('')
    const [verifyingOtp, setVerifyingOtp] = useState(false)

    const [online, setOnline] =
        useState(captain?.status === 'active')

    // separate loaders so one action does not disable the other
    const [loading, setLoading] = useState(false)
    const [confirming, setConfirming] = useState(false)
    const [cancelling, setCancelling] = useState(false)

    // bottom sheet: compact (map visible) / expanded (more details)
    const [expanded, setExpanded] = useState(false)

    // past rides sheet
    const [historyOpen, setHistoryOpen] = useState(false)

    const locationWatchIdRef = useRef(null)
    const heartbeatRef = useRef(null)
    const lastPositionRef = useRef(null)

    // time of the last location sent to the server (for the 5 sec throttle)
    const lastSentRef = useRef(0)

    // "<rideId>:<status>" of the last ride we restored -> same state is not applied twice
    const lastRestoredRef = useRef('')

    // lets the socket handler read the latest value without re-subscribing.
    // true while the captain is entering the OTP OR is already tracking an
    // accepted ride -> a new "new-ride" must not replace the current ride.
    const confirmOpenRef = useRef(false)

    useEffect(() => {
        confirmOpenRef.current =
            confirmRidePopupPanel || showLiveTracking
    }, [confirmRidePopupPanel, showLiveTracking])

    /* ================= CAPTAIN STATUS ================= */

    useEffect(() => {
        if (captain) {
            setOnline(captain.status === 'active')
        }
    }, [captain])

    /* ================= RESTORE RUNNING RIDE =================
        Asks the server for the captain's running ride and puts the screen back
        into the right state. Works after the app was closed, the phone
        restarted or the socket missed an event.

        accepted -> live map + "Reached pickup" button (OTP popup if enabled)
        ongoing  -> /captain-riding page
    */

    const restoreRide = useCallback(async (initial = false) => {

        try {

            const { data } = await axios.get(
                `${BASE_URL}/rides/captain/active`,
                { headers: authHeaders() }
            )

            const running = data?.ride

            // null -> server confirmed: no running ride
            if (!running) return null

            const key = `${running._id}:${running.status}`

            if (lastRestoredRef.current === key) return running

            lastRestoredRef.current = key

            if (running.status === 'ongoing') {

                sessionStorage.setItem(
                    'activeRide',
                    JSON.stringify(running)
                )

                navigate('/captain-riding', {
                    state: { ride: running }
                })

                return running
            }

            if (running.status === 'accepted') {

                // keep the passenger profile we already have if the server
                // could only send the user id this time
                setRide(prev => {

                    if (prev?._id !== running._id) return running

                    return {
                        ...prev,
                        ...running,
                        user:
                            running.user && typeof running.user === 'object'
                                ? running.user
                                : prev.user
                    }
                })

                setRidePopupPanel(false)
                setShowLiveTracking(true)
                setExpanded(false)

                // only on first load: never close an OTP popup the captain
                // is already using
                if (initial) {
                    setConfirmRidePopupPanel(OPEN_OTP_AFTER_CONFIRM)
                }
            }

            return running

        } catch (error) {

            console.error(
                'RESTORE RIDE ERROR:',
                error.response?.data || error.message
            )
        }

    }, [navigate])

    // first load
    useEffect(() => {

        restoreRide(true)

    }, [restoreRide])

    // app comes back to the foreground / socket reconnects
    useEffect(() => {

        const handleVisible = () => {

            if (document.visibilityState === 'visible') {
                restoreRide(false)
            }
        }

        const handleReconnect = () => restoreRide(false)

        document.addEventListener('visibilitychange', handleVisible)
        socket?.io?.on('reconnect', handleReconnect)

        return () => {
            document.removeEventListener('visibilitychange', handleVisible)
            socket?.io?.off('reconnect', handleReconnect)
        }

    }, [socket, restoreRide])

    /* ================= CANCEL RIDE ================= */

    // back to the dashboard, forget everything about the old ride
    const resetRideState = () => {

        setRide(null)
        setShowLiveTracking(false)
        setConfirmRidePopupPanel(false)
        setRidePopupPanel(false)
        setOtp('')

        lastRestoredRef.current = ''
    }

    // captain can cancel only before the OTP is verified (status "accepted")
    const cancelRide = async () => {

        const rideId = ride?._id || ride?.rideId

        if (!rideId) {
            resetRideState()
            return
        }

        if (cancelling) return

        if (!window.confirm('Cancel this ride?')) return

        setCancelling(true)

        try {

            await axios.post(
                `${BASE_URL}/rides/captain/cancel`,
                { rideId },
                { headers: authHeaders() }
            )

            resetRideState()

        } catch (error) {

            console.error(
                'CANCEL RIDE ERROR:',
                error.response?.data || error.message
            )

            // Ask the server what really happened:
            // null    -> ride is already cancelled (e.g. by the passenger) -> reset
            // ongoing -> ride already started -> screen moves to the riding page
            const active = await restoreRide(false)

            if (active === null) {
                resetRideState()
                return
            }

            alert(
                error.response?.data?.message ||
                'Unable to cancel the ride.'
            )

        } finally {

            setCancelling(false)
        }
    }

    // the passenger cancelled the ride
    useEffect(() => {

        if (!socket) return

        const handleCancelled = data => {

            const currentId = ride?._id || ride?.rideId

            if (
                data?.rideId &&
                currentId &&
                String(data.rideId) !== String(currentId)
            ) {
                return
            }

            resetRideState()

            alert('The passenger cancelled the ride.')
        }

        socket.on('ride-cancelled', handleCancelled)

        return () => {
            socket.off('ride-cancelled', handleCancelled)
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [socket, ride?._id, ride?.rideId])

    /* ================= LOCATION TRACKING ================= */

    // GPS can fire many times per second, but the server gets one update
    // every 5 seconds. force = true skips the throttle (after join / accept).
    const sendLocation = (force = false) => {

        if (!socket || !captain?._id || !lastPositionRef.current) return

        const now = Date.now()

        if (!force && now - lastSentRef.current < LOCATION_SEND_MS - 500) {
            return
        }

        lastSentRef.current = now

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
                        sendLocation(true)   // join is saved, server accepts it now
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

        // 2) continuous high accuracy updates (throttled inside sendLocation)
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

        // 3) every 5 sec: watchPosition does not fire while standing still
        heartbeatRef.current =
            setInterval(() => sendLocation(), LOCATION_SEND_MS)
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

    /* ================= AUTO LOCATION =================
        GPS keeps running while online OR while a ride is being tracked,
        so the user keeps receiving the captain position during the ride. */

    useEffect(() => {

        if (!socket || !captain?._id) return

        if (online || showLiveTracking) {
            startLocationTracking()
        } else {
            stopLocationTracking()
        }

        return () => {
            stopLocationTracking()
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [socket, captain?._id, online, showLiveTracking])

    /* ================= NEW RIDE ================= */

    useEffect(() => {

        if (!socket) return

        const handleNewRide = data => {

            console.log('NEW RIDE RECEIVED:', data)

            // backend may send the ride directly or wrapped in { ride }
            const incoming = data?.ride || data

            if (!incoming) return

            // do not replace the ride while captain is entering OTP
            // or already tracking an accepted ride
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

                console.log('✅ CONFIRMED RIDE:', confirmedRide)
                console.log('👤 CONFIRMED USER:', confirmedRide?.user)

                setRide(confirmedRide)

                setRidePopupPanel(false)

                setShowLiveTracking(true)
                setExpanded(false)

                setConfirmRidePopupPanel(OPEN_OTP_AFTER_CONFIRM)

                sendLocation(true)
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

            const response = await axios.get(
                `${BASE_URL}/rides/start-ride`,
                {
                    params: {
                        rideId,
                        otp
                    },
                    headers: authHeaders()
                }
            )

            if (response.status === 200) {

                /*
                * IMPORTANT:
                * /start-ride may return only user ObjectId.
                * We already have the populated user from /rides/confirm.
                * So preserve ride.user from CaptainHome state.
                */

                const startedRide = {
                    ...response.data,

                    user:
                        response.data?.user &&
                        typeof response.data.user === 'object'
                            ? response.data.user
                            : ride?.user
                }

                console.log('🚕 STARTED RIDE:', startedRide)
                console.log('👤 PASSENGER:', startedRide?.user)

                setConfirmRidePopupPanel(false)
                setRidePopupPanel(false)
                setShowLiveTracking(false)
                setOtp('')

                sessionStorage.setItem(
                    'activeRide',
                    JSON.stringify(startedRide)
                )

                navigate('/captain-riding', {
                    state: {
                        ride: startedRide
                    }
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

    const passengerName =
        ride?.user?.fullname?.firstname || 'Passenger'

    const roundButton =
        'pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full ' +
        'bg-white text-[#12334A] shadow-lg transition-all duration-200 ' +
        'hover:bg-[#F15A24] hover:text-white active:scale-95 sm:h-12 sm:w-12'

    return (

    <div className="relative h-[100dvh] w-full overflow-hidden bg-gray-100">

        {/* =========================================================
            LIVE MAP BACKGROUND
        ========================================================== */}
        <div className="absolute inset-0 z-0">

            <LiveTracking
                role="captain"
                tracking={showLiveTracking && Boolean(ride)}
                pickupLocation={
                    ride?.pickupCoordinates
                        ? [
                            ride.pickupCoordinates.ltd,
                            ride.pickupCoordinates.lng
                        ]
                        : null
                }
                pickupAddress={ride?.pickup}
            />

        </div>


        {/* =========================================================
            TOP BAR
        ========================================================== */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 sm:pt-[max(1.5rem,env(safe-area-inset-top))]">

            {/* LOGO */}
            <div className="pointer-events-auto flex items-center gap-2">

                <img
                    src={logo}
                    alt="Saarthi"
                    className="h-9 w-9 object-contain sm:h-10 sm:w-10"
                />

                <h1 className="text-2xl font-extrabold leading-none tracking-tight text-[#12334A] sm:text-3xl">
                    Saarthi
                    <span className="text-[#F15A24]">.</span>
                </h1>

            </div>


            {/* PAST RIDES + LOGOUT */}
            <div className="flex items-center gap-3">

                <button
                    type="button"
                    onClick={() => setHistoryOpen(true)}
                    aria-label="Past rides"
                    className={roundButton}
                >
                    <i className="text-xl ri-history-line"></i>
                </button>

                <Link
                    to="/captain/logout"
                    aria-label="Logout"
                    className={roundButton}
                >
                    <i className="text-xl ri-logout-box-r-line"></i>
                </Link>

            </div>

        </div>


        {/* =========================================================
            BOTTOM DASHBOARD SHEET
        ========================================================== */}
        <div className="absolute inset-x-0 bottom-0 z-20">

            <div
                className={`
                    flex
                    flex-col
                    overflow-hidden
                    rounded-t-[28px]
                    bg-white
                    shadow-[0_-10px_40px_rgba(0,0,0,0.15)]
                    transition-[max-height]
                    duration-300
                    ease-out
                    ${
                        expanded
                            ? 'max-h-[80dvh]'
                            : 'max-h-[44dvh]'
                    }
                `}
            >

                {/* =================================================
                    DRAG / EXPAND BUTTON
                ================================================== */}
                <button
                    type="button"
                    onClick={() => setExpanded(v => !v)}
                    aria-label={
                        expanded
                            ? 'Collapse dashboard'
                            : 'Show full dashboard'
                    }
                    aria-expanded={expanded}
                    className="group relative flex w-full shrink-0 items-center justify-center pb-2 pt-2 active:scale-95"
                >

                    {/* HANDLE */}
                    <span className="absolute top-2 h-1 w-12 rounded-full bg-gray-300 transition-colors duration-200 group-hover:bg-[#F15A24]/50" />

                    {/* ARROW */}
                    <span className="mt-2 flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-[#12334A] shadow-md transition-all duration-300 group-hover:border-[#F15A24]/40 group-hover:text-[#F15A24] group-active:scale-90">

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


                {/* =================================================
                    DASHBOARD CONTENT
                ================================================== */}
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 sm:px-8">

                    {/* =================================================
                        HEADING
                    ================================================== */}
                    <div className="mb-4 flex items-center gap-3">

                        <span className="h-7 w-2 rounded-full bg-[#F15A24]" />

                        <h2 className="text-2xl font-extrabold text-[#12334A] sm:text-3xl">
                            Captain dashboard
                        </h2>

                    </div>


                    {/* =================================================
                        ACTIVE RIDE
                    ================================================== */}
                    {showLiveTracking && ride && (

                        <div className="mb-3 rounded-xl bg-[#F15A24]/10 p-4 ring-1 ring-[#F15A24]/30">

                            <div className="flex items-start justify-between gap-3">

                                <div className="min-w-0">

                                    <p className="text-xs font-semibold uppercase tracking-wide text-[#F15A24]">
                                        Ride accepted
                                    </p>

                                    <h3 className="truncate font-semibold text-[#12334A]">
                                        {passengerName}
                                    </h3>

                                    <p className="mt-0.5 line-clamp-2 text-xs text-gray-600">
                                        {ride.pickup}
                                    </p>

                                </div>

                            </div>


                            {/* OTP BUTTON */}
                            <button
                                type="button"
                                onClick={() =>
                                    setConfirmRidePopupPanel(true)
                                }
                                className="mt-3 w-full rounded-xl bg-[#12334A] py-3 font-semibold text-white shadow-md shadow-[#12334A]/15 transition-all duration-300 hover:bg-[#F15A24] active:scale-[0.98]"
                            >
                                Reached pickup · Enter OTP
                            </button>


                            {/* CANCEL BUTTON */}
                            <button
                                type="button"
                                onClick={cancelRide}
                                disabled={cancelling}
                                className="mt-2 w-full rounded-xl border border-red-200 bg-white py-3 font-semibold text-red-600 transition-all hover:bg-red-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {cancelling ? 'Cancelling...' : 'Cancel ride'}
                            </button>

                        </div>

                    )}


                    {/* =================================================
                        MAIN DASHBOARD GRID
                    ================================================== */}
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">

                        {/* =================================================
                            ONLINE / OFFLINE
                        ================================================== */}
                        <div
                            className={`
                                flex
                                items-center
                                justify-between
                                gap-3
                                rounded-xl
                                px-4
                                py-3
                                transition-colors
                                duration-300
                                ${
                                    online
                                        ? 'bg-[#F15A24]/10 ring-1 ring-[#F15A24]/30'
                                        : 'bg-gray-100'
                                }
                            `}
                        >

                            <div className="flex min-w-0 items-center gap-3">

                                {/* ICON */}
                                <div
                                    className={`
                                        flex
                                        h-11
                                        w-11
                                        shrink-0
                                        items-center
                                        justify-center
                                        rounded-xl
                                        ${
                                            online
                                                ? 'bg-[#F15A24] text-white'
                                                : 'bg-white text-gray-400'
                                        }
                                    `}
                                >
                                    <i className="text-2xl ri-steering-2-line"></i>
                                </div>


                                {/* TEXT */}
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


                            {/* TOGGLE */}
                            <button
                                type="button"
                                onClick={toggleOnlineStatus}
                                disabled={loading}
                                role="switch"
                                aria-checked={online}
                                aria-label="Toggle online status"
                                className={`
                                    h-8
                                    w-14
                                    shrink-0
                                    rounded-full
                                    p-1
                                    transition-colors
                                    duration-300
                                    ${
                                        online
                                            ? 'bg-[#12334A]'
                                            : 'bg-gray-300'
                                    }
                                    ${
                                        loading
                                            ? 'cursor-not-allowed opacity-50'
                                            : 'cursor-pointer'
                                    }
                                `}
                            >

                                <div
                                    className={`
                                        h-6
                                        w-6
                                        rounded-full
                                        bg-white
                                        shadow-sm
                                        transition-transform
                                        duration-300
                                        ${
                                            online
                                                ? 'translate-x-6'
                                                : 'translate-x-0'
                                        }
                                    `}
                                />

                            </button>

                        </div>


                        {/* =================================================
                            DYNAMIC CAPTAIN STATS
                            Trips
                            Today's Earnings
                            Total Earnings
                            Rating
                        ================================================== */}
                        <div className="md:col-span-2 lg:col-span-2">

                            <CaptainStats />

                        </div>

                    </div>


                    {/* =================================================
                        CAPTAIN DETAILS
                    ================================================== */}
                    <div className="mt-3">

                        <CaptainDetails />

                    </div>

                </div>

            </div>

        </div>


        {/* =========================================================
            DIM BACKDROP
        ========================================================== */}
        <div
            aria-hidden="true"
            className={`
                fixed
                inset-0
                z-40
                bg-black/30
                transition-opacity
                duration-300
                ${
                    ridePopupPanel || confirmRidePopupPanel
                        ? 'opacity-100'
                        : 'pointer-events-none opacity-0'
                }
            `}
        />


        {/* =========================================================
            RIDE REQUEST POPUP
        ========================================================== */}
        <div
            aria-hidden={!ridePopupPanel}
            className={`
                ${popupBase}
                z-50
                ${popupState(ridePopupPanel)}
            `}
        >

            <span className="mx-auto mt-3 h-1 w-12 shrink-0 rounded-full bg-gray-300" />

            <div className="overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-8">

                <RidePopUp
                    ride={ride}
                    confirming={confirming}
                    setRidePopupPanel={setRidePopupPanel}
                    setConfirmRidePopupPanel={
                        setConfirmRidePopupPanel
                    }
                    confirmRide={confirmRide}
                />

            </div>

        </div>


        {/* =========================================================
            CONFIRM RIDE / OTP POPUP
        ========================================================== */}
        <div
            aria-hidden={!confirmRidePopupPanel}
            className={`
                ${popupBase}
                z-[60]
                ${popupState(confirmRidePopupPanel)}
            `}
        >

            <span className="mx-auto mt-3 h-1 w-12 shrink-0 rounded-full bg-gray-300" />

            <div className="overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-8">

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


        {/* =========================================================
            PAST RIDES SHEET
        ========================================================== */}
        {historyOpen && (
            <RideHistory
                role="captain"
                onClose={() => setHistoryOpen(false)}
            />
        )}

    </div>

)
}

export default CaptainHome