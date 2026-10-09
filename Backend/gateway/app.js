
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();

// IMPORTANT:
// Do not add express.json() or express.urlencoded() here.
// The Gateway should preserve request bodies for downstream services.

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
    .map((origin) => origin.trim())
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
});

app.use((req, res, next) => {
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
        message: "Too many login attempts, try again in a minute",
    },
});

const otpLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === "OPTIONS",
    message: {
        message: "Too many OTP attempts, try again in a minute",
    },
});

app.use(generalLimiter);

// OTP endpoints: stricter limit
app.use(
    ["/auth/send-code", "/auth/verify-code"],
    otpLimiter
);

// Authentication endpoints
app.use(
    ["/auth/send-code", "/auth/verify-code", "/auth/google"],
    authLimiter
);

// Ride OTP verification endpoint
app.use("/rides/start-ride", otpLimiter);

// ======================================================
// HEALTH CHECK
// ======================================================

app.get("/", (req, res) => {
    res.json({
        service: "Saarthi API Gateway",
        status: "running",
    });
});

app.get("/health", async (req, res) => {
    const entries = await Promise.all(
        Object.entries(SERVICES).map(async ([name, url]) => {
            try {
                const response = await fetch(`${url}/`, {
                    signal: AbortSignal.timeout(2000),
                });

                return [
                    name,
                    {
                        status: "up",
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

    const allUp = entries.every(
        ([, result]) => result.status === "up"
    );

    res.status(allUp ? 200 : 503).json({
        gateway: "up",
        services: Object.fromEntries(entries),
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
                // Do not trust a client-supplied internal service key.
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

                if (typeof res.writeHead === "function") {
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
                }
            },

            ...(extra.on || {}),
        },
    });
}

const withoutDownstreamCors = {
    on: {
        proxyRes: stripDownstreamCors,
    },
};

// ======================================================
// BLOCK INTERNAL ROUTES
// ======================================================

// Internal ride routes must not be publicly accessible.
app.use("/rides/internal", (req, res) => {
    return res.status(404).json({
        message: "Route not found",
    });
});

// Block captain lookup by MongoDB ID.
app.use("/captains", (req, res, next) => {
    if (/^\/[a-f\d]{24}(\/|$)/i.test(req.path)) {
        return res.status(404).json({
            message: "Route not found",
        });
    }

    next();
});

// Block user lookup by MongoDB ID.
app.use("/users", (req, res, next) => {
    if (/^\/[a-f\d]{24}(\/|$)/i.test(req.path)) {
        return res.status(404).json({
            message: "Route not found",
        });
    }

    next();
});

// ======================================================
// USER SERVICE
// ======================================================

// Gateway: /users/login
// User Service: /users/login

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

// Gateway:    /auth/send-code
// User Service: /auth/send-code
//
// Same mapping applies to:
// /auth/verify-code
// /auth/google
// /auth/me
//
// IMPORTANT:
// This preserves the /auth prefix.
// User Service must mount authRoutes using:
// app.use("/auth", authRoutes)

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

            if (typeof res.writeHead === "function") {
                res.writeHead(502, {
                    "Content-Type": "application/json",
                });

                res.end(
                    JSON.stringify({
                        message: "Notification service unavailable",
                    })
                );
            }
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
        message: err.message || "Gateway error",
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
