const express = require('express');
const router = express.Router();
const weatherChaserService = require('../services/weatherChaserService');

router.get('/status', (req, res) => {
    const radarStatus = weatherChaserService.getStatus();
    
    res.json({
        status: 'online',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        radar: {
            active: radarStatus.active,
            frameCount: radarStatus.frameCount,
            lastUpdate: radarStatus.lastUpdate,
            radarCount: radarStatus.radarCount
        }
    });
});

module.exports = router;
