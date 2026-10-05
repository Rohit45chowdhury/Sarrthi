require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

// NOTE: no express.json() / body parsers here. Parsing the body in the
// gateway would consume it and the proxied service would receive nothing.


// ======================================================
// CONFIG
// ======================================================

// 127.0.0.1 (not localhost) avoids Node IPv6 ::1 ECONNREFUSED issues
// In docker-compose use service names, e.g. http://user-service:3001
const SERVICES = {
    user: process.env.USER_SERVICE_URL || 'http://127.0.0.1:3001',
    captain: process.env.CAPTAIN_SERVICE_URL || 'http://127.0.0.1:3002',
    ride: process.env.RIDE_SERVICE_URL || 'http://127.0.0.1:3003',
    maps: process.env.MAPS_SERVICE_URL || 'http://127.0.0.1:3004',
    notification: process.env.NOTIFICATION_SERVICE_URL || 'http://127.0.0.1:3005'
};

const CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

// behind nginx / a cloud load balancer set TRUST_PROXY=true so rate limits
// use the real client IP
if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
}


// ======================================================
// CORS (the gateway is the ONLY place that decides CORS)
// socket.io handles its own CORS inside notification-service.
// ======================================================

const corsMiddleware = cors({
    origin: CORS_ORIGINS.length ? CORS_ORIGINS : true, // true = reflect request origin (dev)
    credentials: true
});

app.use((req, res, next) => {
    if (req.path.startsWith('/socket.io')) return next();
    return corsMiddleware(req, res, next);
});


// ======================================================
// HEALTH (is every service reachable?)
// ======================================================

app.get('/health', async (req, res) => {

    const entries = await Promise.all(
        Object.entries(SERVICES).map(async ([name, url]) => {
            try {
                // any HTTP answer means the service is up
                const r = await fetch(`${url}/`, { signal: AbortSignal.timeout(2000) });
                return [name, { status: 'up', code: r.status }];
            } catch (error) {
                return [name, { status: 'down', error: error.cause?.code || error.message }];
            }
        })
    );

    const allUp = entries.every(([, v]) => v.status === 'up');

    res.status(allUp ? 200 : 503).json({
        gateway: 'up',
        services: Object.fromEntries(entries)
    });
});

app.get('/', (req, res) => {
    res.json({ service: 'Saarthi API Gateway', status: 'running' });
});


// ======================================================
// RATE LIMITS
// ======================================================

const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_PER_MIN) || 300,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS' || req.path.startsWith('/socket.io'),
    message: { message: 'Too many requests, slow down' }
});

// start-ride takes a 6-digit OTP in the query string: stop brute-forcing
const otpLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many OTP attempts, try again in a minute' }
});

app.use(generalLimiter);


// ======================================================
// BLOCK INTERNAL ROUTES
// These are for service-to-service calls only.
// ======================================================

app.use('/rides/internal', (req, res) => {
    res.status(404).json({ message: 'Route not found' });
});

// captain-service internal routes: /captains/active and /captains/<id>[/location|status|rating]
// (the real frontend routes are register, login, profile, stats, status, logout)
app.use('/captains', (req, res, next) => {
    if (req.path === '/active' || /^\/[a-f\d]{24}(\/|$)/i.test(req.path)) {
        return res.status(404).json({ message: 'Route not found' });
    }
    next();
});

// user-service internal route: /users/<id>  (frontend uses register, login, profile, logout)
app.use('/users', (req, res, next) => {
    if (/^\/[a-f\d]{24}(\/|$)/i.test(req.path)) {
        return res.status(404).json({ message: 'Route not found' });
    }
    next();
});

// /notifications/* is never proxied (no route below), so it is unreachable too.

app.use('/rides/start-ride', otpLimiter);


// ======================================================
// PROXIES
// pathFilter (not app.use('/path')) keeps the FULL path:
// /users/register is forwarded as /users/register.
// ======================================================

function stripDownstreamCors(proxyRes) {
    for (const key of Object.keys(proxyRes.headers)) {
        if (key.toLowerCase().startsWith('access-control-')) {
            delete proxyRes.headers[key];
        }
    }
}

function makeProxy(name, target, pathFilter, extra = {}) {
    return createProxyMiddleware({
        target,
        pathFilter,
        changeOrigin: true,
        proxyTimeout: 30000,
        timeout: 30000,
        on: {
            // clients must never be able to send the internal service key
            proxyReq: (proxyReq) => proxyReq.removeHeader('x-internal-key'),

            error: (err, req, res) => {
                console.error(`[gateway] ${name}-service error:`, err.code || err.message);

                if (typeof res.writeHead === 'function' && !res.headersSent) {
                    const timedOut = err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET';
                    res.writeHead(timedOut ? 504 : 502, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        message: timedOut
                            ? `${name} service timed out`
                            : `${name} service unavailable`
                    }));
                } else if (typeof res.destroy === 'function') {
                    res.destroy(); // websocket upgrade failed
                }
            },

            ...(extra.on || {})
        }
    });
}

const withoutDownstreamCors = { on: { proxyRes: stripDownstreamCors } };

app.use(makeProxy('user', SERVICES.user, '/users', withoutDownstreamCors));
app.use(makeProxy('captain', SERVICES.captain, '/captains', withoutDownstreamCors));
app.use(makeProxy('ride', SERVICES.ride, '/rides', withoutDownstreamCors));
app.use(makeProxy('maps', SERVICES.maps, '/maps', withoutDownstreamCors));

// Socket.IO (long-polling AND websocket). server.js forwards "upgrade" events.
const socketProxy = createProxyMiddleware({
    target: SERVICES.notification,
    pathFilter: '/socket.io',
    changeOrigin: true,
    ws: true,
    on: {
        error: (err, req, res) => {
            console.error('[gateway] notification-service error:', err.code || err.message);

            if (typeof res.writeHead === 'function' && !res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'notification service unavailable' }));
            } else if (typeof res.destroy === 'function') {
                res.destroy();
            }
        }
    }
});

app.use(socketProxy);


// ======================================================
// 404 + ERROR HANDLER
// ======================================================

app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('[gateway] UNHANDLED ERROR:', err);
    res.status(err.status || 500).json({ message: err.message || 'Gateway error' });
});

module.exports = { app, socketProxy, SERVICES };
