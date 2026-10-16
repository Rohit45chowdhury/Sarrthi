import React, {
    useRef,
    useState,
    useContext,
    useEffect,
    useCallback
} from 'react'

import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import axios from 'axios'
import { useNavigate, useLocation } from 'react-router-dom'

import LocationSearchPanel from '../components/LocationSearchPanel'
import VehiclePanel from '../components/VehiclePanel'
import ConfirmRide from '../components/ConfirmRide'
import LookingForDriver from '../components/LookingForDriver'
import WaitingForDriver from '../components/WaitingForDriver'
import LiveTracking from '../components/LiveTracking'
import RideHistory from '../components/RideHistory'

import { UserDataContext } from '../context/UserContext'
import { SocketContext } from '../context/SocketContext'

const BASE_URL =
    import.meta.env.VITE_API_URL ||
    'http://localhost:3000'

// how long we search for a driver before showing "No drivers available"
const DRIVER_SEARCH_TIMEOUT = 30000

// only these ride statuses may be restored on the Home screen
const RESTORABLE_STATUSES = ['pending', 'accepted', 'ongoing']

// backend stores "motorcycle", the frontend panels use the key "moto"
const FRONT_VEHICLE_KEY = {
    auto: 'auto',
    car: 'car',
    motorcycle: 'moto'
}

