
require("dotenv").config();

const http = require("http");
const { app, socketProxy, SERVICES } = require("./app");

const PORT = Number(process.env.PORT) || 3000;

const server = http.createServer(app);

// ======================================================
// SOCKET.IO WEBSOCKET UPGRADE
// ======================================================

server.on("upgrade", (req, socket, head) => {
    if (req.url && req.url.startsWith("/socket.io")) {
        socketProxy.upgrade(req, socket, head);
        return;
    }

    socket.destroy();
});

// ======================================================
// START SERVER
// ======================================================

server.listen(PORT, "0.0.0.0", () => {
    console.log("==================================");
    console.log("      Saarthi API Gateway");
    console.log("==================================");
    console.log(`Gateway listening on port ${PORT}`);
    console.log("");
    console.log("Configured downstream services:");
    console.log(`  /auth/*      -> ${SERVICES.user}`);
    console.log(`  /users/*     -> ${SERVICES.user}`);
    console.log(`  /captains/*  -> ${SERVICES.captain}`);
    console.log(`  /rides/*     -> ${SERVICES.ride}`);
    console.log(`  /maps/*      -> ${SERVICES.maps}`);
    console.log(`  /socket.io/* -> ${SERVICES.notification}`);
    console.log("");
});

// ======================================================
// GRACEFUL SHUTDOWN
// ======================================================

function shutdown(signal) {
    console.log(`${signal} received. Closing Gateway...`);

    server.close((error) => {
        if (error) {
            console.error("Gateway shutdown error:", error.message);
            process.exitCode = 1;
        }

        process.exit();
    });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ======================================================
// SERVER ERRORS
// ======================================================

server.on("error", (error) => {
    console.error("[gateway] Server error:", error.message);

    if (error.code === "EADDRINUSE") {
        console.error(`Port ${PORT} is already in use.`);
    }

    process.exitCode = 1;
});
