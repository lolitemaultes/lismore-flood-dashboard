const express = require('express');
const router = express.Router();
const Joi = require('joi');
const weatherChaserService = require('../services/weatherChaserService');
const RainViewerService = require('../services/rainViewerService');
const { Logger } = require('../utils/logger');
const { heavyLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');

// Constants
const TRANSPARENT_PNG_1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAOxAAADsQBlSsOGwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAANSURBVHja7cEBDQAAAMKg909tDjegAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4GcAHBIAAWq3sR4AAAAASUVORK5CYII=',
    'base64'
);

// --- Validation Schemas ---
const tileSchema = Joi.object({
    timestamp: Joi.string().pattern(/^\d{12}$/).required(),
    z: Joi.number().integer().min(0).max(20).required(),
    x: Joi.number().integer().min(0).required(),
    y: Joi.number().integer().min(0).required()
});

const imageSchema = Joi.object({
    radarId: Joi.string().pattern(/^\d+$/).required(),
    timestamp: Joi.string().pattern(/^\d{12}$/).required()
});

// --- Endpoints ---

// 1. RainViewer Tiles
router.get('/tile/:timestamp/:z/:x/:y', heavyLimiter, validate(tileSchema), async (req, res) => {
    const { timestamp, z, x, y } = req.params;
    const requestedQuality = parseInt(req.query.quality);

    const normalizeQuality = (value) => {
        if (Number.isNaN(value)) return 0;
        const clamped = Math.max(0, Math.min(2, value));
        return clamped >= 2 ? 1 : clamped;
    };

    let qualityCandidates;
    if (!Number.isNaN(requestedQuality)) {
        const preferred = normalizeQuality(requestedQuality);
        qualityCandidates = [preferred];
        if (preferred === 1) qualityCandidates.push(0); else if (preferred === 0) qualityCandidates.push(1);
    } else {
        // Heuristic: higher quality for higher zoom
        qualityCandidates = parseInt(z) >= 9 ? [1, 0] : [0, 1];
    }

    // Remove duplicates
    qualityCandidates = [...new Set(qualityCandidates)];

    for (const candidateQuality of qualityCandidates) {
        try {
            const { data, hit } = await RainViewerService.fetchTile(timestamp, z, x, y, candidateQuality);
            
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=21600, immutable');
            res.setHeader('X-Cache', hit ? 'HIT' : 'MISS');
            return res.send(data);
        } catch (error) {
            // Continue to next quality candidate
        }
    }

    // Fallback if all fail
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.send(TRANSPARENT_PNG_1x1);
});

// 2. Weather Chaser Frames
router.get('/weatherchaser/frames', async (req, res) => {
    try {
        if (req.query.refresh === '1' || req.query.refresh === 'true') {
            weatherChaserService.clearFailedCache();
            await weatherChaserService.updateFrames();
        }

        const radarIds = req.query.radars ? req.query.radars.split(',').map(id => parseInt(id)) : null;
        const data = weatherChaserService.getFrames(radarIds);
        const status = weatherChaserService.getStatus();

        res.json({
            success: true,
            frames: data.frames,
            radars: data.radars,
            status: status,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        Logger.error('Error getting frames:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. Weather Chaser Status
router.get('/weatherchaser/status', (req, res) => {
    try {
        const status = weatherChaserService.getStatus();
        res.json({ success: true, ...status, timestamp: new Date().toISOString() });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 4. Weather Chaser Health
router.get('/weatherchaser/health', (req, res) => {
    try {
        const healthData = [];
        const serviceDown = weatherChaserService.checkServiceHealth();

        weatherChaserService.healthStats.forEach((stats, radarId) => {
            const radarInfo = weatherChaserService.getRadar(radarId);
            const healthRate = weatherChaserService.getHealthRate(radarId);
            healthData.push({
                radarId,
                radarName: radarInfo ? radarInfo.fullName : `Radar ${radarId}`,
                healthRate,
                status: healthRate === null ? 'unknown' : healthRate > 50 ? 'healthy' : healthRate > 10 ? 'degraded' : 'failing'
            });
        });

        healthData.sort((a, b) => (a.healthRate || 100) - (b.healthRate || 100));

        res.json({
            success: true,
            serviceDown,
            radars: healthData,
            queueLength: weatherChaserService.requestQueue.length,
            activeRequests: weatherChaserService.activeRequests
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 5. Weather Chaser Image Proxy
router.get('/weatherchaser/image/:radarId/:timestamp', heavyLimiter, validate(imageSchema), async (req, res) => {
    const { radarId, timestamp } = req.params;

    try {
        const { data, cached } = await weatherChaserService.fetchImage(radarId, timestamp);
        
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=21600, immutable');
        res.setHeader('X-Cache', cached ? 'HIT' : 'MISS');
        res.send(data);
    } catch (error) {
        // If service is down or recently failed, serve transparent
        if (error.type === 'failed_or_down') {
            res.setHeader('Content-Type', 'image/png');
            res.status(200).send(TRANSPARENT_PNG_1x1);
        } else {
            res.setHeader('Content-Type', 'image/png');
            res.send(TRANSPARENT_PNG_1x1);
        }
    }
});

// Legacy Routes (Redirects)
router.get('/frames', (req, res) => res.redirect('/api/radar/weatherchaser/frames'));
router.get('/status', (req, res) => res.redirect('/api/radar/weatherchaser/status'));

module.exports = { router };