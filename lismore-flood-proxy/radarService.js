const ftp = require('basic-ftp');
const fs = require('fs').promises;
const path = require('path');

class RadarService {
    constructor() {
        this.FTP_HOST = 'ftp.bom.gov.au';
        this.FTP_RADAR_PATH = '/anon/gen/radar/';
        this.PRODUCT_CODE = 'IDR00004'; // National composite
        this.CACHE_DIR = path.join(__dirname, 'radar_cache');
        this.MAX_FRAMES = 12;
        this.REFRESH_INTERVAL = 6 * 60 * 1000; // 6 minutes
        this.frames = [];
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
        // IDR00004.T.202501091830.png
        const match = filename.match(/IDR\d+\.T\.(\d{12})\.png/);
        if (!match) return null;

        const timestamp = match[1];
        const year = timestamp.substring(0, 4);
        const month = timestamp.substring(4, 6);
        const day = timestamp.substring(6, 8);
        const hour = timestamp.substring(8, 10);
        const minute = timestamp.substring(10, 12);

        const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00+10:00`); // AEST

        return {
            filename,
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

            // Filter for our product code and parse
            const radarFiles = files
                .filter(file => file.name.startsWith(this.PRODUCT_CODE) && file.name.endsWith('.png'))
                .map(file => this.parseFilename(file.name))
                .filter(parsed => parsed !== null)
                .sort((a, b) => b.time - a.time) // Most recent first
                .slice(0, this.MAX_FRAMES);

            if (radarFiles.length === 0) {
                console.log('[RADAR] No radar files found');
                return;
            }

            console.log(`[RADAR] Found ${radarFiles.length} frames. Downloading...`);

            // Download each frame
            const downloadedFrames = [];
            for (const frame of radarFiles) {
                const localPath = path.join(this.CACHE_DIR, frame.filename);

                // Check if we already have this file
                try {
                    await fs.access(localPath);
                    console.log(`[RADAR] Already cached: ${frame.filename}`);
                    downloadedFrames.push(frame);
                    continue;
                } catch {
                    // File doesn't exist, download it
                }

                try {
                    const remotePath = this.FTP_RADAR_PATH + frame.filename;
                    await client.downloadTo(localPath, remotePath);
                    console.log(`[RADAR] Downloaded: ${frame.filename}`);
                    downloadedFrames.push(frame);
                } catch (error) {
                    console.error(`[RADAR] Failed to download ${frame.filename}:`, error.message);
                }
            }

            this.frames = downloadedFrames;
            this.lastUpdate = new Date();

            console.log(`[RADAR] Update complete. ${this.frames.length} frames available.`);

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
            const currentFilenames = new Set(this.frames.map(f => f.filename));

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

    getFrames() {
        return this.frames.map(frame => ({
            filename: frame.filename,
            timestamp: frame.timestamp,
            date: frame.date.toISOString(),
            time: frame.time
        }));
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
        return {
            available: this.frames.length > 0,
            frameCount: this.frames.length,
            lastUpdate: this.lastUpdate ? this.lastUpdate.toISOString() : null,
            isUpdating: this.isUpdating
        };
    }
}

// Create singleton instance
const radarService = new RadarService();

module.exports = radarService;
