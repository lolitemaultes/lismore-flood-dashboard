const express = require('express');
const router = express.Router();
const axios = require('axios');
const { Logger } = require('../utils/logger');
const { heavyLimiter } = require('../middleware/rateLimiter');

router.get('/proxy/webcam', heavyLimiter, async (req, res) => {
    try {
        const webcamUrl = 'https://webcams.transport.nsw.gov.au/livetraffic-webcams/cameras/bruxner_highway_lismore.jpeg';

        const response = await axios.get(webcamUrl, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/jpeg,image/*,*/*;q=0.8'
            },
            validateStatus: null,
            timeout: 15000 // Increased timeout to reduce intermittent failures
        });

        if (response.status !== 200) {
            Logger.error(`Webcam image fetch failed: HTTP ${response.status}`);
            return res.status(response.status).send(`Error: ${response.status}`);
        }

        res.set('Content-Type', 'image/jpeg');
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        res.send(response.data);
    } catch (error) {
        Logger.error('Error fetching webcam image:', error.message);
        res.status(500).send('Error fetching webcam image');
    }
});

module.exports = router;
