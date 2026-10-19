import React, {
    useEffect,
    useMemo,
    useRef,
    useState,
    useContext,
    useCallback
} from 'react';

import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import logo from '../assets/logo.png';

import CaptainDetails from '../components/CaptainDetails';
import RidePopUp from '../components/RidePopUp';
import ConfirmRidePopUp from '../components/ConfirmRidePopUp';
import LiveTracking from '../components/LiveTracking';
import CaptainStats from '../components/CaptainStats';
import RideHistory from '../components/RideHistory';

import { CaptainDataContext } from '../context/CapatainContext';
import { SocketContext } from '../context/SocketContext';

const BASE_URL =
    import.meta.env.VITE_API_URL ||
    'http://localhost:3000';

const LOCATION_SEND_MS = 5000;
const OPEN_OTP_AFTER_CONFIRM = false;
const REQUEST_EXPIRY_MS = 60000;

const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json'
});

const getRideId = ride => ride?._id || ride?.rideId || null;

/* Normalize coordinates to Leaflet [latitude, longitude]. */
const toCoords = (lat, lng) => {
    if (
        lat === null || lat === undefined || lat === '' ||
        lng === null || lng === undefined || lng === ''
    ) {
        return null;
    }

    const latitude = Number(lat);
    const longitude = Number(lng);

    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
    ) {
        return null;
    }

    return [latitude, longitude];
};

/* Accept common coordinate payload formats. */
const normalizeLocation = data => {
    const location =
        data?.location ??
        data?.userLocation ??
        data?.captainLocation ??
        data;

    return toCoords(
        location?.ltd ??
        location?.lat ??
        location?.latitude,
        location?.lng ??
        location?.long ??
        location?.longitude
    );
};

/* Fallback: convert a pickup address into [lat, lng]. */
const geocodeAddress = async address => {
    const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
        { headers: { 'Accept-Language': 'en' } }
    );

    if (!response.ok) {
        throw new Error('Geocoding failed');
    }

    const results = await response.json();

    return toCoords(results?.[0]?.lat, results?.[0]?.lon);
};

