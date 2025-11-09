const ftp = require('basic-ftp');
const fs = require('fs').promises;
const path = require('path');

// Comprehensive list of Australian BoM weather radars with geographic bounds
// Bounds calculated for approximately 512km radius coverage
const AUSTRALIAN_RADARS = [
    // New South Wales & ACT
    { id: 'IDR023', name: 'Sydney', center: [-33.70, 151.21], bounds: [[-38.30, 146.21], [-29.10, 156.21]] },
    { id: 'IDR033', name: 'Canberra', center: [-35.66, 149.51], bounds: [[-40.26, 144.51], [-31.06, 154.51]] },
    { id: 'IDR043', name: 'Newcastle', center: [-32.73, 151.83], bounds: [[-37.33, 146.83], [-28.13, 156.83]] },
    { id: 'IDR053', name: 'Moruya', center: [-35.83, 150.15], bounds: [[-40.43, 145.15], [-31.23, 155.15]] },
    { id: 'IDR063', name: 'Wollongong', center: [-34.26, 150.87], bounds: [[-38.86, 145.87], [-29.66, 155.87]] },
    { id: 'IDR643', name: 'Namoi', center: [-31.02, 150.19], bounds: [[-35.62, 145.19], [-26.42, 155.19]] },
    { id: 'IDR663', name: 'Grafton', center: [-29.62, 152.95], bounds: [[-34.22, 147.95], [-25.02, 157.95]] },
    { id: 'IDR713', name: 'Coffs Harbour', center: [-30.32, 153.24], bounds: [[-34.92, 148.24], [-25.72, 158.24]] },

    // Queensland
    { id: 'IDR143', name: 'Brisbane', center: [-27.72, 152.94], bounds: [[-32.32, 147.94], [-23.12, 157.94]] },
    { id: 'IDR153', name: 'Gold Coast', center: [-28.11, 153.53], bounds: [[-32.71, 148.53], [-23.51, 158.53]] },
    { id: 'IDR503', name: 'Cairns', center: [-16.82, 145.68], bounds: [[-21.42, 140.68], [-12.22, 150.68]] },
    { id: 'IDR513', name: 'Townsville', center: [-19.25, 146.77], bounds: [[-23.85, 141.77], [-14.65, 151.77]] },
    { id: 'IDR523', name: 'Mackay', center: [-21.12, 149.18], bounds: [[-25.72, 144.18], [-16.52, 154.18]] },
    { id: 'IDR533', name: 'Gladstone', center: [-23.86, 151.26], bounds: [[-28.46, 146.26], [-19.26, 156.26]] },
    { id: 'IDR553', name: 'Gympie', center: [-26.55, 152.98], bounds: [[-31.15, 147.98], [-21.95, 157.98]] },
    { id: 'IDR603', name: 'Emerald', center: [-23.55, 148.16], bounds: [[-28.15, 143.16], [-18.95, 153.16]] },
    { id: 'IDR613', name: 'Rockhampton', center: [-23.45, 150.48], bounds: [[-28.05, 145.48], [-18.85, 155.48]] },
    { id: 'IDR623', name: 'Bowen', center: [-20.05, 148.08], bounds: [[-24.65, 143.08], [-15.45, 153.08]] },
    { id: 'IDR633', name: 'Mornington Island', center: [-16.68, 139.18], bounds: [[-21.28, 134.18], [-12.08, 144.18]] },
    { id: 'IDR673', name: 'Charleville', center: [-26.42, 146.26], bounds: [[-31.02, 141.26], [-21.82, 151.26]] },
    { id: 'IDR693', name: 'Longreach', center: [-23.44, 144.28], bounds: [[-28.04, 139.28], [-18.84, 149.28]] },

    // Victoria
    { id: 'IDR073', name: 'Melbourne', center: [-37.86, 144.75], bounds: [[-42.46, 139.75], [-33.26, 149.75]] },
    { id: 'IDR373', name: 'Mildura', center: [-34.24, 142.09], bounds: [[-38.84, 137.09], [-29.64, 147.09]] },
    { id: 'IDR253', name: 'Bairnsdale', center: [-37.89, 147.57], bounds: [[-42.49, 142.57], [-33.29, 152.57]] },

    // South Australia
    { id: 'IDR083', name: 'Adelaide', center: [-34.62, 138.47], bounds: [[-39.22, 133.47], [-30.02, 143.47]] },
    { id: 'IDR273', name: 'Woomera', center: [-31.16, 136.82], bounds: [[-35.76, 131.82], [-26.56, 141.82]] },
    { id: 'IDR283', name: 'Port Augusta', center: [-32.51, 137.69], bounds: [[-37.11, 132.69], [-27.91, 142.69]] },

    // Western Australia
    { id: 'IDR703', name: 'Broome', center: [-17.95, 122.23], bounds: [[-22.55, 117.23], [-13.35, 127.23]] },
    { id: 'IDR313', name: 'Perth', center: [-32.39, 116.02], bounds: [[-36.99, 111.02], [-27.79, 121.02]] },
    { id: 'IDR323', name: 'Albany', center: [-34.94, 117.81], bounds: [[-39.54, 112.81], [-30.34, 122.81]] },
    { id: 'IDR303', name: 'Dampier', center: [-20.65, 116.69], bounds: [[-25.25, 111.69], [-16.05, 121.69]] },
    { id: 'IDR773', name: 'Carnarvon', center: [-24.89, 113.67], bounds: [[-29.49, 108.67], [-20.29, 118.67]] },
    { id: 'IDR783', name: 'Geraldton', center: [-28.80, 114.70], bounds: [[-33.40, 109.70], [-24.20, 119.70]] },

    // Tasmania
    { id: 'IDR223', name: 'Hobart', center: [-42.84, 147.58], bounds: [[-47.44, 142.58], [-38.24, 152.58]] },
    { id: 'IDR243', name: 'Launceston', center: [-41.18, 147.47], bounds: [[-45.78, 142.47], [-36.58, 152.47]] },

    // Northern Territory
    { id: 'IDR013', name: 'Darwin', center: [-12.46, 131.04], bounds: [[-17.06, 126.04], [-7.86, 136.04]] },
    { id: 'IDR093', name: 'Alice Springs', center: [-23.80, 133.89], bounds: [[-28.40, 128.89], [-19.20, 138.89]] },
    { id: 'IDR193', name: 'Katherine', center: [-14.51, 132.45], bounds: [[-19.11, 127.45], [-9.91, 137.45]] }
];

