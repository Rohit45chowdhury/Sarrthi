
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
  useMap
} from 'react-leaflet';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';

const FALLBACK_CENTER = [22.5726, 88.3639];

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
  iconAnchor: [18, 18]
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
    lng === null ||
    lng === undefined
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

function FitPoints({ points }) {
  const map = useMap();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!points.length) return;

    if (!initializedRef.current) {
      if (points.length === 1) {
        map.setView(points[0], 16);
      } else {
        map.fitBounds(L.latLngBounds(points), {
          padding: [55, 55],
          maxZoom: 16
        });
      }

      initializedRef.current = true;
      return;
    }

    const bounds = map.getBounds();

    const outside = points.some(point => !bounds.contains(point));

    if (outside) {
      if (points.length === 1) {
        map.panTo(points[0], { animate: true });
      } else {
        map.fitBounds(L.latLngBounds(points), {
          padding: [55, 55],
          maxZoom: 16,
          animate: true
        });
      }
    }
  }, [map, points]);

  return null;
}

// ---------------- MAIN COMPONENT ----------------

export default function LiveTracking({
  role = 'user',
  captainLocation = null,
  userLocation = null
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

  // On captain screen, current device = captain.
  // On user screen, captain location comes from Socket.IO.

  const captainPoint = useMemo(() => {
    return role === 'captain'
      ? normalizePoint(myPosition)
      : normalizePoint(captainLocation);
  }, [role, myPosition, captainLocation]);

  // ---------------- USER LOCATION ----------------

  // On user screen, current device = user.
  // On captain screen, user location comes from Socket.IO.

  const userPoint = useMemo(() => {
    return role === 'captain'
      ? normalizePoint(userLocation)
      : normalizePoint(myPosition);
  }, [role, userLocation, myPosition]);

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

  // ---------------- ROAD ROUTE ----------------

  useEffect(() => {
    let isMounted = true;

    const fetchRoute = async () => {
      const {
        captainPoint: captain,
        userPoint: user
      } = latestPointsRef.current;

      // Both locations are required for a road route.
      if (!captain || !user) {
        lastRoutedPointsRef.current = null;

        setRoute([]);
        setRouteDistance(null);
        setRouteDuration(null);
        setRouteError('');

        return;
      }

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

  // ---------------- FORMAT DISTANCE ----------------

  const formatDistance = meters => {
    if (meters == null) return 'Calculating...';

    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }

    return `${(meters / 1000).toFixed(2)} km`;
  };

  // ---------------- UI ----------------

  return (
    <div className="relative w-full h-full min-h-[300px]">
      {/* Distance and status panel */}
      <div className="absolute z-[1000] top-3 left-3 right-3 bg-white rounded-xl shadow-md p-3">
        <div className="font-semibold text-gray-900">
          Captain ↔ User
        </div>

        <div className="text-sm text-gray-700">
          Straight-line distance:{' '}
          {formatDistance(straightDistance)}
        </div>

        {routeDistance !== null && (
          <div className="text-sm text-gray-700">
            Road distance: {formatDistance(routeDistance)}

            {routeDuration !== null &&
              ` · ${Math.max(
                1,
                Math.round(routeDuration / 60)
              )} min`}
          </div>
        )}

        {(!captainPoint || !userPoint) && (
          <div className="text-xs text-amber-700 mt-1">
            Waiting for both live GPS locations...
          </div>
        )}

        {gpsError && (
          <div className="text-xs text-red-600 mt-1">
            {gpsError}
          </div>
        )}

        {routeError && (
          <div className="text-xs text-amber-700 mt-1">
            {routeError}
          </div>
        )}
      </div>

      {/* Leaflet map */}
      <MapContainer
        center={FALLBACK_CENTER}
        zoom={13}
        scrollWheelZoom={true}
        className="w-full h-full min-h-[300px] rounded-xl"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Captain marker */}
        {captainPoint && (
          <Marker
            position={captainPoint}
            icon={captainIcon}
          >
            <Popup>
              Captain's current GPS location
            </Popup>
          </Marker>
        )}

        {/* User marker */}
        {userPoint && (
          <Marker
            position={userPoint}
            icon={userIcon}
          >
            <Popup>
              User's current GPS location
            </Popup>
          </Marker>
        )}

        {/* Road route */}
        {route.length > 0 && (
          <Polyline
            positions={route}
            pathOptions={{
              color: '#2563eb',
              weight: 5,
              opacity: 0.85
            }}
          />
        )}

        {/* Automatically position markers in view */}
        <FitPoints points={points} />
      </MapContainer>
    </div>
  );
}
