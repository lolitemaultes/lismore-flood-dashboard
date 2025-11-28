const express = require('express');
const router = express.Router();
const OutageService = require('../services/outageService');
const { Logger } = require('../utils/logger');
const { apiLimiter } = require('../middleware/rateLimiter');

router.get('/api/outages', apiLimiter, async (req, res) => {
    try {
        if (req.query.refresh) {
            OutageService.getCache().flushAll();
            Logger.info('Outage cache cleared by user request');
        }

        Logger.info('Fetching outage data from Essential Energy...');

        const results = await Promise.allSettled([
            OutageService.fetchCategory('current'),
            OutageService.fetchCategory('future'),
            OutageService.fetchCategory('cancelled')
        ]);

        const current = results[0].status === 'fulfilled' ? results[0].value : [];
        const future = results[1].status === 'fulfilled' ? results[1].value : [];
        const cancelled = results[2].status === 'fulfilled' ? results[2].value : [];

        const errors = [];
        if (results[0].status === 'rejected') {
            errors.push({ category: 'current', error: results[0].reason.message });
        }
        if (results[1].status === 'rejected') {
            errors.push({ category: 'future', error: results[1].reason.message });
        }
        if (results[2].status === 'rejected') {
            errors.push({ category: 'cancelled', error: results[2].reason.message });
        }

        const allOutages = [...current, ...future, ...cancelled];

        let bounds = null;
        if (allOutages.length > 0) {
            const lats = allOutages.map(o => o.latitude);
            const lons = allOutages.map(o => o.longitude);
            bounds = {
                north: Math.max(...lats),
                south: Math.min(...lats),
                east: Math.max(...lons),
                west: Math.min(...lons)
            };
        }

        if (errors.length === 3) {
            Logger.error('All outage categories failed to fetch');
            return res.status(503).json({
                success: false,
                error: 'Essential Energy outage service is currently unavailable',
                hint: 'The Essential Energy KML feeds are not responding. Please try again later.',
                errors: errors,
                timestamp: new Date().toISOString()
            });
        }

        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            counts: {
                current: current.length,
                future: future.length,
                cancelled: cancelled.length,
                total: allOutages.length
            },
            bounds: bounds,
            features: allOutages,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        Logger.error('Error in /api/outages:', error.message);
        res.status(500).json({
            success: false,
            error: 'Internal server error while fetching outages',
            detail: error.message
        });
    }
});

router.get('/api/outages/clear-cache', apiLimiter, (req, res) => {
    OutageService.getCache().flushAll();
    Logger.info('Outage cache cleared via API');
    res.json({
        success: true,
        message: 'Outage cache cleared',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
