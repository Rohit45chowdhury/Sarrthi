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

// Supports:
// [lat, lng]
// { lat, lng }
// { latitude, longitude }
// { ltd, lng }
// { location: { lat, lng } }

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

// ---------------- STRAIGHT-LINE DISTANCE ----------------

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

// ---------------- MAP AUTO-POSITIONING ----------------
// `padding` keeps markers away from the screen areas that are covered by
// the bottom sheet / top bar of the page that contains the map.

function FitPoints({ points, padding }) {
  const map = useMap();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!points.length) return;

    const fit = animate =>
      map.fitBounds(L.latLngBounds(points), {
        paddingTopLeft: [padding.left, padding.top],
        paddingBottomRight: [padding.right, padding.bottom],
        maxZoom: 16,
        animate
      });

    if (!initializedRef.current) {
      fit(false);
      initializedRef.current = true;
      return;
    }

    // A marker counts as "outside" when it is outside the visible area
    // (the map minus the padding).
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
//
// Props
//   role            'user' | 'captain'
//   captainLocation captain position (used on the user screen)
//   userLocation    passenger live position (used on the captain screen)
//   pickupLocation  [lat, lng] pickup point, shown on the captain screen
//                   while `tracking` is true and no live passenger position
//   pickupAddress   text shown in the pickup marker popup
//   tracking        false -> only the own marker, no pickup marker/route
//   showInfo        true  -> small debug panel with distances (default: map only)
//   zoomControl     true  -> +/- buttons (default off, pinch / scroll still work)
//   fitPadding      { top, right, bottom, left } in px, so markers stay out
//                   from under the page's bottom sheet / top bar
//   className       extra classes for the wrapper

