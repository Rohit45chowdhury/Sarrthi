import React, {
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react'

import {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    Polyline,
    useMap,
    useMapEvents
} from 'react-leaflet'

import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import { SocketContext } from '../context/SocketContext'


// ================= FIX LEAFLET ICON =================

delete L.Icon.Default.prototype._getIconUrl

L.Icon.Default.mergeOptions({
    iconRetinaUrl:
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',

    iconUrl:
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',

    shadowUrl:
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png'
})


// ================= CUSTOM ICONS =================

const captainIcon = new L.DivIcon({
    className: 'captain-live-marker',

    html: `
        <div style="
            width: 44px;
            height: 44px;
            background: #12334A;
            border: 3px solid white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            color: white;
            font-size: 22px;
        ">
            🚗
        </div>
    `,

    iconSize: [44, 44],
    iconAnchor: [22, 22]
})

// pickup / passenger marker (orange, so it is different from the captain)
const pickupIcon = new L.DivIcon({
    className: 'pickup-live-marker',

    html: `
        <div style="
            width: 44px;
            height: 44px;
            background: #F15A24;
            border: 3px solid white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            color: white;
            font-size: 22px;
        ">
            👤
        </div>
    `,

    iconSize: [44, 44],
    iconAnchor: [22, 22]
})


// ================= CONFIG =================

const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving'
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search'

// OSRM throttling:
//  - always recalculate when captain (or pickup) moved >= 25 m
//  - or when moved >= 5 m AND at least 10 s passed since the last request
//  - after a failed request, retry automatically every 10 s
const ROUTE_MIN_MOVE_M = 25
const ROUTE_SMALL_MOVE_M = 5
const ROUTE_MIN_INTERVAL_MS = 10000

// pickup address -> [lat, lng], so the same address is geocoded only once
const geocodeCache = new Map()


// ================= HELPERS =================

// Number(null) is 0, which would put a marker at 0,0 -> reject null/''.
const toNum = value =>
    value === null || value === undefined || value === ''
        ? NaN
        : Number(value)

const toPoint = (lat, lng) => {

    const a = toNum(lat)
    const b = toNum(lng)

    return Number.isFinite(a) && Number.isFinite(b)
        ? [a, b]
        : null
}

// A long address (full Nominatim display_name, often with Bengali names)
// frequently finds nothing. Same fallbacks the backend geocoder uses:
// original -> without Bengali script -> most specific parts -> locality part.
const buildQueries = original => {

    const parts = original
        .split(',')
        .map(p => p.replace(/[\u0980-\u09FF]+/g, '').trim())
        .filter(Boolean)

    const queries = [
        original,
        parts.join(', '),
        parts.slice(0, 3).join(', '),
        parts.slice(-4).join(', ')
    ]

    return [...new Set(queries.filter(Boolean))]
}

// haversine, metres. points are [lat, lng]
const distanceMeters = (a, b) => {

    const R = 6371000
    const rad = deg => (deg * Math.PI) / 180

    const dLat = rad(b[0] - a[0])
    const dLng = rad(b[1] - a[1])

    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(a[0])) *
        Math.cos(rad(b[0])) *
        Math.sin(dLng / 2) ** 2

    return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

const formatDistance = meters =>
    meters < 1000
        ? `${Math.round(meters)} m`
        : `${(meters / 1000).toFixed(1)} km`

const formatDuration = seconds => {

    const totalMinutes = Math.max(1, Math.round(seconds / 60))

    if (totalMinutes < 60) return `${totalMinutes} min`

    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60

    return minutes ? `${hours} h ${minutes} min` : `${hours} h`
}


// ================= MAP CONTROLLER =================
// Used only when NOT tracking (old behaviour). Depends on plain numbers (not an
// array), so the effect runs only when the position really changes. panTo
// keeps the user's current zoom level.

const MapController = ({ target }) => {

    const map = useMap()

    const lat = target?.[0]
    const lng = target?.[1]

    useEffect(() => {

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

        map.panTo([lat, lng], {
            animate: true,
            duration: 0.5
        })

    }, [lat, lng, map])

    return null
}


// ================= FIT ROUTE (tracking only) =================
// Fits captain + pickup + route inside the visible part of the map.
// Bottom padding is large because the bottom sheets cover the lower part
// of the screen, top padding keeps the route clear of the info card.

const FitRoute = ({ pointsRef, fitKey, paused }) => {

    const map = useMap()

    useEffect(() => {

        if (paused) return

        const points = pointsRef.current

        if (!points || points.length === 0) return

        if (points.length === 1) {
            map.setView(points[0], 16, { animate: true })
            return
        }

        const height = map.getSize().y

        const top = Math.min(150, Math.round(height * 0.25))
        const bottom = Math.max(
            40,
            Math.min(Math.round(height * 0.45), height - top - 100)
        )

        map.fitBounds(L.latLngBounds(points), {
            paddingTopLeft: [40, top],
            paddingBottomRight: [40, bottom],
            maxZoom: 17,
            animate: true
        })

    }, [fitKey, paused, map, pointsRef])

    return null
}


// pauses auto-fit as soon as the person drags the map themselves
const UserMoveWatcher = ({ onMove }) => {

    useMapEvents({
        dragstart: onMove
    })

    return null
}


// ================= TRACKING INFO CARD =================

const TrackingCard = ({
    role,
    hasCaptain,
    hasPickup,
    geocodeStatus,
    route,
    routeError,
    gpsError,
    socketConnected,
    autoFit,
    onRecenter
}) => {

    // what to say while there is no route yet
    let status = null

    if (!hasCaptain) {

        status =
            role === 'captain'
                ? {
                    text: gpsError || 'Getting your location...',
                    loading: !gpsError
                }
                : {
                    text: 'Waiting for captain location...',
                    loading: true
                }

    } else if (!hasPickup) {

        // 'idle' = the ride has no pickup address and no coordinates,
        // so there is nothing to wait for
        status =
            geocodeStatus === 'error' || geocodeStatus === 'idle'
                ? {
                    text: 'Unable to find the pickup point on the map.',
                    loading: false
                }
                : {
                    text: 'Locating pickup point...',
                    loading: true
                }

    } else if (!route) {

        status = routeError
            ? { text: routeError, loading: false }
            : { text: 'Calculating route...', loading: true }
    }

    return (

        <div className="pointer-events-none absolute inset-x-0 top-[4.75rem] z-[1000] flex justify-center px-4 sm:top-24">

            <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-white p-4 shadow-lg">

                {/* header */}
                <div className="flex items-center justify-between gap-3">

                    <div className="flex min-w-0 items-center gap-2">
                        <span className="h-5 w-1.5 shrink-0 rounded-full bg-[#F15A24]" />
                        <h3 className="truncate font-bold text-[#12334A]">
                            {role === 'captain'
                                ? 'Head to pickup'
                                : 'Your captain is on the way'}
                        </h3>
                    </div>

                    {/* shown only after the person moved the map */}
                    {!autoFit && (
                        <button
                            type="button"
                            onClick={onRecenter}
                            aria-label="Fit route on screen"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[#12334A] transition-colors hover:bg-[#F15A24] hover:text-white"
                        >
                            <i className="text-lg ri-focus-3-line" />
                        </button>
                    )}

                </div>

                {/* socket disconnected */}
                {!socketConnected && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                        Connection lost. Reconnecting...
                    </p>
                )}

                {/* status OR distance + ETA */}
                {status ? (

                    <p
                        className={`mt-3 flex items-center gap-2 text-sm ${
                            status.loading ? 'text-gray-500' : 'text-red-500'
                        }`}
                    >
                        {status.loading && (
                            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-gray-300 border-t-[#F15A24]" />
                        )}
                        {status.text}
                    </p>

                ) : (

                    <>
                        <div className="mt-3 grid grid-cols-2 gap-2">

                            <div className="flex items-center gap-3 rounded-xl bg-gray-100 px-3 py-2.5">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F15A24]/10 text-[#F15A24]">
                                    <i className="text-lg ri-route-line" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs text-gray-500">Distance</p>
                                    <p className="truncate text-lg font-bold leading-tight text-[#12334A]">
                                        {formatDistance(route.distance)}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 rounded-xl bg-gray-100 px-3 py-2.5">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F15A24]/10 text-[#F15A24]">
                                    <i className="text-lg ri-time-line" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs text-gray-500">Time</p>
                                    <p className="truncate text-lg font-bold leading-tight text-[#12334A]">
                                        {formatDuration(route.duration)}
                                    </p>
                                </div>
                            </div>

                        </div>

                        {routeError && (
                            <p className="mt-2 text-xs text-amber-600">
                                Couldn't refresh the route. Showing the last known route.
                            </p>
                        )}
                    </>
                )}

            </div>

        </div>
    )
}


// ================= LIVE TRACKING =================
/*
    Props (all optional, without them the component behaves as before):

    captainLocation  [lat, lng] | null   captain position (user side, from socket)
    pickupLocation   [lat, lng] | null   pickup coordinates if you already have them
    pickupAddress    string              used when pickupLocation is not given
                                         (geocoded once with Nominatim)
    role             'user' | 'captain'  who is looking at the map
                                         captain -> captain point = own GPS
                                         user    -> captain point = captainLocation
    tracking         boolean             true after the captain accepted the ride
*/

const LiveTracking = ({
    captainLocation = null,
    pickupLocation = null,
    pickupAddress = '',
    role = 'user',
    tracking = false
}) => {

    const { socket } = useContext(SocketContext)

    const [currentPosition, setCurrentPosition] = useState(null)

    const [error, setError] = useState('')

    const [socketConnected, setSocketConnected] = useState(true)

    const [geocoded, setGeocoded] = useState({
        address: '',
        point: null,
        status: 'idle'
    })

    const [route, setRoute] = useState(null)
    const [routeError, setRouteError] = useState('')

    const [autoFit, setAutoFit] = useState(true)

    const mountedRef = useRef(false)
    const abortRef = useRef(null)
    const requestIdRef = useRef(0)

    // after a failed OSRM request the route is retried automatically
    const retryTimerRef = useRef(null)
    const [retryTick, setRetryTick] = useState(0)

    const lastRouteRef = useRef({
        from: null,
        to: null,
        at: 0,
        failed: false
    })

    const pointsRef = useRef([])


    // ================= GET LIVE GPS =================

    useEffect(() => {

        if (!navigator.geolocation) {

            setError('Geolocation is not supported by your browser.')

            return
        }

        const watchId = navigator.geolocation.watchPosition(

            (position) => {

                const { latitude, longitude } = position.coords

                // same coordinates -> keep the old array, no re-render
                setCurrentPosition(prev =>
                    prev &&
                    prev[0] === latitude &&
                    prev[1] === longitude
                        ? prev
                        : [latitude, longitude]
                )

                setError('')
            },

            (err) => {

                console.error('GPS Error:', err.message)

                switch (err.code) {

                    case 1:
                        setError('Location permission denied. Please allow location access.')
                        break

                    case 2:
                        setError('Location information is unavailable.')
                        break

                    case 3:
                        setError('Location request timed out.')
                        break

                    default:
                        setError('Unable to get your location.')
                }
            },

            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 20000
            }
        )

        return () => {

            navigator.geolocation.clearWatch(watchId)

        }

    }, [])


    // ================= UNMOUNT: stop any running OSRM request =================

    useEffect(() => {

        mountedRef.current = true

        return () => {
            mountedRef.current = false
            abortRef.current?.abort()
            clearTimeout(retryTimerRef.current)
        }

    }, [])


    // ================= SOCKET CONNECTION STATE (reuses the shared socket) =================

    useEffect(() => {

        if (!tracking || !socket) return

        const handleConnect = () => setSocketConnected(true)
        const handleDisconnect = () => setSocketConnected(false)

        setSocketConnected(socket.connected)

        socket.on('connect', handleConnect)
        socket.on('disconnect', handleDisconnect)

        return () => {
            socket.off('connect', handleConnect)
            socket.off('disconnect', handleDisconnect)
        }

    }, [tracking, socket])


    // ================= VALIDATE CAPTAIN LOCATION =================

    const capLat = toNum(captainLocation?.[0])
    const capLng = toNum(captainLocation?.[1])

    // useMemo -> same array reference until the numbers change
    const validCaptainLocation = useMemo(
        () =>
            Number.isFinite(capLat) && Number.isFinite(capLng)
                ? [capLat, capLng]
                : null,
        [capLat, capLng]
    )


    // ================= PICKUP POINT =================
    // 1) pickupLocation prop  2) geocoded pickupAddress  3) (user only) own GPS

    const provLat = toNum(pickupLocation?.[0])
    const provLng = toNum(pickupLocation?.[1])

    const providedPickup = useMemo(
        () =>
            Number.isFinite(provLat) && Number.isFinite(provLng)
                ? [provLat, provLng]
                : null,
        [provLat, provLng]
    )

    const address = String(pickupAddress || '').trim()

    useEffect(() => {

        if (!tracking || providedPickup || !address) return

        const cached = geocodeCache.get(address)

        if (cached) {
            setGeocoded({ address, point: cached, status: 'done' })
            return
        }

        setGeocoded({ address, point: null, status: 'loading' })

        const controller = new AbortController()

        const lookup = async () => {

            const queries = buildQueries(address)

            for (let i = 0; i < queries.length; i++) {

                const res = await fetch(
                    `${NOMINATIM_SEARCH_URL}?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(queries[i])}`,
                    {
                        signal: controller.signal,
                        headers: { 'Accept-Language': 'en' }
                    }
                )

                if (!res.ok) throw new Error(`Geocoding failed (${res.status})`)

                const list = await res.json()

                const point = toPoint(list?.[0]?.lat, list?.[0]?.lon)

                if (point) return point

                // Nominatim public server allows about 1 request per second
                if (i < queries.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1100))
                }
            }

            throw new Error('Pickup address not found')
        }

        lookup()
            .then(point => {

                geocodeCache.set(address, point)

                setGeocoded({ address, point, status: 'done' })
            })
            .catch(err => {

                if (err.name === 'AbortError') return

                console.error('Pickup geocode error:', err.message)

                setGeocoded({ address, point: null, status: 'error' })
            })

        return () => controller.abort()

    }, [tracking, providedPickup, address])

    // ignore a result that belongs to an older address
    const geocodeStatus =
        geocoded.address === address
            ? geocoded.status
            : address
                ? 'loading'
                : 'idle'

    let pickupPoint = null

    if (providedPickup) {
        pickupPoint = providedPickup
    } else if (geocodeStatus === 'done') {
        pickupPoint = geocoded.point
    } else if (
        role === 'user' &&
        (geocodeStatus === 'error' || !address)
    ) {
        pickupPoint = currentPosition
    }

    const captainPoint =
        role === 'captain' ? currentPosition : validCaptainLocation

    const cLat = captainPoint?.[0]
    const cLng = captainPoint?.[1]
    const pLat = pickupPoint?.[0]
    const pLng = pickupPoint?.[1]

    const hasBoth =
        Number.isFinite(cLat) &&
        Number.isFinite(cLng) &&
        Number.isFinite(pLat) &&
        Number.isFinite(pLng)


    // ================= RESET WHEN TRACKING STOPS =================

    useEffect(() => {

        if (tracking) return

        requestIdRef.current++
        abortRef.current?.abort()
        clearTimeout(retryTimerRef.current)

        lastRouteRef.current = {
            from: null,
            to: null,
            at: 0,
            failed: false
        }

        setRoute(null)
        setRouteError('')
        setAutoFit(true)

    }, [tracking])


    // ================= OSRM ROUTE (throttled) =================
    // OSRM wants  longitude,latitude  - Leaflet wants  latitude,longitude.
    // Request: captain -> pickup. Response coordinates are converted back.

    useEffect(() => {

        if (!tracking || !hasBoth) return

        const from = [cLat, cLng]
        const to = [pLat, pLng]

        const last = lastRouteRef.current

        if (last.from) {

            const elapsed = Date.now() - last.at

            const moved = distanceMeters(from, last.from)
            const pickupMoved = distanceMeters(to, last.to)

            const needed = last.failed
                ? elapsed >= ROUTE_MIN_INTERVAL_MS
                : pickupMoved >= ROUTE_MIN_MOVE_M ||
                  moved >= ROUTE_MIN_MOVE_M ||
                  (moved >= ROUTE_SMALL_MOVE_M &&
                      elapsed >= ROUTE_MIN_INTERVAL_MS)

            if (!needed) return
        }

        const requestId = ++requestIdRef.current

        // stop the previous request and any pending retry
        abortRef.current?.abort()
        clearTimeout(retryTimerRef.current)

        const controller = new AbortController()
        abortRef.current = controller

        lastRouteRef.current = {
            from,
            to,
            at: Date.now(),
            failed: false
        }

        fetch(
            `${OSRM_URL}/${cLng},${cLat};${pLng},${pLat}?overview=full&geometries=geojson`,
            { signal: controller.signal }
        )
            .then(res => {

                if (!res.ok) throw new Error(`OSRM error (${res.status})`)

                return res.json()
            })
            .then(data => {

                if (
                    !mountedRef.current ||
                    requestId !== requestIdRef.current
                ) return

                const best = data?.routes?.[0]

                if (
                    data?.code !== 'Ok' ||
                    !best?.geometry?.coordinates?.length
                ) {
                    throw new Error('No route found')
                }

                // GeoJSON [lng, lat] -> Leaflet [lat, lng]
                const coords = best.geometry.coordinates.map(
                    ([lng, lat]) => [lat, lng]
                )

                setRoute({
                    id: requestId,
                    coords,
                    distance: best.distance,   // metres
                    duration: best.duration    // seconds
                })

                setRouteError('')
            })
            .catch(err => {

                if (err.name === 'AbortError') return

                if (
                    !mountedRef.current ||
                    requestId !== requestIdRef.current
                ) return

                console.error('OSRM route error:', err.message)

                lastRouteRef.current.failed = true

                setRouteError('Unable to calculate the route right now.')

                // try again in 10 s even if the captain is standing still
                clearTimeout(retryTimerRef.current)

                retryTimerRef.current = setTimeout(
                    () => setRetryTick(t => t + 1),
                    ROUTE_MIN_INTERVAL_MS
                )
            })

    }, [tracking, hasBoth, cLat, cLng, pLat, pLng, retryTick])


    // ================= MAP CENTER (initial) =================

    const mapCenter =
        (tracking ? pickupPoint || captainPoint : null) ||
        validCaptainLocation ||
        currentPosition


    // ================= FIT DATA =================

    const fitPoints = route
        ? route.coords
        : [captainPoint, pickupPoint].filter(Boolean)

    pointsRef.current = fitPoints

    const fitKey = route
        ? `route-${route.id}`
        : `points-${fitPoints.length}`


    // ================= LOADING =================

    if (!mapCenter) {

        return (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 p-5">

                <div className="text-center">

                    <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-gray-300 border-t-[#F15A24]" />

                    <p className="font-medium text-[#12334A]">
                        Getting live location...
                    </p>

                    {error && (
                        <p className="mt-2 text-sm text-red-500">
                            {error}
                        </p>
                    )}

                </div>

            </div>
        )
    }


    // ================= MAP =================

    return (

        <div className="absolute inset-0 z-0 h-full w-full">

            <MapContainer
                center={mapCenter}
                zoom={16}
                scrollWheelZoom={true}
                zoomControl={false}
                className="h-full w-full"
            >

                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />


                {/* ===== NORMAL MODE (before a ride is accepted) ===== */}

                {!tracking && <MapController target={mapCenter} />}


                {/* USER CURRENT LOCATION */}

                {!tracking && currentPosition && (

                    <Marker position={currentPosition}>

                        <Popup>

                            <div className="text-center">

                                <strong>Your Location</strong>

                                <br />

                                You are here.

                            </div>

                        </Popup>

                    </Marker>

                )}


                {/* CAPTAIN LIVE LOCATION */}

                {!tracking && validCaptainLocation && (

                    <Marker
                        position={validCaptainLocation}
                        icon={captainIcon}
                    >

                        <Popup>

                            <div className="text-center">

                                <strong>Saarthi Captain</strong>

                                <br />

                                Live location

                            </div>

                        </Popup>

                    </Marker>

                )}


                {/* ===== TRACKING MODE (ride accepted) ===== */}

                {tracking && (
                    <>
                        <UserMoveWatcher onMove={() => setAutoFit(false)} />

                        <FitRoute
                            pointsRef={pointsRef}
                            fitKey={fitKey}
                            paused={!autoFit}
                        />
                    </>
                )}

                {/* ROUTE: white casing + navy line so it stays visible on any map colour */}

                {tracking && route && (
                    <>
                        <Polyline
                            positions={route.coords}
                            pathOptions={{
                                color: '#ffffff',
                                weight: 9,
                                opacity: 0.9
                            }}
                        />

                        <Polyline
                            positions={route.coords}
                            pathOptions={{
                                color: '#12334A',
                                weight: 5,
                                opacity: 0.9
                            }}
                        />
                    </>
                )}


                {/* PICKUP / USER */}

                {tracking && pickupPoint && (

                    <Marker position={pickupPoint} icon={pickupIcon}>

                        <Popup>

                            <div className="text-center">

                                <strong>
                                    {role === 'captain'
                                        ? 'Pickup point'
                                        : 'Your pickup'}
                                </strong>

                            </div>

                        </Popup>

                    </Marker>

                )}


                {/* CAPTAIN */}

                {tracking && captainPoint && (

                    <Marker position={captainPoint} icon={captainIcon}>

                        <Popup>

                            <div className="text-center">

                                <strong>
                                    {role === 'captain'
                                        ? 'You'
                                        : 'Saarthi Captain'}
                                </strong>

                                <br />

                                Live location

                            </div>

                        </Popup>

                    </Marker>

                )}

            </MapContainer>


            {/* DISTANCE + ETA CARD */}

            {tracking && (
                <TrackingCard
                    role={role}
                    hasCaptain={Boolean(captainPoint)}
                    hasPickup={Boolean(pickupPoint)}
                    geocodeStatus={geocodeStatus}
                    route={route}
                    routeError={routeError}
                    gpsError={error}
                    socketConnected={socketConnected}
                    autoFit={autoFit}
                    onRecenter={() => setAutoFit(true)}
                />
            )}

        </div>
    )
}

export default LiveTracking