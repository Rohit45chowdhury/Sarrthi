import React, {
    useRef,
    useState,
    useContext,
    useEffect
} from 'react'

import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'

import LocationSearchPanel from '../components/LocationSearchPanel'
import VehiclePanel from '../components/VehiclePanel'
import ConfirmRide from '../components/ConfirmRide'
import LookingForDriver from '../components/LookingForDriver'
import WaitingForDriver from '../components/WaitingForDriver'
import LiveTracking from '../components/LiveTracking'

import { UserDataContext } from '../context/UserContext'
import { SocketContext } from '../context/SocketContext'

const BASE_URL =
    import.meta.env.VITE_API_URL ||
    'http://localhost:3000'

// how long we search for a driver before showing "No drivers available"
const DRIVER_SEARCH_TIMEOUT = 30000

const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`
})

// Initial off-screen position is inline, NOT the Tailwind `translate-y-full`
// class. Tailwind v4 uses the CSS `translate` property, GSAP uses `transform`,
// so the class keeps the sheet hidden even after GSAP animates y to 0.
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

    // ================= STATES =================

    const [pickup, setPickup] = useState('')
    const [destination, setDestination] = useState('')

    const [panelOpen, setPanelOpen] = useState(false)
    const [activeField, setActiveField] = useState(null)

    const [locationPanelExpanded, setLocationPanelExpanded] = useState(false)

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

    // true when nobody accepted the ride within DRIVER_SEARCH_TIMEOUT
    const [noDriverFound, setNoDriverFound] = useState(false)

    // live tracking: opens after the captain accepted the ride
    const [showLiveTracking, setShowLiveTracking] = useState(false)

    // [lat, lng] of the captain, updated through "captain-location-update"
    const [captainLocation, setCaptainLocation] = useState(null)

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

    // ================= USER SOCKET JOIN =================

    useEffect(() => {

        if (!socket || !user?._id) return

        const joinUser = () => {

            console.log('USER SOCKET CONNECTED:', socket.id)

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

    // ================= RIDE ACCEPTED =================

    useEffect(() => {

        if (!socket) return

        const handleRideAccepted = data => {

            console.log('RIDE ACCEPTED:', data)

            const acceptedRide = data?.ride || data

            if (!acceptedRide || typeof acceptedRide !== 'object') {
                console.error('Invalid ride-accepted payload:', data)
                return
            }

            setRide(acceptedRide)

            // map switches to tracking mode, the captain position arrives
            // through "captain-location-update"
            setCaptainLocation(null)
            setShowLiveTracking(true)

            setActivePanel('waiting')
        }

        socket.on('ride-accepted', handleRideAccepted)

        return () => {
            socket.off('ride-accepted', handleRideAccepted)
        }

    }, [socket])

    // ================= NO DRIVER AVAILABLE =================

    // Timeout: starts when the "looking" panel opens. If no captain accepts
    // in time, show "No drivers available". When the ride is accepted the
    // panel changes to 'waiting', the cleanup runs and the timer is cancelled.
    useEffect(() => {

        setNoDriverFound(false)

        if (activePanel !== 'looking') return

        const timer = setTimeout(() => {
            setNoDriverFound(true)
        }, DRIVER_SEARCH_TIMEOUT)

        return () => clearTimeout(timer)

    }, [activePanel])

    // Optional: if the backend emits "no-captains-available" (nearby captain
    // list was empty) show the message immediately. Harmless if never emitted.
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

            // payload: { ltd, lng }  (also accepts { location: { ltd, lng } })
            const point = toCoords(
                data?.ltd ?? data?.location?.ltd,
                data?.lng ?? data?.location?.lng
            )

            if (!point) {
                console.error('Invalid captain location:', data)
                return
            }

            // same position -> keep old state, no re-render
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
            return alert('Geolocation is not supported')
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

            alert(
                'Unable to get current location. Please enter pickup manually.'
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

            // invalidate any request that is still in flight
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

                // a newer request exists -> ignore this stale response
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

                // only the latest request may turn the loader off
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
    // The search block now stays mounted (hidden with CSS), so panelRef is
    // never null and the panel keeps its height when we come back to it.

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
            return alert('Please enter pickup and destination.')
        }

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

            console.log('Fare:', data)

            setFare(data)

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
            throw new Error('Missing ride information')
        }

        console.log('Creating ride:', {
            pickup,
            destination,
            vehicleType
        })

        const { data } = await axios.post(
            `${BASE_URL}/rides/create`,
            { pickup, destination, vehicleType },
            { headers: authHeaders() }
        )

        console.log('Ride created:', data)

        setRide(data?.ride || data)

        /*
         * Do NOT emit "new-ride" from the frontend.
         * The backend creates the ride, finds nearby captains and emits
         * "new-ride" to each captain's socketId.
         */

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

    const sheet =
        'fixed w-full z-10 bottom-0 bg-white px-3 pt-12'

    const inputClass =
        'bg-[#eee] px-12 py-2 text-lg rounded-lg w-full'

    // dim backdrop is not used while tracking, so the map stays clear and usable
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


    {/* LOGOUT */}

    <button
        type="button"
        onClick={handleLogout}
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

            {/* Close */}

            <h5
                ref={panelCloseRef}
                onClick={() => setPanelOpen(false)}
                className="
                    absolute
                    opacity-0
                    right-6
                    top-6
                    text-2xl
                    cursor-pointer
                    text-[#12334A]
                    hover:text-[#F15A24]
                    transition-colors
                "
            >
                <i className="ri-arrow-down-wide-line" />
            </h5>


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
                        onChange={handleChange(
                            'pickup',
                            setPickup
                        )}
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
                    onChange={handleChange(
                        'destination',
                        setDestination
                    )}
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
                "
            >
                Find Trip
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
            onRetry={() => setConfirmRidePanel(true)}
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
        />
    </div>

</div>
    )
}

export default Home