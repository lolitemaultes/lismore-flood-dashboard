const axios = require('axios');
const { Logger } = require('../utils/logger');
const { Config } = require('../config/config');

/**
 * Service for interacting with the Weather Chaser radar API.
 */
class WeatherChaserService {
    constructor() {
        /** 
         * @type {Array<{id: number, name: string, state: string, lat: number, lon: number, fullName: string}>} 
         */
        this.radarStations = Config.radarStations;

        // All radars are available
        this.allRadarIds = this.radarStations.map(r => r.id);

        /** 
         * @type {Array<{time: number, timestamp: string, dateStr: string, rainViewerTime: number}>} 
         */
        this.frames = [];
        
        /** @type {Date|null} */
        this.lastUpdate = null;

        // Caching & Queueing State
        this.imageCache = new Map();
        this.failedCache = new Map();
        this.healthStats = new Map();
        
        this.MAX_CACHE_SIZE = 500;
        this.CACHE_DURATION = 21600000; // 6 hours
        this.FAILED_CACHE_DURATION = 300000; // 5 minutes
        this.HEALTH_RESET_INTERVAL = 3600000; // 1 hour

        this.serviceDown = false;
        this.requestQueue = [];
        this.activeRequests = 0;
        this.MAX_CONCURRENT_REQUESTS = 5;
        this.REQUEST_DELAY = 100;
    }

    /**
     * Initialize the service and generate initial frames
     * @returns {Promise<void>}
     */
    async initialize() {
        Logger.info('WeatherChaser radar service initializing...');
        await this.updateFrames();

        // Auto-refresh every 5 minutes
        setInterval(async () => {
            Logger.verbose('WeatherChaser auto-refreshing frames...');
            await this.updateFrames();
        }, 5 * 60 * 1000);

        Logger.success('WeatherChaser radar service initialized');
    }

    // --- Caching Methods ---

    getCacheKey(radarId, timestamp) {
        return `${radarId}_${timestamp}`;
    }

    addToCache(key, data) {
        if (this.imageCache.size >= this.MAX_CACHE_SIZE) {
            const firstKey = this.imageCache.keys().next().value;
            this.imageCache.delete(firstKey);
        }
        this.imageCache.set(key, { data: data, timestamp: Date.now() });
    }

    getFromCache(key) {
        const cached = this.imageCache.get(key);
        if (!cached) return null;
        if (Date.now() - cached.timestamp > this.CACHE_DURATION) {
            this.imageCache.delete(key);
            return null;
        }
        return cached.data;
    }

    markFailed(key, errorType) {
        this.failedCache.set(key, { errorType: errorType, timestamp: Date.now() });
    }

    isFailed(key) {
        const failed = this.failedCache.get(key);
        if (!failed) return false;
        if (Date.now() - failed.timestamp > this.FAILED_CACHE_DURATION) {
            this.failedCache.delete(key);
            return false;
        }
        return true;
    }

    clearFailedCache() {
        this.failedCache.clear();
    }

    // --- Health Methods ---

    updateHealth(radarId, success) {
        if (!this.healthStats.has(radarId)) {
            this.healthStats.set(radarId, {
                successCount: 0, failCount: 0, lastSuccess: null, lastFail: null, lastReset: Date.now()
            });
        }
        const stats = this.healthStats.get(radarId);
        if (Date.now() - stats.lastReset > this.HEALTH_RESET_INTERVAL) {
            stats.successCount = 0; stats.failCount = 0; stats.lastReset = Date.now();
        }
        if (success) { stats.successCount++; stats.lastSuccess = Date.now(); }
        else { stats.failCount++; stats.lastFail = Date.now(); }
        this.healthStats.set(radarId, stats);
    }

    getHealthRate(radarId) {
        const stats = this.healthStats.get(radarId);
        if (!stats || (stats.successCount + stats.failCount) === 0) return null;
        return (stats.successCount / (stats.successCount + stats.failCount)) * 100;
    }

    checkServiceHealth() {
        // Check critical radars (Brisbane & Grafton)
        const criticalRadars = [66, 28];
        let criticalFailures = 0;
        let criticalChecks = 0;

        criticalRadars.forEach(id => {
            const rate = this.getHealthRate(id);
            if (rate !== null) {
                criticalChecks++;
                if (rate < 20) criticalFailures++; // Fail if < 20% success rate
            }
        });

        // If we have data for critical radars and they are failing, service is down
        if (criticalChecks > 0 && criticalFailures === criticalChecks) {
            this.serviceDown = true;
        } else {
            // Fallback to general health check
            let totalRadars = 0;
            let failingRadars = 0;
            this.healthStats.forEach((stats, radarId) => {
                totalRadars++;
                const healthRate = this.getHealthRate(radarId);
                if (healthRate !== null && healthRate < 5) failingRadars++;
            });
            
            // Down if > 80% of all tracked radars are failing (and we have a decent sample size)
            this.serviceDown = totalRadars > 5 && (failingRadars / totalRadars) > 0.8;
        }

        if (this.serviceDown) Logger.warn('[WEATHER CHASER] Service health check: DOWN');
        else Logger.verbose('[WEATHER CHASER] Service health check: OK');

        return this.serviceDown;
    }

