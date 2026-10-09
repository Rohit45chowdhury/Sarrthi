
require("dotenv").config();

const http = require("http");
const { app, socketProxy, SERVICES } = require("./app");

const PORT = Number(process.env.PORT) || 3000;

const server = http.createServer(app);

// Forward WebSocket upgrade requests to the notification service.
server.on("upgrade", (req, socket, head) => {
    if (req.url && req.url.startsWith("/socket.io")) {
        socketProxy.upgrade(req, socket, head);
        return;
    }

    socket.destroy();
});

server.listen(PORT, () => {
   
    console.log("       Saarthi API Gateway");
    
    console.log(`Gateway running on http://localhost:${PORT}`);
    console.log("");
    console.log("Routes:");
    console.log(`  /auth/*      -> ${SERVICES.user}`);
    console.log(`  /users/*     -> ${SERVICES.user}`);
    console.log(`  /captains/*  -> ${SERVICES.captain}`);
    console.log(`  /rides/*     -> ${SERVICES.ride}`);
    console.log(`  /maps/*      -> ${SERVICES.maps}`);
    console.log(
        `  /socket.io/* -> ${SERVICES.notification} (WebSocket)`
    );
    
});

server.on("error", (error) => {
    console.error("[gateway] Server error:", error.message);

    if (error.code === "EADDRINUSE") {
        console.error(
            `Port ${PORT} is already in use. Stop the other process or change PORT.`
        );
    }
});
