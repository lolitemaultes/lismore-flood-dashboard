const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');

// Config & Utils
const { Config } = require('./config/config');
const { Logger, colors } = require('./utils/logger');
const FileUtils = require('./utils/fileUtils');
const errorHandler = require('./middleware/errorHandler');

// Services
const weatherChaserService = require('./services/weatherChaserService');
const RadarService = require('./services/radarService');

// Routes & Controllers
const radarController = require('./routes/radar');
const floodRoutes = require('./routes/flood');
const outageRoutes = require('./routes/outages');
const webcamRoutes = require('./routes/webcam');
const cycloneRoutes = require('./routes/cyclone');
const elevationRoutes = require('./routes/elevation');
const statusRoutes = require('./routes/status');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Request Logging Middleware
app.use((req, res, next) => {
    const startTime = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const isExpected404 = res.statusCode === 404 && (
            req.path.includes('.well-known') || req.path.includes('devtools') || req.path.includes('cyclone-image')
        );
        const isRadarImageReq = req.path.includes('/api/radar/weatherchaser/image/');

        if (res.statusCode >= 400 && !isExpected404 && !isRadarImageReq) {
            Logger.error(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
        } else if (duration > 2000 && !isRadarImageReq) {
            Logger.warn(`Slow request: ${req.method} ${req.path} ${duration}ms`);
        }
    });
    next();
});

// --- Routes Mounting ---
app.use('/', statusRoutes);
app.use('/', floodRoutes);
app.use('/', outageRoutes);
app.use('/', webcamRoutes);
app.use('/', cycloneRoutes);
app.use('/', elevationRoutes);
app.use('/api/radar', radarController.router);

// Root API Index
app.get('/api', (req, res) => {
    res.json({
        name: 'Lismore Flood Dashboard API',
        version: '3.0.0',
        endpoints: {
            radar: '/api/radar',
            flood: '/flood-data',
            outages: '/api/outages',
            webcam: '/proxy/webcam',
            cyclone: '/api/check-cyclone',
            status: '/status'
        }
    });
});

// Error Handling Middleware
app.use(errorHandler);

// --- Background Tasks ---

async function prefetchAllRadarImages() {
    try {
        const status = weatherChaserService.getStatus();
        if (!status.active || !status.frameCount) {
            Logger.warn('[PREFETCH] Service inactive or no frames');
            return;
        }

        const TARGET_RADAR_IDS = [66, 28]; // Brisbane & Grafton
        const allRadars = weatherChaserService.getAllRadars().filter(r => TARGET_RADAR_IDS.includes(r.id));
        const { frames } = weatherChaserService.getFrames();

        if (!frames || frames.length === 0) return;

        Logger.info(`[PREFETCH] Starting for ${allRadars.length} radars x ${frames.length} frames`);

        let successCount = 0, failCount = 0, cachedCount = 0;

        for (const radar of allRadars) {
            for (const frame of frames) {
                const cacheKey = weatherChaserService.getCacheKey(radar.id, frame.timestamp);

                if (weatherChaserService.getFromCache(cacheKey)) {
                    cachedCount++;
                    continue;
                }

                if (weatherChaserService.isFailed(cacheKey)) {
                    failCount++;
                    continue;
                }

                try {
                    const imageUrl = weatherChaserService.buildImageUrl(radar.id, frame.timestamp);
                    const response = await axios.get(imageUrl, {
                        responseType: 'arraybuffer', timeout: 5000,
                        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/png', 'Accept-Encoding': 'gzip, deflate' },
                        validateStatus: s => s === 200
                    });
                    weatherChaserService.addToCache(cacheKey, response.data);
                    weatherChaserService.updateHealth(radar.id, true);
                    successCount++;
                } catch (error) {
                    weatherChaserService.markFailed(cacheKey, 'error');
                    weatherChaserService.updateHealth(radar.id, false);
                    failCount++;
                }
            }
            // Small delay between radars
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        Logger.success(`[PREFETCH] Done: ${successCount} new, ${cachedCount} cached, ${failCount} failed`);
    } catch (error) {
        Logger.error('[PREFETCH] Error:', error.message);
    }
}

async function initializeServer() {
    Logger.header('LISMORE FLOOD DASHBOARD SERVER API v2');

    try {
        await FileUtils.ensureDirectory(Config.paths.RESOURCES_DIR);
        Logger.success('Directory structure verified');

        await weatherChaserService.initialize();
        Logger.success('Weather Chaser service initialized');

        // Run prefetch asynchronously without awaiting, so server starts immediately
        prefetchAllRadarImages();

        // Periodic Tasks
        setInterval(async () => {
            weatherChaserService.checkServiceHealth();
            Logger.info('[PERIODIC] Refreshing radar images...');
            await prefetchAllRadarImages();
        }, 5 * 60 * 1000);

        await RadarService.downloadLegend();

        // Cleanup Task
        setInterval(async () => {
            await FileUtils.cleanupRadarImages();
        }, 5 * 60 * 1000);

        const server = app.listen(PORT, () => {
            Logger.success(`Server running on port ${PORT}`);
            Logger.info(`Dashboard: ${colors.bright}http://localhost:${PORT}${colors.reset}`);
            Logger.info(`API Index: ${colors.bright}http://localhost:${PORT}/api${colors.reset}`);
        });

        server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                Logger.error(`Port ${PORT} in use.`);
            } else {
                Logger.error('Server error:', error.message);
            }
            process.exit(1);
        });

        process.on('SIGINT', () => {
            Logger.info('Shutting down...');
            server.close(() => process.exit(0));
        });

    } catch (error) {
        Logger.error('Fatal Init Error:', error.message);
        process.exit(1);
    }
}

initializeServer();
