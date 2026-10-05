require('dotenv').config();

const http = require('http');
const app = require('./app');
const connectToDb = require('./db/db');

const PORT = process.env.PORT || 3003;

connectToDb().then(() => {
    http.createServer(app).listen(PORT, () => {
        console.log(`Rides service running on port ${PORT}`);
    });
});
