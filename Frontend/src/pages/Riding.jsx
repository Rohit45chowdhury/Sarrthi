
import React, {
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState
} from 'react';

import { Link, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';

import LiveTracking from '../components/LiveTracking';

import { SocketContext } from '../context/SocketContext';
import { UserDataContext } from '../context/UserContext';

const BASE_URL =
    import.meta.env.VITE_API_URL ||
    'http://localhost:3000';

const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`
});

const readStoredRide = () => {
    try {
        return JSON.parse(sessionStorage.getItem('activeRide') || 'null');
    } catch {
        return null;
    }
};

const getRideId = ride => ride?._id || ride?.rideId || null;

const normalizeCoordinates = data => {
    if (!data) return null;

    const location = data.location || data;

    const rawLat =
        location.lat ??
        location.latitude ??
        location.ltd;

    const rawLng =
        location.lng ??
        location.longitude;

    if (
        rawLat === null ||
        rawLat === undefined ||
        rawLat === '' ||
        rawLng === null ||
        rawLng === undefined ||
        rawLng === ''
    ) {
        return null;
    }

    const lat = Number(rawLat);
    const lng = Number(rawLng);

    if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        Math.abs(lat) > 90 ||
        Math.abs(lng) > 180
    ) {
        return null;
    }

    return [lat, lng];
};

const Riding = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const { socket } = useContext(SocketContext);
    const { user } = useContext(UserDataContext);

    const [ride, setRide] = useState(
        () => location.state?.ride || readStoredRide()
    );

    const [captainLocation, setCaptainLocation] = useState(null);

    const rideId = getRideId(ride);

    // Keep the latest values available to socket callbacks.
    const rideIdRef = useRef(rideId);
    const lastUserPositionRef = useRef(null);
    const lastLocationEmitRef = useRef(0);
    const joinedRef = useRef(false);

    useEffect(() => {
        rideIdRef.current = rideId;
    }, [rideId]);

    const leaveRide = useCallback(() => {
        try {
            sessionStorage.removeItem('activeRide');
        } catch (error) {
            console.warn('Unable to clear stored ride:', error);
        }

        navigate('/home', {
            replace: true,
            state: { rideEnded: true }
        });
    }, [navigate]);

    // ==========================================
    // PERSIST ACTIVE RIDE
    // ==========================================

    useEffect(() => {
        if (!ride) return;

        try {
            sessionStorage.setItem('activeRide', JSON.stringify(ride));
        } catch (error) {
            console.warn('Unable to store active ride:', error);
        }
    }, [ride]);

    // ==========================================
    // REFRESH ACTIVE RIDE FROM BACKEND
    // ==========================================

    useEffect(() => {
        let cancelled = false;

        const refreshRide = async () => {
            try {
                const { data } = await axios.get(
                    `${BASE_URL}/rides/active`,
                    { headers: authHeaders() }
                );

                if (cancelled) return;

                const running = data?.ride;

                if (!running) {
                    // Only clear the ride when the API successfully
                    // confirms there is no active ride.
                    const storedRide = readStoredRide();

                    if (storedRide) {
                        leaveRide();
                    }

                    return;
                }

                if (running.status !== 'ongoing') {
                    console.warn(
                        'Active ride has unexpected status:',
                        running.status
                    );
                    return;
                }

                setRide(previous => ({
                    ...(previous || {}),
                    ...running,
                    captain: running.captain || previous?.captain
                }));
            } catch (error) {
                // A network/server error must not automatically end the ride.
                console.error(
                    'RIDING REFRESH ERROR:',
                    error.response?.data || error.message
                );
            }
        };

        refreshRide();

        return () => {
            cancelled = true;
        };
    }, [leaveRide]);

    // ==========================================
    // JOIN USER SOCKET + SEND USER GPS
    // ==========================================

    useEffect(() => {
        if (!socket || !user?._id) return;

        let active = true;
        let joinInProgress = false;

        const emitLatestLocation = (force = false) => {
            if (
                !active ||
                !socket.connected ||
                !joinedRef.current ||
                !lastUserPositionRef.current ||
                !rideIdRef.current
            ) {
                return;
            }

            const now = Date.now();

            // Limit ordinary GPS updates to one every 3 seconds.
            if (
                !force &&
                now - lastLocationEmitRef.current < 3000
            ) {
                return;
            }

            lastLocationEmitRef.current = now;

            socket.emit('user-live-location', {
                rideId: String(rideIdRef.current),
                location: {
                    ltd: lastUserPositionRef.current.lat,
                    lng: lastUserPositionRef.current.lng
                }
            });
        };

        const joinUser = () => {
            if (!active || !socket.connected || joinInProgress) {
                return;
            }

            const token = localStorage.getItem('token');

            if (!token) {
                console.error(
                    'User socket: authentication token missing.'
                );
                return;
            }

            joinInProgress = true;
            joinedRef.current = false;

            socket.emit(
                'join',
                {
                    userId: user._id,
                    userType: 'user',
                    token
                },
                response => {
                    joinInProgress = false;

                    if (!active) return;

                    if (response?.ok) {
                        joinedRef.current = true;

                        console.log(
                            'User socket joined successfully.'
                        );

                        // Send the latest GPS immediately after joining.
                        emitLatestLocation(true);
                    } else {
                        joinedRef.current = false;

                        console.error(
                            'User socket join failed:',
                            response?.message || 'Unknown error'
                        );
                    }
                }
            );
        };

        const handleConnect = () => {
            console.log('User socket connected:', socket.id);
            joinUser();
        };

        const handleDisconnect = reason => {
            joinedRef.current = false;
            joinInProgress = false;

            console.warn(
                'User socket disconnected:',
                reason
            );
        };

        const handleConnectError = error => {
            console.error(
                'User socket connection error:',
                error.message
            );
        };

        const handleSocketError = error => {
            console.error(
                'User socket error:',
                error?.message || error
            );
        };

        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('connect_error', handleConnectError);
        socket.on('error', handleSocketError);

        // The socket may already be connected when this component mounts.
        if (socket.connected) {
            joinUser();
        }

        let watchId = null;

        if (navigator.geolocation) {
            watchId = navigator.geolocation.watchPosition(
                position => {
                    if (!active) return;

                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;

                    if (
                        !Number.isFinite(lat) ||
                        !Number.isFinite(lng) ||
                        Math.abs(lat) > 90 ||
                        Math.abs(lng) > 180
                    ) {
                        return;
                    }

                    // Always save the latest position, even if the
                    // socket is disconnected or not yet authenticated.
                    lastUserPositionRef.current = { lat, lng };

                    emitLatestLocation(false);
                },
                error => {
                    console.error(
                        'User GPS error:',
                        error.code,
                        error.message
                    );
                },
                {
                    enableHighAccuracy: true,
                    maximumAge: 2000,
                    timeout: 15000
                }
            );
        } else {
            console.error(
                'Geolocation is not supported by this browser.'
            );
        }

        // Resend the last known position while the user is stationary.
        const heartbeat = setInterval(() => {
            emitLatestLocation(true);
        }, 5000);

        return () => {
            active = false;
            joinedRef.current = false;
            joinInProgress = false;

            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
            socket.off('connect_error', handleConnectError);
            socket.off('error', handleSocketError);

            if (watchId !== null) {
                navigator.geolocation.clearWatch(watchId);
            }

            clearInterval(heartbeat);
        };
    }, [socket, user?._id]);

    // ==========================================
    // RECEIVE CAPTAIN LIVE GPS
    // ==========================================

    useEffect(() => {
        if (!socket || !rideId) return;

        // Don't display an old ride's location while waiting
        // for the new ride's first location update.
        setCaptainLocation(null);

        const handleCaptainLocation = data => {
            if (!data) return;

            // Ignore updates for another ride.
            if (
                data.rideId != null &&
                String(data.rideId) !== String(rideId)
            ) {
                return;
            }

            const coordinates = normalizeCoordinates(data);

            if (!coordinates) return;

            setCaptainLocation(previous => {
                if (
                    previous &&
                    previous[0] === coordinates[0] &&
                    previous[1] === coordinates[1]
                ) {
                    return previous;
                }

                return coordinates;
            });
        };

        socket.on(
            'captain-location-update',
            handleCaptainLocation
        );

        socket.on(
            'captain-location',
            handleCaptainLocation
        );

        return () => {
            socket.off(
                'captain-location-update',
                handleCaptainLocation
            );

            socket.off(
                'captain-location',
                handleCaptainLocation
            );
        };
    }, [socket, rideId]);

    // ==========================================
    // RIDE ENDED
    // ==========================================

    useEffect(() => {
        if (!socket) return;

        const handleRideEnded = () => {
            console.log('Ride ended');
            leaveRide();
        };

        socket.on('ride-ended', handleRideEnded);

        return () => {
            socket.off('ride-ended', handleRideEnded);
        };
    }, [socket, leaveRide]);

    // ==========================================
    // NO ACTIVE RIDE
    // ==========================================

    if (!ride) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100 p-5">
                <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-xl">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
                        <i className="ri-error-warning-line text-3xl text-red-500" />
                    </div>

                    <h2 className="mt-4 text-xl font-bold text-[#12334A]">
                        No active ride
                    </h2>

                    <p className="mt-2 text-sm text-gray-500">
                        Please book a ride to continue.
                    </p>

                    <Link
                        to="/home"
                        state={{ rideEnded: true }}
                        className="mt-6 inline-flex w-full justify-center rounded-xl bg-[#12334A] px-5 py-3 font-semibold text-white"
                    >
                        Back to Home
                    </Link>
                </div>
            </div>
        );
    }

    const captain = ride?.captain;

    const captainName =
        captain?.fullname?.firstname || 'Captain';

    const vehicleType =
        captain?.vehicle?.vehicleType ||
        ride?.vehicleType ||
        'Car';

    const vehiclePlate =
        captain?.vehicle?.plate || 'WB-00-XX-0000';

    return (
        <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-gray-100 lg:flex-row">

            {/* MAP */}
            <div className="relative h-[48dvh] min-h-[280px] w-full shrink-0 overflow-hidden bg-gray-200 sm:h-[55dvh] lg:h-full lg:flex-1">
                <LiveTracking
                    role="user"
                    captainLocation={captainLocation}
                />

                <div className="pointer-events-none absolute inset-x-0 top-0 z-[400] h-28 bg-gradient-to-b from-[#12334A]/50 to-transparent" />

                <div className="absolute left-4 top-4 z-[500] rounded-xl bg-white px-4 py-2 shadow-lg">
                    <h1 className="text-xl font-extrabold tracking-tight text-[#12334A]">
                        Saarthi<span className="text-[#F15A24]">.</span>
                    </h1>
                </div>

                <div className="absolute bottom-4 left-4 z-[500] flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-lg">
                    <span className="relative flex h-2.5 w-2.5">
                        <span
                            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${
                                captainLocation
                                    ? 'bg-green-500'
                                    : 'bg-amber-500'
                            }`}
                        />

                        <span
                            className={`relative h-2.5 w-2.5 rounded-full ${
                                captainLocation
                                    ? 'bg-green-500'
                                    : 'bg-amber-500'
                            }`}
                        />
                    </span>

                    <span className="text-xs font-semibold text-[#12334A]">
                        {captainLocation
                            ? 'Captain location received'
                            : 'Waiting for captain location'}
                    </span>
                </div>
            </div>

            {/* RIDE DETAILS */}
            <div className="relative z-[450] flex min-h-0 w-full flex-1 flex-col overflow-y-auto rounded-t-[28px] bg-white px-4 pb-6 pt-4 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] sm:px-6 lg:h-full lg:max-h-full lg:w-[420px] lg:flex-none lg:rounded-none lg:border-l lg:border-gray-100 lg:px-6 lg:pt-8 lg:shadow-none xl:w-[460px]">

                <div className="mx-auto mb-5 h-1 w-12 shrink-0 rounded-full bg-gray-300 lg:hidden" />

                {/* HEADER */}
                <div className="mb-5 flex items-center justify-between">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                            Your journey
                        </p>

                        <h2 className="mt-1 text-xl font-extrabold text-[#12334A]">
                            Ride in progress
                        </h2>
                    </div>

                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50">
                        <i className="ri-taxi-fill text-2xl text-[#F15A24]" />
                    </div>
                </div>

                {/* CAPTAIN CARD */}
                <div className="rounded-2xl bg-gradient-to-br from-[#12334A] to-[#1d4e6e] p-4 text-white shadow-lg">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-2xl font-extrabold text-[#12334A] ring-2 ring-[#F15A24]">
                                {String(captainName).charAt(0).toUpperCase()}
                            </div>

                            <div className="min-w-0">
                                <p className="text-xs text-white/60">
                                    Your Captain
                                </p>

                                <h3 className="truncate text-lg font-bold capitalize">
                                    {captainName}
                                </h3>

                                <p className="text-xs capitalize text-white/70">
                                    {vehicleType}
                                </p>
                            </div>
                        </div>

                        <div className="shrink-0 text-right">
                            <p className="text-xs text-white/60">
                                Total fare
                            </p>

                            <h3 className="text-2xl font-extrabold">
                                ₹{ride?.fare ?? 0}
                            </h3>
                        </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between rounded-xl bg-white/10 px-4 py-3">
                        <div>
                            <p className="text-[10px] uppercase tracking-wider text-white/60">
                                Vehicle number
                            </p>

                            <p className="mt-1 text-lg font-bold tracking-wider">
                                {vehiclePlate}
                            </p>
                        </div>

                        <i className="ri-car-line text-3xl text-[#F15A24]" />
                    </div>
                </div>

                {/* ROUTE DETAILS */}
                <div className="mt-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                    <div className="flex gap-4">
                        <div className="flex flex-col items-center pt-1">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#12334A]/10 text-[#12334A]">
                                <i className="ri-map-pin-user-fill" />
                            </div>

                            <div className="my-1 min-h-12 flex-1 border-l-2 border-dashed border-gray-300" />

                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-50 text-[#F15A24]">
                                <i className="ri-map-pin-2-fill" />
                            </div>
                        </div>

                        <div className="min-w-0 flex-1">
                            <div className="pb-5">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                    Pickup location
                                </p>

                                <p className="mt-1 break-words text-sm font-semibold leading-relaxed text-[#12334A]">
                                    {ride?.pickup || 'Pickup not available'}
                                </p>
                            </div>

                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                    Destination
                                </p>

                                <p className="mt-1 break-words text-sm font-semibold leading-relaxed text-[#12334A]">
                                    {ride?.destination || 'Destination not available'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* PAYMENT */}
                <div className="mt-5 rounded-2xl border border-gray-100 p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-50">
                                <i className="ri-wallet-3-line text-xl text-green-600" />
                            </div>

                            <div>
                                <h3 className="font-semibold text-[#12334A]">
                                    Cash Payment
                                </h3>

                                <p className="text-xs text-gray-500">
                                    Pay after reaching destination
                                </p>
                            </div>
                        </div>

                        <h3 className="text-lg font-bold text-[#12334A]">
                            ₹{ride?.fare ?? 0}
                        </h3>
                    </div>
                </div>

                {/* FOOTER */}
                <div className="mt-5 rounded-xl bg-[#12334A]/5 p-3 text-center">
                    <i className="ri-shield-check-line mr-1 text-[#F15A24]" />

                    <span className="text-xs font-medium text-[#12334A]">
                        Have a safe and comfortable journey with Saarthi.
                    </span>
                </div>
            </div>
        </div>
    );
};

export default Riding;
