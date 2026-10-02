const axios = require('axios');
const captainModel = require('../models/captain.model');

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const OSRM = 'https://router.project-osrm.org';

const HEADERS = {
    'User-Agent': 'Saarthi-Ride-App/1.0',
    'Accept-Language': 'en'
};

/* ================= ERROR TYPE ================= */

// Carries an HTTP status so controllers can respond correctly
class GeoError extends Error {
    constructor(message, status = 500) {
        super(message);
        this.name = 'GeoError';
        this.status = status;
    }
}

/* ================= GEOCODE CACHE + THROTTLE ================= */

// Nominatim's public server allows ~1 request/second
const GEO_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const GEO_CACHE_MAX = 500;
const MAX_QUEUE_WAIT = 8000; // refuse work if the queue is longer than this
const geoCache = new Map();

let nextSlot = 0;

async function throttleNominatim() {
    const now = Date.now();
    const startAt = Math.max(now, nextSlot);

    // FIX: without a cap, rapid requests (e.g. typing) build an endless queue
    // and ride booking ends up stuck behind stale suggestion lookups
    if (startAt - now > MAX_QUEUE_WAIT) {
        throw new GeoError('Location service is busy, try again', 503);
    }

    nextSlot = startAt + 1100;

    if (startAt > now) {
        await new Promise(resolve => setTimeout(resolve, startAt - now));
    }
}

function cacheGet(key) {
    const hit = geoCache.get(key);

    if (!hit) return null;

    if (Date.now() - hit.at > GEO_CACHE_TTL) {
        geoCache.delete(key);
        return null;
    }

    return { ...hit.value }; // copy so callers can't mutate the cache
}

function cacheSet(key, value) {
    if (geoCache.size >= GEO_CACHE_MAX) {
        geoCache.delete(geoCache.keys().next().value); // drop oldest
    }

    geoCache.set(key, { value, at: Date.now() });
}

/* ================= HELPERS ================= */

function buildQueries(original) {
    const parts = original
        .split(',')
        .map(p => p.replace(/[\u0980-\u09FF]+/g, '').trim()) // strip Bengali script
        .filter(Boolean);

    const queries = [
        original,
        parts.join(', '),
        parts.slice(0, 3).join(', '), // most specific parts
        parts.slice(-4).join(', ')    // locality, district, state, country
    ];

    return [...new Set(queries.filter(Boolean))];
}

function distanceInKm(lat1, lon1, lat2, lon2) {
    const R = 6371;

    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) ** 2;

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ================= ADDRESS -> COORDINATES ================= */

async function getAddressCoordinates(address) {
    if (!address || typeof address !== 'string') {
        throw new GeoError('Address is required', 400);
    }

    const original = address.trim();
    const cacheKey = original.toLowerCase();

    const cached = cacheGet(cacheKey);

    if (cached) return cached;

    for (const query of buildQueries(original)) {
        try {
            await throttleNominatim();

            const { data } = await axios.get(`${NOMINATIM}/search`, {
                params: {
                    q: query,
                    format: 'json',
                    addressdetails: 1,
                    limit: 1,
                    countrycodes: 'in'
                },
                headers: HEADERS,
                timeout: 10000
            });

            if (data && data.length > 0) {
                const lat = Number(data[0].lat);
                const lng = Number(data[0].lon);

                if (Number.isFinite(lat) && Number.isFinite(lng)) {
                    // FIX: captains are stored as { ltd, lng }, and the original
                    // ride code reads `.ltd` — return both names so neither breaks
                    const result = { lat, ltd: lat, lng };

                    cacheSet(cacheKey, result);

                    return { ...result };
                }
            }
        } catch (error) {
            // Queue is full: no point trying the remaining fallbacks
            if (error instanceof GeoError) throw error;

            const status = error.response?.status;

            console.error('Geocoding error for query:', query, status || error.message);

            // FIX: if we're blocked/rate-limited, more queries make it worse
            if (status === 429 || status === 403) {
                throw new GeoError('Location service is rate limited, try again shortly', 503);
            }
            // other failures: continue with the next fallback query
        }
    }

    throw new GeoError(`Location not found: ${original}`, 404);
}

module.exports.getAddressCoordinates = getAddressCoordinates;

// Backwards-compatible alias for any code using the singular name
module.exports.getAddressCoordinate = getAddressCoordinates;

