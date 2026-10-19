import React, {
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  ZoomControl,
  useMap
} from 'react-leaflet';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';

const FALLBACK_CENTER = [22.5726, 88.3639];

const ROUTE_REFRESH_MS = 4000;
const ROUTE_MOVE_THRESHOLD_M = 30;
const ROUTE_STALE_THRESHOLD_M = 150;

// Used only until the real road route arrives (about 25 km/h).
const AVG_SPEED_MPS = 7;
const ROAD_FACTOR = 1.3;

// Distance/time card sits at the top, so the map must keep
// markers below it (card bottom is roughly 190px from the top).
const CARD_SAFE_TOP = 200;

// ---------------- ICONS ----------------

const captainIcon = new L.DivIcon({
  className: '',
  html: '<div style="font-size:28px">🚕</div>',
  iconSize: [36, 36],
  iconAnchor: [18, 18]
});

const userIcon = new L.DivIcon({
  className: '',
  html: '<div style="font-size:28px">📍</div>',
  iconSize: [36, 36],
  iconAnchor: [18, 36]
});

// ---------------- NORMALIZE LOCATION ----------------

function normalizePoint(point) {
  if (!point) return null;

  // Nested payload: { location: { ltd, lng } }
  if (
    typeof point === 'object' &&
    !Array.isArray(point) &&
    point.location
  ) {
    const nested = normalizePoint(point.location);
    if (nested) return nested;
  }

  let lat;
  let lng;

  if (Array.isArray(point) && point.length >= 2) {
    [lat, lng] = point;
  } else if (typeof point === 'object') {
    lat = point.lat ?? point.latitude ?? point.ltd;
    lng = point.lng ?? point.long ?? point.longitude ?? point.lon;
  } else {
    return null;
  }

  if (
    lat === null || lat === undefined || lat === '' ||
    lng === null || lng === undefined || lng === ''
  ) {
    return null;
  }

  lat = Number(lat);
  lng = Number(lng);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return null;
  }

  return [lat, lng];
}

// ---------------- DISTANCE / FORMAT ----------------

function distanceMeters(a, b) {
  if (!a || !b) return null;

  const toRadians = value => (value * Math.PI) / 180;
  const [lat1, lng1] = a;
  const [lat2, lng2] = b;

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;

  return (
    6371000 *
    2 *
    Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)))
  );
}

function formatDistance(meters) {
  if (meters == null || !Number.isFinite(meters)) return '--';

  if (meters < 1000) {
    return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  }

  return `${(meters / 1000).toFixed(1)} km`;
}

