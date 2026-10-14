
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

// Production: set FRONTEND_URL to your deployed frontend URL.
// Multiple origins can be comma-separated.
const allowedOrigins = (
    process.env.FRONTEND_URL || 'http://localhost:5173'
)
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

app.use(cors({
    origin(origin, callback) {
        // Allow server-to-server requests and health checks without an Origin.
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(new Error('Origin not allowed by CORS'));
    },
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root route
app.get('/', (req, res) => {
    res.status(200).json({
        service: 'Saarthi Notification Service',
        status: 'running',
        socket: 'enabled'
    });
});

// Health route for Render
app.get('/health', (req, res) => {
    res.status(200).json({
        service: 'Saarthi Notification Service',
        status: 'healthy',
        socket: 'enabled'
    });
});

// Internal API: called by ride-service only.
// Do not expose /notifications/* through the public gateway.
const OBJECT_ID = /^[a-f\d]{24}$/i;

function internalOnly(req, res, next) {
    const key = process.env.INTERNAL_API_KEY;

    // Fail closed if the internal key is missing.
    if (!key) {
        console.error('INTERNAL_API_KEY is not configured');
        return res.status(503).json({
            message: 'Internal API is not configured'
        });
    }

    if (req.headers['x-internal-key'] !== key) {
        return res.status(401).json({
            message: 'Unauthorized'
        });
    }

    next();
}

const router = express.Router();
router.use(internalOnly);

// Notify a captain
router.post('/captain', (req, res) => {
    const { captainId, event, data } = req.body || {};

    if (
        !OBJECT_ID.test(String(captainId || '')) ||
        typeof event !== 'string' ||
        !event.trim()
    ) {
        return res.status(400).json({
            message: 'Valid captainId and event are required'
        });
    }

    return res.status(200).json({
        delivered: emitToCaptain(captainId, event, data)
    });
});

// Notify a user
router.post('/user', (req, res) => {
    const { userId, event, data } = req.body || {};

    if (
        !OBJECT_ID.test(String(userId || '')) ||
        typeof event !== 'string' ||
        !event.trim()
    ) {
        return res.status(400).json({
            message: 'Valid userId and event are required'
        });
    }

    return res.status(200).json({
        delivered: emitToUser(userId, event, data)
    });
});

// Start ride-location tracking
router.post('/track-ride', (req, res) => {
    const { captainId, rideId, userId, phase } = req.body || {};

    if (
        !OBJECT_ID.test(String(captainId || '')) ||
        !OBJECT_ID.test(String(rideId || '')) ||
        !OBJECT_ID.test(String(userId || ''))
    ) {
        return res.status(400).json({
            message: 'Valid captainId, rideId and userId are required'
        });
    }

    return res.status(200).json({
        tracking: trackCaptainRide({
            captainId,
            rideId,
            userId,
            phase
        })
    });
});

// Stop ride-location tracking
router.post('/untrack-ride', (req, res) => {
    const { captainId } = req.body || {};

    if (!OBJECT_ID.test(String(captainId || ''))) {
        return res.status(400).json({
            message: 'Valid captainId is required'
        });
    }

    return res.status(200).json({
        stopped: untrackCaptainRide(captainId)
    });
});

app.use('/notifications', router);

// Start HTTP + Socket.IO
const server = http.createServer(app);

initializeSocket(server);

const PORT = process.env.PORT || 3005;

server.listen(PORT, () => {
    console.log(`Notification service running on port ${PORT}`);
});
