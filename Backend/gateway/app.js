require("dotenv").config();

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();

// Do NOT add express.json() or express.urlencoded() here.
// The Gateway should not consume request bodies before proxying.

// ======================================================
// SERVICE CONFIGURATION
// ======================================================

const SERVICES = {
    user: process.env.USER_SERVICE_URL || "http://127.0.0.1:3001",
    captain: process.env.CAPTAIN_SERVICE_URL || "http://127.0.0.1:3002",
    ride: process.env.RIDE_SERVICE_URL || "http://127.0.0.1:3003",
    maps: process.env.MAPS_SERVICE_URL || "http://127.0.0.1:3004",
    notification:
        process.env.NOTIFICATION_SERVICE_URL || "http://127.0.0.1:3005",
};

const CORS_ORIGINS = (
    process.env.CORS_ORIGINS || "http://localhost:5173"
)
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);

if (process.env.TRUST_PROXY === "true") {
    app.set("trust proxy", 1);
}

// ======================================================
// CORS
// ======================================================

const corsMiddleware = cors({
    origin: CORS_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Requested-With",
    ],
});

app.use((req, res, next) => {
    // Socket.IO handles its own CORS configuration.
    if (req.path.startsWith("/socket.io")) {
        return next();
    }

    return corsMiddleware(req, res, next);
});

// ======================================================
// RATE LIMITING
// ======================================================

const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_PER_MIN) || 300,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) =>
        req.method === "OPTIONS" ||
        req.path.startsWith("/socket.io"),
    message: {
        message: "Too many requests, slow down",
    },
});

const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === "OPTIONS",
    message: {
        message: "Too many authentication attempts. Try again later.",
    },
});

const otpLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === "OPTIONS",
    message: {
        message: "Too many OTP attempts. Try again later.",
    },
});

app.use(generalLimiter);

app.use(
    ["/auth/send-code", "/auth/verify-code"],
    otpLimiter
);

app.use(
    ["/auth/send-code", "/auth/verify-code", "/auth/google"],
    authLimiter
);

app.use("/rides/start-ride", otpLimiter);

// ======================================================
// ROOT & HEALTH CHECK
// ======================================================

app.get("/", (req, res) => {
    res.status(200).json({
        service: "Saarthi API Gateway",
        status: "running",
    });
});

app.get("/health", async (req, res) => {
    const entries = await Promise.all(
        Object.entries(SERVICES).map(async ([name, url]) => {
            try {
                const response = await fetch(`${url}/`, {
                    signal: AbortSignal.timeout(3000),
                });

                return [
                    name,
                    {
                        status: response.ok ? "up" : "unhealthy",
                        code: response.status,
                    },
                ];
            } catch (error) {
                return [
                    name,
                    {
                        status: "down",
                        error: error.cause?.code || error.message,
                    },
                ];
            }
        })
    );

    const services = Object.fromEntries(entries);
    const allUp = Object.values(services).every(
        (service) => service.status === "up"
    );

    res.status(allUp ? 200 : 503).json({
        gateway: "up",
        status: allUp ? "healthy" : "degraded",
        services,
    });
});

// ======================================================
// PROXY HELPERS
// ======================================================

function stripDownstreamCors(proxyRes) {
    for (const key of Object.keys(proxyRes.headers)) {
        if (key.toLowerCase().startsWith("access-control-")) {
            delete proxyRes.headers[key];
        }
    }
}

const withoutDownstreamCors = {
    on: {
        proxyRes: stripDownstreamCors,
    },
};

