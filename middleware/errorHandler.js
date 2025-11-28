const { Logger } = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
    Logger.error(`Unhandled Error: ${err.message}`);
    if (process.env.VERBOSE_LOGGING === 'true' && err.stack) {
        Logger.error(err.stack);
    }

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    res.status(statusCode).json({
        success: false,
        error: message
    });
};

module.exports = errorHandler;
