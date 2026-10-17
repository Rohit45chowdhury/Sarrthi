
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
    import.meta.env.VITE_API_URL || 'http://localhost:3000'

const DRIVER_SEARCH_TIMEOUT = 30000
const ACCEPT_POLL_MS = 4000

const FRONT_VEHICLE_KEY = {
    auto: 'auto',
    car: 'car',
    motorcycle: 'moto',
    moto: 'moto'
}

const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`
})

const hiddenSheetStyle = {
    transform: 'translateY(100%)'
}

// Accept multiple common latitude/longitude formats.
// Missing values must not accidentally become [0, 0].
const toCoords = (lat, lng) => {
    if (
        lat === null || lat === undefined || lat === '' ||
        lng === null || lng === undefined || lng === ''
    ) {
        return null
    }

    const latitude = Number(lat)
    const longitude = Number(lng)

    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
    ) {
        return null
    }

    return [latitude, longitude]
}

// Supports { ltd, lng }, { lat, lng }, { latitude, longitude },
// and nested forms such as { location: { ltd, lng } }.
const extractCoords = payload => {
    const location =
        payload?.location?.location ||
        payload?.location ||
        payload?.coordinates ||
        payload

    return toCoords(
        location?.ltd ??
        location?.lat ??
        location?.latitude,
        location?.lng ??
        location?.long ??
        location?.longitude ??
        location?.lon
    )
}

const Home = () => {
    const { user } = useContext(UserDataContext)
    const { socket } = useContext(SocketContext)

    const navigate = useNavigate()
    const routeLocation = useLocation()

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

    const [ride, setRide] = useState(null)
    const [locating, setLocating] = useState(false)
    const [creatingRide, setCreatingRide] = useState(false)

    const [noDriverFound, setNoDriverFound] = useState(false)
    const [showLiveTracking, setShowLiveTracking] = useState(false)
    const [captainLocation, setCaptainLocation] = useState(null)

    const [historyOpen, setHistoryOpen] = useState(false)
    const [restoring, setRestoring] = useState(true)
    const [cancelling, setCancelling] = useState(false)

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

    const vehicleRef = useRef(null)
    const confirmRef = useRef(null)
    const lookingRef = useRef(null)
    const waitingRef = useRef(null)

    const refs = {
        vehicle: vehicleRef,
        confirm: confirmRef,
        looking: lookingRef,
        waiting: waitingRef
    }

    const panelRef = useRef(null)
    const panelCloseRef = useRef(null)

    const debounceRef = useRef({})
    const requestIdRef = useRef({
        pickup: 0,
        destination: 0
    })

    const lastRestoredRef = useRef('')
    const cancellingRef = useRef(false)

    // Keep the latest ride ID accessible to socket handlers.
    const currentRideIdRef = useRef(null)

    useEffect(() => {
        currentRideIdRef.current = ride?._id
            ? String(ride._id)
            : null
    }, [ride?._id])

    // Avoid redirect loops immediately after a ride finishes.
    const skipOngoingRedirectRef = useRef(
        Boolean(routeLocation.state?.rideEnded)
    )

    useEffect(() => {
        if (!skipOngoingRedirectRef.current) return

        const timer = setTimeout(() => {
            skipOngoingRedirectRef.current = false
        }, 8000)

        return () => clearTimeout(timer)
    }, [])

    // ================= USER SOCKET JOIN =================

    useEffect(() => {
        if (!socket || !user?._id) return

        const joinUser = () => {
            const token = localStorage.getItem('token')

            if (!token) {
                console.error('User socket join failed: token missing')
                return
            }

            console.log('USER SOCKET CONNECTED:', socket.id)

            socket.emit(
                'join',
                {
                    userId: user._id,
                    userType: 'user',
                    token
                },
                response => {
                    if (response?.ok) {
                        console.log('User socket joined successfully')
                    } else {
                        console.error(
                            'User socket join failed:',
                            response?.message || 'No acknowledgement'
                        )
                    }
                }
            )
        }

        if (socket.connected) {
            joinUser()
        }

        socket.on('connect', joinUser)

        return () => {
            socket.off('connect', joinUser)
        }
    }, [socket, user?._id])

    // ================= RESTORE RUNNING RIDE =================

    const restoreRide = useCallback(async (includePending = false) => {
        try {
            const { data } = await axios.get(
                `${BASE_URL}/rides/active`,
                { headers: authHeaders() }
            )

            const running = data?.ride

            if (!running) return null

            // Only restore pending rides on the initial page load.
            if (running.status === 'pending' && !includePending) {
                return running
            }

            if (
                running.status === 'ongoing' &&
                skipOngoingRedirectRef.current
            ) {
                return null
            }

            const key = `${running._id}:${running.status}`

            if (lastRestoredRef.current === key) {
                return running
            }

            lastRestoredRef.current = key

            if (running.status === 'ongoing') {
                navigate('/riding', {
                    state: { ride: running }
                })

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
            } else if (running.status === 'pending') {
                setShowLiveTracking(false)
                setCaptainLocation(null)
                setActivePanel('looking')
            }

            return running
        } catch (error) {
            console.error(
                'RESTORE RIDE ERROR:',
                error.response?.data || error.message
            )

            return undefined
        }
    }, [navigate])

    useEffect(() => {
        let mounted = true

        restoreRide(true).finally(() => {
            if (mounted) setRestoring(false)
        })

        return () => {
            mounted = false
        }
    }, [restoreRide])

    // Restore state after reconnect or when returning to the app.
    useEffect(() => {
        const handleVisible = () => {
            if (document.visibilityState === 'visible') {
                restoreRide(false)
            }
        }

        const handleReconnect = () => {
            restoreRide(false)
        }

        document.addEventListener('visibilitychange', handleVisible)
        socket?.io?.on('reconnect', handleReconnect)

        return () => {
            document.removeEventListener('visibilitychange', handleVisible)
            socket?.io?.off('reconnect', handleReconnect)
        }
    }, [socket, restoreRide])

    // Poll while waiting for a captain acceptance event.
    useEffect(() => {
        if (activePanel !== 'looking' || !ride?._id) return

        const interval = setInterval(() => {
            restoreRide(false)
        }, ACCEPT_POLL_MS)

        return () => clearInterval(interval)
    }, [activePanel, ride?._id, restoreRide])

    // ================= RESET RIDE =================

    const resetRideState = useCallback(() => {
        setRide(null)
        setShowLiveTracking(false)
        setCaptainLocation(null)
        setNoDriverFound(false)
        setActivePanel('search')

        lastRestoredRef.current = ''
        currentRideIdRef.current = null

        sessionStorage.removeItem('activeRide')
    }, [])

    // ================= CANCEL RIDE =================

    const cancelRide = async ({
        ask = true,
        pendingOnly = false,
        silent = false
    } = {}) => {
        const rideId = ride?._id

        if (!rideId) {
            resetRideState()
            return true
        }

        if (cancellingRef.current) return false

        if (ask && !window.confirm('Cancel this ride?')) {
            return false
        }

        cancellingRef.current = true
        setCancelling(true)

        try {
            await axios.post(
                `${BASE_URL}/rides/cancel`,
                { rideId, pendingOnly },
                { headers: authHeaders() }
            )

            resetRideState()
            return true
        } catch (error) {
            console.error(
                'CANCEL RIDE ERROR:',
                error.response?.data || error.message
            )

            const active = await restoreRide(false)

            if (active === null) {
                resetRideState()
                return true
            }

            if (!silent) {
                alert(
                    error.response?.data?.message ||
                    'Unable to cancel the ride.'
                )
            }

            return false
        } finally {
            cancellingRef.current = false
            setCancelling(false)
        }
    }

    const retryRide = async () => {
        if (ride?._id) {
            const cancelled = await cancelRide({
                ask: false,
                pendingOnly: true,
                silent: true
            })

            if (!cancelled) return
        }

        setNoDriverFound(false)
        setConfirmRidePanel(true)
    }

    // ================= RIDE CANCELLED =================

    useEffect(() => {
        if (!socket) return

        const handleCancelled = data => {
            const eventRideId = data?.rideId
                ? String(data.rideId)
                : null

            const currentRideId = currentRideIdRef.current

            if (
                eventRideId &&
                currentRideId &&
                eventRideId !== currentRideId
            ) {
                return
            }

            resetRideState()
            alert('Your captain cancelled the ride. Please book again.')
        }

        socket.on('ride-cancelled', handleCancelled)

        return () => {
            socket.off('ride-cancelled', handleCancelled)
        }
    }, [socket, resetRideState])

    // ================= RIDE ACCEPTED =================

    useEffect(() => {
        if (!socket) return

        const handleRideAccepted = data => {
            console.log('RIDE ACCEPTED:', data)

            const acceptedRide = data?.ride || data

            if (
                !acceptedRide ||
                typeof acceptedRide !== 'object'
            ) {
                console.error('Invalid ride-accepted payload:', data)
                return
            }

            // Ignore acceptance events for a different ride.
            const eventRideId = acceptedRide?._id
                ? String(acceptedRide._id)
                : data?.rideId
                    ? String(data.rideId)
                    : null

            const currentRideId = currentRideIdRef.current

            if (
                eventRideId &&
                currentRideId &&
                eventRideId !== currentRideId
            ) {
                console.warn('Ignoring acceptance for another ride')
                return
            }

            setRide(acceptedRide)
            setNoDriverFound(false)
            setCaptainLocation(null)
            setShowLiveTracking(true)
            setActivePanel('waiting')
        }

        socket.on('ride-accepted', handleRideAccepted)

        return () => {
            socket.off('ride-accepted', handleRideAccepted)
        }
    }, [socket])

    // ================= RIDE STARTED =================

    useEffect(() => {
        if (!socket) return

        const handleRideStarted = data => {
            console.log('RIDE STARTED:', data)

            const startedRide = data?.ride || data

            if (!startedRide || typeof startedRide !== 'object') {
                console.error('Invalid ride-started payload:', data)
                return
            }

            const eventRideId = startedRide?._id
                ? String(startedRide._id)
                : data?.rideId
                    ? String(data.rideId)
                    : null

            const currentRideId = currentRideIdRef.current

            if (
                eventRideId &&
                currentRideId &&
                eventRideId !== currentRideId
            ) {
                return
            }

            skipOngoingRedirectRef.current = false

            navigate('/riding', {
                state: { ride: startedRide }
            })
        }

        socket.on('ride-started', handleRideStarted)

        return () => {
            socket.off('ride-started', handleRideStarted)
        }
    }, [socket, navigate])

    // ================= NO CAPTAIN FOUND =================

    useEffect(() => {
        setNoDriverFound(false)

        if (activePanel !== 'looking') return

        const timer = setTimeout(() => {
            setNoDriverFound(true)
        }, DRIVER_SEARCH_TIMEOUT)

        return () => clearTimeout(timer)
    }, [activePanel, ride?._id])

    useEffect(() => {
        if (!socket) return

        const handleNoCaptains = data => {
            const eventRideId = data?.rideId
                ? String(data.rideId)
                : null

            const currentRideId = currentRideIdRef.current

            if (
                eventRideId &&
                currentRideId &&
                eventRideId !== currentRideId
            ) {
                return
            }

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
            // Supports both flat and nested event payloads.
            const eventRideId = data?.rideId
                ? String(data.rideId)
                : data?.ride?._id
                    ? String(data.ride._id)
                    : null

            const currentRideId = currentRideIdRef.current

            // When the server includes rideId, reject other rides.
            if (
                eventRideId &&
                currentRideId &&
                eventRideId !== currentRideId
            ) {
                return
            }

            const point = extractCoords(data)

            if (!point) {
                console.warn('Invalid captain location payload:', data)
                return
            }

            setCaptainLocation(previous => {
                if (
                    previous &&
                    previous[0] === point[0] &&
                    previous[1] === point[1]
                ) {
                    return previous
                }

                return point
            })
        }

        socket.on('captain-location-update', handleCaptainLocation)

        return () => {
            socket.off('captain-location-update', handleCaptainLocation)
        }
    }, [socket, ride?._id])

    // ================= SEND USER LIVE LOCATION =================
    // This lets the captain see the passenger's live position, provided
    // the backend relays this event to the captain for the same ride.

    useEffect(() => {
        if (!socket || !showLiveTracking || !ride?._id) return
        if (!navigator.geolocation) return

        const rideId = String(ride._id)
        let lastSent = 0

        const watchId = navigator.geolocation.watchPosition(
            position => {
                const now = Date.now()

                if (now - lastSent < 5000) return

                lastSent = now

                const { latitude, longitude } = position.coords

                socket.emit('user-live-location', {
                    rideId,
                    location: {
                        ltd: latitude,
                        lng: longitude
                    }
                })
            },
            error => {
                console.error(
                    'User live location error:',
                    error.code,
                    error.message
                )
            },
            {
                enableHighAccuracy: true,
                maximumAge: 5000,
                timeout: 20000
            }
        )

        return () => {
            navigator.geolocation.clearWatch(watchId)
        }
    }, [socket, showLiveTracking, ride?._id])

    // ================= LOGOUT =================

    const handleLogout = () => {
        localStorage.removeItem('token')
        sessionStorage.removeItem('activeRide')
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
            alert('Geolocation is not supported')
            return
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

            alert(
                'Unable to get current location. Please enter pickup manually.'
            )
        } finally {
            setLocating(false)
        }
    }

    // ================= SUGGESTIONS =================

    const setSuggestionsFor = (field, list) => {
        setSuggestions(previous => ({
            ...previous,
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

                if (requestId !== requestIdRef.current[field]) return

                const list = [
                    data,
                    data?.suggestions,
                    data?.data
                ].find(Array.isArray) || []

                setSuggestionsFor(field, list)
            } catch (error) {
                if (requestId !== requestIdRef.current[field]) return

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

    // ================= INPUT HANDLERS =================

    const handleChange = (field, setter) => event => {
        const value = event.target.value

        setter(value)
        setActiveField(field)
        setPanelOpen(true)
        getSuggestions(value, field)
    }

    const focusField = field => () => {
        setActiveField(field)
        setPanelOpen(true)
    }

    const handlePickupSelect = selectedLocation => {
        if (!selectedLocation?.address) return

        setPickup(selectedLocation.address)
        setSuggestionsFor('pickup', [])
        setActiveField('destination')
        setPanelOpen(true)
    }

    const handleDestinationSelect = selectedLocation => {
        if (!selectedLocation?.address) return

        setDestination(selectedLocation.address)
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
        if (!pickup.trim() || !destination.trim()) {
            alert('Please enter pickup and destination.')
            return
        }

        if (pickup.trim().toLowerCase() === destination.trim().toLowerCase()) {
            alert('Pickup and destination cannot be the same.')
            return
        }

        setPanelOpen(false)
        setVehiclePanel(true)

        try {
            const { data } = await axios.get(
                `${BASE_URL}/rides/get-fare`,
                {
                    params: {
                        pickup: pickup.trim(),
                        destination: destination.trim()
                    },
                    headers: authHeaders()
                }
            )

            console.log('Fare response:', data)
            setFare(data?.fare || data)
        } catch (error) {
            console.error(
                'Fare error:',
                error.response?.data || error.message
            )

            setVehiclePanel(false)

            alert(
                error.response?.data?.message ||
                'Unable to calculate fare.'
            )
        }
    }

    // ================= CREATE RIDE =================

    const createRide = async () => {
        if (!pickup || !destination || !vehicleType) {
            throw new Error('Please select pickup, destination and vehicle.')
        }

        // Fare UI uses "moto"; backend expects "motorcycle".
        const backendVehicleType =
            vehicleType === 'moto' ? 'motorcycle' : vehicleType

        const { data } = await axios.post(
            `${BASE_URL}/rides/create`,
            {
                pickup,
                destination,
                vehicleType: backendVehicleType
            },
            { headers: authHeaders() }
        )

        const createdRide = data?.ride || data

        if (!createdRide?._id) {
            throw new Error('Ride was created but no ride ID was returned.')
        }

        console.log('Ride created:', createdRide)

        lastRestoredRef.current = ''
        setRide(createdRide)
        currentRideIdRef.current = String(createdRide._id)

        return createdRide
    }

    // ================= CONFIRM RIDE =================

    const handleConfirmRide = async () => {
        if (creatingRide) return

        setCreatingRide(true)
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

            alert(
                error.response?.data?.message ||
                error.message ||
                'Unable to create ride.'
            )
        } finally {
            setCreatingRide(false)
        }
    }

    // ================= STYLES =================

    const sheet = 'fixed w-full z-10 bottom-0 bg-white px-3 pt-12'

    const inputClass =
        'bg-[#eee] px-12 py-2 text-lg rounded-lg w-full'

    const showBackdrop =
        activePanel !== 'search' &&
        !(showLiveTracking && activePanel === 'waiting')

    // ================= UI =================

    return (
        <div className="h-screen relative overflow-hidden bg-[#F5F7FA]">

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
                className={`absolute right-[4.5rem] top-5 z-50 h-11 w-11 bg-white rounded-full shadow-md flex items-center justify-center text-[#12334A] transition-all duration-200 hover:bg-[#F15A24] hover:text-white active:scale-95 ${
                    activePanel === 'search' && !panelOpen
                        ? 'opacity-100'
                        : 'opacity-0 pointer-events-none'
                }`}
            >
                <i className="text-xl ri-history-line" />
            </button>

            {/* LOGOUT */}
            <button
                type="button"
                onClick={handleLogout}
                className="absolute right-5 top-5 z-50 h-11 w-11 bg-white rounded-full shadow-md flex items-center justify-center text-[#12334A] transition-all duration-200 hover:bg-[#F15A24] hover:text-white active:scale-95"
            >
                <i className="text-xl ri-logout-box-r-line" />
            </button>

            {/* MAP */}
            <div className="h-screen w-screen">
                <LiveTracking
                    role="user"
                    tracking={showLiveTracking}
                    captainLocation={
                        showLiveTracking ? captainLocation : null
                    }
                    pickupLocation={extractCoords(
                        ride?.pickupCoordinates ||
                        ride?.pickupLocation
                    )}
                    pickupAddress={ride?.pickup || pickup}
                    showInfo={true}
                />
            </div>

            {/* SEARCH */}
            <div
                className={`${
                    activePanel === 'search' ? 'flex' : 'hidden'
                } flex-col justify-end h-screen absolute top-0 left-0 w-full pointer-events-none`}
            >
                <div className="h-[30%] p-6 bg-white relative pointer-events-auto rounded-t-[28px] shadow-[0_-8px_30px_rgba(18,51,74,0.08)]">

                    <button
                        type="button"
                        onClick={() => {
                            setActiveField(field => field || 'destination')
                            setPanelOpen(value => !value)
                        }}
                        aria-label={panelOpen ? 'Close search panel' : 'Open search panel'}
                        aria-expanded={panelOpen}
                        className="absolute left-1/2 z-[60] flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-2xl text-[#12334A] shadow-lg transition-all duration-300 hover:text-[#F15A24] active:scale-90"
                    >
                        <i
                            className={
                                panelOpen
                                    ? 'ri-arrow-down-s-line'
                                    : 'ri-arrow-up-s-line'
                            }
                        />
                    </button>

                    <div className="flex items-center gap-2">
                        <span className="w-2 h-7 rounded-full bg-[#F15A24]" />
                        <h4 className="text-2xl font-bold text-[#12334A]">
                            Find a trip
                        </h4>
                    </div>

                    <form
                        className="relative py-3"
                        onSubmit={event => event.preventDefault()}
                    >
                        <div className="line absolute h-16 w-1 top-[50%] -translate-y-1/2 left-5 bg-[#12334A] rounded-full" />

                        {/* PICKUP */}
                        <div className="relative">
                            <input
                                value={pickup}
                                onClick={focusField('pickup')}
                                onChange={handleChange('pickup', setPickup)}
                                className={`${inputClass} pr-14 border-gray-300 text-[#12334A] focus:border-[#F15A24] focus:ring-2 focus:ring-[#F15A24]/15`}
                                type="text"
                                placeholder="Add a pick-up location"
                            />

                            <button
                                type="button"
                                disabled={locating}
                                onClick={fetchCurrentLocation}
                                aria-label="Use current location"
                                className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full text-[#12334A] hover:bg-orange-50 hover:text-[#F15A24] transition-colors disabled:opacity-50"
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
                            className={`${inputClass} mt-3 border-gray-300 text-[#12334A] focus:border-[#F15A24] focus:ring-2 focus:ring-[#F15A24]/15`}
                            type="text"
                            placeholder="Enter your destination"
                        />
                    </form>

                    <button
                        type="button"
                        onClick={findTrip}
                        className="bg-[#12334A] text-white px-4 py-3 rounded-xl mt-3 w-full font-semibold transition-all duration-300 hover:bg-[#F15A24] active:scale-[0.98] shadow-md shadow-[#12334A]/15"
                    >
                        Find Trip
                    </button>
                </div>

                {/* SUGGESTIONS */}
                <div
                    ref={panelRef}
                    className="bg-white h-0 overflow-y-auto pointer-events-auto"
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
                ref={vehicleRef}
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
                ref={confirmRef}
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
                ref={lookingRef}
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
                    onCancel={() => cancelRide()}
                    cancelling={cancelling}
                />
            </div>

            {/* WAITING FOR DRIVER */}
            <div
                ref={waitingRef}
                style={hiddenSheetStyle}
                className={`${sheet} py-6 bg-white`}
            >
                <WaitingForDriver
                    ride={ride}
                    setVehicleFound={setVehicleFound}
                    setWaitingForDriver={setWaitingForDriver}
                    waitingForDriver={waitingForDriver}
                    onCancel={() => cancelRide()}
                    cancelling={cancelling}
                />
            </div>

            {/* PAST RIDES */}
            {historyOpen && (
                <RideHistory
                    role="user"
                    onClose={() => setHistoryOpen(false)}
                />
            )}

            {/* INITIAL LOADING */}
            {restoring && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-white/80">
                    <p className="text-sm font-semibold text-[#12334A]">
                        Loading your ride...
                    </p>
                </div>
            )}
        </div>
    )
}

export default Home