function makeProxy(name, target, pathFilter, extra = {}) {
    return createProxyMiddleware({
        target,
        pathFilter,
        changeOrigin: true,
        ...(extra.pathRewrite
            ? { pathRewrite: extra.pathRewrite }
            : {}),
        proxyTimeout: 30000,
        timeout: 30000,

        on: {
            proxyReq: (proxyReq) => {
                // Never forward a client-supplied internal service key.
                proxyReq.removeHeader("x-internal-key");
            },

            error: (error, req, res) => {
                console.error(
                    `[gateway] ${name}-service error:`,
                    error.code || error.message
                );

                if (!res || res.headersSent) {
                    if (res && typeof res.destroy === "function") {
                        res.destroy();
                    }
                    return;
                }

                const timedOut =
                    error.code === "ETIMEDOUT" ||
                    error.code === "ECONNRESET";

                res.writeHead(timedOut ? 504 : 502, {
                    "Content-Type": "application/json",
                });

                res.end(
                    JSON.stringify({
                        message: timedOut
                            ? `${name} service timed out`
                            : `${name} service unavailable`,
                    })
                );
            },

            ...(extra.on || {}),
        },
    });
}

// ======================================================
// BLOCK INTERNAL ROUTES
// ======================================================

// Internal ride routes must not be exposed through the Gateway.
app.use("/rides/internal", (req, res) => {
    return res.status(404).json({
        message: "Route not found",
    });
});

// Prevent public lookups by raw MongoDB document ID.
const mongoIdPath = /(^|\/)[a-f\d]{24}(\/|$)/i;

app.use("/captains", (req, res, next) => {
    if (mongoIdPath.test(req.path)) {
        return res.status(404).json({
            message: "Route not found",
        });
    }

    next();
});

app.use("/users", (req, res, next) => {
    if (mongoIdPath.test(req.path)) {
        return res.status(404).json({
            message: "Route not found",
        });
    }

    next();
});

// ======================================================
// USER SERVICE
// ======================================================

// Keeps the original /users/... path for the downstream service.
app.use(
    makeProxy(
        "user",
        SERVICES.user,
        "/users",
        withoutDownstreamCors
    )
);

// ======================================================
// AUTH ROUTES -> USER SERVICE
// ======================================================

// Preserves /auth/... paths.
app.use(
    makeProxy(
        "user-auth",
        SERVICES.user,
        "/auth",
        withoutDownstreamCors
    )
);

// ======================================================
// CAPTAIN SERVICE
// ======================================================

app.use(
    makeProxy(
        "captain",
        SERVICES.captain,
        "/captains",
        withoutDownstreamCors
    )
);

// ======================================================
// RIDE SERVICE
// ======================================================

app.use(
    makeProxy(
        "ride",
        SERVICES.ride,
        "/rides",
        withoutDownstreamCors
    )
);

// ======================================================
// MAPS SERVICE
// ======================================================

app.use(
    makeProxy(
        "maps",
        SERVICES.maps,
        "/maps",
        withoutDownstreamCors
    )
);

// ======================================================
// SOCKET.IO -> NOTIFICATION SERVICE
// ======================================================

const socketProxy = createProxyMiddleware({
    target: SERVICES.notification,
    pathFilter: "/socket.io",
    changeOrigin: true,
    ws: true,
    proxyTimeout: 30000,
    timeout: 30000,

    on: {
        error: (error, req, res) => {
            console.error(
                "[gateway] notification-service error:",
                error.code || error.message
            );

            if (!res || res.headersSent) {
                if (res && typeof res.destroy === "function") {
                    res.destroy();
                }
                return;
            }

            res.writeHead(502, {
                "Content-Type": "application/json",
            });

            res.end(
                JSON.stringify({
                    message: "Notification service unavailable",
                })
            );
        },
    },
});

app.use(socketProxy);

// ======================================================
// 404 HANDLER
// ======================================================

app.use((req, res) => {
    res.status(404).json({
        message: "Route not found",
        path: req.originalUrl,
    });
});

// ======================================================
// GLOBAL ERROR HANDLER
// ======================================================

app.use((err, req, res, next) => {
    console.error("[gateway] UNHANDLED ERROR:", err);

    if (res.headersSent) {
        return next(err);
    }

    res.status(err.status || 500).json({
        message: "Gateway error",
    });
});

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
    app,
    socketProxy,
    SERVICES,
};