const socketIo = require('socket.io');
const userModel = require('./models/user.model');
const captainModel = require('./models/captain.model');

let io;

function initializeSocket(server) {

    io = socketIo(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        }
    });

    io.on('connection', (socket) => {

        console.log(`Client connected: ${socket.id}`);


        // =========================
        // USER / CAPTAIN JOIN
        // =========================

        socket.on('join', async (data) => {

            try {

                const {
                    userId,
                    userType
                } = data;

                console.log('==============================');
                console.log('JOIN REQUEST');
                console.log('userId:', userId);
                console.log('userType:', userType);
                console.log('socketId:', socket.id);
                console.log('==============================');


                if (!userId || !userType) {

                    console.log(
                        'Missing userId or userType'
                    );

                    return socket.emit('error', {
                        message:
                            'userId and userType are required'
                    });
                }


                // =========================
                // USER
                // =========================

                if (userType === 'user') {

                    const updatedUser =
                        await userModel.findByIdAndUpdate(
                            userId,
                            {
                                socketId: socket.id
                            },
                            {
                                new: true,
                                runValidators: true
                            }
                        );

                    if (!updatedUser) {

                        console.log(
                            'USER NOT FOUND:',
                            userId
                        );

                        return;
                    }

                    console.log(
                        'USER SOCKET ID SAVED:',
                        updatedUser.socketId
                    );
                }


                // =========================
                // CAPTAIN
                // =========================

                else if (userType === 'captain') {

                    const updatedCaptain =
                        await captainModel.findByIdAndUpdate(
                            userId,
                            {
                                socketId: socket.id
                            },
                            {
                                new: true,
                                runValidators: true
                            }
                        );

                    if (!updatedCaptain) {

                        console.log(
                            'CAPTAIN NOT FOUND:',
                            userId
                        );

                        return;
                    }

                    console.log(
                        'CAPTAIN SOCKET ID SAVED:',
                        updatedCaptain.socketId
                    );
                }


                // =========================
                // INVALID TYPE
                // =========================

                else {

                    console.log(
                        'Invalid userType:',
                        userType
                    );

                    socket.emit('error', {
                        message:
                            'Invalid userType'
                    });
                }

            } catch (error) {

                console.error(
                    'Join socket error:',
                    error
                );
            }
        });


        // =========================
        // CAPTAIN LOCATION
        // =========================

        socket.on(
            'update-location-captain',
            async (data) => {

                try {

                    const {
                        userId,
                        location
                    } = data;


                    if (
                        !userId ||
                        !location ||
                        location.ltd === undefined ||
                        location.lng === undefined
                    ) {

                        return socket.emit('error', {
                            message:
                                'Invalid location data'
                        });
                    }


                    await captainModel.findByIdAndUpdate(
                        userId,
                        {
                            location: {
                                ltd: location.ltd,
                                lng: location.lng
                            }
                        }
                    );


                    console.log(
                        `Captain ${userId} location updated:`,
                        location
                    );

                } catch (error) {

                    console.error(
                        'Captain location update error:',
                        error
                    );
                }
            }
        );


        // =========================
        // DISCONNECT
        // =========================

        socket.on('disconnect', async () => {

            console.log(
                `Client disconnected: ${socket.id}`
            );

            try {

                const user =
                    await userModel.findOneAndUpdate(
                        {
                            socketId: socket.id
                        },
                        {
                            $unset: {
                                socketId: 1
                            }
                        },
                        {
                            new: true
                        }
                    );


                const captain =
                    await captainModel.findOneAndUpdate(
                        {
                            socketId: socket.id
                        },
                        {
                            $unset: {
                                socketId: 1
                            }
                        },
                        {
                            new: true
                        }
                    );


                if (user) {

                    console.log(
                        'User socketId removed:',
                        user._id
                    );
                }


                if (captain) {

                    console.log(
                        'Captain socketId removed:',
                        captain._id
                    );
                }

            } catch (error) {

                console.error(
                    'Disconnect cleanup error:',
                    error
                );
            }
        });

    });


    console.log(
        'Socket.IO initialized'
    );

    return io;
}


// =========================
// SEND MESSAGE
// =========================

const sendMessageToSocketId = (
    socketId,
    messageObject
) => {

    console.log(
        'Sending socket message:',
        {
            socketId,
            event: messageObject.event,
            data: messageObject.data
        }
    );


    if (!io) {

        console.log(
            'Socket.io not initialized'
        );

        return;
    }


    if (!socketId) {

        console.log(
            'Socket ID missing'
        );

        return;
    }


    io.to(socketId).emit(
        messageObject.event,
        messageObject.data
    );
};


module.exports = {
    initializeSocket,
    sendMessageToSocketId
};