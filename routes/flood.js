const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const Joi = require('joi');
const FloodService = require('../services/floodService');
const { Logger } = require('../utils/logger');
const { Config } = require('../config/config');
const { apiLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');

const riverDataSchema = Joi.object({
    location: Joi.string().min(3).max(100).optional()
});

router.get('/flood-data', apiLimiter, async (req, res) => {
    try {
        const data = await FloodService.fetchBomFloodData();
        res.json(data);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to fetch flood data',
            detail: error.message
        });
    }
});

router.get('/river-data', apiLimiter, validate(riverDataSchema, 'query'), async (req, res) => {
    try {
        const location = req.query.location || "Wilsons R at Lismore (mAHD)";
        const data = await FloodService.fetchRiverHeightData(location);
        res.json(data);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/api/flood-properties', apiLimiter, (req, res) => {
    const floodDataPath = path.join(__dirname, '../public', 'floodmap-data.json');

    try {
        if (fs.existsSync(floodDataPath)) {
            const data = fs.readFileSync(floodDataPath, 'utf8');
            res.json(JSON.parse(data));
        } else {
            res.status(404).json({
                success: false,
                error: 'Flood data file not found'
            });
        }
    } catch (error) {
        Logger.error('Error reading flood data:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to load flood data'
        });
    }
});

router.get('/api/bom-connectivity', apiLimiter, async (req, res) => {
    try {
        const response = await axios.head(Config.urls.BOM_BASE, {
            timeout: 5000,
            validateStatus: null
        });

        res.json({
            success: response.status >= 200 && response.status < 400,
            status: response.status,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;
