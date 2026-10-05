const socketIo = require('socket.io');
const axios = require('axios');

let io;

// ======================================================
// CONFIG
// ======================================================

// 127.0.0.1 (not localhost) avoids Node IPv6 ::1 ECONNREFUSED issues
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://127.0.0.1:3001';
const CAPTAIN_SERVICE_URL = process.env.CAPTAIN_SERVICE_URL || 'http://127.0.0.1:3002';
const RIDE_SERVICE_URL = process.env.RIDE_SERVICE_URL || 'http://127.0.0.1:3003';

// true  -> join requires a valid token (frontend must send it)
// false -> token is verified only when sent (backward compatible)
const REQUIRE_SOCKET_AUTH = process.env.REQUIRE_SOCKET_AUTH === 'true';

// How often an in-memory tracked ride is re-verified with ride-service
const TRACK_RECHECK_MS = 30000;

const http = axios.create({
    timeout: 5000,
    headers: process.env.INTERNAL_API_KEY
        ? { 'x-internal-key': process.env.INTERNAL_API_KEY }
        : {}
});

const OBJECT_ID = /^[a-f\d]{24}$/i;

// captainId -> { rideId, userId, phase: 'accepted' | 'ongoing', checkedAt }
const trackedRides = new Map();

const VALID_TYPES = new Set(['user', 'captain']);


// ======================================================
// HELPERS
// ======================================================

function emitError(socket, message) {
    socket.emit('error', { message });
}

// Accept numbers or numeric strings
function toCoord(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') return Number(value);
    return NaN;
}

function isValidLatLng(ltd, lng) {
    return (
        Number.isFinite(ltd) &&
        Number.isFinite(lng) &&
        ltd >= -90 && ltd <= 90 &&
        lng >= -180 && lng <= 180
    );
}

function roomName(type, id) {
    return `${type}:${id}`;
}

// Number of live sockets inside a room
function roomSize(room) {
    return io?.sockets.adapter.rooms.get(room)?.size || 0;
}


// ======================================================
// SEND TO USER / CAPTAIN (used by HTTP routes in server.js)
// ======================================================

function emitToRoom(type, id, event, data) {
    if (!io) {
        console.log('Socket.io not initialized');
        return false;
    }

    if (!id || !event) {
        console.log('emit: id or event missing');
        return false;
    }

    const room = roomName(type, id);

    if (roomSize(room) === 0) {
        console.log(`No connected socket for ${room} (${event})`);
        return false;
    }

    // Do not log `data`: ride payload may contain OTP
    console.log(`Sending "${event}" to ${room}`);
    io.to(room).emit(event, data);
    return true;
}

const emitToCaptain = (captainId, event, data) =>
    emitToRoom('captain', captainId, event, data);

const emitToUser = (userId, event, data) =>
    emitToRoom('user', userId, event, data);


// ======================================================
// RIDE TRACKING
// ======================================================

// phase 'accepted' : captain heading to pickup  (event: captain-location-update)
// phase 'ongoing'  : ride in progress           (event: captain-location)
function trackCaptainRide({ captainId, rideId, userId, phase = 'accepted' }) {
    if (!captainId || !rideId || !userId) return false;

    trackedRides.set(String(captainId), {
        rideId: String(rideId),
        userId: String(userId),
        phase: phase === 'ongoing' ? 'ongoing' : 'accepted',
        checkedAt: Date.now()
    });

    return true;
}

function untrackCaptainRide(captainId) {
    return trackedRides.delete(String(captainId));
}

// Ask ride-service for the captain's current accepted/ongoing ride.
// Returns the ride, null (no active ride) or undefined (lookup failed).
async function lookupActiveRide(captainId) {
    try {
        const { data } = await http.get(
            `${RIDE_SERVICE_URL}/rides/internal/active-by-captain/${captainId}`
        );
        return data?.ride || null;
    } catch (error) {
        console.error('Active ride lookup error:', error.response?.data || error.message);
        return undefined;
    }
}

// Current tracking info for a captain (re-verified when stale / missing,
// which also recovers tracking after a notification-service restart)
async function getTracked(socket, captainId) {
    let tracked = trackedRides.get(captainId);
    const now = Date.now();

    if (tracked && now - tracked.checkedAt <= TRACK_RECHECK_MS) {
        return tracked;
    }

    // throttle lookups per socket
    if (now - (socket.data.lastTrackLookup || 0) < TRACK_RECHECK_MS) {
        return tracked || null;
    }
    socket.data.lastTrackLookup = now;

    const ride = await lookupActiveRide(captainId);

    if (ride === undefined) {
        // ride-service unreachable: keep what we have
        return tracked || null;
    }

    if (!ride) {
        trackedRides.delete(captainId);
        return null;
    }

    tracked = {
        rideId: String(ride.rideId),
        userId: String(ride.userId),
        phase: ride.status === 'ongoing' ? 'ongoing' : 'accepted',
        checkedAt: now
    };

    trackedRides.set(captainId, tracked);
    return tracked;
}


// ======================================================
// CAPTAIN-SERVICE CALLS
// ======================================================

function saveCaptainLocation(captainId, ltd, lng) {
    http.patch(`${CAPTAIN_SERVICE_URL}/captains/${captainId}/location`, { ltd, lng })
        .catch((error) => {
            console.error(
                'Save captain location error:',
                error.response?.data || error.message
            );
        });
}

function setCaptainInactive(captainId) {
    return http
        .patch(`${CAPTAIN_SERVICE_URL}/captains/${captainId}/status`, { status: 'inactive' })
        .catch((error) => {
            console.error(
                'Set captain inactive error:',
                error.response?.data || error.message
            );
        });
}


