const Redis = require('ioredis');

const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT) || 6379,
    username: 'default',
    password: process.env.REDIS_PASSWORD,
    tls: {},
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false
});

redis.on('ready', () => console.log('Redis connected'));
redis.on('error', (err) => console.error('Redis error:', err.message));

module.exports = redis;