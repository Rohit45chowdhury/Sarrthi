const socketIo = require('socket.io');
const mongoose = require('mongoose');
const userModel = require('./models/user.model');
const captainModel = require('./models/captain.model');

let io;

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

function isSocketConnected(socketId) {
    const sockets = io.sockets.sockets;

    return typeof sockets.get === 'function'
        ? Boolean(sockets.get(socketId)) // socket.io v3+
        : Boolean(sockets[socketId]);    // socket.io v2
}


function initializeSocket(server) {

    // FIX: calling this twice used to create a second Socket.IO server
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

                // FIX: destructuring undefined/null data used to throw
                const { userId, userType } = data || {};

                if (!userId || !userType) {
                    return fail('userId and userType are required');
                }

                // FIX: validate type and id up front, before touching the DB
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

                // FIX: client now hears about a missing account (was silent)
                if (!updated) {
                    return fail(`${userType} not found`);
                }

                // FIX: socket disconnected while we were saving, so the
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

                console.log(`JOIN ok: ${userType} ${updated._id} -> ${socket.id}`);

                reply({ ok: true });

            } catch (error) {

                console.error('Join socket error:', error);

                emitError(socket, 'Join failed');
                reply({ ok: false, message: 'Join failed' });
            }
        });


        // =========================
        // CAPTAIN LOCATION
        // =========================

        socket.on('update-location-captain', async (data) => {

            try {

                // FIX: trust the identity set at join, not a userId sent by the
                // client. Otherwise anyone can move any captain on the map.
                if (
                    socket.data.userType !== 'captain' ||
                    !socket.data.userId
                ) {
                    return emitError(socket, 'Join as a captain first');
                }

                // FIX: null / '' / true used to pass the old check and
                // Number(null) became 0, placing captains at (0, 0)
                const ltd = toCoord(data?.location?.ltd);
                const lng = toCoord(data?.location?.lng);

                if (
                    !Number.isFinite(ltd) ||
                    !Number.isFinite(lng) ||
                    ltd < -90 || ltd > 90 ||
                    lng < -180 || lng > 180
                ) {
                    return emitError(socket, 'Invalid location data');
                }

                // FIX: stored as real numbers (strings used to be saved as sent)
                await captainModel.updateOne(
                    { _id: socket.data.userId },
                    { $set: { 'location.ltd': ltd, 'location.lng': lng } }
                );

                // FIX: removed the per-update console.log; it fires every few
                // seconds per captain and floods the logs

            } catch (error) {

                console.error('Captain location update error:', error);
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

                // FIX: one targeted query by _id instead of two full scans by
                // socketId. The socketId condition keeps it race-safe: if the
                // user already reconnected, the new socketId is left alone.
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

    // FIX: stale socketIds (offline captains) used to be "sent" silently
    if (!isSocketConnected(socketId)) {
        console.log(`Socket not connected: ${socketId} (${messageObject.event})`);
        return false;
    }

    // FIX: no longer logs messageObject.data. Ride payloads contain the OTP.
    console.log(`Sending "${messageObject.event}" to ${socketId}`);

    io.to(socketId).emit(messageObject.event, messageObject.data);

    return true;
};


module.exports = {
    initializeSocket,
    sendMessageToSocketId
};