/* ================= DISTANCE + TIME ================= */

module.exports.getDistanceTime = async (origin, destination) => {
    if (!origin || !destination) {
        throw new GeoError('Origin and destination are required', 400);
    }

    // Sequential on purpose: keeps us under Nominatim's rate limit
    const start = await getAddressCoordinates(origin);
    const end = await getAddressCoordinates(destination);

    const coordinates = `${start.lng},${start.lat};${end.lng},${end.lat}`;

    try {
        const { data } = await axios.get(
            `${OSRM}/route/v1/driving/${coordinates}`,
            {
                params: {
                    overview: 'false',
                    alternatives: 'false',
                    steps: 'false'
                },
                timeout: 15000
            }
        );

        if (data.code !== 'Ok' || !data.routes?.length) {
            throw new GeoError(data.message || 'No route found', 404);
        }

        const route = data.routes[0];
        const distanceKm = route.distance / 1000;
        const durationMin = route.duration / 60;

        return {
            distance: {
                text: `${distanceKm.toFixed(2)} km`,
                value: route.distance // meters
            },
            duration: {
                text: `${Math.round(durationMin)} mins`,
                value: route.duration // seconds
            },
            status: 'OK'
        };
    } catch (error) {
        if (error instanceof GeoError) throw error;

        console.error('OSRM Error:', error.response?.data || error.message);

        throw new GeoError('Unable to calculate route', 502);
    }
};

/* ================= SUGGESTIONS ================= */

// NOTE: Nominatim's public usage policy forbids search-as-you-type
// autocomplete. Debounce the frontend (>= 600ms, min 3 chars) and consider
// Photon (photon.komoot.io) or a self-hosted instance for real autocomplete.
module.exports.getAutoCompleteSuggestions = async (input) => {
    if (!input || typeof input !== 'string') {
        throw new GeoError('Query is required', 400);
    }

    try {
        await throttleNominatim();

        const { data } = await axios.get(`${NOMINATIM}/search`, {
            params: {
                q: input.trim(),
                format: 'json',
                addressdetails: 1,
                limit: 5,
                countrycodes: 'in'
            },
            headers: HEADERS,
            timeout: 10000
        });

        return (data || []).map(place => {
            const lat = Number(place.lat);
            const lng = Number(place.lon);

            // FIX: remember the coordinates of every suggestion. When the user
            // picks one, ride creation finds the pickup in the cache and does
            // not need another Nominatim request (which could fail with
            // 503/404 and leave the ride with 0 nearby captains).
            if (
                place.display_name &&
                Number.isFinite(lat) &&
                Number.isFinite(lng)
            ) {
                cacheSet(
                    place.display_name.trim().toLowerCase(),
                    { lat, ltd: lat, lng }
                );
            }

            return {
                description: place.display_name,
                address: place.display_name,
                lat,
                ltd: lat,
                lng
            };
        });
    } catch (error) {
        if (error instanceof GeoError) throw error;

        console.error('Suggestion Error:', error.response?.data || error.message);

        throw new GeoError('Unable to get suggestions', 502);
    }
};

/* ================= CAPTAINS IN RADIUS ================= */

// radius is in kilometers. Captain location is stored as { ltd, lng },
// which MongoDB geo operators can't read, so we filter by distance here.
module.exports.getCaptainsInTheRadius = async (lat, lng, radius) => {
    const centerLat = Number(lat);
    const centerLng = Number(lng);
    const radiusKm = Number(radius);

    if (
        !Number.isFinite(centerLat) ||
        !Number.isFinite(centerLng) ||
        !Number.isFinite(radiusKm)
    ) {
        throw new GeoError('lat, lng and radius must be numbers', 400);
    }

    // FIX: $exists matches null values, and Number(null) === 0, which put
    // captains with null location at (0, 0). Exclude null explicitly.
    const captains = await captainModel.find({
        'location.ltd': { $exists: true, $ne: null },
        'location.lng': { $exists: true, $ne: null }
    });

    return captains.filter(captain => {
        const cLat = Number(captain.location.ltd);
        const cLng = Number(captain.location.lng);

        // FIX: isFinite also rejects Infinity, not just NaN
        if (!Number.isFinite(cLat) || !Number.isFinite(cLng)) return false;

        return distanceInKm(centerLat, centerLng, cLat, cLng) <= radiusKm;
    });
};