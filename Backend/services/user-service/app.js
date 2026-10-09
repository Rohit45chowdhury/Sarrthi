
const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const userRoutes = require('./routes/user.routes');
const authRoutes = require('./routes/auth.routes');

const app = express();

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health checks
app.get('/', (req, res) => {
    res.json({
        service: 'Saarthi User Service',
        status: 'running'
    });
});

app.get('/health', (req, res) => {
    res.json({ ok: true });
});

// Application routes
app.use('/users', userRoutes);
app.use('/auth', authRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('UNHANDLED ERROR:', err);

    res.status(err.status || 500).json({
        message: err.message || 'Server error'
    });
});

module.exports = app;
