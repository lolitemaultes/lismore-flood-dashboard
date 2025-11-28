const express = require('express');
const router = express.Router();
const axios = require('axios');
const { Logger } = require('../utils/logger');
const { Config } = require('../config/config');
const { apiLimiter } = require('../middleware/rateLimiter');

router.get('/api/check-cyclone', apiLimiter, async (req, res) => {
    try {
        const imageUrl = 'https://www.bom.gov.au/fwo/IDQ65001.png';

        const response = await axios.head(imageUrl, {
            headers: Config.headers.browser,
            validateStatus: null,
            timeout: 5000
        });

        const available = response.status === 200;
        
        res.json({
            available,
            status: response.status,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.json({
            available: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

router.get('/proxy/cyclone-image', apiLimiter, async (req, res) => {
    try {
        const imageUrl = 'https://www.bom.gov.au/fwo/IDQ65001.png';

        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            headers: Config.headers.browser,
            validateStatus: null,
            timeout: 10000
        });

        if (response.status !== 200) {
            if (response.status === 404) {
                return res.status(404).send('No cyclone image available');
            }
            return res.status(response.status).send(`Error: ${response.status}`);
        }

        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'public, max-age=60');
        res.send(response.data);
    } catch (error) {
        if (error.response && error.response.status !== 404) {
            Logger.error('Error fetching cyclone image:', error.message);
        }
        res.status(error.response ? error.response.status : 500).send('Error fetching cyclone image');
    }
});

module.exports = router;
