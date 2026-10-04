const socketIo = require('socket.io');
const mongoose = require('mongoose');
const userModel = require('./models/user.model');
const captainModel = require('./models/captain.model');
const rideModel = require('./models/ride.model');

let io;

// Re-check the ride in DB at most this often
const LIVE_RIDE_RECHECK_MS = 30000;

// Accepted-ride tracking
const trackedRides = new Map();

// Track re-check interval
const TRACK_RECHECK_MS = 30000;

// Models
const MODELS = new Map([
    ['user', userModel],
    ['captain', captainModel]
]);

function emitError(socket, message) {
    socket.emit('error', { message });
}

// Accept numbers or numeric strings
function toCoord(value) {
    if (typeof value === 'number') return value;

    if (
        typeof value === 'string' &&
        value.trim() !== ''
    ) {
        return Number(value);
    }

    return NaN;
}

function isValidLatLng(ltd, lng) {
    return (
        Number.isFinite(ltd) &&
        Number.isFinite(lng) &&
        ltd >= -90 &&
        ltd <= 90 &&
        lng >= -180 &&
        lng <= 180
    );
}

function isSocketConnected(socketId) {
    const sockets = io.sockets.sockets;

    return typeof sockets.get === 'function'
        ? Boolean(sockets.get(socketId))
        : Boolean(sockets[socketId]);
}


// ======================================================
// ACCEPTED RIDE:
// CAPTAIN LOCATION -> PASSENGER
// ======================================================

function trackCaptainRide({ captainId, rideId, userId }) {

    if (!captainId || !rideId || !userId) return;

    trackedRides.set(String(captainId), {
        rideId: String(rideId),
        userId: String(userId),
        checkedAt: Date.now()
    });
}


// ======================================================
// RELAY CAPTAIN LOCATION
// ======================================================

async function relayCaptainLocation(socket, ltd, lng) {

    try {

        const captainId = socket.data.userId;

        let tracked = trackedRides.get(captainId);

        // Re-check old tracked ride
        if (
            tracked &&
            Date.now() - tracked.checkedAt > TRACK_RECHECK_MS
        ) {

            const ride = await rideModel
                .findOne({
                    _id: tracked.rideId,
                    captain: captainId,
                    status: 'accepted'
                })
                .select('user');

            if (!ride) {

                trackedRides.delete(captainId);
                tracked = null;

            } else {

                tracked.userId = String(ride.user);
                tracked.checkedAt = Date.now();
            }
        }

        // No tracked ride
        if (!tracked) {

            const now = Date.now();

            if (
                now - (socket.data.lastTrackLookup || 0)
                < TRACK_RECHECK_MS
            ) {
                return;
            }

            socket.data.lastTrackLookup = now;

            const ride = await rideModel
                .findOne({
                    captain: captainId,
                    status: 'accepted'
                })
                .sort({ _id: -1 })
                .select('user');

            if (!ride) return;

            tracked = {
                rideId: String(ride._id),
                userId: String(ride.user),
                checkedAt: now
            };

            trackedRides.set(captainId, tracked);
        }

        // Send captain location to passenger
        io.to(`user:${tracked.userId}`).emit(
            'captain-location-update',
            {
                rideId: tracked.rideId,
                ltd,
                lng
            }
        );

    } catch (error) {

        console.error(
            'Captain location relay error:',
            error
        );
    }
}


// ======================================================
// INITIALIZE SOCKET
// ======================================================