const CaptainHome = () => {
    const navigate = useNavigate();

    const { captain, updateCaptain } =
        useContext(CaptainDataContext);

    const { socket } = useContext(SocketContext);

    const [ridePopupPanel, setRidePopupPanel] = useState(false);
    const [confirmRidePopupPanel, setConfirmRidePopupPanel] =
        useState(false);

    const [ride, setRide] = useState(null);
    const [pendingRides, setPendingRides] = useState([]);
    const [notifOpen, setNotifOpen] = useState(false);

    const [showLiveTracking, setShowLiveTracking] = useState(false);

    // Leaflet coordinate format: [latitude, longitude].
    const [captainPosition, setCaptainPosition] = useState(null);
    const [userPosition, setUserPosition] = useState(null);
    const [pickupGeo, setPickupGeo] = useState(null);

    const [otp, setOtp] = useState('');
    const [verifyingOtp, setVerifyingOtp] = useState(false);

    const [online, setOnline] = useState(
        captain?.status === 'active'
    );

    const [loading, setLoading] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [cancelling, setCancelling] = useState(false);

    const [expanded, setExpanded] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);

    const locationWatchIdRef = useRef(null);
    const heartbeatRef = useRef(null);
    const lastPositionRef = useRef(null);
    const lastSentRef = useRef(0);
    const lastRestoredRef = useRef('');

    const confirmOpenRef = useRef(false);
    const ridePopupOpenRef = useRef(false);
    const expiryTimersRef = useRef({});

    const activeRideId = getRideId(ride);
    const isTracking = showLiveTracking && Boolean(activeRideId);

    // Pickup coordinates stored on the ride (any common format).
    const pickupFromRide = useMemo(
        () =>
            normalizeLocation(
                ride?.pickupCoordinates || ride?.pickupLocation
            ),
        [ride?.pickupCoordinates, ride?.pickupLocation]
    );

    // Final pickup point: ride data first, geocoded address as fallback.
    const pickupPoint = pickupFromRide || pickupGeo;

    useEffect(() => {
        setPickupGeo(null);

        if (!isTracking || pickupFromRide || !ride?.pickup) return;

        let cancelled = false;

        geocodeAddress(ride.pickup)
            .then(point => {
                if (!cancelled) setPickupGeo(point);
            })
            .catch(error => {
                console.warn('Pickup geocode error:', error.message);
            });

        return () => {
            cancelled = true;
        };
    }, [isTracking, activeRideId, pickupFromRide, ride?.pickup]);

    useEffect(() => {
        confirmOpenRef.current =
            confirmRidePopupPanel || showLiveTracking;
    }, [confirmRidePopupPanel, showLiveTracking]);

    useEffect(() => {
        ridePopupOpenRef.current = ridePopupPanel;
    }, [ridePopupPanel]);

    /* ================= REQUEST QUEUE ================= */

    const clearExpiryTimer = useCallback(id => {
        if (!id) return;

        const key = String(id);

        if (expiryTimersRef.current[key]) {
            clearTimeout(expiryTimersRef.current[key]);
            delete expiryTimersRef.current[key];
        }
    }, []);

    const removePending = useCallback((id) => {
        if (!id) return;

        clearExpiryTimer(id);

        setPendingRides(previous =>
            previous.filter(
                item => String(getRideId(item)) !== String(id)
            )
        );
    }, [clearExpiryTimer]);

    const clearAllPending = useCallback(() => {
        Object.values(expiryTimersRef.current).forEach(clearTimeout);
        expiryTimersRef.current = {};

        setPendingRides([]);
        setNotifOpen(false);
    }, []);

    useEffect(() => {
        return () => {
            Object.values(expiryTimersRef.current).forEach(clearTimeout);
            expiryTimersRef.current = {};
        };
    }, []);

    const openRequest = request => {
        setRide(request);
        setNotifOpen(false);
        setRidePopupPanel(true);
    };

    const dismissRequest = id => {
        removePending(id);

        if (String(getRideId(ride)) === String(id)) {
            setRidePopupPanel(false);
            setRide(null);
        }
    };

    useEffect(() => {
        if (pendingRides.length === 0) {
            setNotifOpen(false);
        }
    }, [pendingRides.length]);

    /* ================= CAPTAIN STATUS ================= */

    useEffect(() => {
        if (captain) {
            setOnline(captain.status === 'active');
        }
    }, [captain]);

    useEffect(() => {
        if (!online) {
            clearAllPending();
        }
    }, [online, clearAllPending]);

    /* ================= CLEAR STALE MAP POSITIONS ================= */

    useEffect(() => {
        // Do not show the previous passenger on a different ride.
        setUserPosition(null);
    }, [activeRideId]);

    /* ================= CAPTAIN LOCATION SENDING ================= */

    const sendLocation = useCallback((force = false) => {
        if (
            !socket ||
            !captain?._id ||
            !lastPositionRef.current ||
            !socket.connected
        ) {
            return;
        }

        const now = Date.now();

        if (
            !force &&
            now - lastSentRef.current < LOCATION_SEND_MS - 500
        ) {
            return;
        }

        lastSentRef.current = now;

        socket.emit('update-location-captain', {
            userId: captain._id,
            location: lastPositionRef.current
        });
    }, [socket, captain?._id]);

    /* ================= SOCKET JOIN / RECONNECT ================= */

    useEffect(() => {
        if (!socket || !captain?._id) return;

        const joinCaptain = () => {
            const token = localStorage.getItem('token');

            if (!token) {
                console.error('Captain socket join failed: token missing');
                return;
            }

            socket.emit(
                'join',
                {
                    userId: captain._id,
                    userType: 'captain',
                    token
                },
                response => {
                    if (response?.ok) {
                        console.log('Captain socket room joined');

                        // Send latest known location after joining.
                        sendLocation(true);
                    } else {
                        console.error(
                            'Captain socket join failed:',
                            response?.message || 'Unknown error'
                        );
                    }
                }
            );
        };

        if (socket.connected) {
            joinCaptain();
        }

        socket.on('connect', joinCaptain);

        return () => {
            socket.off('connect', joinCaptain);
        };
    }, [socket, captain?._id, sendLocation]);

    /* ================= CAPTAIN GPS TRACKING ================= */

    const startLocationTracking = useCallback(() => {
        if (
            !socket ||
            !captain?._id ||
            !navigator.geolocation ||
            locationWatchIdRef.current !== null
        ) {
            return;
        }

        const onSuccess = position => {
            const { latitude, longitude } = position.coords;
            const point = toCoords(latitude, longitude);

            if (!point) return;

            lastPositionRef.current = {
                ltd: latitude,
                lng: longitude
            };

            setCaptainPosition(previous =>
                previous &&
                previous[0] === point[0] &&
                previous[1] === point[1]
                    ? previous
                    : point
            );

            sendLocation();
        };

        const onError = error => {
            console.error(
                'Captain location error:',
                error.code,
                error.message
            );
        };

        navigator.geolocation.getCurrentPosition(
            onSuccess,
            onError,
            {
                enableHighAccuracy: false,
                maximumAge: 60000,
                timeout: 15000
            }
        );

        locationWatchIdRef.current =
            navigator.geolocation.watchPosition(
                onSuccess,
                onError,
                {
                    enableHighAccuracy: true,
                    maximumAge: 5000,
                    timeout: 30000
                }
            );

        heartbeatRef.current = setInterval(() => {
            sendLocation();
        }, LOCATION_SEND_MS);
    }, [socket, captain?._id, sendLocation]);

    const stopLocationTracking = useCallback(() => {
        if (locationWatchIdRef.current !== null) {
            if (navigator.geolocation) {
                navigator.geolocation.clearWatch(
                    locationWatchIdRef.current
                );
            }

            locationWatchIdRef.current = null;
        }

        if (heartbeatRef.current !== null) {
            clearInterval(heartbeatRef.current);
            heartbeatRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (!socket || !captain?._id) return;

        if (online || showLiveTracking) {
            startLocationTracking();
        } else {
            stopLocationTracking();
        }

        return () => {
            stopLocationTracking();
        };
    }, [
        socket,
        captain?._id,
        online,
        showLiveTracking,
        startLocationTracking,
        stopLocationTracking
    ]);

    /* ================= RECEIVE PASSENGER LIVE LOCATION ================= */

    useEffect(() => {
        if (!socket || !activeRideId || !showLiveTracking) {
            return;
        }

        const currentRideId = String(activeRideId);

        const handleUserLocation = data => {
            console.log('USER LIVE LOCATION RECEIVED:', data);

            const incomingRideId =
                data?.rideId ??
                data?.ride?._id ??
                data?.ride?.rideId;

            // Ignore a location update explicitly belonging to another ride.
            if (
                incomingRideId &&
                String(incomingRideId) !== currentRideId
            ) {
                return;
            }

            const point = normalizeLocation(data);

            if (!point) {
                console.warn(
                    'Invalid passenger location payload:',
                    data
                );
                return;
            }

            setUserPosition(previous =>
                previous &&
                previous[0] === point[0] &&
                previous[1] === point[1]
                    ? previous
                    : point
            );
        };

        socket.on('user-live-location', handleUserLocation);

        return () => {
            socket.off('user-live-location', handleUserLocation);
        };
    }, [socket, activeRideId, showLiveTracking]);

    /* ================= RESTORE RUNNING RIDE ================= */

    const restoreRide = useCallback(async (initial = false) => {
        try {
            const { data } = await axios.get(
                `${BASE_URL}/rides/captain/active`,
                { headers: authHeaders() }
            );

            const running = data?.ride;

            if (!running) {
                lastRestoredRef.current = '';
                return null;
            }

            const runningId = getRideId(running);

            if (!runningId) return null;

            const key = `${runningId}:${running.status}`;

            if (lastRestoredRef.current === key) {
                return running;
            }

            lastRestoredRef.current = key;

            if (running.status === 'ongoing') {
                sessionStorage.setItem(
                    'activeRide',
                    JSON.stringify(running)
                );

                navigate('/captain-riding', {
                    state: { ride: running }
                });

                return running;
            }

            if (running.status === 'accepted') {
                setRide(previous => {
                    if (
                        String(getRideId(previous)) !==
                        String(runningId)
                    ) {
                        return running;
                    }

                    return {
                        ...previous,
                        ...running,
                        user:
                            running.user &&
                            typeof running.user === 'object'
                                ? running.user
                                : previous.user
                    };
                });

                clearAllPending();
                setRidePopupPanel(false);
                setShowLiveTracking(true);
                setExpanded(false);

                if (initial) {
                    setConfirmRidePopupPanel(
                        OPEN_OTP_AFTER_CONFIRM
                    );
                }
            }

            return running;
        } catch (error) {
            console.error(
                'RESTORE RIDE ERROR:',
                error.response?.data || error.message
            );

            return undefined;
        }
    }, [navigate, clearAllPending]);

    useEffect(() => {
        restoreRide(true);
    }, [restoreRide]);

    useEffect(() => {
        const handleVisible = () => {
            if (document.visibilityState === 'visible') {
                restoreRide(false);
            }
        };

        const handleReconnect = () => {
            restoreRide(false);
        };

        document.addEventListener(
            'visibilitychange',
            handleVisible
        );

        socket?.io?.on('reconnect', handleReconnect);

        return () => {
            document.removeEventListener(
                'visibilitychange',
                handleVisible
            );

            socket?.io?.off('reconnect', handleReconnect);
        };
    }, [socket, restoreRide]);

    /* ================= RESET RIDE ================= */

    const resetRideState = useCallback(() => {
        setRide(null);
        setShowLiveTracking(false);
        setConfirmRidePopupPanel(false);
        setRidePopupPanel(false);
        setOtp('');

        setUserPosition(null);
        setCaptainPosition(null);

        lastPositionRef.current = null;
        lastSentRef.current = 0;
        lastRestoredRef.current = '';
    }, []);

    /* ================= CANCEL RIDE ================= */

    const cancelRide = async () => {
        const rideId = getRideId(ride);

        if (!rideId) {
            resetRideState();
            return;
        }

        if (cancelling) return;

        if (!window.confirm('Cancel this ride?')) return;

        setCancelling(true);

        try {
            await axios.post(
                `${BASE_URL}/rides/captain/cancel`,
                { rideId },
                { headers: authHeaders() }
            );

            resetRideState();
        } catch (error) {
            console.error(
                'CANCEL RIDE ERROR:',
                error.response?.data || error.message
            );

            const active = await restoreRide(false);

            if (active === null) {
                resetRideState();
                return;
            }

            alert(
                error.response?.data?.message ||
                'Unable to cancel the ride.'
            );
        } finally {
            setCancelling(false);
        }
    };

    /* ================= PASSENGER CANCELLED ================= */

    useEffect(() => {
        if (!socket) return;

        const handleCancelled = data => {
            const cancelledId = data?.rideId;

            removePending(cancelledId);

            const currentId = getRideId(ride);

            if (!currentId) return;

            if (
                cancelledId &&
                String(cancelledId) !== String(currentId)
            ) {
                return;
            }

            resetRideState();
            alert('The passenger cancelled the ride.');
        };

        socket.on('ride-cancelled', handleCancelled);

        return () => {
            socket.off('ride-cancelled', handleCancelled);
        };
    }, [
        socket,
        activeRideId,
        removePending,
        resetRideState
    ]);

    /* ================= ONLINE / OFFLINE ================= */

    const toggleOnlineStatus = async () => {
        if (loading) return;

        const token = localStorage.getItem('token');

        if (!token) {
            console.error('Token not found');
            return;
        }

        const newStatus = online ? 'inactive' : 'active';

        setLoading(true);

        try {
            const response = await axios.patch(
                `${BASE_URL}/captains/status`,
                { status: newStatus },
                { headers: authHeaders() }
            );

            if (response.status === 200) {
                const updatedCaptain = response.data.captain;

                setOnline(updatedCaptain.status === 'active');
                updateCaptain?.(updatedCaptain);
            }
        } catch (error) {
            console.error(
                'STATUS ERROR:',
                error.response?.data || error.message
            );
        } finally {
            setLoading(false);
        }
    };

    /* ================= NEW RIDE ================= */

    useEffect(() => {
        if (!socket) return;

        const handleNewRide = data => {
            console.log('NEW RIDE RECEIVED:', data);

            const incoming = data?.ride || data;
            const id = getRideId(incoming);

            if (!incoming || !id) return;

            if (confirmOpenRef.current) return;

            setPendingRides(previous =>
                previous.some(
                    item =>
                        String(getRideId(item)) === String(id)
                )
                    ? previous
                    : [...previous, incoming]
            );

            if (REQUEST_EXPIRY_MS > 0) {
                clearExpiryTimer(id);

                expiryTimersRef.current[String(id)] = setTimeout(() => {
                    delete expiryTimersRef.current[String(id)];

                    setPendingRides(previous =>
                        previous.filter(
                            item =>
                                String(getRideId(item)) !== String(id)
                        )
                    );
                }, REQUEST_EXPIRY_MS);
            }

            if (!ridePopupOpenRef.current) {
                setRide(incoming);
                setRidePopupPanel(true);
            }
        };

        socket.on('new-ride', handleNewRide);

        return () => {
            socket.off('new-ride', handleNewRide);
        };
    }, [socket, clearExpiryTimer]);

    /* ================= CONFIRM RIDE ================= */

    const confirmRide = async () => {
        if (confirming) return;

        const rideId = getRideId(ride);

        if (!rideId) {
            console.error('Ride ID missing:', ride);
            return;
        }

        if (!localStorage.getItem('token')) {
            console.error('Captain token missing');
            return;
        }

        try {
            setConfirming(true);

            const response = await axios.post(
                `${BASE_URL}/rides/confirm`,
                { rideId },
                { headers: authHeaders() }
            );

            if (response.status === 200) {
                const confirmedData =
                    response.data.ride || response.data;

                // Keep passenger and pickup data from the request popup.
                const confirmedRide = {
                    ...ride,
                    ...confirmedData,
                    user:
                        confirmedData?.user &&
                        typeof confirmedData.user === 'object'
                            ? confirmedData.user
                            : ride?.user
                };

                console.log('RIDE CONFIRMED:', confirmedRide);

                setRide(confirmedRide);
                setUserPosition(null);

                clearAllPending();

                setRidePopupPanel(false);
                setShowLiveTracking(true);
                setExpanded(false);

                setConfirmRidePopupPanel(
                    OPEN_OTP_AFTER_CONFIRM
                );

                sendLocation(true);
            }
        } catch (error) {
            console.error(
                'CONFIRM RIDE ERROR:',
                error.response?.data || error.message
            );

            const status = error.response?.status;

            if ([400, 404, 409].includes(status)) {
                alert(
                    error.response?.data?.message ||
                    'Ride is no longer available'
                );

                removePending(rideId);
                setRidePopupPanel(false);
                setRide(null);
            } else {
                alert('Unable to confirm ride. Please try again.');
            }
        } finally {
            setConfirming(false);
        }
    };

    /* ================= VERIFY OTP / START RIDE ================= */

    const verifyOtp = async () => {
        const rideId = getRideId(ride);

        if (!rideId || otp.length !== 6 || verifyingOtp) return;

        if (!localStorage.getItem('token')) {
            console.error('Captain token missing');
            return;
        }

        try {
            setVerifyingOtp(true);

            const response = await axios.get(
                `${BASE_URL}/rides/start-ride`,
                {
                    params: { rideId, otp },
                    headers: authHeaders()
                }
            );

            if (response.status === 200) {
                const startedRide = {
                    ...response.data,
                    user:
                        response.data?.user &&
                        typeof response.data.user === 'object'
                            ? response.data.user
                            : ride?.user
                };

                setConfirmRidePopupPanel(false);
                setRidePopupPanel(false);
                setShowLiveTracking(false);
                setOtp('');

                sessionStorage.setItem(
                    'activeRide',
                    JSON.stringify(startedRide)
                );

                navigate('/captain-riding', {
                    state: { ride: startedRide }
                });
            }
        } catch (error) {
            console.error(
                'VERIFY OTP ERROR:',
                error.response?.data || error.message
            );

            alert(
                error.response?.data?.message || 'Invalid OTP'
            );
        } finally {
            setVerifyingOtp(false);
        }
    };

    /* ================= UI ================= */

    const popupBase =
        'fixed inset-x-0 bottom-0 flex max-h-[88dvh] flex-col overflow-hidden ' +
        'rounded-t-[28px] bg-white shadow-2xl ' +
        'transition-[transform,visibility] duration-300 ease-out ' +
        'lg:mx-auto lg:max-w-xl';

    const popupState = open =>
        open
            ? 'visible translate-y-0'
            : 'invisible pointer-events-none translate-y-full';

    const passengerName =
        ride?.user?.fullname?.firstname || 'Passenger';

    const roundButton =
        'pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full ' +
        'bg-white text-[#12334A] shadow-lg transition-all duration-200 ' +
        'hover:bg-[#F15A24] hover:text-white active:scale-95 sm:h-12 sm:w-12';

    return (
        <div className="relative h-[100dvh] w-full overflow-hidden bg-gray-100">

            {/* LIVE MAP */}
            <div className="absolute inset-0 z-0">
                <LiveTracking
                    role="captain"
                    tracking={isTracking}
                    captainLocation={
                        isTracking ? captainPosition : null
                    }
                    userLocation={
                        isTracking ? userPosition : null
                    }
                    pickupLocation={pickupPoint}
                    pickupAddress={ride?.pickup || ''}
                    showInfo={true}
                    infoTop="calc(max(1rem, env(safe-area-inset-top)) + 3.75rem)"
                    fitPadding={{
                        top: 140,
                        right: 50,
                        left: 50,
                        bottom: Math.round(window.innerHeight * 0.46)
                    }}
                />
            </div>

            {/* TOP BAR */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 sm:pt-[max(1.5rem,env(safe-area-inset-top))]">

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

                <div className="pointer-events-auto flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => setNotifOpen(value => !value)}
                        aria-label={`Ride requests (${pendingRides.length})`}
                        aria-expanded={notifOpen}
                        className={`${roundButton} relative`}
                    >
                        <i className={`text-xl ri-notification-3-line ${
                            pendingRides.length > 0 ? 'animate-pulse' : ''
                        }`} />

                        {pendingRides.length > 0 && (
                            <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[#F15A24] px-1 text-[11px] font-bold text-white ring-2 ring-white">
                                {pendingRides.length > 9
                                    ? '9+'
                                    : pendingRides.length}
                            </span>
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={() => setHistoryOpen(true)}
                        aria-label="Past rides"
                        className={roundButton}
                    >
                        <i className="text-xl ri-history-line" />
                    </button>

                    <Link
                        to="/captain/logout"
                        aria-label="Logout"
                        className={roundButton}
                    >
                        <i className="text-xl ri-logout-box-r-line" />
                    </Link>
                </div>
            </div>

            {/* BOTTOM DASHBOARD */}
            <div className="absolute inset-x-0 bottom-0 z-20">
                <div className={`flex flex-col overflow-hidden rounded-t-[28px] bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.15)] transition-[max-height] duration-300 ease-out ${
                    expanded ? 'max-h-[80dvh]' : 'max-h-[44dvh]'
                }`}>

                    <button
                        type="button"
                        onClick={() => setExpanded(value => !value)}
                        aria-label={expanded ? 'Collapse dashboard' : 'Show full dashboard'}
                        aria-expanded={expanded}
                        className="group relative flex w-full shrink-0 items-center justify-center pb-2 pt-2 active:scale-95"
                    >
                        <span className="absolute top-2 h-1 w-12 rounded-full bg-gray-300" />
                        <span className="mt-2 flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-[#12334A] shadow-md">
                            <i className={`text-xl ${
                                expanded
                                    ? 'ri-arrow-down-s-line'
                                    : 'ri-arrow-up-s-line'
                            }`} />
                        </span>
                    </button>

                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 sm:px-8">

                        <div className="mb-4 flex items-center gap-3">
                            <span className="h-7 w-2 rounded-full bg-[#F15A24]" />
                            <h2 className="text-2xl font-extrabold text-[#12334A] sm:text-3xl">
                                Captain dashboard
                            </h2>
                        </div>

                        {/* ACTIVE RIDE */}
                        {showLiveTracking && ride && (
                            <div className="mb-3 rounded-xl bg-[#F15A24]/10 p-4 ring-1 ring-[#F15A24]/30">
                                <p className="text-xs font-semibold uppercase tracking-wide text-[#F15A24]">
                                    Ride accepted
                                </p>

                                <h3 className="truncate font-semibold text-[#12334A]">
                                    {passengerName}
                                </h3>

                                <p className="mt-0.5 line-clamp-2 text-xs text-gray-600">
                                    {ride.pickup}
                                </p>

                                <button
                                    type="button"
                                    onClick={() => setConfirmRidePopupPanel(true)}
                                    className="mt-3 w-full rounded-xl bg-[#12334A] py-3 font-semibold text-white hover:bg-[#F15A24]"
                                >
                                    Reached pickup · Enter OTP
                                </button>

                                <button
                                    type="button"
                                    onClick={cancelRide}
                                    disabled={cancelling}
                                    className="mt-2 w-full rounded-xl border border-red-200 bg-white py-3 font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                                >
                                    {cancelling ? 'Cancelling...' : 'Cancel ride'}
                                </button>
                            </div>
                        )}

                        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">

                            {/* ONLINE STATUS */}
                            <div className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 ${
                                online
                                    ? 'bg-[#F15A24]/10 ring-1 ring-[#F15A24]/30'
                                    : 'bg-gray-100'
                            }`}>
                                <div className="flex min-w-0 items-center gap-3">
                                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                                        online
                                            ? 'bg-[#F15A24] text-white'
                                            : 'bg-white text-gray-400'
                                    }`}>
                                        <i className="text-2xl ri-steering-2-line" />
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
                                                : 'Go online to receive rides'}
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
                                    className={`h-8 w-14 shrink-0 rounded-full p-1 transition-colors ${
                                        online ? 'bg-[#12334A]' : 'bg-gray-300'
                                    } ${loading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                                >
                                    <div className={`h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
                                        online ? 'translate-x-6' : 'translate-x-0'
                                    }`} />
                                </button>
                            </div>

                            <div className="md:col-span-2 lg:col-span-2">
                                <CaptainStats />
                            </div>
                        </div>

                        <div className="mt-3">
                            <CaptainDetails />
                        </div>
                    </div>
                </div>
            </div>

            {/* NOTIFICATION LIST */}
            {notifOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setNotifOpen(false)}
                    />

                    <div className="fixed right-5 top-[4.5rem] z-50 w-[calc(100%-2.5rem)] max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 sm:right-8 sm:top-20">
                        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                            <h3 className="font-extrabold text-[#12334A]">
                                Ride requests
                            </h3>
                            <span className="rounded-full bg-[#F15A24]/10 px-2 py-0.5 text-xs font-semibold text-[#F15A24]">
                                {pendingRides.length}
                            </span>
                        </div>

                        <div className="max-h-[50dvh] overflow-y-auto overscroll-contain">
                            {pendingRides.length === 0 ? (
                                <p className="px-4 py-8 text-center text-sm text-gray-500">
                                    No pending ride requests
                                </p>
                            ) : (
                                pendingRides.map(request => {
                                    const id = getRideId(request);

                                    return (
                                        <div
                                            key={id}
                                            className="flex items-start gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0"
                                        >
                                            <button
                                                type="button"
                                                onClick={() => openRequest(request)}
                                                className="min-w-0 flex-1 text-left"
                                            >
                                                <p className="truncate font-semibold text-[#12334A]">
                                                    {request.user?.fullname?.firstname || 'New ride request'}
                                                    {request.fare != null && (
                                                        <span className="ml-2 text-sm font-bold text-[#F15A24]">
                                                            ₹{request.fare}
                                                        </span>
                                                    )}
                                                </p>

                                                <p className="line-clamp-1 text-xs text-gray-600">
                                                    <i className="ri-map-pin-user-fill mr-1" />
                                                    {request.pickup}
                                                </p>

                                                <p className="line-clamp-1 text-xs text-gray-600">
                                                    <i className="ri-map-pin-2-fill mr-1" />
                                                    {request.destination}
                                                </p>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => dismissRequest(id)}
                                                aria-label="Dismiss request"
                                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-600"
                                            >
                                                <i className="text-lg ri-close-line" />
                                            </button>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* BACKDROP */}
            <div
                aria-hidden="true"
                className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 ${
                    ridePopupPanel || confirmRidePopupPanel
                        ? 'opacity-100'
                        : 'pointer-events-none opacity-0'
                }`}
            />

            {/* RIDE REQUEST POPUP */}
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

            {/* CONFIRM RIDE / OTP POPUP */}
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

            {/* PAST RIDES */}
            {historyOpen && (
                <RideHistory
                    role="captain"
                    onClose={() => setHistoryOpen(false)}
                />
            )}
        </div>
    );
};

export default CaptainHome;