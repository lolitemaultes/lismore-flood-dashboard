const Joi = require('joi');
const { Logger } = require('../utils/logger');

const validate = (schema, property = 'params') => {
    return (req, res, next) => {
        const { error } = schema.validate(req[property]);
        if (error) {
            const message = error.details.map(i => i.message).join(',');
            Logger.warn(`Validation Error on ${req.path}: ${message}`);
            return res.status(400).json({ error: message });
        }
        next();
    };
};

module.exports = validate;
