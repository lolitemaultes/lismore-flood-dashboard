const axios = require('axios');
const NodeCache = require('node-cache');
const { Logger } = require('../utils/logger');

// Constants
const MAX_RADAR_TILE_CACHE_SIZE = 2000;
const RADAR_TILE_CACHE_DURATION = 21600000; // 6 hours

// Internal Cache (Map for now to match previous logic, or could use node-cache)
// The previous implementation used a Map with manual LRU. Let's use node-cache for simplicity and robustness.
const tileCache = new NodeCache({ stdTTL: RADAR_TILE_CACHE_DURATION / 1000, maxKeys: MAX_RADAR_TILE_CACHE_SIZE });

class RainViewerService {
    static getRadarTileCacheKey(timestamp, z, x, y, quality) {
        return `${timestamp}_${z}_${x}_${y}_q${quality}`;
    }

    static async fetchTile(timestamp, z, x, y, quality) {
        const cacheKey = this.getRadarTileCacheKey(timestamp, z, x, y, quality);
        const cached = tileCache.get(cacheKey);
        if (cached) {
            return { data: cached, hit: true };
        }

        const rainViewerUrl = `https://tilecache.rainviewer.com/v2/radar/${timestamp}/256/${z}/${x}/${y}/0/${quality}_0.png`;

        try {
            const response = await axios.get(rainViewerUrl, {
                responseType: 'arraybuffer',
                timeout: 5000,
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': 'image/png,image/*',
                    'Accept-Encoding': 'gzip, deflate'
                },
                validateStatus: (status) => status === 200,
                decompress: true
            });

            tileCache.set(cacheKey, response.data);
            return { data: response.data, hit: false };
        } catch (error) {
            throw error;
        }
    }
}

module.exports = RainViewerService;
