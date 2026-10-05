const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const rideRoutes = require('./routes/ride.routes');

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get('/', (req, res) => {
    res.json({ service: 'Saarthi Rides Service', status: 'running' });
});

app.use('/rides', rideRoutes);

// 404
app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
});

// Last-resort error handler (bad JSON body, etc.)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('UNHANDLED ERROR:', err);
    res.status(err.status || 500).json({ message: err.message || 'Server error' });
});

module.exports = app;
