
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

const CaptainRiding = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const { socket } = useContext(SocketContext);
    const { captain } = useContext(CaptainDataContext);

    const [finishRidePanel, setFinishRidePanel] = useState(false);
    const [rideCardExpanded, setRideCardExpanded] = useState(true);

    const finishRidePanelRef = useRef(null);
    const rideCardRef = useRef(null);
    const lastPosRef = useRef(null);

    const [rideData] = useState(
        () => location.state?.ride || readStoredRide()
    );

    const rideId = rideData?._id || rideData?.rideId;

    useEffect(() => {
        if (rideData) {
            sessionStorage.setItem('activeRide', JSON.stringify(rideData));
        }
    }, [rideData]);

    // ==========================================
    // LIVE LOCATION + SOCKET JOIN
    // ==========================================

    useEffect(() => {
        if (
            !socket ||
            !captain?._id ||
            !rideId ||
            !navigator.geolocation
        ) {
            return;
        }

        let active = true;

        const send = () => {
            if (!active || !lastPosRef.current || !socket.connected) return;

            socket.emit('update-location-captain', {
                userId: captain._id,
                location: lastPosRef.current
            });

            socket.emit('captain-live-location', {
                rideId,
                location: lastPosRef.current
            });
        };

        const join = () => {
            const token = localStorage.getItem('token');

            if (!token) {
                console.error('Captain socket: token missing');
                return;
            }

            socket.emit(
                'join',
                {
                    userId: captain._id,
                    userType: 'captain',
                    token
                },
                (res) => {
                    if (res?.ok) {
                        console.log('Captain riding socket joined');

                        if (lastPosRef.current) {
                            send();
                        }
                    } else {
                        console.error(
                            'Captain riding socket join failed:',
                            res?.message
                        );
                    }
                }
            );
        };

        if (socket.connected) {
            join();
        }

        socket.on('connect', join);

        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                lastPosRef.current = {
                    ltd: pos.coords.latitude,
                    lng: pos.coords.longitude
                };

                send();
            },
            (err) => {
                console.error(
                    'Captain GPS error:',
                    err.code,
                    err.message
                );
            },
            {
                enableHighAccuracy: true,
                maximumAge: 2000,
                timeout: 30000
            }
        );

        const heartbeat = setInterval(send, 5000);

        return () => {
            active = false;
            socket.off('connect', join);
            navigator.geolocation.clearWatch(watchId);
            clearInterval(heartbeat);
        };
    }, [socket, captain?._id, rideId]);

    // ==========================================
    // RIDE CARD SLIDE ANIMATION
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
    ]
        .filter(Boolean)
        .join(' ') || 'Passenger';

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
                <LiveTracking />
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

                    {/* SLIDE ARROW BUTTON */}
                    <button
                        type="button"
                        onClick={() => {
                            setRideCardExpanded((previous) => !previous);
                        }}
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

                    {/* PASSENGER + FARE CARD */}
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
                                            onError={(event) => {
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