function formatMinutes(seconds, approximate = false) {
  if (seconds == null || !Number.isFinite(seconds)) return '--';

  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${approximate ? '~' : ''}${minutes} min`;
}

// ---------------- MAP AUTO-POSITIONING ----------------

function FitPoints({ points, padding }) {
  const map = useMap();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!points.length) {
      // Re-fit when the next ride starts.
      initializedRef.current = false;
      return;
    }

    const size = map.getSize();

    // Never let padding swallow the whole map on small screens.
    const top = Math.min(padding.top, size.y * 0.35);
    const left = Math.min(padding.left, size.x * 0.2);
    const right = Math.min(padding.right, size.x * 0.2);

    // Keep at least 15% of the height free for the markers.
    let bottom = Math.min(padding.bottom, size.y * 0.55);
    const maxTotal = size.y * 0.85;

    if (top + bottom > maxTotal) {
      bottom = Math.max(0, maxTotal - top);
    }

    const fit = animate => {
      if (points.length === 1) {
        map.setView(points[0], 16, { animate });
        return;
      }

      map.fitBounds(L.latLngBounds(points), {
        paddingTopLeft: [left, top],
        paddingBottomRight: [right, bottom],
        maxZoom: 16,
        animate
      });
    };

    if (!initializedRef.current) {
      fit(false);
      initializedRef.current = true;
      return;
    }

    const outside = points.some(point => {
      const p = map.latLngToContainerPoint(point);

      return (
        p.x < left ||
        p.x > size.x - right ||
        p.y < top ||
        p.y > size.y - bottom
      );
    });

    if (outside) fit(true);
  }, [map, points, padding]);

  return null;
}

// ---------------- MAIN COMPONENT ----------------

export default function LiveTracking({
  role = 'user',
  captainLocation = null,
  userLocation = null,
  pickupLocation = null,
  pickupAddress = '',
  tracking = true,
  showInfo = true,
  zoomControl = false,
  fitPadding = null,
  infoTop = '4.5rem',
  className = ''
}) {
  const [myPosition, setMyPosition] = useState(null);
  const [gpsError, setGpsError] = useState('');

  const [route, setRoute] = useState([]);
  const [routeDistance, setRouteDistance] = useState(null);
  const [routeDuration, setRouteDuration] = useState(null);
  const [routeError, setRouteError] = useState('');

  const lastRoutedPointsRef = useRef(null);
  const latestPointsRef = useRef({
    captainPoint: null,
    userPoint: null
  });
  const routeRequestRef = useRef(null);

  const cardVisible = showInfo && tracking;

  // When the card is visible, the top padding is never smaller than the
  // card area, even if the parent passes a smaller value.
  const padding = useMemo(() => ({
    top: cardVisible
      ? Math.max(fitPadding?.top ?? 0, CARD_SAFE_TOP)
      : fitPadding?.top ?? 55,
    right: fitPadding?.right ?? 55,
    bottom: fitPadding?.bottom ?? 55,
    left: fitPadding?.left ?? 55
  }), [
    fitPadding?.top,
    fitPadding?.right,
    fitPadding?.bottom,
    fitPadding?.left,
    cardVisible
  ]);

  // ---------------- CURRENT DEVICE GPS ----------------

  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError('This browser does not support GPS location.');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      position => {
        setMyPosition([
          position.coords.latitude,
          position.coords.longitude
        ]);
        setGpsError('');
      },
      error => {
        console.warn('GPS error:', error.message);

        if (error.code === 1) {
          setGpsError('Allow location access in your browser.');
        } else if (error.code === 2) {
          setGpsError('Your device location is unavailable.');
        } else if (error.code === 3) {
          setGpsError('GPS timed out. Waiting for another update.');
        } else {
          setGpsError('Unable to get your device location.');
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 15000
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // ---------------- LIVE POINTS ----------------
  // Both sides measure between the SAME two live points:
  // the captain's GPS and the passenger's GPS. That is why
  // distance and time match on both screens.

  const myPoint = useMemo(
    () => normalizePoint(myPosition),
    [myPosition]
  );

  const livePassengerPoint = useMemo(
    () =>
      role === 'captain'
        ? normalizePoint(userLocation)
        : myPoint,
    [role, userLocation, myPoint]
  );

  const pickupPoint = useMemo(
    () => normalizePoint(pickupLocation),
    [pickupLocation]
  );

  // ---------------- CAPTAIN POSITION ----------------

  const captainPoint = useMemo(() => {
    if (role === 'captain') {
      return myPoint || normalizePoint(captainLocation);
    }

    return tracking ? normalizePoint(captainLocation) : null;
  }, [role, tracking, myPoint, captainLocation]);

  // ---------------- USER / PICKUP POSITION ----------------

  const userPoint = useMemo(() => {
    if (role === 'captain' && !tracking) return null;

    // Live passenger position first, pickup point as fallback.
    return livePassengerPoint || pickupPoint;
  }, [role, tracking, livePassengerPoint, pickupPoint]);

  latestPointsRef.current = { captainPoint, userPoint };

  const points = useMemo(
    () => [captainPoint, userPoint].filter(Boolean),
    [captainPoint, userPoint]
  );

  const hasBoth = Boolean(captainPoint && userPoint);

  const straightDistance = useMemo(
    () => distanceMeters(captainPoint, userPoint),
    [captainPoint, userPoint]
  );

  // ---------------- ROAD ROUTE AND ETA ----------------
  // Starts immediately once both points exist, then refreshes.

  useEffect(() => {
    if (!hasBoth) {
      lastRoutedPointsRef.current = null;

      setRoute([]);
      setRouteDistance(null);
      setRouteDuration(null);
      setRouteError('');
      return;
    }

    let isMounted = true;

    const fetchRoute = async () => {
      const {
        captainPoint: captain,
        userPoint: user
      } = latestPointsRef.current;

      if (!captain || !user) return;

      const previous = lastRoutedPointsRef.current;

      const captainMoved =
        !previous ||
        distanceMeters(previous.captain, captain) >=
          ROUTE_MOVE_THRESHOLD_M;

      const userMoved =
        !previous ||
        distanceMeters(previous.user, user) >=
          ROUTE_MOVE_THRESHOLD_M;

      if (!captainMoved && !userMoved) return;

      // Let an existing request finish before starting another.
      if (routeRequestRef.current) return;

      const controller = new AbortController();
      routeRequestRef.current = controller;

      const requestedCaptain = [...captain];
      const requestedUser = [...user];

      try {
        const [cLat, cLng] = requestedCaptain;
        const [uLat, uLng] = requestedUser;

        // OSRM uses longitude,latitude order.
        const url =
          `${OSRM_URL}/${cLng},${cLat};${uLng},${uLat}` +
          '?overview=full&geometries=geojson';

        const response = await fetch(url, {
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`Route request failed (${response.status})`);
        }

        const data = await response.json();
        const result = data.routes?.[0];

        if (!result || !result.geometry?.coordinates?.length) {
          throw new Error('No driving route found.');
        }

        if (!isMounted) return;

        // Skip an old result if either point moved a lot meanwhile.
        const latest = latestPointsRef.current;

        const captainIsStale =
          distanceMeters(requestedCaptain, latest.captainPoint) >=
          ROUTE_STALE_THRESHOLD_M;

        const userIsStale =
          distanceMeters(requestedUser, latest.userPoint) >=
          ROUTE_STALE_THRESHOLD_M;

        if (captainIsStale || userIsStale) return;

        setRoute(
          result.geometry.coordinates.map(([lng, lat]) => [lat, lng])
        );
        setRouteDistance(result.distance);
        setRouteDuration(result.duration);
        setRouteError('');

        lastRoutedPointsRef.current = {
          captain: requestedCaptain,
          user: requestedUser
        };
      } catch (error) {
        if (error.name !== 'AbortError' && isMounted) {
          console.warn('Route error:', error.message);
          setRouteError('Road route temporarily unavailable.');
        }
      } finally {
        if (routeRequestRef.current === controller) {
          routeRequestRef.current = null;
        }
      }
    };

    fetchRoute();
    const interval = setInterval(fetchRoute, ROUTE_REFRESH_MS);

    return () => {
      isMounted = false;
      clearInterval(interval);

      routeRequestRef.current?.abort();
      routeRequestRef.current = null;
    };
  }, [hasBoth]);

  // ---------------- DISPLAY VALUES ----------------

  const isRoadRoute = routeDistance !== null;

  const displayedDistance = routeDistance ?? straightDistance;

  // Instant estimate until the road route arrives.
  const estimatedSeconds =
    straightDistance != null
      ? (straightDistance * ROAD_FACTOR) / AVG_SPEED_MPS
      : null;

  const displayedDuration = routeDuration ?? estimatedSeconds;

  // True only when the passenger end of the line is a real live GPS point.
  const usingLivePassenger = Boolean(livePassengerPoint);

  const directionLabel =
    role === 'captain'
      ? usingLivePassenger
        ? 'You → Passenger'
        : 'You → Pickup'
      : usingLivePassenger
        ? 'Captain → You'
        : 'Captain → Pickup';

  const statusMessage = gpsError
    ? { text: gpsError, tone: 'text-red-600' }
    : !hasBoth
      ? {
          text: 'Waiting for both live locations...',
          tone: 'text-amber-700'
        }
      : routeError
        ? { text: routeError, tone: 'text-amber-700' }
        : role === 'captain' && !usingLivePassenger
          ? {
              text: 'Waiting for passenger live location...',
              tone: 'text-amber-700'
            }
          : null;

  const userMarkerLabel =
    role === 'captain'
      ? usingLivePassenger
        ? 'Passenger (live)'
        : pickupAddress || 'Pickup location'
      : usingLivePassenger
        ? 'You'
        : pickupAddress || 'Pickup location';

  // ---------------- UI ----------------

  return (
    <div
      className={`relative isolate h-full min-h-[300px] w-full overflow-hidden ${className}`}
    >
      {/* Distance and ETA card (top, clear of bottom sheets) */}
      {cardVisible && (
        <div
          className="pointer-events-none absolute left-3 right-3 z-[500] mx-auto max-w-sm"
          style={{ top: infoTop }}
        >
          <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white/95 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-1.5">
              <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                {directionLabel}
              </p>

              <div className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                <span className="text-[10px] font-bold text-emerald-700">
                  LIVE
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 divide-x divide-gray-100">
              <div className="min-w-0 px-3 py-2">
                <p className="text-[11px] font-medium text-gray-500">
                  Distance
                </p>
                <p className="truncate text-lg font-extrabold leading-tight text-[#12334A]">
                  {formatDistance(displayedDistance)}
                </p>
                <p className="truncate text-[10px] text-gray-400">
                  {isRoadRoute
                    ? 'By road'
                    : straightDistance !== null
                      ? 'Straight line'
                      : 'Waiting for GPS'}
                </p>
              </div>

              <div className="min-w-0 px-3 py-2">
                <p className="text-[11px] font-medium text-gray-500">
                  Est. time
                </p>
                <p className="truncate text-lg font-extrabold leading-tight text-[#F15A24]">
                  {formatMinutes(displayedDuration, !isRoadRoute)}
                </p>
                <p className="truncate text-[10px] text-gray-400">
                  {isRoadRoute ? 'No live traffic' : 'Calculating route'}
                </p>
              </div>
            </div>

            {statusMessage && (
              <p
                className={`truncate border-t border-gray-100 px-3 py-1 text-[11px] ${statusMessage.tone}`}
              >
                {statusMessage.text}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Map */}
      <MapContainer
        center={FALLBACK_CENTER}
        zoom={13}
        scrollWheelZoom={true}
        zoomControl={false}
        className="z-0 h-full min-h-[300px] w-full"
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {zoomControl && <ZoomControl position="topright" />}

        {captainPoint && (
          <Marker position={captainPoint} icon={captainIcon}>
            <Popup>
              {role === 'captain' ? 'You (captain)' : 'Your captain'}
            </Popup>
          </Marker>
        )}

        {userPoint && (
          <Marker position={userPoint} icon={userIcon}>
            <Popup>{userMarkerLabel}</Popup>
          </Marker>
        )}

        {route.length > 0 && hasBoth && (
          <Polyline
            positions={route}
            pathOptions={{
              color: '#12334A',
              weight: 5,
              opacity: 0.85
            }}
          />
        )}

        <FitPoints points={points} padding={padding} />
      </MapContainer>
    </div>
  );
}