
import React, {
    useRef,
    useState,
    useContext,
    useEffect,
    useCallback
} from 'react';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

import LocationSearchPanel from '../components/LocationSearchPanel';
import VehiclePanel from '../components/VehiclePanel';
import ConfirmRide from '../components/ConfirmRide';
import LookingForDriver from '../components/LookingForDriver';
import WaitingForDriver from '../components/WaitingForDriver';
import LiveTracking from '../components/LiveTracking';
import RideHistory from '../components/RideHistory';

import { UserDataContext } from '../context/UserContext';
import { SocketContext } from '../context/SocketContext';

const BASE_URL =
    import.meta.env.VITE_API_URL || 'http://localhost:3000';

const DRIVER_SEARCH_TIMEOUT = 30000;

const FRONT_VEHICLE_KEY = {
    auto: 'auto',
    car: 'car',
    motorcycle: 'moto'
};

const authHeaders = () => {
    const token = localStorage.getItem('token');

    return token
        ? { Authorization: `Bearer ${token}` }
        : {};
};

const hiddenSheetStyle = {
    transform: 'translateY(100%)'
};

const toCoords = (lat, lng) => {
    if (
        lat === null ||
        lat === undefined ||
        lat === '' ||
        lng === null ||
        lng === undefined ||
        lng === ''
    ) {
        return null;
    }

    const latitude = Number(lat);
    const longitude = Number(lng);

    return Number.isFinite(latitude) &&
        Number.isFinite(longitude)
        ? [latitude, longitude]
        : null;
};

