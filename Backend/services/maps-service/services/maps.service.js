const axios = require('axios');
const crypto = require('crypto');
const redis = require('../redis');

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const OSRM = 'https://router.project-osrm.org';

// Nominatim policy: identify your app (add a contact email/URL in .env)
const HEADERS = {
    'User-Agent': process.env.NOMINATIM_USER_AGENT || 'Saarthi-Ride-App/1.0',
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

/* ================= REDIS CACHE ================= */

const PREFIX = 'maps:v1:';          // bump v1 -> v2 to invalidate everything
const GEO_TTL = 60 * 60 * 24 * 7;   // 7 days: addresses rarely move
const SUGGEST_TTL = 60 * 10;        // 10 minutes
const ROUTE_TTL = 60 * 30;          // 30 minutes (OSRM has no live traffic)

const hash = (s) => crypto.createHash('sha1').update(s).digest('hex');

// Redis is an optimisation, never a dependency: on any error act like a miss
async function cacheGet(key) {
    try {
        const v = await redis.get(PREFIX + key);
        return v ? JSON.parse(v) : null;
    } catch {
        return null;
    }
}

async function cacheSet(key, value, ttl) {
    try {
        await redis.set(PREFIX + key, JSON.stringify(value), 'EX', ttl);
    } catch {
        /* ignore */
    }
}

/* ================= NOMINATIM THROTTLE ================= */

// Nominatim's public server allows ~1 request/second
// NOTE: this slot is per-process. If you run more than one instance,
// move it into Redis so all instances share the same limit.
const MAX_QUEUE_WAIT = 8000; // refuse work if the queue is longer than this

let nextSlot = 0;

async function throttleNominatim() {
    const now = Date.now();
    const startAt = Math.max(now, nextSlot);

    // Without a cap, rapid requests (e.g. typing) build an endless queue
    // and ride booking ends up stuck behind stale suggestion lookups
    if (startAt - now > MAX_QUEUE_WAIT) {
        throw new GeoError('Location service is busy, try again', 503);
    }

    nextSlot = startAt + 1100;

    if (startAt > now) {
        await new Promise(resolve => setTimeout(resolve, startAt - now));
    }
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

const geoKey = (text) => `geo:${hash(text.trim().toLowerCase())}`;

/* ================= ADDRESS -> COORDINATES ================= */

async function getAddressCoordinates(address) {
    if (!address || typeof address !== 'string') {
        throw new GeoError('Address is required', 400);
    }

    const original = address.trim();
    const cacheKey = geoKey(original);

    const cached = await cacheGet(cacheKey);

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
                    // Captains are stored as { ltd, lng }, so return both names
                    // (`lat` and `ltd`) and neither side breaks
                    const result = { lat, ltd: lat, lng };

                    await cacheSet(cacheKey, result, GEO_TTL);

                    return result;
                }
            }
        } catch (error) {
            // Queue is full: no point trying the remaining fallbacks
            if (error instanceof GeoError) throw error;

            const status = error.response?.status;

            console.error('Geocoding error for query:', query, status || error.message);

            // If we're blocked/rate-limited, more queries make it worse
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

    // Cached by the raw strings, so a hit skips the geocode lookups too
    const routeKey = `route:${hash(
        origin.trim().toLowerCase() + '|' + destination.trim().toLowerCase()
    )}`;

    const cachedRoute = await cacheGet(routeKey);

    if (cachedRoute) return cachedRoute;

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

        const result = {
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

        await cacheSet(routeKey, result, ROUTE_TTL);

        return result;
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

    const listKey = `sug:${hash(input.trim().toLowerCase())}`;

    const cachedList = await cacheGet(listKey);

    if (cachedList) return cachedList;

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

        const suggestions = [];
        const pipe = redis.pipeline();

        for (const place of data || []) {
            const lat = Number(place.lat);
            const lng = Number(place.lon);

            // Remember the coordinates of every suggestion. When the user
            // picks one, ride creation finds the pickup in the cache and does
            // not need another Nominatim request.
            if (
                place.display_name &&
                Number.isFinite(lat) &&
                Number.isFinite(lng)
            ) {
                pipe.set(
                    PREFIX + geoKey(place.display_name),
                    JSON.stringify({ lat, ltd: lat, lng }),
                    'EX',
                    GEO_TTL
                );
            }

            suggestions.push({
                description: place.display_name,
                address: place.display_name,
                lat,
                ltd: lat,
                lng
            });
        }

        // one round trip for all coordinate entries; failure is harmless
        try {
            await pipe.exec();
        } catch {
            /* ignore */
        }

        if (suggestions.length) {
            await cacheSet(listKey, suggestions, SUGGEST_TTL);
        }

        return suggestions;
    } catch (error) {
        if (error instanceof GeoError) throw error;

        console.error('Suggestion Error:', error.response?.data || error.message);

        throw new GeoError('Unable to get suggestions', 502);
    }
};

