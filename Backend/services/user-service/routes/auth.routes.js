const express = require('express');
const router = express.Router();

const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const { authLimiter } = require('../middlewares/rateLimit.middleware');

router.post('/google', authLimiter, authController.google);
router.get('/me', authMiddleware.authUser, authController.me);

module.exports = router;