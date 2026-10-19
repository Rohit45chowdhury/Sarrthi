const axios = require('axios');
const crypto = require('crypto');
const redis = require('../redis');

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const PHOTON = 'https://photon.komoot.io';
const OSRM = 'https://router.project-osrm.org';

// Rough bounding box of India: minLon,minLat,maxLon,maxLat
const INDIA_BBOX = '68.1,6.7,97.4,35.7';

// Nominatim policy: identify your app (set a contact email/URL in .env)
// Example: NOMINATIM_USER_AGENT=Saarthi-Ride-App/1.0 (you@example.com)
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

    // Without a cap, rapid requests build an endless queue
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

/* ================= PHOTON (AUTOCOMPLETE + FALLBACK) ================= */

// Build a readable one-line address from Photon properties
function formatPhotonAddress(p) {
    const street = [p.housenumber, p.street].filter(Boolean).join(' ');

    const parts = [
        p.name,
        street,
        p.locality,
        p.district,
        p.city,
        p.county,
        p.state,
        p.postcode,
        p.country
    ].filter(Boolean);

    // Remove repeated parts (e.g. name equal to city)
    return [...new Set(parts)].join(', ');
}

// Returns [{ address, lat, lng }] limited to India
async function photonSearch(query, limit = 5) {
    const { data } = await axios.get(`${PHOTON}/api/`, {
        params: {
            q: query,
            limit,
            lang: 'en',
            bbox: INDIA_BBOX
        },
        headers: HEADERS,
        timeout: 8000
    });

    const results = [];

    for (const feature of data?.features || []) {
        const p = feature.properties || {};
        const [lng, lat] = feature.geometry?.coordinates || [];

        if (p.countrycode && p.countrycode !== 'IN') continue;

        const address = formatPhotonAddress(p);

        if (
            address &&
            Number.isFinite(Number(lat)) &&
            Number.isFinite(Number(lng))
        ) {
            results.push({ address, lat: Number(lat), lng: Number(lng) });
        }
    }

    return results;
}

/* ================= ADDRESS -> COORDINATES ================= */

async function getAddressCoordinates(address) {
    if (!address || typeof address !== 'string') {
        throw new GeoError('Address is required', 400);
    }

    const original = address.trim();
    const cacheKey = geoKey(original);

    const cached = await cacheGet(cacheKey);

    if (cached) return cached;

    const queries = buildQueries(original);

    let blocked = false;

    // 1) Nominatim first
    for (const query of queries) {
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
                    const result = { lat, ltd: lat, lng };

                    await cacheSet(cacheKey, result, GEO_TTL);

                    return result;
                }
            }
        } catch (error) {
            // Queue is full: skip straight to the Photon fallback
            if (error instanceof GeoError) {
                blocked = true;
                break;
            }

            const status = error.response?.status;

            console.error('Geocoding error for query:', query, status || error.message);

            // Blocked/rate-limited: more Nominatim queries make it worse
            if (status === 429 || status === 403) {
                blocked = true;
                break;
            }
            // other failures: continue with the next fallback query
        }
    }

    // 2) Photon fallback (Nominatim blocked, busy, or found nothing)
    for (const query of queries) {
        try {
            const results = await photonSearch(query, 1);

            if (results.length > 0) {
                const { lat, lng } = results[0];
                const result = { lat, ltd: lat, lng };

                await cacheSet(cacheKey, result, GEO_TTL);

                return result;
            }
        } catch (error) {
            console.error(
                'Photon fallback error for query:',
                query,
                error.response?.status || error.message
            );
            break;
        }
    }

    if (blocked) {
        throw new GeoError('Location service is rate limited, try again shortly', 503);
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

// Uses Photon (built for search-as-you-type) instead of Nominatim,
// whose public policy forbids autocomplete.
module.exports.getAutoCompleteSuggestions = async (input) => {
    if (!input || typeof input !== 'string') {
        throw new GeoError('Query is required', 400);
    }

    const query = input.trim();

    // Too short to be useful
    if (query.length < 3) return [];

    const listKey = `sug:photon:${hash(query.toLowerCase())}`;

    const cachedList = await cacheGet(listKey);

    if (cachedList) return cachedList;

    try {
        const places = await photonSearch(query, 5);

        const suggestions = places.map(place => ({
            description: place.address,
            address: place.address,
            lat: place.lat,
            ltd: place.lat,
            lng: place.lng
        }));

        // Save each suggestion's coordinates so ride creation does not need
        // another geocode call when the user selects it
        if (places.length) {
            try {
                const pipe = redis.pipeline();

                for (const place of places) {
                    pipe.set(
                        PREFIX + geoKey(place.address),
                        JSON.stringify({
                            lat: place.lat,
                            ltd: place.lat,
                            lng: place.lng
                        }),
                        'EX',
                        GEO_TTL
                    );
                }

                await pipe.exec();
            } catch {
                /* ignore */
            }
        }

        // Cache only non-empty lists, so a transient empty result
        // is not stuck for 10 minutes
        if (suggestions.length) {
            await cacheSet(listKey, suggestions, SUGGEST_TTL);
        }

        return suggestions;
    } catch (error) {
        const status = error.response?.status;

        console.error('Autocomplete error for input:', query, status || error.message);

        if (status === 429 || status === 403) {
            throw new GeoError('Location service is rate limited, try again shortly', 503);
        }

        throw new GeoError('Unable to fetch suggestions', 502);
    }
};