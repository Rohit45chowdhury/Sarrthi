require('dotenv').config();

const http = require('http');
const { app, socketProxy, SERVICES } = require('./app');

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

// WebSocket upgrades do not go through Express: forward them explicitly
server.on('upgrade', socketProxy.upgrade);

server.listen(PORT, () => {
    console.log(`Gateway running on http://localhost:${PORT}`);
    console.log('Routes:');
    console.log(`  /users/*     -> ${SERVICES.user}`);
    console.log(`  /captains/*  -> ${SERVICES.captain}`);
    console.log(`  /rides/*     -> ${SERVICES.ride}`);
    console.log(`  /maps/*      -> ${SERVICES.maps}`);
    console.log(`  /socket.io/* -> ${SERVICES.notification}  (websocket)`);
});
