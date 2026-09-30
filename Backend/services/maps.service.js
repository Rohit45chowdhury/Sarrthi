const axios = require('axios');
const captainModel = require('../models/captain.model');

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const OSRM = 'https://router.project-osrm.org';

const HEADERS = {
    'User-Agent': 'Saarthi-Ride-App/1.0',
    'Accept-Language': 'en'
};

/* ================= GEOCODE CACHE + THROTTLE ================= */

// Nominatim's public server allows ~1 request/second
const GEO_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const GEO_CACHE_MAX = 500;
const geoCache = new Map();

let nextSlot = 0;

async function throttleNominatim() {
    const now = Date.now();
    const startAt = Math.max(now, nextSlot);

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

    return hit.value;
}

function cacheSet(key, value) {
    if (geoCache.size >= GEO_CACHE_MAX) {
        // Drop the oldest entry
        geoCache.delete(geoCache.keys().next().value);
    }

    geoCache.set(key, { value, at: Date.now() });
}

/* ================= HELPERS ================= */

function buildQueries(original) {
    const parts = original
        .split(',')
        .map(p => p.replace(/[\u0980-\u09FF]+/g, '').trim()) // strip Bengali script
        .filter(Boolean);

    const cleaned = parts.join(', ');

    const queries = [
        original,
        cleaned,
        parts.slice(0, 3).join(', '),  // most specific part
        parts.slice(-4).join(', ')     // locality, district, state, country
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
        throw new Error('Address is required');
    }

    const original = address.trim();
    const cacheKey = original.toLowerCase();

    const cached = cacheGet(cacheKey);

    if (cached) return cached;

    for (const query of buildQueries(original)) {
        try {
            await throttleNominatim();

            console.log('Trying Nominatim:', query);

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
                    console.log('Location found:', {
                        query,
                        lat,
                        lng,
                        display_name: data[0].display_name
                    });

                    const result = { lat, lng };

                    cacheSet(cacheKey, result);

                    return result;
                }
            }
        } catch (error) {
            // One failed query must not stop the remaining fallbacks
            console.error(
                'Geocoding error for query:',
                query,
                error.response?.status || error.message
            );
        }
    }

    throw new Error(`Location not found: ${original}`);
}

module.exports.getAddressCoordinates = getAddressCoordinates;

// Backwards-compatible alias for any code using the singular name
module.exports.getAddressCoordinate = getAddressCoordinates;

/* ================= DISTANCE + TIME ================= */

module.exports.getDistanceTime = async (origin, destination) => {
    if (!origin || !destination) {
        throw new Error('Origin and destination are required');
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
            throw new Error(data.message || 'No route found');
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
        console.error('OSRM Error:', error.response?.data || error.message);

        throw new Error(error.message || 'Unable to calculate route');
    }
};

/* ================= SUGGESTIONS ================= */

module.exports.getAutoCompleteSuggestions = async (input) => {
    if (!input || typeof input !== 'string') {
        throw new Error('Query is required');
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

        return (data || []).map(place => ({
            description: place.display_name,
            address: place.display_name,
            lat: Number(place.lat),
            lng: Number(place.lon)
        }));
    } catch (error) {
        console.error('Suggestion Error:', error.response?.data || error.message);

        throw new Error('Unable to get suggestions');
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
        throw new Error('lat, lng and radius must be numbers');
    }

    const captains = await captainModel.find({
        'location.ltd': { $exists: true },
        'location.lng': { $exists: true }
    });

    return captains.filter(captain => {
        const cLat = Number(captain.location.ltd);
        const cLng = Number(captain.location.lng);

        if (Number.isNaN(cLat) || Number.isNaN(cLng)) return false;

        return distanceInKm(centerLat, centerLng, cLat, cLng) <= radiusKm;
    });
};