    // --- Queue Methods ---

    async processQueue() {
        if (this.activeRequests >= this.MAX_CONCURRENT_REQUESTS || this.requestQueue.length === 0) return;
        const request = this.requestQueue.shift();
        if (!request) return;
        
        this.activeRequests++;
        try { await request.execute(); } catch (error) {} 
        finally {
            this.activeRequests--;
            setTimeout(() => this.processQueue(), this.REQUEST_DELAY);
        }
    }

    fetchImage(radarId, timestamp) {
        const cacheKey = this.getCacheKey(radarId, timestamp);

        // 1. Check Cache
        const cached = this.getFromCache(cacheKey);
        if (cached) {
            this.updateHealth(parseInt(radarId), true);
            return Promise.resolve({ data: cached, cached: true });
        }

        // 2. Check Failure Cache / Service Down
        if (this.isFailed(cacheKey) || this.serviceDown) {
            return Promise.reject({ type: 'failed_or_down' });
        }

        // 3. Queue Request
        return new Promise((resolve, reject) => {
            this.requestQueue.push({
                execute: async () => {
                    try {
                        const imageUrl = this.buildImageUrl(radarId, timestamp);
                        const response = await axios.get(imageUrl, {
                            responseType: 'arraybuffer',
                            timeout: 5000,
                            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/png', 'Accept-Encoding': 'gzip, deflate' },
                            validateStatus: (s) => s === 200
                        });
                        
                        this.addToCache(cacheKey, response.data);
                        this.updateHealth(parseInt(radarId), true);
                        resolve({ data: response.data, cached: false });
                    } catch (error) {
                        this.markFailed(cacheKey, 'error');
                        this.updateHealth(parseInt(radarId), false);
                        reject(error);
                    }
                }
            });
            this.processQueue();
        });
    }

    // --- Core Logic ---

    roundToRadarTime(date) {
        const rounded = new Date(date);
        const minutes = rounded.getUTCMinutes();
        const remainder = minutes % 5;
        const offset = remainder === 4 ? 0 : (remainder + 1);
        rounded.setUTCMinutes(minutes - offset);
        rounded.setUTCSeconds(0);
        rounded.setUTCMilliseconds(0);
        return rounded;
    }

    async updateFrames() {
        try {
            const frames = [];
            const now = new Date();
            const adjustedNow = new Date(now.getTime() - 10 * 60 * 1000);
            const latestFrame = this.roundToRadarTime(adjustedNow);

            for (let i = 0; i < 10; i++) {
                const frameTime = new Date(latestFrame.getTime() - i * 5 * 60 * 1000);
                frames.push({
                    time: frameTime.getTime(),
                    timestamp: this.formatTimestamp(frameTime),
                    dateStr: frameTime.toISOString(),
                    rainViewerTime: Math.floor(frameTime.getTime() / 1000)
                });
            }
            frames.reverse();
            this.frames = frames;
            this.lastUpdate = new Date();
            return true;
        } catch (error) {
            Logger.error('WeatherChaser error updating frames:', error);
            return false;
        }
    }

    formatTimestamp(date) {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        return `${year}${month}${day}${hours}${minutes}`;
    }

    getFrames(radarIds = null) {
        const ids = radarIds || this.allRadarIds;
        const radars = this.radarStations.filter(r => ids.includes(r.id));
        return { frames: this.frames, radars: radars, lastUpdate: this.lastUpdate };
    }

    getAllRadars() { return this.radarStations; }
    getRadar(radarId) { return this.radarStations.find(r => r.id === radarId); }
    
    buildImageUrl(radarId, timestamp) {
        return `https://theweatherchaser.com/radar/primary/${radarId}-1-m-${timestamp}.png`;
    }

    getStatus() {
        const frameCount = this.frames.length;
        // Logger.verbose(`[DEBUG] getStatus called. Frames: ${frameCount}, ServiceDown: ${this.serviceDown}`);
        return {
            active: !this.serviceDown && frameCount > 0, // Active only if service is UP and has data
            frameCount: frameCount,
            lastUpdate: this.lastUpdate,
            radarCount: this.radarStations.length,
            totalRadars: this.radarStations.length
        };
    }
}

const weatherChaserService = new WeatherChaserService();
module.exports = weatherChaserService;