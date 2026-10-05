const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');

const userController = require('../controllers/user.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const internalOnly = require('../middlewares/internal.middleware');


router.post(
    '/register',
    [
        body('email').isEmail().withMessage('Invalid Email'),
        body('fullname.firstname').isLength({ min: 3 }).withMessage('First name must be at least 3 characters long'),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
    ],
    userController.registerUser
);

router.post(
    '/login',
    [
        body('email').isEmail().withMessage('Invalid Email'),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
    ],
    userController.loginUser
);

router.get('/profile', authMiddleware.authUser, userController.getUserProfile);

router.get('/logout', authMiddleware.authUser, userController.logoutUser);

// INTERNAL: keep this AFTER the static routes above ("/:id" would swallow them).
// The gateway also blocks it, so it is not reachable from outside.
router.get(
    '/:id',
    internalOnly,
    param('id').isMongoId().withMessage('Invalid user id'),
    userController.getUserById
);


module.exports = router;
