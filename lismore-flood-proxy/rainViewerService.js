const axios = require('axios');

// Logger utility for consistent formatting
class RadarLogger {
    static formatTimestamp() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    static log(action, details = '', status = '', duration = '') {
        const timestamp = this.formatTimestamp();
        const actionPadded = action.padEnd(6, ' ');
        const detailsPadded = details.padEnd(25, ' ');
        const statusPadded = status ? String(status).padEnd(4, ' ') : '';
        const durationStr = duration ? `${duration}ms` : '';

        console.log(`[${timestamp}] RADAR ${actionPadded} ${detailsPadded}${statusPadded}${durationStr}`);
    }

    static error(action, message) {
        const timestamp = this.formatTimestamp();
        const actionPadded = action.padEnd(6, ' ');
        console.error(`[${timestamp}] RADAR ${actionPadded} ERROR: ${message}`);
    }
}

class RainViewerService {
    constructor() {
        this.API_URLS = [
            'https://api.rainviewer.com/public/weather-maps.json',
            'https://tilecache.rainviewer.com/api/maps.json'
        ];
        this.TILE_BASE_URL = 'https://tilecache.rainviewer.com'; // RainViewer tile cache
        this.TILE_SIZE = 256;
        this.REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes
        this.FRAME_INTERVAL = 10 * 60; // 10 minutes in seconds
        this.frames = [];
        this.lastUpdate = null;
        this.isUpdating = false;
        this.useFallbackMode = false;

        this.initializeService();
    }

    async initializeService() {
        try {
            RadarLogger.log('INIT', 'RainViewer Tile Cache', '200');

            // Initial fetch
            await this.updateFrames();

            // Set up periodic updates
            setInterval(async () => {
                try {
                    await this.updateFrames();
                } catch (error) {
                    RadarLogger.error('UPDATE', error.message);
                }
            }, this.REFRESH_INTERVAL);

        } catch (error) {
            RadarLogger.error('INIT', error.message);
        }
    }

    async fetchJSON(url) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Referer': 'https://www.rainviewer.com/',
                    'Origin': 'https://www.rainviewer.com'
                },
                timeout: 10000,
                maxRedirects: 5,
                validateStatus: (status) => status === 200
            });

            return response.data;
        } catch (error) {
            if (error.response) {
                // Log the actual response for debugging
                const responseText = typeof error.response.data === 'string'
                    ? error.response.data.substring(0, 200)
                    : JSON.stringify(error.response.data).substring(0, 200);
                RadarLogger.error('FETCH', `HTTP ${error.response.status}: ${responseText}`);
                throw new Error(`HTTP ${error.response.status}: ${error.response.statusText}`);
            } else if (error.request) {
                RadarLogger.error('FETCH', 'No response received from RainViewer API');
                throw new Error('No response from RainViewer API');
            } else {
                RadarLogger.error('FETCH', error.message);
                throw error;
            }
        }
    }

    /**
     * Generate fallback frames based on current time when API is unavailable
     */
    generateFallbackFrames() {
        const now = Math.floor(Date.now() / 1000);
        const roundedNow = Math.floor(now / this.FRAME_INTERVAL) * this.FRAME_INTERVAL;
        const frames = [];

        // Generate last 12 frames (2 hours of data at 10 min intervals)
        for (let i = 11; i >= 0; i--) {
            const timestamp = roundedNow - (i * this.FRAME_INTERVAL);
            frames.push({
                path: `/v2/radar/${timestamp}/256/{z}/{x}/{y}/2/1_1.png`,
                time: timestamp * 1000,
                timestamp: timestamp,
                date: new Date(timestamp * 1000),
                tileUrl: this.getTileUrl(timestamp),
                isPrediction: false
            });
        }

        return frames;
    }

    async updateFrames() {
        if (this.isUpdating) {
            RadarLogger.log('UPDATE', 'Already in progress', '304');
            return;
        }

        this.isUpdating = true;
        const startTime = Date.now();

        try {
            RadarLogger.log('FETCH', 'Fetching frame list');

            // Try each API URL
            let apiData = null;
            let lastError = null;

            for (const apiUrl of this.API_URLS) {
                try {
                    apiData = await this.fetchJSON(apiUrl);
                    if (apiData && apiData.radar && apiData.radar.past) {
                        this.useFallbackMode = false;
                        break;
                    }
                } catch (error) {
                    lastError = error;
                    continue;
                }
            }

            // If API failed, use fallback timestamp generation
            if (!apiData || !apiData.radar || !apiData.radar.past) {
                RadarLogger.log('FETCH', 'API unavailable, using fallback');
                this.useFallbackMode = true;
                this.frames = this.generateFallbackFrames();
                this.lastUpdate = new Date();

                const totalDuration = Date.now() - startTime;
                RadarLogger.log('UPDATE', `${this.frames.length} frames (fallback)`, '200', totalDuration);
                return;
            }

            // Get past radar frames ONLY (exclude forecast/nowcast)
            const pastFrames = apiData.radar.past || [];

            if (pastFrames.length === 0) {
                // Use fallback if no frames from API
                RadarLogger.log('FETCH', 'No API frames, using fallback');
                this.useFallbackMode = true;
                this.frames = this.generateFallbackFrames();
                this.lastUpdate = new Date();

                const totalDuration = Date.now() - startTime;
                RadarLogger.log('UPDATE', `${this.frames.length} frames (fallback)`, '200', totalDuration);
                return;
            }

            // Process frames (past only, no predictions)
            this.frames = pastFrames.map(frame => ({
                path: frame.path,
                time: frame.time * 1000, // Convert to milliseconds
                timestamp: frame.time, // UNIX timestamp for Rainbow API
                date: new Date(frame.time * 1000),
                tileUrl: this.getTileUrl(frame.time),
                isPrediction: false // All frames are historical
            }));

            this.lastUpdate = new Date();

            const totalDuration = Date.now() - startTime;
            RadarLogger.log('UPDATE', `${this.frames.length} frames ready`, '200', totalDuration);

        } catch (error) {
            RadarLogger.error('UPDATE', error.message);
            // Use fallback on any error
            RadarLogger.log('FETCH', 'Error, using fallback mode');
            this.useFallbackMode = true;
            this.frames = this.generateFallbackFrames();
            this.lastUpdate = new Date();
        } finally {
            this.isUpdating = false;
        }
    }

    getTileUrl(timestamp) {
        // Proxy through our server to avoid CORS issues
        // Server-side proxy fetches from RainViewer tile cache with pre-colored tiles
        // Tiles use RainViewer's color scheme (color=2, similar to weather radar colors)
        return `/api/radar/tile/${timestamp}/{z}/{x}/{y}`;
    }

    getFrames() {
        return this.frames.map(frame => ({
            path: frame.path,
            time: frame.time,
            date: frame.date.toISOString(),
            tileUrl: frame.tileUrl,
            isPrediction: frame.isPrediction
        }));
    }

    getStatus() {
        return {
            available: this.frames.length > 0,
            frameCount: this.frames.length,
            lastUpdate: this.lastUpdate ? this.lastUpdate.toISOString() : null,
            isUpdating: this.isUpdating,
            service: 'RainViewer',
            mode: this.useFallbackMode ? 'fallback' : 'api'
        };
    }

    // Get configuration for frontend
    getConfig() {
        return {
            tileSize: this.TILE_SIZE,
            colorMode: 'dbz_u8', // Raw dBZ data mode
            api: 'Rainbow'
        };
    }
}

// Create singleton instance
const rainViewerService = new RainViewerService();

module.exports = rainViewerService;