function initializeSocket(server) {

    // Prevent duplicate Socket.IO initialization
    if (io) return io;

    io = socketIo(server, {

        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        },

        // ==================================================
        // IMPORTANT:
        // Detect dead / closed browser connections
        // ==================================================

        pingInterval: 5000,
        pingTimeout: 10000
    });


    // ======================================================
    // SOCKET CONNECTION
    // ======================================================

    io.on('connection', (socket) => {

        console.log(
            `Client connected: ${socket.id}`
        );

        // Identity is assigned after successful join
        socket.data = {};


        // ==================================================
        // USER / CAPTAIN JOIN
        // ==================================================

        socket.on('join', async (data, ack) => {

            const reply = (payload) => {

                if (typeof ack === 'function') {
                    ack(payload);
                }
            };

            const fail = (message) => {

                console.log(
                    'Join failed:',
                    message
                );

                emitError(socket, message);

                reply({
                    ok: false,
                    message
                });
            };

            try {

                const {
                    userId,
                    userType
                } = data || {};

                if (!userId || !userType) {
                    return fail(
                        'userId and userType are required'
                    );
                }

                const Model = MODELS.get(userType);

                if (!Model) {
                    return fail(
                        'Invalid userType'
                    );
                }

                if (!mongoose.isValidObjectId(userId)) {
                    return fail(
                        'Invalid userId'
                    );
                }

                // Save socket ID
                const updated = await Model.findByIdAndUpdate(
                    userId,
                    {
                        socketId: socket.id
                    },
                    {
                        new: true,
                        runValidators: true
                    }
                );

                if (!updated) {

                    return fail(
                        `${userType} not found`
                    );
                }

                // Socket disconnected while DB update was running
                if (socket.disconnected) {

                    await Model.updateOne(
                        {
                            _id: updated._id,
                            socketId: socket.id
                        },
                        {
                            $unset: {
                                socketId: 1
                            }
                        }
                    );

                    return;
                }

                // Save identity inside socket
                socket.data.userId =
                    String(updated._id);

                socket.data.userType =
                    userType;

                // Personal room
                socket.join(
                    `${userType}:${socket.data.userId}`
                );

                console.log(
                    `JOIN ok: ${userType} ${updated._id} -> ${socket.id}`
                );

                reply({
                    ok: true
                });

            } catch (error) {

                console.error(
                    'Join socket error:',
                    error
                );

                emitError(
                    socket,
                    'Join failed'
                );

                reply({
                    ok: false,
                    message: 'Join failed'
                });
            }
        });


        // ==================================================
        // CAPTAIN LOCATION
        // ==================================================

        socket.on(
            'update-location-captain',
            async (data) => {

                try {

                    // Only captain can update captain location
                    if (
                        socket.data.userType !== 'captain' ||
                        !socket.data.userId
                    ) {

                        return emitError(
                            socket,
                            'Join as a captain first'
                        );
                    }

                    const ltd =
                        toCoord(
                            data?.location?.ltd
                        );

                    const lng =
                        toCoord(
                            data?.location?.lng
                        );

                    if (
                        !isValidLatLng(
                            ltd,
                            lng
                        )
                    ) {

                        return emitError(
                            socket,
                            'Invalid location data'
                        );
                    }

                    await Promise.all([

                        // Save location
                        captainModel.updateOne(
                            {
                                _id:
                                    socket.data.userId
                            },
                            {
                                $set: {
                                    'location.ltd': ltd,
                                    'location.lng': lng
                                }
                            }
                        ),

                        // Relay to passenger
                        relayCaptainLocation(
                            socket,
                            ltd,
                            lng
                        )
                    ]);

                } catch (error) {

                    console.error(
                        'Captain location update error:',
                        error
                    );
                }
            }
        );


        // ==================================================
        // CAPTAIN LIVE LOCATION -> PASSENGER
        // ==================================================

        socket.on(
            'captain-live-location',
            async (data) => {

                try {

                    if (
                        socket.data.userType !== 'captain' ||
                        !socket.data.userId
                    ) {

                        return emitError(
                            socket,
                            'Join as a captain first'
                        );
                    }

                    const ltd =
                        toCoord(
                            data?.location?.ltd
                        );

                    const lng =
                        toCoord(
                            data?.location?.lng
                        );

                    if (
                        !isValidLatLng(
                            ltd,
                            lng
                        )
                    ) {

                        return emitError(
                            socket,
                            'Invalid location data'
                        );
                    }

                    const rideId =
                        data?.rideId;

                    if (
                        !mongoose.isValidObjectId(
                            rideId
                        )
                    ) {
                        return;
                    }

                    const cached =
                        socket.data.liveRide;

                    const needsCheck =
                        !cached ||
                        cached.rideId !== String(rideId) ||
                        Date.now() -
                        cached.checkedAt >
                        LIVE_RIDE_RECHECK_MS;

                    if (needsCheck) {

                        const ride =
                            await rideModel
                                .findOne({
                                    _id: rideId,
                                    captain:
                                        socket.data.userId,
                                    status: 'ongoing'
                                })
                                .select('user');

                        if (!ride) {

                            socket.data.liveRide =
                                null;

                            return;
                        }

                        socket.data.liveRide = {

                            rideId:
                                String(ride._id),

                            userId:
                                String(ride.user),

                            checkedAt:
                                Date.now()
                        };
                    }

                    io.to(
                        `user:${socket.data.liveRide.userId}`
                    ).emit(
                        'captain-location',
                        {
                            rideId:
                                socket.data.liveRide.rideId,

                            lat: ltd,
                            lng: lng
                        }
                    );

                } catch (error) {

                    console.error(
                        'Live location relay error:',
                        error
                    );
                }
            }
        );


        // ==================================================
        // DISCONNECT
        // ==================================================

        socket.on(
            'disconnect',
            async (reason) => {

                console.log(
                    `Client disconnected: ${socket.id}`
                );

                console.log(
                    `Disconnect reason: ${reason}`
                );

                const {
                    userId,
                    userType
                } = socket.data || {};

                // Socket never joined
                if (!userId || !userType) {
                    return;
                }

                try {

                    const Model =
                        MODELS.get(userType);

                    if (!Model) {
                        return;
                    }


                    // ==================================================
                    // CAPTAIN DISCONNECTED
                    // ==================================================

                    if (userType === 'captain') {

                        const result =
                            await captainModel.updateOne(

                                {
                                    _id: userId,

                                    // VERY IMPORTANT:
                                    // Only update if this is still
                                    // the captain's current socket.
                                    socketId: socket.id
                                },

                                {
                                    $set: {
                                        status: 'inactive'
                                    },

                                    $unset: {
                                        socketId: 1
                                    }
                                }
                            );


                        if (result.modifiedCount > 0) {

                            console.log(
                                `Captain ${userId} automatically set to INACTIVE`
                            );

                        } else {

                            console.log(
                                `Captain ${userId} already reconnected or socket changed`
                            );
                        }

                        // Remove accepted ride tracking
                        trackedRides.delete(
                            String(userId)
                        );

                        return;
                    }


                    // ==================================================
                    // NORMAL USER DISCONNECTED
                    // ==================================================

                    await Model.updateOne(

                        {
                            _id: userId,
                            socketId: socket.id
                        },

                        {
                            $unset: {
                                socketId: 1
                            }
                        }
                    );

                } catch (error) {

                    console.error(
                        'Disconnect cleanup error:',
                        error
                    );
                }
            }
        );

    });

    console.log(
        'Socket.IO initialized'
    );

    return io;
}


// ======================================================
// SEND MESSAGE
// ======================================================

const sendMessageToSocketId = (
    socketId,
    messageObject
) => {

    if (!io) {

        console.log(
            'Socket.io not initialized'
        );

        return false;
    }

    if (!socketId) {

        console.log(
            'Socket ID missing'
        );

        return false;
    }

    if (
        !messageObject ||
        !messageObject.event
    ) {

        console.log(
            'Message event missing'
        );

        return false;
    }

    if (!isSocketConnected(socketId)) {

        console.log(
            `Socket not connected: ${socketId} (${messageObject.event})`
        );

        return false;
    }

    // Do not log messageObject.data because
    // ride payload may contain OTP
    console.log(
        `Sending "${messageObject.event}" to ${socketId}`
    );

    io.to(socketId).emit(
        messageObject.event,
        messageObject.data
    );

    return true;
};


// ======================================================
// EXPORT
// ======================================================

module.exports = {
    initializeSocket,
    sendMessageToSocketId,
    trackCaptainRide
};