// ======================================================
// VERIFY WHO IS JOINING
// ======================================================

async function verifyIdentity(userType, userId, token) {
    if (!token) {
        return !REQUIRE_SOCKET_AUTH;
    }

    const url = userType === 'captain'
        ? `${CAPTAIN_SERVICE_URL}/captains/profile`
        : `${USER_SERVICE_URL}/users/profile`;

    try {
        const { data } = await http.get(url, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const entity = data?.captain || data?.user || data;
        return String(entity?._id) === String(userId);

    } catch (error) {
        console.error('Socket auth error:', error.response?.status || error.message);
        return false;
    }
}


// ======================================================
// INITIALIZE SOCKET
// ======================================================

function initializeSocket(server) {

    // Prevent duplicate initialization
    if (io) return io;

    io = socketIo(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        },

        // Detect dead / closed browser connections
        pingInterval: 5000,
        pingTimeout: 10000
    });


    io.on('connection', (socket) => {

        console.log(`Client connected: ${socket.id}`);

        // Identity is assigned after successful join
        socket.data = {};


        // ==================================================
        // USER / CAPTAIN JOIN
        // data: { userId, userType, token? }
        // ==================================================

        socket.on('join', async (data, ack) => {

            const reply = (payload) => {
                if (typeof ack === 'function') ack(payload);
            };

            const fail = (message) => {
                console.log('Join failed:', message);
                emitError(socket, message);
                reply({ ok: false, message });
            };

            try {
                const { userId, userType, token } = data || {};

                if (!userId || !userType) {
                    return fail('userId and userType are required');
                }

                if (!VALID_TYPES.has(userType)) {
                    return fail('Invalid userType');
                }

                if (!OBJECT_ID.test(String(userId))) {
                    return fail('Invalid userId');
                }

                const allowed = await verifyIdentity(userType, userId, token);

                if (!allowed) {
                    return fail('Authentication failed');
                }

                // socket closed while verifying
                if (socket.disconnected) return;

                socket.data.userId = String(userId);
                socket.data.userType = userType;

                // Personal room: all events are delivered through this
                socket.join(roomName(userType, socket.data.userId));

                console.log(`JOIN ok: ${userType} ${userId} -> ${socket.id}`);

                reply({ ok: true });

            } catch (error) {
                console.error('Join socket error:', error);
                emitError(socket, 'Join failed');
                reply({ ok: false, message: 'Join failed' });
            }
        });


        // ==================================================
        // CAPTAIN LOCATION
        // saves location + (while heading to pickup) relays to passenger
        // ==================================================

        socket.on('update-location-captain', async (data) => {

            try {
                if (socket.data.userType !== 'captain' || !socket.data.userId) {
                    return emitError(socket, 'Join as a captain first');
                }

                const ltd = toCoord(data?.location?.ltd);
                const lng = toCoord(data?.location?.lng);

                if (!isValidLatLng(ltd, lng)) {
                    return emitError(socket, 'Invalid location data');
                }

                const captainId = socket.data.userId;

                // saved by captain-service (fire-and-forget)
                saveCaptainLocation(captainId, ltd, lng);

                const tracked = await getTracked(socket, captainId);

                if (tracked && tracked.phase === 'accepted') {
                    emitToUser(tracked.userId, 'captain-location-update', {
                        rideId: tracked.rideId,
                        ltd,
                        lng
                    });
                }

            } catch (error) {
                console.error('Captain location update error:', error);
            }
        });


        // ==================================================
        // CAPTAIN LIVE LOCATION -> PASSENGER (ride ongoing)
        // ==================================================

        socket.on('captain-live-location', async (data) => {

            try {
                if (socket.data.userType !== 'captain' || !socket.data.userId) {
                    return emitError(socket, 'Join as a captain first');
                }

                const ltd = toCoord(data?.location?.ltd);
                const lng = toCoord(data?.location?.lng);

                if (!isValidLatLng(ltd, lng)) {
                    return emitError(socket, 'Invalid location data');
                }

                const rideId = data?.rideId;

                if (!OBJECT_ID.test(String(rideId || ''))) return;

                const tracked = await getTracked(socket, socket.data.userId);

                if (
                    !tracked ||
                    tracked.phase !== 'ongoing' ||
                    tracked.rideId !== String(rideId)
                ) {
                    return;
                }

                emitToUser(tracked.userId, 'captain-location', {
                    rideId: tracked.rideId,
                    lat: ltd,
                    lng
                });

            } catch (error) {
                console.error('Live location relay error:', error);
            }
        });


        // ==================================================
        // DISCONNECT
        // ==================================================

        socket.on('disconnect', async (reason) => {

            console.log(`Client disconnected: ${socket.id} (${reason})`);

            const { userId, userType } = socket.data || {};

            // never joined, or not a captain: rooms clean themselves up
            if (!userId || userType !== 'captain') return;

            try {
                // Captain may have another live socket (page refresh / reconnect).
                // Only go inactive if NO socket is left in the captain's room.
                if (roomSize(roomName('captain', userId)) > 0) {
                    console.log(`Captain ${userId} still connected on another socket`);
                    return;
                }

                await setCaptainInactive(userId);
                trackedRides.delete(String(userId));

                console.log(`Captain ${userId} automatically set to INACTIVE`);

            } catch (error) {
                console.error('Disconnect cleanup error:', error);
            }
        });
    });

    console.log('Socket.IO initialized');

    return io;
}


module.exports = {
    initializeSocket,
    emitToCaptain,
    emitToUser,
    trackCaptainRide,
    untrackCaptainRide
};
