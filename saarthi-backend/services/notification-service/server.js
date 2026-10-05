require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');

const {
    initializeSocket,
    emitToCaptain,
    emitToUser,
    trackCaptainRide,
    untrackCaptainRide
} = require('./socket');

const app = express();

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.get('/', (req, res) => {
    res.status(200).json({
        service: 'Saarthi Notification Service',
        status: 'running',
        socket: 'enabled'
    });
});


// ======================================================
// INTERNAL API (called by ride-service only)
// Do NOT expose /notifications/* through the gateway.
// ======================================================

const OBJECT_ID = /^[a-f\d]{24}$/i;

function internalOnly(req, res, next) {
    const key = process.env.INTERNAL_API_KEY;

    // no key configured -> open (development only)
    if (!key) return next();

    if (req.headers['x-internal-key'] !== key) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    next();
}

const router = express.Router();
router.use(internalOnly);

// emit `event` to a captain
router.post('/captain', (req, res) => {
    const { captainId, event, data } = req.body || {};

    if (!OBJECT_ID.test(String(captainId || '')) || typeof event !== 'string' || !event) {
        return res.status(400).json({ message: 'captainId and event are required' });
    }

    return res.status(200).json({ delivered: emitToCaptain(captainId, event, data) });
});

// emit `event` to a user
router.post('/user', (req, res) => {
    const { userId, event, data } = req.body || {};

    if (!OBJECT_ID.test(String(userId || '')) || typeof event !== 'string' || !event) {
        return res.status(400).json({ message: 'userId and event are required' });
    }

    return res.status(200).json({ delivered: emitToUser(userId, event, data) });
});

// start relaying captain location to the user
router.post('/track-ride', (req, res) => {
    const { captainId, rideId, userId, phase } = req.body || {};

    if (
        !OBJECT_ID.test(String(captainId || '')) ||
        !OBJECT_ID.test(String(rideId || '')) ||
        !OBJECT_ID.test(String(userId || ''))
    ) {
        return res.status(400).json({ message: 'captainId, rideId and userId are required' });
    }

    return res.status(200).json({
        tracking: trackCaptainRide({ captainId, rideId, userId, phase })
    });
});

// stop relaying (ride ended / cancelled)
router.post('/untrack-ride', (req, res) => {
    const { captainId } = req.body || {};

    if (!OBJECT_ID.test(String(captainId || ''))) {
        return res.status(400).json({ message: 'captainId is required' });
    }

    return res.status(200).json({ stopped: untrackCaptainRide(captainId) });
});

app.use('/notifications', router);


const server = http.createServer(app);

initializeSocket(server);

const PORT = process.env.PORT || 3005;

server.listen(PORT, () => {
    console.log(`HTTP Server : http://localhost:${PORT}`);
    console.log(`Socket.IO   : ws://localhost:${PORT}`);
});