class RadarService {
    constructor() {
        this.FTP_HOST = 'ftp.bom.gov.au';
        this.FTP_RADAR_PATH = '/anon/gen/radar/';
        this.CACHE_DIR = path.join(__dirname, 'radar_cache');
        this.MAX_FRAMES = 12;
        this.REFRESH_INTERVAL = 6 * 60 * 1000; // 6 minutes
        this.radarFrames = {}; // Organized by radar ID
        this.timestamps = []; // Unique timestamps across all radars
        this.lastUpdate = null;
        this.isUpdating = false;

        this.initializeCache();
    }

    async initializeCache() {
        try {
            await fs.mkdir(this.CACHE_DIR, { recursive: true });
            console.log('[RADAR] Cache directory initialized:', this.CACHE_DIR);

            // Initial fetch
            await this.updateFrames();

            // Set up periodic updates
            setInterval(async () => {
                try {
                    await this.updateFrames();
                } catch (error) {
                    console.error('[RADAR] Auto-update error:', error.message);
                }
            }, this.REFRESH_INTERVAL);

        } catch (error) {
            console.error('[RADAR] Failed to initialize cache:', error);
        }
    }

    parseFilename(filename) {
        // IDRxxx.T.202501091830.png
        const match = filename.match(/(IDR\d+)\.T\.(\d{12})\.png/);
        if (!match) return null;

        const radarId = match[1];
        const timestamp = match[2];
        const year = timestamp.substring(0, 4);
        const month = timestamp.substring(4, 6);
        const day = timestamp.substring(6, 8);
        const hour = timestamp.substring(8, 10);
        const minute = timestamp.substring(10, 12);

        const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00+10:00`); // AEST

        return {
            filename,
            radarId,
            timestamp,
            date,
            time: date.getTime()
        };
    }

    async updateFrames() {
        if (this.isUpdating) {
            console.log('[RADAR] Update already in progress, skipping');
            return;
        }

        this.isUpdating = true;
        const client = new ftp.Client();
        client.ftp.verbose = false;

        try {
            console.log('[RADAR] Connecting to BoM FTP...');
            await client.access({
                host: this.FTP_HOST,
                secure: false
            });

            console.log('[RADAR] Connected. Listing files...');
            const files = await client.list(this.FTP_RADAR_PATH);

            // Get all radar IDs we're interested in
            const radarIds = AUSTRALIAN_RADARS.map(r => r.id);

            // Parse all files and filter for our radars
            const allRadarFiles = files
                .filter(file => file.name.endsWith('.png') && file.name.includes('.T.'))
                .map(file => this.parseFilename(file.name))
                .filter(parsed => parsed !== null && radarIds.includes(parsed.radarId));

            if (allRadarFiles.length === 0) {
                console.log('[RADAR] No radar files found');
                return;
            }

            // Group by radar ID
            const filesByRadar = {};
            for (const radarId of radarIds) {
                filesByRadar[radarId] = allRadarFiles
                    .filter(f => f.radarId === radarId)
                    .sort((a, b) => b.time - a.time)
                    .slice(0, this.MAX_FRAMES);
            }

            // Find common timestamps across all radars (use most recent 12)
            const allTimestamps = [...new Set(allRadarFiles.map(f => f.timestamp))]
                .sort()
                .reverse()
                .slice(0, this.MAX_FRAMES);

            console.log(`[RADAR] Found ${allTimestamps.length} common timestamps across ${radarIds.length} radars`);

            // Download frames for each radar at each timestamp
            const downloadedFrames = {};
            let totalDownloaded = 0;

            for (const radar of AUSTRALIAN_RADARS) {
                downloadedFrames[radar.id] = [];

                for (const timestamp of allTimestamps) {
                    const filename = `${radar.id}.T.${timestamp}.png`;
                    const localPath = path.join(this.CACHE_DIR, filename);

                    // Check if we already have this file
                    try {
                        await fs.access(localPath);
                        downloadedFrames[radar.id].push({ filename, timestamp, time: parseInt(timestamp) });
                        continue;
                    } catch {
                        // File doesn't exist, download it
                    }

                    try {
                        const remotePath = this.FTP_RADAR_PATH + filename;
                        await client.downloadTo(localPath, remotePath);
                        downloadedFrames[radar.id].push({ filename, timestamp, time: parseInt(timestamp) });
                        totalDownloaded++;
                    } catch (error) {
                        // Radar might not have this timestamp, skip silently
                    }
                }

                console.log(`[RADAR] ${radar.name}: ${downloadedFrames[radar.id].length} frames available`);
            }

            this.radarFrames = downloadedFrames;
            this.timestamps = allTimestamps;
            this.lastUpdate = new Date();

            console.log(`[RADAR] Update complete. ${totalDownloaded} new frames downloaded.`);

            // Clean up old files
            await this.cleanupOldFrames();

        } catch (error) {
            console.error('[RADAR] Error updating frames:', error);
            throw error;
        } finally {
            client.close();
            this.isUpdating = false;
        }
    }

    async cleanupOldFrames() {
        try {
            const files = await fs.readdir(this.CACHE_DIR);
            const currentFilenames = new Set();

            // Collect all current filenames
            for (const radarId in this.radarFrames) {
                for (const frame of this.radarFrames[radarId]) {
                    currentFilenames.add(frame.filename);
                }
            }

            for (const file of files) {
                if (file.endsWith('.png') && !currentFilenames.has(file)) {
                    const filePath = path.join(this.CACHE_DIR, file);
                    await fs.unlink(filePath);
                    console.log(`[RADAR] Cleaned up old file: ${file}`);
                }
            }
        } catch (error) {
            console.error('[RADAR] Error cleaning up old frames:', error);
        }
    }

    getRadarConfig() {
        return AUSTRALIAN_RADARS.map(radar => ({
            id: radar.id,
            name: radar.name,
            center: radar.center,
            bounds: radar.bounds
        }));
    }

    getFrames() {
        return {
            timestamps: this.timestamps,
            radars: this.radarFrames,
            radarConfig: this.getRadarConfig()
        };
    }

    async getFrameData(filename) {
        const framePath = path.join(this.CACHE_DIR, filename);
        try {
            const data = await fs.readFile(framePath);
            return data;
        } catch (error) {
            throw new Error(`Frame not found: ${filename}`);
        }
    }

    getStatus() {
        const totalFrames = Object.values(this.radarFrames).reduce((sum, frames) => sum + frames.length, 0);
        return {
            available: this.timestamps.length > 0,
            frameCount: totalFrames,
            timestamps: this.timestamps.length,
            radarCount: AUSTRALIAN_RADARS.length,
            lastUpdate: this.lastUpdate ? this.lastUpdate.toISOString() : null,
            isUpdating: this.isUpdating
        };
    }
}

// Create singleton instance
const radarService = new RadarService();

module.exports = radarService;
