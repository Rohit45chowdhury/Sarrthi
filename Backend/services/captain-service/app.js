
const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');

const captainRoutes = require('./routes/captain.routes');

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Root route
app.get('/', (req, res) => {
    res.json({
        service: 'Saarthi Captain Service',
        status: 'running'
    });
});

// Health check route
app.get('/health', (req, res) => {
    const dbConnected = mongoose.connection.readyState === 1;

    return res.status(dbConnected ? 200 : 503).json({
        service: 'captain-service',
        status: dbConnected ? 'healthy' : 'degraded',
        database: dbConnected ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
    });
});

// Captain API routes
app.use('/captains', captainRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        message: 'Route not found'
    });
});

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('UNHANDLED ERROR:', err);

    res.status(err.status || 500).json({
        message: err.message || 'Server error'
    });
});

module.exports = app;
