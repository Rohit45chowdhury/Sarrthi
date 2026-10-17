
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
const DEFAULT_PADDING = 55;

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
    lng = point.lng ?? point.longitude;
  } else {
    return null;
  }

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

// ---------------- DISTANCE CALCULATION ----------------

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
    Math.atan2(
      Math.sqrt(h),
      Math.sqrt(Math.max(0, 1 - h))
    )
  );
}

function formatKm(meters) {
  if (meters == null || !Number.isFinite(meters)) {
    return '-- km';
  }

  return `${(meters / 1000).toFixed(2)} km`;
}

// ---------------- MAP AUTO-POSITIONING ----------------

function FitPoints({ points, padding }) {
  const map = useMap();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!points.length) return;

    const fit = animate => {
      if (points.length === 1) {
        map.setView(points[0], 16, { animate });
        return;
      }

      map.fitBounds(L.latLngBounds(points), {
        paddingTopLeft: [padding.left, padding.top],
        paddingBottomRight: [padding.right, padding.bottom],
        maxZoom: 16,
        animate
      });
    };

    if (!initializedRef.current) {
      fit(false);
      initializedRef.current = true;
      return;
    }

    const size = map.getSize();

    const outside = points.some(point => {
      const p = map.latLngToContainerPoint(point);

      return (
        p.x < padding.left ||
        p.x > size.x - padding.right ||
        p.y < padding.top ||
        p.y > size.y - padding.bottom
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

  const padding = useMemo(() => ({
    top: fitPadding?.top ?? DEFAULT_PADDING,
    right: fitPadding?.right ?? DEFAULT_PADDING,
    bottom: fitPadding?.bottom ?? DEFAULT_PADDING,
    left: fitPadding?.left ?? DEFAULT_PADDING
  }), [
    fitPadding?.top,
    fitPadding?.right,
    fitPadding?.bottom,
    fitPadding?.left
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

  // ---------------- CAPTAIN POSITION ----------------

  const captainPoint = useMemo(() => {
    if (role === 'captain') {
      return (
        normalizePoint(myPosition) ||
        normalizePoint(captainLocation)
      );
    }

    return tracking ? normalizePoint(captainLocation) : null;
  }, [role, tracking, myPosition, captainLocation]);

  // ---------------- USER / PICKUP POSITION ----------------

  const userPoint = useMemo(() => {
    if (role === 'captain') {
      if (!tracking) return null;

      return (
        normalizePoint(userLocation) ||
        normalizePoint(pickupLocation)
      );
    }

    return normalizePoint(myPosition);
  }, [role, tracking, userLocation, pickupLocation, myPosition]);

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

  // ---------------- CLEAR ROUTE WHEN TRACKING STOPS ----------------

  useEffect(() => {
    if (hasBoth) return;

    lastRoutedPointsRef.current = null;

    setRoute([]);
    setRouteDistance(null);
    setRouteDuration(null);
    setRouteError('');
  }, [hasBoth]);

  // ---------------- ROAD ROUTE AND ETA ----------------

  useEffect(() => {
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
        distanceMeters(previous.captain, captain) >= 50;

      const userMoved =
        !previous ||
        distanceMeters(previous.user, user) >= 50;

      if (!captainMoved && !userMoved) return;

      // Let an existing request finish before starting another.
      if (routeRequestRef.current) return;

      const controller = new AbortController();
      routeRequestRef.current = controller;

      // Remember which coordinates this request used.
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

        // Do not apply an old result if either location moved
        // significantly while this request was in progress.
        const latest = latestPointsRef.current;

        const captainIsStale =
          distanceMeters(requestedCaptain, latest.captainPoint) >= 100;

        const userIsStale =
          distanceMeters(requestedUser, latest.userPoint) >= 100;

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

    const initialTimer = setTimeout(fetchRoute, 500);
    const interval = setInterval(fetchRoute, 5000);

    return () => {
      isMounted = false;
      clearTimeout(initialTimer);
      clearInterval(interval);

      routeRequestRef.current?.abort();
      routeRequestRef.current = null;
    };
  }, []);

  // ---------------- DISPLAY VALUES ----------------

  const formatMinutes = seconds => {
    if (seconds == null || !Number.isFinite(seconds)) {
      return '--';
    }

    return `${Math.max(1, Math.round(seconds / 60))} min`;
  };

  const otherLabel = role === 'captain'
    ? pickupAddress || 'Passenger location'
    : 'Captain location';

  const displayedDistance = routeDistance ?? straightDistance;
  const isRoadDistance = routeDistance !== null;

  // ---------------- UI ----------------

  return (
    <div
      className={`relative isolate h-full min-h-[300px] w-full overflow-hidden ${className}`}
    >
      {/* Responsive distance and estimated time card */}
      {showInfo && (
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-[500] mx-auto max-w-md sm:bottom-5 sm:left-auto sm:right-5 sm:mx-0">
          <div className="rounded-2xl border border-gray-200/80 bg-white/95 p-3 shadow-xl backdrop-blur-md sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 sm:text-xs">
                  Live ride tracking
                </p>
                <h3 className="mt-0.5 truncate text-sm font-bold text-[#12334A] sm:text-base">
                  {role === 'captain'
                    ? 'You and passenger'
                    : 'You and your captain'}
                </h3>
              </div>

              <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-[10px] font-semibold text-emerald-700 sm:text-xs">
                  LIVE
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {/* Distance */}
              <div className="rounded-xl bg-slate-50 p-3 sm:p-4">
                <div className="mb-2 flex items-center gap-2 text-gray-500">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[#12334A] shadow-sm">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <path d="M4 7h16M4 17h16M7 4l-3 3 3 3M17 14l3 3-3 3" />
                    </svg>
                  </span>
                  <span className="text-xs font-medium sm:text-sm">
                    Distance
                  </span>
                </div>

                <p className="text-xl font-extrabold leading-tight text-[#12334A] sm:text-2xl">
                  {formatKm(displayedDistance)}
                </p>

                <p className="mt-1 text-[10px] text-gray-500 sm:text-xs">
                  {isRoadDistance
                    ? 'By road'
                    : straightDistance !== null
                      ? 'Straight-line estimate'
                      : 'Waiting for GPS'}
                </p>
              </div>

              {/* Estimated travel time */}
              <div className="rounded-xl bg-orange-50/80 p-3 sm:p-4">
                <div className="mb-2 flex items-center gap-2 text-gray-500">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[#F15A24] shadow-sm">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 2" />
                    </svg>
                  </span>
                  <span className="text-xs font-medium sm:text-sm">
                    Est. time
                  </span>
                </div>

                <p className="text-xl font-extrabold leading-tight text-[#F15A24] sm:text-2xl">
                  {formatMinutes(routeDuration)}
                </p>

                <p className="mt-1 text-[10px] text-gray-500 sm:text-xs">
                  {routeDuration !== null
                    ? 'Estimated drive'
                    : 'Calculating route'}
                </p>
              </div>
            </div>

            {!hasBoth && (
              <p className="mt-3 text-xs text-amber-700">
                Waiting for both live GPS locations...
              </p>
            )}

            {gpsError && (
              <p className="mt-2 text-xs text-red-600">
                {gpsError}
              </p>
            )}

            {routeError && (
              <p className="mt-2 text-xs text-amber-700">
                {routeError}
              </p>
            )}

            <p className="mt-2 text-[10px] leading-relaxed text-gray-400">
              Time is an estimate and does not account for live traffic.
            </p>
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
              {role === 'captain' ? 'Your location' : 'Your captain'}
            </Popup>
          </Marker>
        )}

        {userPoint && (
          <Marker position={userPoint} icon={userIcon}>
            <Popup>{otherLabel}</Popup>
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