export default function LiveTracking({
  role = 'user',
  captainLocation = null,
  userLocation = null,
  pickupLocation = null,
  pickupAddress = '',
  tracking = true,
  showInfo = false,
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

  const padTop = fitPadding?.top ?? DEFAULT_PADDING;
  const padRight = fitPadding?.right ?? DEFAULT_PADDING;
  const padBottom = fitPadding?.bottom ?? DEFAULT_PADDING;
  const padLeft = fitPadding?.left ?? DEFAULT_PADDING;

  const padding = useMemo(
    () => ({
      top: padTop,
      right: padRight,
      bottom: padBottom,
      left: padLeft
    }),
    [padTop, padRight, padBottom, padLeft]
  );

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
          setGpsError(
            'Location permission denied. Allow location access in your browser.'
          );
        } else if (error.code === 2) {
          setGpsError(
            'Your device location is unavailable. Check your GPS.'
          );
        } else if (error.code === 3) {
          setGpsError(
            'GPS request timed out. Waiting for another location update.'
          );
        } else {
          setGpsError('Unable to get your current device location.');
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 15000
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  // ---------------- CAPTAIN LOCATION ----------------

  // Captain screen: current device = captain.
  // User screen: captain location comes from Socket.IO (only while tracking).

  const captainPoint = useMemo(() => {
    if (role === 'captain') {
      return (
        normalizePoint(myPosition) ||
        normalizePoint(captainLocation)
      );
    }

    return tracking ? normalizePoint(captainLocation) : null;
  }, [role, tracking, myPosition, captainLocation]);

  // ---------------- USER / PICKUP LOCATION ----------------

  // User screen: current device = user.
  // Captain screen: live passenger position, or the pickup point,
  // and only while a ride is being tracked.

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

  // Keep latest points available to the route polling effect.
  latestPointsRef.current = {
    captainPoint,
    userPoint
  };

  // ---------------- MAP POINTS ----------------

  const points = useMemo(() => {
    return [captainPoint, userPoint].filter(Boolean);
  }, [captainPoint, userPoint]);

  // ---------------- STRAIGHT-LINE DISTANCE ----------------

  const straightDistance = useMemo(() => {
    return distanceMeters(captainPoint, userPoint);
  }, [captainPoint, userPoint]);

  // ---------------- CLEAR ROUTE WHEN A POINT DISAPPEARS ----------------

  const hasBoth = Boolean(captainPoint && userPoint);

  useEffect(() => {
    if (hasBoth) return;

    lastRoutedPointsRef.current = null;

    setRoute(previous => (previous.length ? [] : previous));
    setRouteDistance(null);
    setRouteDuration(null);
    setRouteError('');
  }, [hasBoth]);

  // ---------------- ROAD ROUTE ----------------

  useEffect(() => {
    let isMounted = true;

    const fetchRoute = async () => {
      const {
        captainPoint: captain,
        userPoint: user
      } = latestPointsRef.current;

      // Both locations are required for a road route.
      if (!captain || !user) return;

      const previous = lastRoutedPointsRef.current;

      const captainMoved =
        !previous ||
        distanceMeters(previous.captain, captain) >= 50;

      const userMoved =
        !previous ||
        distanceMeters(previous.user, user) >= 50;

      // Avoid unnecessary route API calls.
      if (!captainMoved && !userMoved) return;

      // Do not start overlapping requests.
      if (routeRequestRef.current) return;

      const controller = new AbortController();

      routeRequestRef.current = controller;

      try {
        const [captainLat, captainLng] = captain;
        const [userLat, userLng] = user;

        // OSRM requires longitude,latitude coordinate order.
        const url =
          `${OSRM_URL}/${captainLng},${captainLat};${userLng},${userLat}` +
          '?overview=full&geometries=geojson';

        const response = await fetch(url, {
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(
            `Route request failed (${response.status})`
          );
        }

        const data = await response.json();
        const result = data.routes?.[0];

        if (!result || !result.geometry?.coordinates?.length) {
          throw new Error('No driving route found');
        }

        if (!isMounted) return;

        const routeCoordinates =
          result.geometry.coordinates.map(([lng, lat]) => [
            lat,
            lng
          ]);

        setRoute(routeCoordinates);
        setRouteDistance(result.distance);
        setRouteDuration(result.duration);
        setRouteError('');

        lastRoutedPointsRef.current = {
          captain: [...captain],
          user: [...user]
        };
      } catch (error) {
        if (
          error.name !== 'AbortError' &&
          isMounted
        ) {
          console.warn('Route error:', error.message);

          setRouteError(
            'Road route is temporarily unavailable.'
          );

          // Keep the last successful route visible.
        }
      } finally {
        if (routeRequestRef.current === controller) {
          routeRequestRef.current = null;
        }
      }
    };

    // First route attempt.
    const initialTimer = setTimeout(fetchRoute, 500);

    // Check for significant movement every five seconds.
    const interval = setInterval(fetchRoute, 5000);

    return () => {
      isMounted = false;

      clearTimeout(initialTimer);
      clearInterval(interval);

      routeRequestRef.current?.abort();
      routeRequestRef.current = null;
    };
  }, []);

  // ---------------- FORMAT DISTANCE (debug panel only) ----------------

  const formatDistance = meters => {
    if (meters == null) return 'Calculating...';

    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }

    return `${(meters / 1000).toFixed(2)} km`;
  };

  const otherLabel =
    role === 'captain'
      ? pickupAddress || 'Passenger location'
      : 'Your location';

  // ---------------- UI ----------------
  // `isolate` keeps every Leaflet layer (z-index up to 1000) inside the map,
  // so page buttons, top bars and bottom sheets always stay above the map.

  return (
    <div
      className={`relative isolate h-full min-h-[300px] w-full ${className}`}
    >
      {/* Optional debug panel - off by default (map only) */}
      {showInfo && (
        <div className="absolute bottom-3 left-3 z-[500] max-w-[85%] rounded-xl bg-white p-3 text-sm text-gray-700 shadow-md">
          <div className="font-semibold text-gray-900">
            Captain ↔ {role === 'captain' ? 'Passenger' : 'You'}
          </div>

          <div>
            Straight-line: {formatDistance(straightDistance)}
          </div>

          {routeDistance !== null && (
            <div>
              Road: {formatDistance(routeDistance)}

              {routeDuration !== null &&
                ` · ${Math.max(
                  1,
                  Math.round(routeDuration / 60)
                )} min`}
            </div>
          )}

          {gpsError && (
            <div className="mt-1 text-xs text-red-600">
              {gpsError}
            </div>
          )}

          {routeError && (
            <div className="mt-1 text-xs text-amber-700">
              {routeError}
            </div>
          )}
        </div>
      )}

      {/* Leaflet map */}
      <MapContainer
        center={FALLBACK_CENTER}
        zoom={13}
        scrollWheelZoom={true}
        zoomControl={false}
        className="z-0 h-full min-h-[300px] w-full"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {zoomControl && <ZoomControl position="topright" />}

        {/* Captain marker */}
        {captainPoint && (
          <Marker
            position={captainPoint}
            icon={captainIcon}
          >
            <Popup>
              {role === 'captain'
                ? 'Your location'
                : 'Your captain'}
            </Popup>
          </Marker>
        )}

        {/* User / pickup marker */}
        {userPoint && (
          <Marker
            position={userPoint}
            icon={userIcon}
          >
            <Popup>{otherLabel}</Popup>
          </Marker>
        )}

        {/* Road route */}
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

        {/* Keep markers inside the visible part of the map */}
        <FitPoints points={points} padding={padding} />
      </MapContainer>
    </div>
  );
}