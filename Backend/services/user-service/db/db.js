const mongoose = require('mongoose');

// returns the promise so server.js can wait for the DB before listening
function connectToDb() {
    return mongoose
        .connect(process.env.DB_CONNECT)
        .then(() => console.log('Connected to DB'))
        .catch((err) => {
            console.error('DB connection failed:', err.message);
            process.exit(1);
        });
}

module.exports = connectToDb;
