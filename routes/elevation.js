const express = require('express');
const router = express.Router();
const axios = require('axios');
const NodeCache = require('node-cache');
const Joi = require('joi');
const { Logger } = require('../utils/logger');
const { apiLimiter, heavyLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');

const tileCache = new NodeCache({ stdTTL: 86400, checkperiod: 3600, maxKeys: 1000 });

const TRANSPARENT_TILE_256 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAOxAAADsQBlSsOGwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAANSURBVHja7cEBDQAAAMKg909tDjegAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4GcAHBIAAWq3sR4AAAAASUVORK5CYII=',
    'base64'
);

const tileSchema = Joi.object({
    z: Joi.number().integer().min(0).max(15).required(),
    x: Joi.number().integer().min(0).required(),
    y: Joi.number().integer().min(0).required()
});

const elevationSchema = Joi.object({
    lat: Joi.number().min(-90).max(90).required(),
    lng: Joi.number().min(-180).max(180).required(),
    z: Joi.number().integer().min(0).max(20).default(14)
});

router.get('/terrarium/:z/:x/:y.png', heavyLimiter, validate(tileSchema), async (req, res) => {
    res.set('Content-Type', 'image/png');
    res.set('Access-Control-Allow-Origin', '*');
    
    try {
        const { z, x, y } = req.params;
        
        const cacheKey = `tile:${z}:${x}:${y}`;
        const cached = tileCache.get(cacheKey);
        if (cached) {
            res.set('Cache-Control', 'public, max-age=86400, immutable');
            res.set('X-Cache', 'HIT');
            return res.send(cached);
        }
        
        const upstreamUrls = [
            `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
            `https://elevation-tiles-prod.s3.amazonaws.com/terrarium/${z}/${x}/${y}.png`
        ];
        
        for (const upstream of upstreamUrls) {
            try {
                const response = await axios.get(upstream, {
                    responseType: 'arraybuffer',
                    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/png,image/*;q=0.8' },
                    timeout: 5000,
                    validateStatus: (s) => s === 200
                });
                
                if (response.data && response.data.length > 0) {
                    tileCache.set(cacheKey, response.data);
                    res.set('Cache-Control', 'public, max-age=86400, immutable');
                    res.set('X-Cache', 'MISS');
                    return res.send(response.data);
                }
            } catch (err) { continue; }
        }
        
        res.set('Cache-Control', 'public, max-age=300');
        res.set('X-Cache', 'EMPTY');
        return res.send(TRANSPARENT_TILE_256);
        
    } catch (error) {
        res.set('Cache-Control', 'public, max-age=60');
        res.set('X-Cache', 'ERROR');
        return res.send(TRANSPARENT_TILE_256);
    }
});

router.get('/elevation', apiLimiter, validate(elevationSchema, 'query'), async (req, res) => {
    try {
        const lat = parseFloat(req.query.lat);
        const lng = parseFloat(req.query.lng);
        const z = parseInt(req.query.z || '14', 10);
        
        const n = Math.pow(2, z);
        const xt = Math.floor(((lng + 180) / 360) * n);
        const latRad = (lat * Math.PI) / 180;
        const yt = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
        const xRel = ((lng + 180) / 360) * n - xt;
        const yRel = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n - yt;
        const px = Math.max(0, Math.min(255, Math.round(xRel * 256)));
        const py = Math.max(0, Math.min(255, Math.round(yRel * 256)));
        
        return res.json({ 
            ok: true, z, tile: { x: xt, y: yt }, pixel: { x: px, y: py },
            url: `/terrarium/${z}/${xt}/${yt}.png` 
        });
    } catch (e) {
        Logger.error('Elevation lookup error:', e.message);
        res.status(500).json({ error: 'elevation lookup failed' });
    }
});

module.exports = router;
