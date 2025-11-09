const https = require('https');

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
        this.API_URL = 'https://api.rainviewer.com/public/weather-maps.json';
        this.TILE_BASE_URL = 'https://tilecache.rainviewer.com'; // RainViewer tile cache
        this.TILE_SIZE = 256;
        this.REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes
        this.frames = [];
        this.lastUpdate = null;
        this.isUpdating = false;

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

    fetchJSON(url) {
        return new Promise((resolve, reject) => {
            https.get(url, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error('Failed to parse JSON'));
                    }
                });
            }).on('error', (err) => {
                reject(err);
            });
        });
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
            const fetchStart = Date.now();

            const apiData = await this.fetchJSON(this.API_URL);
            const fetchDuration = Date.now() - fetchStart;

            if (!apiData || !apiData.radar || !apiData.radar.past) {
                throw new Error('Invalid API response structure');
            }

            // Get past radar frames ONLY (exclude forecast/nowcast)
            const pastFrames = apiData.radar.past || [];

            if (pastFrames.length === 0) {
                throw new Error('No radar frames available');
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
            throw error;
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
            service: 'RainViewer'
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
