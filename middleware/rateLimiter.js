const rateLimit = require('express-rate-limit');
const { Logger } = require('../utils/logger');

// Standard limiter for API endpoints
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
    handler: (req, res, next, options) => {
        Logger.warn(`Rate limit exceeded for IP ${req.ip} on ${req.path}`);
        res.status(options.statusCode).send(options.message);
    }
});

// Stricter limiter for heavy endpoints (radar images, webcam proxy)
const heavyLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 120, // Increased from 60 to 120 (2 requests/sec average) to allow bursts during page load/refresh
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many image requests, please slow down.' }
});

module.exports = { apiLimiter, heavyLimiter };