const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`
})

// Initial off-screen position is inline, NOT the Tailwind `translate-y-full`
// class (Tailwind v4 uses CSS `translate`, GSAP uses `transform`).
const hiddenSheetStyle = { transform: 'translateY(100%)' }

// Number(null) is 0 (would become 0,0 on the map) -> reject null/undefined/''
const toCoords = (lat, lng) => {

    if (
        lat === null || lat === undefined || lat === '' ||
        lng === null || lng === undefined || lng === ''
    ) {
        return null
    }

    const a = Number(lat)
    const b = Number(lng)

    return Number.isFinite(a) && Number.isFinite(b)
        ? [a, b]
        : null
}

const Home = () => {

    const { user } = useContext(UserDataContext)
    const { socket } = useContext(SocketContext)

    const navigate = useNavigate()
    const location = useLocation()

    // ================= STATES =================

    const [pickup, setPickup] = useState('')
    const [destination, setDestination] = useState('')

    const [panelOpen, setPanelOpen] = useState(false)
    const [activeField, setActiveField] = useState(null)

    const [suggestions, setSuggestions] = useState({
        pickup: [],
        destination: []
    })

    const [suggestionsLoading, setSuggestionsLoading] = useState(false)

    const [fare, setFare] = useState({})
    const [vehicleType, setVehicleType] = useState(null)
    const [findingTrip, setFindingTrip] = useState(false)

    const [ride, setRide] = useState(null)
    const [locating, setLocating] = useState(false)
    const [creatingRide, setCreatingRide] = useState(false)

    // true when nobody accepted the ride within DRIVER_SEARCH_TIMEOUT
    const [noDriverFound, setNoDriverFound] = useState(false)

    // live tracking: opens after the captain accepted the ride
    const [showLiveTracking, setShowLiveTracking] = useState(false)

    // [lat, lng] of the captain, updated through "captain-location-update"
    const [captainLocation, setCaptainLocation] = useState(null)

    // past rides sheet
    const [historyOpen, setHistoryOpen] = useState(false)

    // true until the first "active ride" check finished
    const [restoring, setRestoring] = useState(true)

    // true while a cancel request is running
    const [cancelling, setCancelling] = useState(false)

    // in-app "Cancel this ride?" dialog (replaces window.confirm)
    const [confirmCancelOpen, setConfirmCancelOpen] = useState(false)

    // in-app message (replaces alert)
    const [toast, setToast] = useState(null)

    // search | vehicle | confirm | looking | waiting
    const [activePanel, setActivePanel] = useState('search')

    const waitingForDriver = activePanel === 'waiting'

    const setVehiclePanel = open =>
        setActivePanel(open ? 'vehicle' : 'search')

    const setConfirmRidePanel = open =>
        setActivePanel(open ? 'confirm' : 'search')

    const setVehicleFound = open =>
        setActivePanel(open ? 'looking' : 'search')

    const setWaitingForDriver = open =>
        setActivePanel(open ? 'waiting' : 'search')

    // ================= REFS =================

    const refs = {
        vehicle: useRef(null),
        confirm: useRef(null),
        looking: useRef(null),
        waiting: useRef(null)
    }

    const panelRef = useRef(null)
    const panelCloseRef = useRef(null)

    const debounceRef = useRef({})

    const requestIdRef = useRef({
        pickup: 0,
        destination: 0
    })

    // "<rideId>:<status>" of the last ride we restored
    const lastRestoredRef = useRef('')

    const toastTimerRef = useRef(null)

    // ================= TOAST =================

    const showToast = useCallback((message, type = 'error') => {

        clearTimeout(toastTimerRef.current)

        setToast({ message, type })

        toastTimerRef.current = setTimeout(() => setToast(null), 3500)

    }, [])

    useEffect(() => {
        return () => clearTimeout(toastTimerRef.current)
    }, [])

    // ================= FINISHED RIDE GUARD =================
    // A ride that was just finished must never be restored again, even if the
    // server still reports it for a moment.

    const markRideFinished = id => {

        if (!id) return

        localStorage.setItem('finishedRideId', String(id))
    }

    const isFinishedRide = id => {

        const finished =
            location.state?.finishedRideId ||
            localStorage.getItem('finishedRideId')

        return Boolean(finished) && String(finished) === String(id)
    }

    // ================= USER SOCKET JOIN =================

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

        // runs again after every reconnect (new socket.id)
        socket.on('connect', joinUser)

        return () => {
            socket.off('connect', joinUser)
        }

    }, [socket, user?._id])

    // ================= RESTORE RUNNING RIDE =================

    // includePending = true only on the first load. Later checks restore only
    // accepted and ongoing rides.
    const restoreRide = useCallback(async (includePending = false) => {

        try {

            const { data } = await axios.get(
                `${BASE_URL}/rides/active`,
                { headers: authHeaders() }
            )

            const running = data?.ride

            // server confirmed: no running ride
            if (!running) return null

            // finished / cancelled / unknown status -> treat as no ride
            if (!RESTORABLE_STATUSES.includes(running.status)) return null

            // the ride the user just finished -> treat as no ride
            if (isFinishedRide(running._id)) return null

            if (running.status === 'pending' && !includePending) return running

            const key = `${running._id}:${running.status}`

            if (lastRestoredRef.current === key) return running

            lastRestoredRef.current = key

            // ride already started -> go to the riding page
            if (running.status === 'ongoing') {

                navigate('/riding', { state: { ride: running } })

                return running
            }

            const type =
                FRONT_VEHICLE_KEY[running.vehicleType] ||
                running.vehicleType ||
                null

            setRide(running)
            setPickup(running.pickup || '')
            setDestination(running.destination || '')
            setVehicleType(type)
            setFare(type ? { [type]: running.fare } : {})

            setNoDriverFound(false)

            if (running.status === 'accepted') {

                setCaptainLocation(null)
                setShowLiveTracking(true)

                setActivePanel('waiting')

            } else {

                // pending: still searching for a driver
                setShowLiveTracking(false)

                setActivePanel('looking')
            }

            return running

        } catch (error) {

            console.error(
                'RESTORE RIDE ERROR:',
                error.response?.data || error.message
            )
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [navigate])

    // first load
    useEffect(() => {

        restoreRide(true).finally(() => setRestoring(false))

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

    // ================= RESET =================

    // back to the search screen, forget everything about the old ride
    const resetRideState = () => {

        setRide(null)
        setShowLiveTracking(false)
        setCaptainLocation(null)
        setNoDriverFound(false)
        setConfirmCancelOpen(false)
        setActivePanel('search')

        lastRestoredRef.current = ''
    }

    // ================= CANCEL RIDE =================

    // pendingOnly -> cancel only if no captain accepted yet (used by "Try again")
    // silent      -> no message when it fails
    const cancelRide = async ({
        pendingOnly = false,
        silent = false
    } = {}) => {

        const rideId = ride?._id

        if (!rideId) {
            resetRideState()
            return true
        }

        if (cancelling) return false

        setCancelling(true)

        try {

            await axios.post(
                `${BASE_URL}/rides/cancel`,
                { rideId, pendingOnly },
                { headers: authHeaders() }
            )

            resetRideState()

            if (!silent) showToast('Ride cancelled.', 'info')

            return true

        } catch (error) {

            console.error(
                'CANCEL RIDE ERROR:',
                error.response?.data || error.message
            )

            // Ask the server what really happened
            const active = await restoreRide(false)

            if (active === null) {
                resetRideState()
                return true
            }

            setConfirmCancelOpen(false)

            if (!silent) {
                showToast(
                    error.response?.data?.message ||
                    'Unable to cancel the ride.'
                )
            }

            return false

        } finally {

            setCancelling(false)
        }
    }

    // "Try again" on the no-driver screen
    const retryRide = async () => {

        if (ride?._id) {

            const done = await cancelRide({
                pendingOnly: true,
                silent: true
            })

            if (!done) return
        }

        setConfirmRidePanel(true)
    }

    // the captain cancelled the ride
    useEffect(() => {

        if (!socket) return

        const handleCancelled = data => {

            if (
                data?.rideId &&
                ride?._id &&
                String(data.rideId) !== String(ride._id)
            ) {
                return
            }

            resetRideState()

            showToast('Your captain cancelled the ride. Please book again.')
        }

        socket.on('ride-cancelled', handleCancelled)

        return () => {
            socket.off('ride-cancelled', handleCancelled)
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [socket, ride?._id])

    // the ride was finished -> clear everything, never show waiting again
    useEffect(() => {

        if (!socket) return

        const handleEnded = data => {

            const endedId = data?._id || data?.ride?._id || data?.rideId || ride?._id

            markRideFinished(endedId)

            resetRideState()
        }

        socket.on('ride-ended', handleEnded)

        return () => {
            socket.off('ride-ended', handleEnded)
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [socket, ride?._id])

    // ================= RIDE ACCEPTED =================

    useEffect(() => {

        if (!socket) return

        const handleRideAccepted = data => {

            const acceptedRide = data?.ride || data

            if (!acceptedRide || typeof acceptedRide !== 'object') {
                console.error('Invalid ride-accepted payload:', data)
                return
            }

            // a brand new ride was accepted -> it is not the finished one
            if (acceptedRide._id && isFinishedRide(acceptedRide._id)) return

            setRide(acceptedRide)

            setCaptainLocation(null)
            setShowLiveTracking(true)

            setActivePanel('waiting')
        }

        socket.on('ride-accepted', handleRideAccepted)

        return () => {
            socket.off('ride-accepted', handleRideAccepted)
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [socket])

    // ================= NO DRIVER AVAILABLE =================

    useEffect(() => {

        setNoDriverFound(false)

        if (activePanel !== 'looking') return

        const timer = setTimeout(() => {
            setNoDriverFound(true)
        }, DRIVER_SEARCH_TIMEOUT)

        return () => clearTimeout(timer)

    }, [activePanel])

    useEffect(() => {

        if (!socket) return

        const handleNoCaptains = () => {
            setNoDriverFound(true)
        }

        socket.on('no-captains-available', handleNoCaptains)

        return () => {
            socket.off('no-captains-available', handleNoCaptains)
        }

    }, [socket])

    // ================= CAPTAIN LIVE LOCATION =================

    useEffect(() => {

        if (!socket) return

        const handleCaptainLocation = data => {

            const point = toCoords(
                data?.ltd ?? data?.location?.ltd,
                data?.lng ?? data?.location?.lng
            )

            if (!point) {
                console.error('Invalid captain location:', data)
                return
            }

            setCaptainLocation(prev =>
                prev && prev[0] === point[0] && prev[1] === point[1]
                    ? prev
                    : point
            )
        }

        socket.on('captain-location-update', handleCaptainLocation)

        return () => {
            socket.off('captain-location-update', handleCaptainLocation)
        }

    }, [socket])

    // ================= LOGOUT =================

    const handleLogout = () => {

        localStorage.removeItem('token')
        localStorage.removeItem('finishedRideId')

        resetRideState()

        navigate('/login')
    }

    // ================= CLEANUP =================

    useEffect(() => {

        return () => {
            Object.values(debounceRef.current).forEach(clearTimeout)
        }

    }, [])

    // ================= CURRENT LOCATION =================

    const reverseGeocode = async (lat, lon) => {

        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`,
            {
                headers: { 'Accept-Language': 'en' }
            }
        )

        if (!response.ok) {
            throw new Error('Reverse geocoding failed')
        }

        const data = await response.json()

        if (!data?.display_name) {
            throw new Error('No address found')
        }

        return data.display_name
    }

    const getPosition = options =>
        new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                resolve,
                reject,
                options
            )
        })

    const fetchCurrentLocation = async () => {

        if (!navigator.geolocation) {
            return showToast('Geolocation is not supported on this device.')
        }

        if (locating) return

        setLocating(true)

        try {

            let position

            try {

                position = await getPosition({
                    enableHighAccuracy: true,
                    timeout: 8000,
                    maximumAge: 0
                })

            } catch (error) {

                // 2 = unavailable, 3 = timeout -> retry with low accuracy
                if (error.code !== 2 && error.code !== 3) {
                    throw error
                }

                position = await getPosition({
                    enableHighAccuracy: false,
                    timeout: 15000,
                    maximumAge: 60000
                })
            }

            const { latitude, longitude } = position.coords

            const address = await reverseGeocode(latitude, longitude)

            setPickup(address)

            setSuggestions(s => ({ ...s, pickup: [] }))

            setActiveField('destination')
            setPanelOpen(true)

        } catch (error) {

            console.error('Location error:', error)

            showToast(
                error.code === 1
                    ? 'Location permission denied. Please allow location access.'
                    : 'Unable to get current location. Please enter pickup manually.'
            )

        } finally {

            setLocating(false)
        }
    }

    // ================= SUGGESTIONS =================

    const setSuggestionsFor = (field, list) => {

        setSuggestions(s => ({
            ...s,
            [field]: list
        }))
    }

    const getSuggestions = (value, field) => {

        const input = value.trim()

        clearTimeout(debounceRef.current[field])

        if (input.length < 3) {

            requestIdRef.current[field]++

            setSuggestionsFor(field, [])
            setSuggestionsLoading(false)

            return
        }

        debounceRef.current[field] = setTimeout(async () => {

            const requestId = ++requestIdRef.current[field]

            setSuggestionsLoading(true)

            try {

                const { data } = await axios.get(
                    `${BASE_URL}/maps/get-suggestions`,
                    {
                        params: { input },
                        headers: authHeaders()
                    }
                )

                if (requestId !== requestIdRef.current[field]) {
                    return
                }

                const list =
                    [data, data?.suggestions, data?.data].find(
                        Array.isArray
                    ) || []

                setSuggestionsFor(field, list)

            } catch (error) {

                if (requestId !== requestIdRef.current[field]) {
                    return
                }

                console.error(
                    'Suggestion error:',
                    error.response?.data || error.message
                )

                setSuggestionsFor(field, [])

            } finally {

                if (requestId === requestIdRef.current[field]) {
                    setSuggestionsLoading(false)
                }
            }

        }, 400)
    }

    // ================= INPUT =================

    const handleChange = (field, setter) => e => {

        const value = e.target.value

        setter(value)

        setActiveField(field)
        setPanelOpen(true)

        getSuggestions(value, field)
    }

    const focusField = field => () => {

        setActiveField(field)
        setPanelOpen(true)
    }

    const handlePickupSelect = location => {

        setPickup(location.address)

        setSuggestionsFor('pickup', [])

        setActiveField('destination')
        setPanelOpen(true)
    }

    const handleDestinationSelect = location => {

        setDestination(location.address)

        setSuggestionsFor('destination', [])

        setActiveField('destination')
        setPanelOpen(true)
    }

    // ================= SEARCH ANIMATION =================

    useGSAP(() => {

        if (panelRef.current) {
            gsap.to(panelRef.current, {
                height: panelOpen ? '70%' : '0%',
                padding: panelOpen ? 24 : 0,
                duration: 0.3,
                ease: 'power2.out'
            })
        }

        if (panelCloseRef.current) {
            gsap.to(panelCloseRef.current, {
                opacity: panelOpen ? 1 : 0,
                duration: 0.2
            })
        }

    }, [panelOpen])

    // ================= SHEET ANIMATION =================

    useGSAP(() => {

        Object.entries(refs).forEach(([name, ref]) => {

            if (!ref.current) return

            gsap.to(ref.current, {
                y: activePanel === name ? 0 : '100%',
                duration: 0.3,
                ease: 'power2.out'
            })
        })

    }, [activePanel])

    // ================= FIND TRIP =================

    const findTrip = async () => {

        if (!pickup || !destination) {
            return showToast('Please enter pickup and destination.')
        }

        if (findingTrip) return

        setFindingTrip(true)

        setPanelOpen(false)
        setVehiclePanel(true)

        try {

            const { data } = await axios.get(
                `${BASE_URL}/rides/get-fare`,
                {
                    params: { pickup, destination },
                    headers: authHeaders()
                }
            )

            setFare(data)

        } catch (error) {

            console.error(
                'Fare error:',
                error.response?.data || error.message
            )

            setVehiclePanel(false)

            showToast(
                error.response?.data?.message ||
                'Unable to calculate fare.'
            )

        } finally {

            setFindingTrip(false)
        }
    }

    // ================= CREATE RIDE =================

    const createRide = async () => {

        if (!pickup || !destination || !vehicleType) {
            throw new Error('Missing ride information')
        }

        const { data } = await axios.post(
            `${BASE_URL}/rides/create`,
            { pickup, destination, vehicleType },
            { headers: authHeaders() }
        )

        setRide(data?.ride || data)

        // "new-ride" is emitted by the backend to nearby captains,
        // never from the frontend.

        return data
    }

    // ================= CONFIRM RIDE =================

    const handleConfirmRide = async () => {

        // prevents double click -> two rides
        if (creatingRide) return

        setCreatingRide(true)

        // a new ride starts: forget tracking data of any previous ride
        setShowLiveTracking(false)
        setCaptainLocation(null)
        setNoDriverFound(false)

        try {

            await createRide()

            setVehicleFound(true)

        } catch (error) {

            console.error(
                'Create ride error:',
                error.response?.data || error.message
            )

            showToast(
                error.response?.data?.message ||
                error.message ||
                'Unable to create ride.'
            )

        } finally {

            setCreatingRide(false)
        }
    }

    // ================= STYLES =================

    const sheet =
        'fixed w-full z-10 bottom-0 bg-white px-3 pt-12'

    const inputClass =
        'bg-[#eee] px-12 py-2 text-lg rounded-lg w-full'

    // dim backdrop is not used while tracking, so the map stays clear and usable
    const showBackdrop =
        activePanel !== 'search' &&
        !(showLiveTracking && activePanel === 'waiting')

    const toastColor =
        toast?.type === 'info'
            ? 'bg-[#12334A] text-white'
            : 'bg-red-600 text-white'

    // ================= UI =================

    return (

        <div className="h-screen relative overflow-hidden bg-[#F5F7FA]">

            {/* TOAST */}

            <div
                className={`pointer-events-none fixed inset-x-0 top-4 z-[120] flex justify-center px-4 transition-all duration-300 ${
                    toast
                        ? 'translate-y-0 opacity-100'
                        : '-translate-y-4 opacity-0'
                }`}
            >
                {toast && (
                    <div
                        role="alert"
                        className={`pointer-events-auto max-w-md rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${toastColor}`}
                    >
                        {toast.message}
                    </div>
                )}
            </div>


            {/* LOGO */}

            <div
                className={`absolute left-14 top-5 z-50 transition-all duration-300 ${
                    activePanel === 'search' && !panelOpen
                        ? 'opacity-100 translate-y-0'
                        : 'opacity-0 -translate-y-3 pointer-events-none'
                }`}
            >
                <h1 className="text-3xl font-extrabold tracking-tight text-[#12334A]">
                    Saarthi<span className="text-[#F15A24]">.</span>
                </h1>
            </div>


            {/* PAST RIDES */}

            <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                aria-label="Past rides"
                className={`
                    absolute right-[4.5rem] top-5 z-50
                    h-11 w-11
                    bg-white
                    rounded-full
                    shadow-md
                    flex items-center justify-center
                    text-[#12334A]
                    transition-all duration-200
                    hover:bg-[#F15A24]
                    hover:text-white
                    active:scale-95
                    ${
                        activePanel === 'search' && !panelOpen
                            ? 'opacity-100'
                            : 'opacity-0 pointer-events-none'
                    }
                `}
            >
                <i className="text-xl ri-history-line" />
            </button>


            {/* LOGOUT */}

            <button
                type="button"
                onClick={handleLogout}
                aria-label="Logout"
                className="
                    absolute right-5 top-5 z-50
                    h-11 w-11
                    bg-white
                    rounded-full
                    shadow-md
                    flex items-center justify-center
                    text-[#12334A]
                    transition-all duration-200
                    hover:bg-[#F15A24]
                    hover:text-white
                    active:scale-95
                "
            >
                <i className="text-xl ri-logout-box-r-line" />
            </button>


            {/* MAP (switches to live tracking after the captain accepts) */}

            <div className="h-screen w-screen">
                <LiveTracking
                    role="user"
                    tracking={showLiveTracking}
                    captainLocation={showLiveTracking ? captainLocation : null}
                    pickupLocation={toCoords(
                        ride?.pickupCoordinates?.ltd,
                        ride?.pickupCoordinates?.lng
                    )}
                    pickupAddress={ride?.pickup || pickup}
                />
            </div>


            {/* SEARCH */}

            <div
                className={`${
                    activePanel === 'search' ? 'flex' : 'hidden'
                } flex-col justify-end h-screen absolute top-0 left-0 w-full pointer-events-none`}
            >

                <div
                    className="
                        h-[30%]
                        p-6
                        bg-white
                        relative
                        pointer-events-auto
                        rounded-t-[28px]
                        shadow-[0_-8px_30px_rgba(18,51,74,0.08)]
                    "
                >

                    {/* UP / DOWN ARROW */}

                    <button
                        type="button"
                        onClick={() => {
                            setActiveField(f => f || 'destination')
                            setPanelOpen(v => !v)
                        }}
                        aria-label={panelOpen ? 'Close search panel' : 'Open search panel'}
                        aria-expanded={panelOpen}
                        className="
                            absolute
                            left-1/2
                            z-[60]
                            flex
                            h-10
                            w-10
                            -translate-x-1/2
                            items-center
                            justify-center
                            rounded-full
                            border
                            border-gray-200
                            bg-white
                            text-2xl
                            text-[#12334A]
                            shadow-lg
                            transition-all
                            duration-300
                            hover:text-[#F15A24]
                            active:scale-90
                        "
                    >
                        <i className={panelOpen ? 'ri-arrow-down-s-line' : 'ri-arrow-up-s-line'} />
                    </button>


                    {/* Heading */}

                    <div className="flex items-center gap-2">

                        <span className="w-2 h-7 rounded-full bg-[#F15A24]" />

                        <h4 className="text-2xl font-bold text-[#12334A]">
                            Find a trip
                        </h4>

                    </div>


                    <form
                        className="relative py-3"
                        onSubmit={e => e.preventDefault()}
                    >

                        {/* Connecting Line */}

                        <div
                            className="
                                line
                                absolute
                                h-16
                                w-1
                                top-[50%]
                                -translate-y-1/2
                                left-5
                                bg-[#12334A]
                                rounded-full
                            "
                        />


                        {/* PICKUP */}

                        <div className="relative">

                            <input
                                value={pickup}
                                onClick={focusField('pickup')}
                                onChange={handleChange('pickup', setPickup)}
                                className={`
                                    ${inputClass}
                                    pr-14
                                    border-gray-300
                                    text-[#12334A]
                                    focus:border-[#F15A24]
                                    focus:ring-2
                                    focus:ring-[#F15A24]/15
                                `}
                                type="text"
                                placeholder="Add a pick-up location"
                            />

                            {/* Current Location */}

                            <button
                                type="button"
                                disabled={locating}
                                onClick={fetchCurrentLocation}
                                aria-label="Use my current location"
                                className="
                                    absolute
                                    right-3
                                    top-1/2
                                    -translate-y-1/2
                                    w-9
                                    h-9
                                    flex
                                    items-center
                                    justify-center
                                    rounded-full
                                    text-[#12334A]
                                    hover:bg-orange-50
                                    hover:text-[#F15A24]
                                    transition-colors
                                    disabled:opacity-50
                                "
                            >
                                <i
                                    className={`text-xl ${
                                        locating
                                            ? 'ri-loader-4-line animate-spin text-[#F15A24]'
                                            : 'ri-crosshair-2-line'
                                    }`}
                                />
                            </button>

                        </div>


                        {/* DESTINATION */}

                        <input
                            value={destination}
                            onClick={focusField('destination')}
                            onChange={handleChange('destination', setDestination)}
                            className={`
                                ${inputClass}
                                mt-3
                                border-gray-300
                                text-[#12334A]
                                focus:border-[#F15A24]
                                focus:ring-2
                                focus:ring-[#F15A24]/15
                            `}
                            type="text"
                            placeholder="Enter your destination"
                        />

                    </form>


                    {/* FIND TRIP */}

                    <button
                        type="button"
                        onClick={findTrip}
                        disabled={findingTrip}
                        className="
                            bg-[#12334A]
                            text-white
                            px-4
                            py-3
                            rounded-xl
                            mt-3
                            w-full
                            font-semibold
                            transition-all
                            duration-300
                            hover:bg-[#F15A24]
                            active:scale-[0.98]
                            shadow-md
                            shadow-[#12334A]/15
                            disabled:opacity-60
                            disabled:cursor-not-allowed
                        "
                    >
                        {findingTrip ? 'Finding trip...' : 'Find Trip'}
                    </button>

                </div>


                {/* SUGGESTIONS */}

                <div
                    ref={panelRef}
                    className="
                        bg-white
                        h-0
                        overflow-y-auto
                        pointer-events-auto
                    "
                >
                    <LocationSearchPanel
                        suggestions={suggestions[activeField] || []}
                        loading={suggestionsLoading}
                        setPickup={handlePickupSelect}
                        setDestination={handleDestinationSelect}
                        activeField={activeField}
                    />
                </div>

            </div>


            {/* BACKDROP */}

            <div
                className={`fixed inset-0 z-[5] bg-[#12334A] transition-opacity ${
                    showBackdrop
                        ? 'opacity-30'
                        : 'opacity-0 pointer-events-none'
                }`}
            />


            {/* VEHICLE */}

            <div
                ref={refs.vehicle}
                style={hiddenSheetStyle}
                className={`${sheet} py-10 bg-white`}
            >
                <VehiclePanel
                    selectVehicle={setVehicleType}
                    fare={fare}
                    setConfirmRidePanel={setConfirmRidePanel}
                    setVehiclePanel={setVehiclePanel}
                />
            </div>


            {/* CONFIRM RIDE */}

            <div
                ref={refs.confirm}
                style={hiddenSheetStyle}
                className={`${sheet} py-6 bg-white`}
            >
                <ConfirmRide
                    pickup={pickup}
                    destination={destination}
                    fare={fare}
                    vehicleType={vehicleType}
                    creatingRide={creatingRide}
                    setConfirmRidePanel={setConfirmRidePanel}
                    setVehicleFound={setVehicleFound}
                    createRide={handleConfirmRide}
                />
            </div>


            {/* LOOKING FOR DRIVER */}

            <div
                ref={refs.looking}
                style={hiddenSheetStyle}
                className={`${sheet} py-6 bg-white`}
            >
                <LookingForDriver
                    ride={ride}
                    pickup={pickup}
                    destination={destination}
                    fare={fare}
                    vehicleType={vehicleType}
                    noDriverFound={noDriverFound}
                    setVehicleFound={setVehicleFound}
                    onRetry={retryRide}
                    onCancel={() => setConfirmCancelOpen(true)}
                    cancelling={cancelling}
                />
            </div>


            {/* WAITING FOR DRIVER */}

            <div
                ref={refs.waiting}
                style={hiddenSheetStyle}
                className={`${sheet} py-6 bg-white`}
            >
                <WaitingForDriver
                    ride={ride}
                    setVehicleFound={setVehicleFound}
                    setWaitingForDriver={setWaitingForDriver}
                    waitingForDriver={waitingForDriver}
                    onCancel={() => setConfirmCancelOpen(true)}
                    cancelling={cancelling}
                />
            </div>


            {/* CANCEL CONFIRMATION */}

            {confirmCancelOpen && (
                <div
                    className="fixed inset-0 z-[110] flex items-end justify-center bg-[#12334A]/50 p-4 sm:items-center"
                    onClick={() => !cancelling && setConfirmCancelOpen(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 className="text-xl font-bold text-[#12334A]">
                            Cancel this ride?
                        </h3>

                        <p className="mt-2 text-sm text-gray-500">
                            Your captain will be notified and the booking will be removed.
                        </p>

                        <div className="mt-6 grid grid-cols-2 gap-3">

                            <button
                                type="button"
                                disabled={cancelling}
                                onClick={() => setConfirmCancelOpen(false)}
                                className="rounded-xl border-2 border-gray-200 px-4 py-3 font-semibold text-[#12334A] transition hover:border-[#12334A] disabled:opacity-60"
                            >
                                Keep ride
                            </button>

                            <button
                                type="button"
                                disabled={cancelling}
                                onClick={() => cancelRide()}
                                className="rounded-xl bg-red-600 px-4 py-3 font-semibold text-white transition hover:bg-red-700 active:scale-[0.98] disabled:opacity-60"
                            >
                                {cancelling ? 'Cancelling...' : 'Yes, cancel'}
                            </button>

                        </div>
                    </div>
                </div>
            )}


            {/* PAST RIDES SHEET */}

            {historyOpen && (
                <RideHistory
                    role="user"
                    onClose={() => setHistoryOpen(false)}
                />
            )}


            {/* FIRST LOAD: checking for a running ride */}

            {restoring && (
                <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-3 bg-white/90">
                    <div className="h-9 w-9 animate-spin rounded-full border-4 border-gray-300 border-t-[#F15A24]" />
                    <p className="text-sm font-semibold text-[#12334A]">
                        Loading your ride...
                    </p>
                </div>
            )}

        </div>
    )
}

export default Home