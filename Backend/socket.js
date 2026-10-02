const socketIo = require('socket.io');
const mongoose = require('mongoose');
const userModel = require('./models/user.model');
const captainModel = require('./models/captain.model');
const rideModel = require('./models/ride.model'); // adjust path if different

let io;

// Re-check the ride in DB at most this often, so a finished ride
// stops being relayed even if the captain's socket stays connected
const LIVE_RIDE_RECHECK_MS = 30000;

// Map (not a plain object) so inputs like "constructor" can't match
const MODELS = new Map([
    ['user', userModel],
    ['captain', captainModel]
]);

function emitError(socket, message) {
    socket.emit('error', { message });
}

// Accepts numbers or numeric strings; rejects null, '', booleans, arrays
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

function isSocketConnected(socketId) {
    const sockets = io.sockets.sockets;

    return typeof sockets.get === 'function'
        ? Boolean(sockets.get(socketId)) // socket.io v3+
        : Boolean(sockets[socketId]);    // socket.io v2
}


function initializeSocket(server) {

    // calling this twice used to create a second Socket.IO server
    if (io) return io;

    io = socketIo(server, {
        cors: {
            origin: '*', // TODO: restrict to your frontend URL in production
            methods: ['GET', 'POST']
        }
    });

    io.on('connection', (socket) => {

        console.log(`Client connected: ${socket.id}`);

        // Identity of this socket, set only after a successful join
        socket.data = {};


        // =========================
        // USER / CAPTAIN JOIN
        // =========================

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

                const { userId, userType } = data || {};

                if (!userId || !userType) {
                    return fail('userId and userType are required');
                }

                const Model = MODELS.get(userType);

                if (!Model) {
                    return fail('Invalid userType');
                }

                if (!mongoose.isValidObjectId(userId)) {
                    return fail('Invalid userId');
                }

                const updated = await Model.findByIdAndUpdate(
                    userId,
                    { socketId: socket.id },
                    { new: true, runValidators: true }
                );

                if (!updated) {
                    return fail(`${userType} not found`);
                }

                // socket disconnected while we were saving, so the
                // disconnect handler had no identity to clean up. Do it here.
                if (socket.disconnected) {
                    await Model.updateOne(
                        { _id: updated._id, socketId: socket.id },
                        { $unset: { socketId: 1 } }
                    );
                    return;
                }

                socket.data.userId = String(updated._id);
                socket.data.userType = userType;

                // personal room: used to push live data (captain location)
                // to a user. Rooms are cleared automatically on disconnect.
                socket.join(`${userType}:${socket.data.userId}`);

                console.log(`JOIN ok: ${userType} ${updated._id} -> ${socket.id}`);

                reply({ ok: true });

            } catch (error) {

                console.error('Join socket error:', error);

                emitError(socket, 'Join failed');
                reply({ ok: false, message: 'Join failed' });
            }
        });


        // =========================
        // CAPTAIN LOCATION (saved in DB)
        // =========================

        socket.on('update-location-captain', async (data) => {

            try {

                // trust the identity set at join, not a userId sent by the
                // client. Otherwise anyone can move any captain on the map.
                if (
                    socket.data.userType !== 'captain' ||
                    !socket.data.userId
                ) {
                    return emitError(socket, 'Join as a captain first');
                }

                const ltd = toCoord(data?.location?.ltd);
                const lng = toCoord(data?.location?.lng);

                if (!isValidLatLng(ltd, lng)) {
                    return emitError(socket, 'Invalid location data');
                }

                await captainModel.updateOne(
                    { _id: socket.data.userId },
                    { $set: { 'location.ltd': ltd, 'location.lng': lng } }
                );

            } catch (error) {

                console.error('Captain location update error:', error);
            }
        });


        // =========================
        // CAPTAIN LIVE LOCATION -> PASSENGER
        // =========================

        socket.on('captain-live-location', async (data) => {

            try {

                if (
                    socket.data.userType !== 'captain' ||
                    !socket.data.userId
                ) {
                    return emitError(socket, 'Join as a captain first');
                }

                const ltd = toCoord(data?.location?.ltd);
                const lng = toCoord(data?.location?.lng);

                if (!isValidLatLng(ltd, lng)) {
                    return emitError(socket, 'Invalid location data');
                }

                const rideId = data?.rideId;

                if (!mongoose.isValidObjectId(rideId)) return;

                // Verify against the DB only when the ride changes or the
                // cached check is old. The ride must belong to THIS captain,
                // so a captain can't push locations to a random passenger.
                const cached = socket.data.liveRide;

                const needsCheck =
                    !cached ||
                    cached.rideId !== String(rideId) ||
                    Date.now() - cached.checkedAt > LIVE_RIDE_RECHECK_MS;

                if (needsCheck) {

                    const ride = await rideModel
                        .findOne({
                            _id: rideId,
                            captain: socket.data.userId,
                            status: 'ongoing' // use your actual in-progress status
                        })
                        .select('user');

                    if (!ride) {
                        socket.data.liveRide = null;
                        return;
                    }

                    socket.data.liveRide = {
                        rideId: String(ride._id),
                        userId: String(ride.user),
                        checkedAt: Date.now()
                    };
                }

                io.to(`user:${socket.data.liveRide.userId}`).emit(
                    'captain-location',
                    {
                        rideId: socket.data.liveRide.rideId,
                        lat: ltd,
                        lng
                    }
                );

            } catch (error) {

                console.error('Live location relay error:', error);
            }
        });


        // =========================
        // DISCONNECT
        // =========================

        socket.on('disconnect', async () => {

            console.log(`Client disconnected: ${socket.id}`);

            const { userId, userType } = socket.data || {};

            if (!userId) return;

            try {

                // one targeted query by _id. The socketId condition keeps it
                // race-safe: if the user already reconnected, the new
                // socketId is left alone.
                await MODELS.get(userType).updateOne(
                    { _id: userId, socketId: socket.id },
                    { $unset: { socketId: 1 } }
                );

            } catch (error) {

                console.error('Disconnect cleanup error:', error);
            }
        });

    });

    console.log('Socket.IO initialized');

    return io;
}


// =========================
// SEND MESSAGE
// =========================

// Returns true if the message was sent, false if the target isn't reachable
const sendMessageToSocketId = (socketId, messageObject) => {

    if (!io) {
        console.log('Socket.io not initialized');
        return false;
    }

    if (!socketId) {
        console.log('Socket ID missing');
        return false;
    }

    if (!messageObject || !messageObject.event) {
        console.log('Message event missing');
        return false;
    }

    // stale socketIds (offline captains) used to be "sent" silently
    if (!isSocketConnected(socketId)) {
        console.log(`Socket not connected: ${socketId} (${messageObject.event})`);
        return false;
    }

    // does not log messageObject.data. Ride payloads contain the OTP.
    console.log(`Sending "${messageObject.event}" to ${socketId}`);

    io.to(socketId).emit(messageObject.event, messageObject.data);

    return true;
};


module.exports = {
    initializeSocket,
    sendMessageToSocketId
};