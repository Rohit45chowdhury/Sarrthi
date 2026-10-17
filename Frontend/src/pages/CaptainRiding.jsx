
import React, {
    useContext,
    useEffect,
    useRef,
    useState
} from 'react';

import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

import FinishRide from '../components/FinishRide';
import LiveTracking from '../components/LiveTracking';

import { SocketContext } from '../context/SocketContext';
import { CaptainDataContext } from '../context/CapatainContext';

const readStoredRide = () => {
    try {
        return JSON.parse(sessionStorage.getItem('activeRide') || 'null');
    } catch {
        return null;
    }
};

const normalizeCoordinates = data => {
    if (!data) return null;

    const source = data.location || data;

    const rawLat = source.lat ?? source.latitude ?? source.ltd;
    const rawLng = source.lng ?? source.longitude;

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

    return { lat, lng };
};

const CaptainRiding = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const { socket } = useContext(SocketContext);
    const { captain } = useContext(CaptainDataContext);

    const [finishRidePanel, setFinishRidePanel] = useState(false);
    const [rideCardExpanded, setRideCardExpanded] = useState(true);
    const [userLocation, setUserLocation] = useState(null);

    const finishRidePanelRef = useRef(null);
    const rideCardRef = useRef(null);

    const lastPosRef = useRef(null);
    const joinedRef = useRef(false);

    const [rideData] = useState(
        () => location.state?.ride || readStoredRide()
    );

    const rideId = rideData?._id || rideData?.rideId;

    // ==========================================
    // PERSIST ACTIVE RIDE
    // ==========================================

    useEffect(() => {
        if (!rideData) return;

        try {
            sessionStorage.setItem(
                'activeRide',
                JSON.stringify(rideData)
            );
        } catch (error) {
            console.warn('Unable to store active ride:', error);
        }
    }, [rideData]);

    // ==========================================
    // JOIN CAPTAIN ROOM + SEND CAPTAIN GPS
    // ==========================================

    useEffect(() => {
        if (!socket || !captain?._id || !rideId) return;

        if (!navigator.geolocation) {
            console.error(
                'Geolocation is not supported by this browser.'
            );
            return;
        }

        let active = true;
        let joinInProgress = false;

        const sendLocation = () => {
            if (
                !active ||
                !socket.connected ||
                !joinedRef.current ||
                !lastPosRef.current
            ) {
                return;
            }

            const locationData = {
                ltd: lastPosRef.current.lat,
                lng: lastPosRef.current.lng
            };

            // This is the location event handled by notification-service.
            // It saves the captain location and relays it to the passenger.
            socket.emit('update-location-captain', {
                location: locationData
            });
        };

        const joinCaptain = () => {
            if (!active || !socket.connected || joinInProgress) {
                return;
            }

            const token = localStorage.getItem('token');

            if (!token) {
                console.error(
                    'Captain socket: authentication token missing.'
                );
                return;
            }

            joinInProgress = true;
            joinedRef.current = false;

            socket.emit(
                'join',
                {
                    userId: captain._id,
                    userType: 'captain',
                    token
                },
                response => {
                    joinInProgress = false;

                    if (!active) return;

                    if (response?.ok) {
                        joinedRef.current = true;

                        console.log(
                            'Captain socket joined successfully.'
                        );

                        // Immediately send the latest GPS after joining.
                        sendLocation();
                    } else {
                        joinedRef.current = false;

                        console.error(
                            'Captain socket join failed:',
                            response?.message || 'Unknown error'
                        );
                    }
                }
            );
        };

        const handleConnect = () => {
            console.log('Captain socket connected:', socket.id);
            joinCaptain();
        };

        const handleDisconnect = reason => {
            joinedRef.current = false;
            joinInProgress = false;

            console.warn(
                'Captain socket disconnected:',
                reason
            );
        };

        const handleConnectError = error => {
            console.error(
                'Captain socket connection error:',
                error.message
            );
        };

        // Register socket listeners before attempting to join.
        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('connect_error', handleConnectError);

        // Start GPS watcher. Save the last position even if the socket
        // is disconnected; sendLocation will send it after reconnect.
        const watchId = navigator.geolocation.watchPosition(
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

                lastPosRef.current = { lat, lng };

                sendLocation();
            },
            error => {
                console.error(
                    'Captain GPS error:',
                    error.code,
                    error.message
                );
            },
            {
                enableHighAccuracy: true,
                maximumAge: 2000,
                timeout: 30000
            }
        );

        // Socket might already be connected on component mount.
        if (socket.connected) {
            joinCaptain();
        }

        // Send last known location periodically while stationary.
        const heartbeat = setInterval(sendLocation, 5000);

        return () => {
            active = false;
            joinedRef.current = false;
            joinInProgress = false;

            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
            socket.off('connect_error', handleConnectError);

            navigator.geolocation.clearWatch(watchId);
            clearInterval(heartbeat);
        };
    }, [socket, captain?._id, rideId]);

    // ==========================================
    // RECEIVE PASSENGER LIVE GPS
    // ==========================================

    useEffect(() => {
        if (!socket || !rideId) return;

        setUserLocation(null);

        const handleUserLocation = data => {
            if (!data) return;

            // Ignore updates belonging to another ride.
            if (
                data.rideId == null ||
                String(data.rideId) !== String(rideId)
            ) {
                return;
            }

            const coordinates = normalizeCoordinates(data);

            if (!coordinates) {
                console.warn(
                    'Ignored invalid passenger GPS coordinates.'
                );
                return;
            }

            setUserLocation(previous => {
                if (
                    previous &&
                    previous.lat === coordinates.lat &&
                    previous.lng === coordinates.lng
                ) {
                    return previous;
                }

                return coordinates;
            });
        };

        socket.on('user-live-location', handleUserLocation);

        return () => {
            socket.off('user-live-location', handleUserLocation);
        };
    }, [socket, rideId]);

    // ==========================================
    // RIDE CARD ANIMATION
    // ==========================================

    useGSAP(() => {
        if (!rideCardRef.current) return;

        gsap.to(rideCardRef.current, {
            maxHeight: rideCardExpanded ? '82dvh' : '36dvh',
            duration: 0.35,
            ease: 'power2.inOut',
            overwrite: 'auto'
        });
    }, [rideCardExpanded]);

    // ==========================================
    // FINISH RIDE PANEL ANIMATION
    // ==========================================

    useGSAP(() => {
        if (!finishRidePanelRef.current) return;

        gsap.to(finishRidePanelRef.current, {
            y: finishRidePanel ? 0 : '100%',
            duration: 0.4,
            ease: finishRidePanel ? 'power3.out' : 'power3.inOut',
            overwrite: 'auto'
        });
    }, [finishRidePanel]);

    // ==========================================
    // NO ACTIVE RIDE
    // ==========================================

    if (!rideData) {
        return (
            <div className="flex h-screen w-full items-center justify-center p-5">
                <div className="text-center">
                    <i className="ri-error-warning-line text-5xl text-red-500" />

                    <h2 className="mt-3 text-xl font-bold">
                        No active ride
                    </h2>

                    <p className="mt-2 text-gray-500">
                        Accept a ride and enter the OTP to start one.
                    </p>

                    <button
                        type="button"
                        onClick={() => navigate('/captain-home')}
                        className="mt-5 rounded-lg bg-black px-6 py-3 text-white"
                    >
                        Back to Home
                    </button>
                </div>
            </div>
        );
    }

    const distanceKm =
        rideData?.distance != null &&
        Number.isFinite(Number(rideData.distance))
            ? (Number(rideData.distance) / 1000).toFixed(1)
            : null;

    const passengerName = [
        rideData?.user?.fullname?.firstname,
        rideData?.user?.fullname?.lastname
    ].filter(Boolean).join(' ') || 'Passenger';

    const passengerImage =
        rideData?.user?.profileImage ||
        rideData?.user?.profilePhoto ||
        rideData?.user?.avatar ||
        rideData?.user?.image ||
        rideData?.user?.photo;

    return (
        <div className="relative h-[100dvh] w-full overflow-hidden bg-gray-100">

            {/* LIVE MAP */}
            <div className="absolute inset-0 z-0">
                <LiveTracking
                    role="captain"
                    userLocation={userLocation}
                />
            </div>

            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-28 bg-gradient-to-b from-[#12334A]/40 to-transparent" />

            {/* TOP BAR */}
            <div className="absolute inset-x-0 top-0 z-30 p-4 sm:p-6">
                <div className="flex items-center justify-between gap-2">
                    <div className="rounded-xl bg-white px-4 py-2 shadow-lg">
                        <h1 className="text-xl font-extrabold leading-none tracking-tight text-[#12334A] sm:text-2xl">
                            Saarthi<span className="text-[#F15A24]">.</span>
                        </h1>
                    </div>

                    <div className="flex h-10 items-center gap-2 rounded-full bg-white px-3 shadow-lg sm:px-4">
                        <span className="relative flex h-2.5 w-2.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#F15A24] opacity-60" />
                            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#F15A24]" />
                        </span>

                        <span className="text-xs font-semibold text-[#12334A]">
                            Trip in progress
                        </span>
                    </div>

                    <Link
                        to="/captain-home"
                        aria-label="Go to captain home"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#12334A] shadow-lg transition hover:bg-[#F15A24] hover:text-white"
                    >
                        <i className="ri-home-5-line text-xl" />
                    </Link>
                </div>
            </div>

            {/* RIDE CARD */}
            <div className="absolute inset-x-0 bottom-0 z-20 lg:inset-x-auto lg:bottom-6 lg:left-6 lg:w-[26rem]">
                <div
                    ref={rideCardRef}
                    style={{ maxHeight: '82dvh' }}
                    className="overflow-y-auto overscroll-contain rounded-t-[28px] bg-white px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_40px_rgba(0,0,0,0.2)] sm:px-6 lg:rounded-3xl lg:shadow-2xl"
                >
                    <button
                        type="button"
                        onClick={() =>
                            setRideCardExpanded(previous => !previous)
                        }
                        aria-label={
                            rideCardExpanded
                                ? 'Collapse ride card'
                                : 'Expand ride card'
                        }
                        aria-expanded={rideCardExpanded}
                        className="group sticky top-0 z-10 flex w-full items-center justify-center bg-white pb-3 pt-2"
                    >
                        <span className="flex h-10 w-14 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-[#12334A] shadow-sm transition-all duration-200 group-hover:border-[#F15A24] group-hover:bg-[#F15A24] group-hover:text-white active:scale-90">
                            <i
                                className={`text-2xl transition-transform duration-300 ${
                                    rideCardExpanded
                                        ? 'ri-arrow-down-s-line'
                                        : 'ri-arrow-up-s-line'
                                }`}
                            />
                        </span>
                    </button>

                    <p className="mb-3 text-center text-xs font-medium text-gray-400">
                        {rideCardExpanded
                            ? 'Tap the arrow to show more map'
                            : 'Tap the arrow to view ride details'}
                    </p>

                    {/* PASSENGER + FARE */}
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#12334A] to-[#1d4e6e] p-4 text-white shadow-lg">
                        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[#F15A24]/20" />
                        <div className="absolute -bottom-10 -left-6 h-24 w-24 rounded-full bg-white/5" />

                        <div className="relative flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                                <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-xl font-extrabold text-[#12334A] ring-4 ring-[#F15A24] ring-offset-2 ring-offset-[#12334A]">
                                    <span>
                                        {String(
                                            rideData?.user?.fullname?.firstname || 'P'
                                        ).charAt(0).toUpperCase()}
                                    </span>

                                    {passengerImage && (
                                        <img
                                            src={passengerImage}
                                            alt={passengerName}
                                            className="absolute inset-0 h-full w-full object-cover"
                                            onError={event => {
                                                event.currentTarget.style.display = 'none';
                                            }}
                                        />
                                    )}
                                </div>

                                <div className="min-w-0">
                                    <p className="text-xs uppercase tracking-wide text-white/60">
                                        Passenger
                                    </p>
                                    <h2 className="truncate text-lg font-extrabold capitalize">
                                        {passengerName}
                                    </h2>
                                </div>
                            </div>

                            <div className="shrink-0 text-right">
                                <p className="text-xs text-white/70">Fare</p>
                                <h2 className="text-2xl font-extrabold">
                                    ₹{rideData?.fare ?? 0}
                                </h2>
                            </div>
                        </div>

                        <div className="relative mt-4 flex flex-wrap items-center gap-2">
                            {distanceKm && (
                                <div className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
                                    <i className="ri-route-line text-[#F15A24]" />
                                    {distanceKm} km trip
                                </div>
                            )}

                            <div className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
                                <i className="ri-money-rupee-circle-line text-[#F15A24]" />
                                Cash
                            </div>
                        </div>
                    </div>

                    {/* PICKUP + DESTINATION */}
                    <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                        <div className="flex gap-4">
                            <div className="flex flex-col items-center pt-1">
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#12334A]/10 text-[#12334A]">
                                    <i className="ri-map-pin-user-fill text-sm" />
                                </span>
                                <span className="my-1 min-h-8 w-px flex-1 border-l-2 border-dashed border-gray-300" />
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#F15A24]/10 text-[#F15A24]">
                                    <i className="ri-map-pin-2-fill text-sm" />
                                </span>
                            </div>

                            <div className="min-w-0 flex-1 space-y-4">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                                        Pickup
                                    </p>
                                    <p className="mt-0.5 break-words text-sm font-medium text-[#12334A]">
                                        {rideData?.pickup || 'Pickup location'}
                                    </p>
                                </div>

                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                                        Destination
                                    </p>
                                    <p className="mt-0.5 break-words text-sm font-medium text-[#12334A]">
                                        {rideData?.destination || 'Destination location'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* COMPLETE RIDE */}
                    <button
                        type="button"
                        onClick={() => setFinishRidePanel(true)}
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#F15A24] p-4 text-base font-bold text-white shadow-lg shadow-[#F15A24]/30 transition-all duration-200 hover:bg-[#d94d1c] active:scale-[0.98]"
                    >
                        Complete ride
                        <i className="ri-check-double-line text-xl" />
                    </button>
                </div>
            </div>

            {/* FINISH RIDE PANEL */}
            <div
                ref={finishRidePanelRef}
                style={{ transform: 'translateY(100%)' }}
                className="fixed bottom-0 left-0 right-0 z-[100] max-h-[90dvh] overflow-y-auto rounded-t-[28px] bg-white px-4 py-6 shadow-2xl sm:px-6"
            >
                <FinishRide
                    ride={rideData}
                    setFinishRidePanel={setFinishRidePanel}
                />
            </div>
        </div>
    );
};

export default CaptainRiding;
