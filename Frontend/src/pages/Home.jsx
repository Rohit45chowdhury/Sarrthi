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

const authHeaders = () => ({
    Authorization:
        `Bearer ${localStorage.getItem('token')}`
})

const Home = () => {

    const { user } =
        useContext(UserDataContext)

    const { socket } =
        useContext(SocketContext)

    const navigate = useNavigate()

    // ================= STATES =================

    const [pickup, setPickup] = useState('')
    const [destination, setDestination] = useState('')

    const [panelOpen, setPanelOpen] =
        useState(false)

    const [activeField, setActiveField] =
        useState(null)

    const [suggestions, setSuggestions] =
        useState({
            pickup: [],
            destination: []
        })

    const [suggestionsLoading, setSuggestionsLoading] =
        useState(false)

    const [fare, setFare] = useState({})
    const [vehicleType, setVehicleType] =
        useState(null)

    const [ride, setRide] = useState(null)
    const [locating, setLocating] =
        useState(false)

    // search | vehicle | confirm | looking | waiting
    const [activePanel, setActivePanel] =
        useState('search')

    const vehiclePanel =
        activePanel === 'vehicle'

    const confirmRidePanel =
        activePanel === 'confirm'

    const vehicleFound =
        activePanel === 'looking'

    const waitingForDriver =
        activePanel === 'waiting'

    const setVehiclePanel = open =>
        setActivePanel(
            open ? 'vehicle' : 'search'
        )

    const setConfirmRidePanel = open =>
        setActivePanel(
            open ? 'confirm' : 'search'
        )

    const setVehicleFound = open =>
        setActivePanel(
            open ? 'looking' : 'search'
        )

    const setWaitingForDriver = open =>
        setActivePanel(
            open ? 'waiting' : 'search'
        )

    // ================= REFS =================

    const refs = {
        vehicle: useRef(null),
        confirm: useRef(null),
        looking: useRef(null),
        waiting: useRef(null)
    }

    const panelRef = useRef(null)
    const panelCloseRef = useRef(null)

    const debounceRef =
        useRef({})

    const requestIdRef =
        useRef({
            pickup: 0,
            destination: 0
        })

    // ================= USER SOCKET JOIN =================

    useEffect(() => {

        if (!socket || !user?._id) return

        const joinUser = () => {

            console.log(
                'USER SOCKET CONNECTED:',
                socket.id
            )

            socket.emit('join', {
                userId: user._id,
                userType: 'user'
            })

        }

        if (socket.connected) {
            joinUser()
        }

        socket.on(
            'connect',
            joinUser
        )

        return () => {
            socket.off(
                'connect',
                joinUser
            )
        }

    }, [socket, user?._id])

    // ================= RIDE ACCEPTED =================

    useEffect(() => {

        if (!socket) return

        const handleRideAccepted = data => {

            console.log(
                'RIDE ACCEPTED:',
                data
            )

            setRide(data)

            setActivePanel('waiting')

        }

        socket.on(
            'ride-accepted',
            handleRideAccepted
        )

        return () => {

            socket.off(
                'ride-accepted',
                handleRideAccepted
            )

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

            Object.values(
                debounceRef.current
            ).forEach(clearTimeout)

        }

    }, [])

    // ================= CURRENT LOCATION =================

    const reverseGeocode = async (
        lat,
        lon
    ) => {

        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`,
            {
                headers: {
                    'Accept-Language': 'en'
                }
            }
        )

        if (!response.ok) {
            throw new Error(
                'Reverse geocoding failed'
            )
        }

        const data =
            await response.json()

        if (!data?.display_name) {
            throw new Error(
                'No address found'
            )
        }

        return data.display_name
    }

    const getPosition = options =>
        new Promise(
            (resolve, reject) => {

                navigator.geolocation.getCurrentPosition(
                    resolve,
                    reject,
                    options
                )

            }
        )

    const fetchCurrentLocation =
        async () => {

            if (!navigator.geolocation) {

                return alert(
                    'Geolocation is not supported'
                )

            }

            setLocating(true)

            try {

                let position

                try {

                    position =
                        await getPosition({
                            enableHighAccuracy: true,
                            timeout: 8000,
                            maximumAge: 0
                        })

                } catch (error) {

                    if (
                        error.code !== 2 &&
                        error.code !== 3
                    ) {
                        throw error
                    }

                    position =
                        await getPosition({
                            enableHighAccuracy: false,
                            timeout: 15000,
                            maximumAge: 60000
                        })
                }

                const {
                    latitude,
                    longitude
                } = position.coords

                const address =
                    await reverseGeocode(
                        latitude,
                        longitude
                    )

                setPickup(address)

                setSuggestions(s => ({
                    ...s,
                    pickup: []
                }))

                setActiveField(
                    'destination'
                )

                setPanelOpen(true)

            } catch (error) {

                console.error(
                    'Location error:',
                    error
                )

                alert(
                    'Unable to get current location. Please enter pickup manually.'
                )

            } finally {

                setLocating(false)

            }
        }

    // ================= SUGGESTIONS =================

    const setSuggestionsFor =
        (field, list) => {

            setSuggestions(s => ({
                ...s,
                [field]: list
            }))

        }

    const getSuggestions =
        (value, field) => {

            const input =
                value.trim()

            clearTimeout(
                debounceRef.current[field]
            )

            if (input.length < 3) {

                setSuggestionsFor(
                    field,
                    []
                )

                setSuggestionsLoading(false)

                return
            }

            debounceRef.current[field] =
                setTimeout(
                    async () => {

                        const requestId =
                            ++requestIdRef.current[field]

                        setSuggestionsLoading(
                            true
                        )

                        try {

                            const { data } =
                                await axios.get(
                                    `${BASE_URL}/maps/get-suggestions`,
                                    {
                                        params: {
                                            input
                                        },
                                        headers:
                                            authHeaders()
                                    }
                                )

                            if (
                                requestId !==
                                requestIdRef.current[field]
                            ) {
                                return
                            }

                            const list =
                                [
                                    data,
                                    data?.suggestions,
                                    data?.data
                                ].find(
                                    Array.isArray
                                ) || []

                            setSuggestionsFor(
                                field,
                                list
                            )

                        } catch (error) {

                            console.error(
                                'Suggestion error:',
                                error.response?.data ||
                                error.message
                            )

                            setSuggestionsFor(
                                field,
                                []
                            )

                        } finally {

                            setSuggestionsLoading(
                                false
                            )

                        }

                    },
                    400
                )
        }

    // ================= INPUT =================

    const handleChange =
        (field, setter) => e => {

            const value =
                e.target.value

            setter(value)

            setActiveField(field)
            setPanelOpen(true)

            getSuggestions(
                value,
                field
            )
        }

    const focusField =
        field => () => {

            setActiveField(field)
            setPanelOpen(true)

        }

    const handlePickupSelect =
        location => {

            setPickup(location.address)

            setSuggestionsFor(
                'pickup',
                []
            )

            setActiveField(
                'destination'
            )

            setPanelOpen(true)

        }

    const handleDestinationSelect =
        location => {

            setDestination(
                location.address
            )

            setSuggestionsFor(
                'destination',
                []
            )

            setPanelOpen(false)
            setActiveField(null)

        }

    // ================= SEARCH ANIMATION =================

    useGSAP(() => {

        gsap.to(
            panelRef.current,
            {
                height:
                    panelOpen
                        ? '70%'
                        : '0%',
                padding:
                    panelOpen
                        ? 24
                        : 0,
                duration: 0.3,
                ease: 'power2.out'
            }
        )

        gsap.to(
            panelCloseRef.current,
            {
                opacity:
                    panelOpen ? 1 : 0,
                duration: 0.2
            }
        )

    }, [panelOpen])

    // ================= SHEET ANIMATION =================

    useGSAP(() => {

        Object.entries(refs).forEach(
            ([name, ref]) => {

                gsap.to(
                    ref.current,
                    {
                        y:
                            activePanel === name
                                ? 0
                                : '100%',
                        duration: 0.3,
                        ease: 'power2.out'
                    }
                )

            }
        )

    }, [activePanel])

    // ================= FIND TRIP =================

    const findTrip = async () => {

        if (
            !pickup ||
            !destination
        ) {

            return alert(
                'Please enter pickup and destination.'
            )

        }

        setPanelOpen(false)
        setVehiclePanel(true)

        try {

            const { data } =
                await axios.get(
                    `${BASE_URL}/rides/get-fare`,
                    {
                        params: {
                            pickup,
                            destination
                        },
                        headers:
                            authHeaders()
                    }
                )

            console.log(
                'Fare:',
                data
            )

            setFare(data)

        } catch (error) {

            console.error(
                'Fare error:',
                error.response?.data ||
                error.message
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

        if (
            !pickup ||
            !destination ||
            !vehicleType
        ) {
            throw new Error(
                'Missing ride information'
            )
        }

        console.log(
            'Creating ride:',
            {
                pickup,
                destination,
                vehicleType
            }
        )

        const { data } =
            await axios.post(
                `${BASE_URL}/rides/create`,
                {
                    pickup,
                    destination,
                    vehicleType
                },
                {
                    headers:
                        authHeaders()
                }
            )

        console.log(
            'Ride created:',
            data
        )

        const createdRide =
            data?.ride || data

        setRide(createdRide)

        /*
         * IMPORTANT:
         * Do NOT emit "new-ride" from frontend.
         *
         * Backend will:
         * 1. Create ride
         * 2. Find nearby active captains
         * 3. Emit "new-ride" to them
         */

        return data
    }

    // ================= CONFIRM RIDE =================

    const handleConfirmRide =
        async () => {

            try {

                await createRide()

                setConfirmRidePanel(
                    false
                )

                setVehicleFound(
                    true
                )

            } catch (error) {

                console.error(
                    'Create ride error:',
                    error.response?.data ||
                    error.message
                )

                alert(
                    error.response?.data?.message ||
                    error.message ||
                    'Unable to create ride.'
                )

            }
        }

    // ================= STYLES =================

    const sheet =
        'fixed w-full z-10 bottom-0 translate-y-full bg-white px-3 pt-12'

    const inputClass =
        'bg-[#eee] px-12 py-2 text-lg rounded-lg w-full'

    // ================= UI =================

    return (

        <div className='h-screen relative overflow-hidden'>

            {/* LOGO */}

            <div
                className={`absolute left-14 top-5 z-50 transition-all duration-300 ${
                    activePanel === 'search' &&
                    !panelOpen
                        ? 'opacity-100 translate-y-0'
                        : 'opacity-0 -translate-y-3 pointer-events-none'
                }`}
            >

                <h1 className='text-3xl font-extrabold'>
                    Saarthi
                </h1>

            </div>

            {/* LOGOUT */}

            <button
                type='button'
                onClick={handleLogout}
                className='absolute right-5 top-5 z-50 h-11 w-11 bg-white rounded-full shadow-md flex items-center justify-center'
            >

                <i className='text-xl ri-logout-box-r-line' />

            </button>

            {/* MAP */}

            <div className='h-screen w-screen'>
                <LiveTracking />
            </div>

            {/* SEARCH */}

            {activePanel === 'search' && (

                <div className='flex flex-col justify-end h-screen absolute top-0 left-0 w-full pointer-events-none'>

                    <div className='h-[30%] p-6 bg-white relative pointer-events-auto'>

                        <h5
                            ref={panelCloseRef}
                            onClick={() =>
                                setPanelOpen(false)
                            }
                            className='absolute opacity-0 right-6 top-6 text-2xl cursor-pointer'
                        >
                            <i className='ri-arrow-down-wide-line' />
                        </h5>

                        <h4 className='text-2xl font-semibold'>
                            Find a trip
                        </h4>

                        <form
                            className='relative py-3'
                            onSubmit={e =>
                                e.preventDefault()
                            }
                        >

                            <div className='line absolute h-16 w-1 top-[50%] -translate-y-1/2 left-5 bg-gray-700 rounded-full' />

                            {/* PICKUP */}

                            <div className='relative'>

                                <input
                                    value={pickup}
                                    onClick={focusField(
                                        'pickup'
                                    )}
                                    onChange={handleChange(
                                        'pickup',
                                        setPickup
                                    )}
                                    className={`${inputClass} pr-14`}
                                    type='text'
                                    placeholder='Add a pick-up location'
                                />

                                <button
                                    type='button'
                                    disabled={locating}
                                    onClick={
                                        fetchCurrentLocation
                                    }
                                    className='absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-200'
                                >

                                    <i
                                        className={`text-xl ${
                                            locating
                                                ? 'ri-loader-4-line animate-spin'
                                                : 'ri-crosshair-2-line'
                                        }`}
                                    />

                                </button>

                            </div>

                            {/* DESTINATION */}

                            <input
                                value={destination}
                                onClick={focusField(
                                    'destination'
                                )}
                                onChange={handleChange(
                                    'destination',
                                    setDestination
                                )}
                                className={`${inputClass} mt-3`}
                                type='text'
                                placeholder='Enter your destination'
                            />

                        </form>

                        <button
                            onClick={findTrip}
                            className='bg-black text-white px-4 py-2 rounded-lg mt-3 w-full'
                        >
                            Find Trip
                        </button>

                    </div>

                    {/* SUGGESTIONS */}

                    <div
                        ref={panelRef}
                        className='bg-white h-0 overflow-y-auto pointer-events-auto'
                    >

                        <LocationSearchPanel
                            suggestions={
                                suggestions[
                                    activeField
                                ] || []
                            }
                            loading={
                                suggestionsLoading
                            }
                            setPickup={
                                handlePickupSelect
                            }
                            setDestination={
                                handleDestinationSelect
                            }
                            activeField={
                                activeField
                            }
                        />

                    </div>

                </div>
            )}

            {/* BACKDROP */}

            <div
                className={`fixed inset-0 z-[5] bg-black transition-opacity ${
                    activePanel === 'search'
                        ? 'opacity-0 pointer-events-none'
                        : 'opacity-30'
                }`}
            />

            {/* VEHICLE */}

            <div
                ref={refs.vehicle}
                className={`${sheet} py-10`}
            >

                <VehiclePanel
                    selectVehicle={
                        setVehicleType
                    }
                    fare={fare}
                    setConfirmRidePanel={
                        setConfirmRidePanel
                    }
                    setVehiclePanel={
                        setVehiclePanel
                    }
                />

            </div>

            {/* CONFIRM RIDE */}

            <div
                ref={refs.confirm}
                className={`${sheet} py-6`}
            >

                <ConfirmRide
                    pickup={pickup}
                    destination={destination}
                    fare={fare}
                    vehicleType={vehicleType}
                    setConfirmRidePanel={
                        setConfirmRidePanel
                    }
                    setVehicleFound={
                        setVehicleFound
                    }
                    createRide={
                        handleConfirmRide
                    }
                />

            </div>

            {/* LOOKING FOR DRIVER */}

            <div
                ref={refs.looking}
                className={`${sheet} py-6`}
            >

                <LookingForDriver
                    ride={ride}
                    pickup={pickup}
                    destination={destination}
                    fare={fare}
                    vehicleType={vehicleType}
                    setVehicleFound={
                        setVehicleFound
                    }
                />

            </div>

            {/* WAITING FOR DRIVER */}

            <div
                ref={refs.waiting}
                className={`${sheet} py-6`}
            >

                <WaitingForDriver
                    ride={ride}
                    setVehicleFound={
                        setVehicleFound
                    }
                    setWaitingForDriver={
                        setWaitingForDriver
                    }
                    waitingForDriver={
                        waitingForDriver
                    }
                />

            </div>

        </div>
    )
}

export default Home