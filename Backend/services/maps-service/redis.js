const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false // fail fast instead of queuing when Redis is down
});

redis.on('error', (e) => console.error('Redis error:', e.message));

module.exports = redis;