const Home = () => {
    const { user } = useContext(UserDataContext);
    const { socket } = useContext(SocketContext);

    const navigate = useNavigate();

    // ================= STATES =================

    const [pickup, setPickup] = useState('');
    const [destination, setDestination] = useState('');

    const [panelOpen, setPanelOpen] = useState(false);
    const [activeField, setActiveField] = useState(null);

    const [suggestions, setSuggestions] = useState({
        pickup: [],
        destination: []
    });

    const [suggestionsLoading, setSuggestionsLoading] =
        useState(false);

    const [fare, setFare] = useState({});
    const [vehicleType, setVehicleType] = useState(null);

    const [ride, setRide] = useState(null);

    const [locating, setLocating] = useState(false);
    const [creatingRide, setCreatingRide] = useState(false);

    const [noDriverFound, setNoDriverFound] = useState(false);

    const [showLiveTracking, setShowLiveTracking] =
        useState(false);

    const [captainLocation, setCaptainLocation] = useState(null);

    const [historyOpen, setHistoryOpen] = useState(false);
    const [restoring, setRestoring] = useState(true);
    const [cancelling, setCancelling] = useState(false);

    // search | vehicle | confirm | looking | waiting
    const [activePanel, setActivePanel] = useState('search');

    const waitingForDriver = activePanel === 'waiting';

    const setVehiclePanel = open => {
        setActivePanel(open ? 'vehicle' : 'search');
    };

    const setConfirmRidePanel = open => {
        setActivePanel(open ? 'confirm' : 'search');
    };

    const setVehicleFound = open => {
        setActivePanel(open ? 'looking' : 'search');
    };

    const setWaitingForDriver = open => {
        setActivePanel(open ? 'waiting' : 'search');
    };

    // ================= REFS =================

    const refs = {
        vehicle: useRef(null),
        confirm: useRef(null),
        looking: useRef(null),
        waiting: useRef(null)
    };

    const panelRef = useRef(null);
    const panelCloseRef = useRef(null);

    const debounceRef = useRef({});

    const requestIdRef = useRef({
        pickup: 0,
        destination: 0
    });

    const lastRestoredRef = useRef('');

    // Prevent an old polling response from overriding a newer ride event.
    const rideStatusRequestRef = useRef(0);

    // ================= RESET RIDE =================

    const resetRideState = useCallback(() => {
        // Invalidate requests that started before the reset.
        rideStatusRequestRef.current += 1;

        setRide(null);
        setShowLiveTracking(false);
        setCaptainLocation(null);
        setNoDriverFound(false);

        setActivePanel('search');

        setVehicleType(null);
        setFare({});

        lastRestoredRef.current = '';
    }, []);

    // ================= USER SOCKET JOIN =================

    useEffect(() => {
        if (!socket || !user?._id) return;

        const joinUser = () => {
            const token = localStorage.getItem('token');

            if (!token) {
                console.error('User socket join failed: token missing');
                return;
            }

            console.log('USER SOCKET CONNECTED:', socket.id);

            socket.emit(
                'join',
                {
                    userId: user._id,
                    userType: 'user',
                    token
                },
                response => {
                    if (response?.ok) {
                        console.log('User socket joined successfully');
                    } else {
                        console.error(
                            'User socket join failed:',
                            response?.message || response
                        );
                    }
                }
            );
        };

        if (socket.connected) {
            joinUser();
        }

        socket.on('connect', joinUser);

        return () => {
            socket.off('connect', joinUser);
        };
    }, [socket, user?._id]);

    // ================= RESTORE RUNNING RIDE =================

    const restoreRide = useCallback(async (includePending = false) => {
        const requestId = ++rideStatusRequestRef.current;

        try {
            const { data } = await axios.get(
                `${BASE_URL}/rides/active`,
                { headers: authHeaders() }
            );

            // A newer request or a ride event has superseded this response.
            if (requestId !== rideStatusRequestRef.current) {
                return undefined;
            }

            const running = data?.ride;

            // No active ride, or ride has reached a terminal status.
            if (
                !running ||
                ['completed', 'cancelled'].includes(
                    String(running.status || '').toLowerCase()
                )
            ) {
                resetRideState();
                return null;
            }

            // On reconnect, do not force a pending ride screen open
            // if the user has already returned to the search screen.
            if (
                running.status === 'pending' &&
                !includePending
            ) {
                return running;
            }

            const key = `${running._id}:${running.status}`;

            if (lastRestoredRef.current === key) {
                return running;
            }

            lastRestoredRef.current = key;

            // Ride has started: open the riding page.
            if (running.status === 'ongoing') {
                setRide(running);
                setShowLiveTracking(false);
                setCaptainLocation(null);

                navigate('/riding', {
                    state: { ride: running }
                });

                return running;
            }

            const type =
                FRONT_VEHICLE_KEY[running.vehicleType] ||
                running.vehicleType ||
                null;

            setRide(running);
            setPickup(running.pickup || '');
            setDestination(running.destination || '');
            setVehicleType(type);
            setFare(type ? { [type]: running.fare } : {});

            setNoDriverFound(false);

            if (running.status === 'accepted') {
                setCaptainLocation(null);
                setShowLiveTracking(true);
                setActivePanel('waiting');
            } else {
                // Pending ride: still searching for a captain.
                setShowLiveTracking(false);
                setCaptainLocation(null);
                setActivePanel('looking');
            }

            return running;
        } catch (error) {
            console.error(
                'RESTORE RIDE ERROR:',
                error.response?.data || error.message
            );

            // Do not clear the current screen just because the API
            // temporarily failed. The server has not confirmed the ride ended.
            return undefined;
        }
    }, [navigate, resetRideState]);

    // First page load.
    useEffect(() => {
        let mounted = true;

        restoreRide(true).finally(() => {
            if (mounted) {
                setRestoring(false);
            }
        });

        return () => {
            mounted = false;
        };
    }, [restoreRide]);

    // Resync when the user returns to the app or socket reconnects.
    useEffect(() => {
        if (!socket) return;

        const handleVisible = () => {
            if (document.visibilityState === 'visible') {
                restoreRide(false);
            }
        };

        const handleReconnect = () => {
            restoreRide(false);
        };

        document.addEventListener('visibilitychange', handleVisible);
        socket.io.on('reconnect', handleReconnect);

        return () => {
            document.removeEventListener(
                'visibilitychange',
                handleVisible
            );

            socket.io.off('reconnect', handleReconnect);
        };
    }, [socket, restoreRide]);

    // ================= ACTIVE RIDE STATUS POLLING =================
    // Fallback for a missed ride-completed socket event.

    useEffect(() => {
        const shouldPoll =
            activePanel === 'waiting' ||
            activePanel === 'looking' ||
            showLiveTracking;

        if (!shouldPoll) return;

        const intervalId = setInterval(() => {
            restoreRide(false);
        }, 5000);

        return () => clearInterval(intervalId);
    }, [activePanel, showLiveTracking, restoreRide]);

    // ================= CANCEL RIDE =================

    const cancelRide = async ({
        ask = true,
        pendingOnly = false,
        silent = false
    } = {}) => {
        const rideId = ride?._id;

        if (!rideId) {
            resetRideState();
            return true;
        }

        if (cancelling) return false;

        if (ask && !window.confirm('Cancel this ride?')) {
            return false;
        }

        setCancelling(true);

        try {
            await axios.post(
                `${BASE_URL}/rides/cancel`,
                { rideId, pendingOnly },
                { headers: authHeaders() }
            );

            resetRideState();

            return true;
        } catch (error) {
            console.error(
                'CANCEL RIDE ERROR:',
                error.response?.data || error.message
            );

            const active = await restoreRide(false);

            if (active === null) {
                resetRideState();
                return true;
            }

            if (!silent) {
                alert(
                    error.response?.data?.message ||
                    'Unable to cancel the ride.'
                );
            }

            return false;
        } finally {
            setCancelling(false);
        }
    };

    const retryRide = async () => {
        if (ride?._id) {
            const done = await cancelRide({
                ask: false,
                pendingOnly: true,
                silent: true
            });

            if (!done) return;
        }

        setConfirmRidePanel(true);
    };

    // ================= CAPTAIN CANCELLED =================

    useEffect(() => {
        if (!socket) return;

        const handleCancelled = data => {
            if (
                data?.rideId &&
                ride?._id &&
                String(data.rideId) !== String(ride._id)
            ) {
                return;
            }

            resetRideState();

            alert('Your captain cancelled the ride. Please book again.');
        };

        socket.on('ride-cancelled', handleCancelled);

        return () => {
            socket.off('ride-cancelled', handleCancelled);
        };
    }, [socket, ride?._id, resetRideState]);

    // ================= RIDE ACCEPTED =================

    useEffect(() => {
        if (!socket) return;

        const handleRideAccepted = data => {
            console.log('RIDE ACCEPTED:', data);

            const acceptedRide = data?.ride || data;

            if (
                !acceptedRide ||
                typeof acceptedRide !== 'object'
            ) {
                console.error('Invalid ride-accepted payload:', data);
                return;
            }

            // Ignore an event for another ride.
            if (
                acceptedRide._id &&
                ride?._id &&
                String(acceptedRide._id) !== String(ride._id)
            ) {
                return;
            }

            rideStatusRequestRef.current += 1;
            lastRestoredRef.current = '';

            setRide(acceptedRide);
            setCaptainLocation(null);
            setShowLiveTracking(true);
            setNoDriverFound(false);
            setActivePanel('waiting');
        };

        socket.on('ride-accepted', handleRideAccepted);

        return () => {
            socket.off('ride-accepted', handleRideAccepted);
        };
    }, [socket, ride?._id]);

    // ================= RIDE STARTED =================

    useEffect(() => {
        if (!socket) return;

        const handleRideStarted = data => {
            console.log('RIDE STARTED:', data);

            const startedRide = data?.ride || data;
            const startedRideId =
                startedRide?.rideId || startedRide?._id;

            if (
                startedRideId &&
                ride?._id &&
                String(startedRideId) !== String(ride._id)
            ) {
                return;
            }

            // Confirm current status with the server before navigation.
            restoreRide(false);
        };

        socket.on('ride-started', handleRideStarted);

        return () => {
            socket.off('ride-started', handleRideStarted);
        };
    }, [socket, ride?._id, restoreRide]);

    // ================= RIDE COMPLETED =================

    useEffect(() => {
        if (!socket) return;

        const handleRideCompleted = data => {
            console.log('RIDE COMPLETED EVENT:', data);

            const completedRideId =
                data?.rideId ||
                data?.ride?._id ||
                data?._id;

            // Ignore completion events belonging to another ride.
            if (
                completedRideId &&
                ride?._id &&
                String(completedRideId) !== String(ride._id)
            ) {
                return;
            }

            resetRideState();

            // Clear the previous booking details as well.
            setPickup('');
            setDestination('');
            setVehicleType(null);
            setFare({});

            console.log(
                'Ride completed: waiting screen and live tracking cleared.'
            );
        };

        socket.on('ride-completed', handleRideCompleted);

        return () => {
            socket.off('ride-completed', handleRideCompleted);
        };
    }, [socket, ride?._id, resetRideState]);

    // ================= NO DRIVER AVAILABLE =================

    useEffect(() => {
        setNoDriverFound(false);

        if (activePanel !== 'looking' || !ride?._id) {
            return;
        }

        const timer = setTimeout(() => {
            setNoDriverFound(true);
        }, DRIVER_SEARCH_TIMEOUT);

        return () => clearTimeout(timer);
    }, [activePanel, ride?._id]);

    useEffect(() => {
        if (!socket) return;

        const handleNoCaptains = () => {
            setNoDriverFound(true);
        };

        socket.on('no-captains-available', handleNoCaptains);

        return () => {
            socket.off('no-captains-available', handleNoCaptains);
        };
    }, [socket]);

    // ================= CAPTAIN LIVE LOCATION =================

    useEffect(() => {
        if (!socket) return;

        const handleCaptainLocation = data => {
            const point = toCoords(
                data?.ltd ?? data?.location?.ltd,
                data?.lng ?? data?.location?.lng
            );

            if (!point) {
                console.error('Invalid captain location:', data);
                return;
            }

            setCaptainLocation(previous =>
                previous &&
                previous[0] === point[0] &&
                previous[1] === point[1]
                    ? previous
                    : point
            );
        };

        socket.on(
            'captain-location-update',
            handleCaptainLocation
        );

        return () => {
            socket.off(
                'captain-location-update',
                handleCaptainLocation
            );
        };
    }, [socket]);

    // ================= LOGOUT =================

    const handleLogout = () => {
        localStorage.removeItem('token');
        navigate('/login');
    };

    // ================= CLEANUP =================

    useEffect(() => {
        return () => {
            Object.values(debounceRef.current).forEach(clearTimeout);
        };
    }, []);

    // ================= CURRENT LOCATION =================

    const reverseGeocode = async (lat, lon) => {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`,
            {
                headers: {
                    'Accept-Language': 'en'
                }
            }
        );

        if (!response.ok) {
            throw new Error('Reverse geocoding failed');
        }

        const data = await response.json();

        if (!data?.display_name) {
            throw new Error('No address found');
        }

        return data.display_name;
    };

    const getPosition = options =>
        new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                resolve,
                reject,
                options
            );
        });

    const fetchCurrentLocation = async () => {
        if (!navigator.geolocation) {
            alert('Geolocation is not supported');
            return;
        }

        if (locating) return;

        setLocating(true);

        try {
            let position;

            try {
                position = await getPosition({
                    enableHighAccuracy: true,
                    timeout: 8000,
                    maximumAge: 0
                });
            } catch (error) {
                if (error.code !== 2 && error.code !== 3) {
                    throw error;
                }

                position = await getPosition({
                    enableHighAccuracy: false,
                    timeout: 15000,
                    maximumAge: 60000
                });
            }

            const { latitude, longitude } = position.coords;

            const address = await reverseGeocode(
                latitude,
                longitude
            );

            setPickup(address);

            setSuggestions(previous => ({
                ...previous,
                pickup: []
            }));

            setActiveField('destination');
            setPanelOpen(true);
        } catch (error) {
            console.error('Location error:', error);

            alert(
                'Unable to get current location. Please enter pickup manually.'
            );
        } finally {
            setLocating(false);
        }
    };

    // ================= SUGGESTIONS =================

    const setSuggestionsFor = (field, list) => {
        setSuggestions(previous => ({
            ...previous,
            [field]: list
        }));
    };

    const getSuggestions = (value, field) => {
        const input = value.trim();

        clearTimeout(debounceRef.current[field]);

        if (input.length < 3) {
            requestIdRef.current[field]++;

            setSuggestionsFor(field, []);
            setSuggestionsLoading(false);

            return;
        }

        debounceRef.current[field] = setTimeout(async () => {
            const requestId = ++requestIdRef.current[field];

            setSuggestionsLoading(true);

            try {
                const { data } = await axios.get(
                    `${BASE_URL}/maps/get-suggestions`,
                    {
                        params: { input },
                        headers: authHeaders()
                    }
                );

                if (
                    requestId !== requestIdRef.current[field]
                ) {
                    return;
                }

                const list =
                    [data, data?.suggestions, data?.data].find(
                        Array.isArray
                    ) || [];

                setSuggestionsFor(field, list);
            } catch (error) {
                if (
                    requestId !== requestIdRef.current[field]
                ) {
                    return;
                }

                console.error(
                    'Suggestion error:',
                    error.response?.data || error.message
                );

                setSuggestionsFor(field, []);
            } finally {
                if (
                    requestId === requestIdRef.current[field]
                ) {
                    setSuggestionsLoading(false);
                }
            }
        }, 400);
    };

    // ================= INPUT =================

    const handleChange = (field, setter) => event => {
        const value = event.target.value;

        setter(value);

        setActiveField(field);
        setPanelOpen(true);

        getSuggestions(value, field);
    };

    const focusField = field => () => {
        setActiveField(field);
        setPanelOpen(true);
    };

    const handlePickupSelect = location => {
        setPickup(location.address);

        setSuggestionsFor('pickup', []);

        setActiveField('destination');
        setPanelOpen(true);
    };

    const handleDestinationSelect = location => {
        setDestination(location.address);

        setSuggestionsFor('destination', []);

        setActiveField('destination');
        setPanelOpen(true);
    };

    // ================= SEARCH ANIMATION =================

    useGSAP(() => {
        if (panelRef.current) {
            gsap.to(panelRef.current, {
                height: panelOpen ? '70%' : '0%',
                padding: panelOpen ? 24 : 0,
                duration: 0.3,
                ease: 'power2.out'
            });
        }

        if (panelCloseRef.current) {
            gsap.to(panelCloseRef.current, {
                opacity: panelOpen ? 1 : 0,
                duration: 0.2
            });
        }
    }, [panelOpen]);

    // ================= SHEET ANIMATION =================

    useGSAP(() => {
        Object.entries(refs).forEach(([name, ref]) => {
            if (!ref.current) return;

            gsap.to(ref.current, {
                y: activePanel === name ? 0 : '100%',
                duration: 0.3,
                ease: 'power2.out'
            });
        });
    }, [activePanel]);

    // ================= FIND TRIP =================

    const findTrip = async () => {
        if (!pickup || !destination) {
            alert('Please enter pickup and destination.');
            return;
        }

        if (pickup.trim() === destination.trim()) {
            alert('Pickup and destination cannot be the same.');
            return;
        }

        setPanelOpen(false);
        setVehiclePanel(true);

        try {
            const { data } = await axios.get(
                `${BASE_URL}/rides/get-fare`,
                {
                    params: { pickup, destination },
                    headers: authHeaders()
                }
            );

            console.log('Fare:', data);

            setFare(data);
        } catch (error) {
            console.error(
                'Fare error:',
                error.response?.data || error.message
            );

            setVehiclePanel(false);

            alert(
                error.response?.data?.message ||
                'Unable to calculate fare.'
            );
        }
    };

    // ================= CREATE RIDE =================

    const createRide = async () => {
        if (!pickup || !destination || !vehicleType) {
            throw new Error('Missing ride information');
        }

        console.log('Creating ride:', {
            pickup,
            destination,
            vehicleType
        });

        const { data } = await axios.post(
            `${BASE_URL}/rides/create`,
            {
                pickup,
                destination,
                vehicleType
            },
            {
                headers: authHeaders()
            }
        );

        const createdRide = data?.ride || data;

        console.log('Ride created:', createdRide);

        setRide(createdRide);
        lastRestoredRef.current = '';

        // Do not emit "new-ride" from the frontend.
        // The backend should notify nearby captains.

        return data;
    };

    // ================= CONFIRM RIDE =================

    const handleConfirmRide = async () => {
        if (creatingRide) return;

        setCreatingRide(true);

        setShowLiveTracking(false);
        setCaptainLocation(null);
        setNoDriverFound(false);

        try {
            await createRide();

            setVehicleFound(true);
        } catch (error) {
            console.error(
                'Create ride error:',
                error.response?.data || error.message
            );

            alert(
                error.response?.data?.message ||
                error.message ||
                'Unable to create ride.'
            );
        } finally {
            setCreatingRide(false);
        }
    };

    // ================= STYLES =================

    const sheet =
        'fixed w-full z-10 bottom-0 bg-white px-3 pt-12';

    const inputClass =
        'bg-[#eee] px-12 py-2 text-lg rounded-lg w-full';

    const showBackdrop =
        activePanel !== 'search' &&
        !(showLiveTracking && activePanel === 'waiting');

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
                aria-label="Logout"
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
                <div className="h-[30%] p-6 bg-white relative pointer-events-auto rounded-t-[28px] shadow-[0_-8px_30px_rgba(18,51,74,0.08)]">

                    {/* UP / DOWN ARROW */}

                    <button
                        type="button"
                        onClick={() => {
                            setActiveField(
                                field => field || 'destination'
                            );

                            setPanelOpen(value => !value);
                        }}
                        aria-label={
                            panelOpen
                                ? 'Close search panel'
                                : 'Open search panel'
                        }
                        aria-expanded={panelOpen}
                        className="absolute left-1/2 top-2 z-[60] flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-2xl text-[#12334A] shadow-lg transition-all duration-300 hover:text-[#F15A24] active:scale-90"
                    >
                        <i
                            className={
                                panelOpen
                                    ? 'ri-arrow-down-s-line'
                                    : 'ri-arrow-up-s-line'
                            }
                        />
                    </button>

                    {/* HEADING */}

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
                        {/* CONNECTING LINE */}

                        <div className="line absolute h-16 w-1 top-[50%] -translate-y-1/2 left-5 bg-[#12334A] rounded-full" />

                        {/* PICKUP */}

                        <div className="relative">
                            <input
                                value={pickup}
                                onClick={focusField('pickup')}
                                onChange={handleChange(
                                    'pickup',
                                    setPickup
                                )}
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
                            onChange={handleChange(
                                'destination',
                                setDestination
                            )}
                            className={`${inputClass} mt-3 border-gray-300 text-[#12334A] focus:border-[#F15A24] focus:ring-2 focus:ring-[#F15A24]/15`}
                            type="text"
                            placeholder="Enter your destination"
                        />
                    </form>

                    {/* FIND TRIP */}

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
                    onCancel={() => cancelRide()}
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

            {/* FIRST LOAD */}

            {restoring && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-white/80">
                    <p className="text-sm font-semibold text-[#12334A]">
                        Loading your ride...
                    </p>
                </div>
            )}
        </div>
    );
};

export default Home;
