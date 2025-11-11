/**
 * Weather Chaser Radar Service
 * Manages radar frame generation for theweatherchaser.com radar images
 */

// Note: Logger is available from server.js when required
const Logger = {
    info: (msg) => {},
    success: (msg) => {},
    error: (msg, err) => {},
    verbose: (msg) => {}
};

// Will be replaced by actual Logger when loaded in server context
if (typeof global !== 'undefined' && global.Logger) {
    Object.assign(Logger, global.Logger);
}

class WeatherChaserService {
    constructor() {
        this.radarStations = [
            { id: 93, name: "Brewarrina", state: "NSW", lat: -29.971, lon: 146.814, fullName: "Brewarrina" },
            { id: 1, name: "Broadmeadows", state: "VIC", lat: -37.691, lon: 144.946, fullName: "Melbourne (Broadmeadows)" },
            { id: 79, name: "Watheroo", state: "WA", lat: -30.36, lon: 116.2922, fullName: "Watheroo" },
            { id: 58, name: "South Doodlakine", state: "WA", lat: -31.777, lon: 117.953, fullName: "South Doodlakine" },
            { id: 78, name: "Weipa", state: "QLD", lat: -12.666, lon: 141.925, fullName: "Weipa" },
            { id: 77, name: "Warruwi", state: "NT", lat: -11.6485, lon: 133.38, fullName: "Warruwi" },
            { id: 9, name: "Gove", state: "NT", lat: -12.275, lon: 136.823, fullName: "Gove" },
            { id: 10, name: "Darwin Ap", state: "NT", lat: -12.4247, lon: 130.8919, fullName: "Darwin Airport" },
            { id: 63, name: "Darwin", state: "NT", lat: -12.457, lon: 130.925, fullName: "Darwin (Berrimah)" },
            { id: 42, name: "Katherine", state: "NT", lat: -14.513, lon: 132.446, fullName: "Katherine (Tindal)" },
            { id: 7, name: "Wyndham", state: "WA", lat: -15.453, lon: 128.119, fullName: "Wyndham" },
            { id: 41, name: "Willis Is", state: "QLD", lat: -16.2874, lon: 149.9646, fullName: "Willis Island" },
            { id: 36, name: "Mornington Is", state: "QLD", lat: -16.666, lon: 139.167, fullName: "Mornington Island (Gulf of Carpentaria)" },
            { id: 19, name: "Cairns", state: "QLD", lat: -16.817, lon: 145.683, fullName: "Cairns" },
            { id: 17, name: "Broome", state: "WA", lat: -17.9483, lon: 122.2353, fullName: "Broome" },
            { id: 39, name: "Halls Creek", state: "WA", lat: -18.231, lon: 127.663, fullName: "Halls Creek" },
            { id: 73, name: "Townsville", state: "QLD", lat: -19.4198, lon: 146.5509, fullName: "Townsville (Hervey Range)" },
            { id: 24, name: "Bowen", state: "QLD", lat: -19.886, lon: 148.075, fullName: "Bowen" },
            { id: 16, name: "Port Hedland", state: "WA", lat: -20.3719, lon: 118.6317, fullName: "Port Hedland" },
            { id: 15, name: "Dampier", state: "WA", lat: -20.65, lon: 116.687, fullName: "Dampier" },
            { id: 75, name: "Mount Isa", state: "QLD", lat: -20.7112, lon: 139.5552, fullName: "Mount Isa" },
            { id: 22, name: "Mackay", state: "QLD", lat: -21.117, lon: 149.217, fullName: "Mackay" },
            { id: 29, name: "Learmonth", state: "WA", lat: -22.103, lon: 113.999, fullName: "Learmonth" },
            { id: 56, name: "Longreach", state: "QLD", lat: -23.43, lon: 144.29, fullName: "Longreach" },
            { id: 72, name: "Emerald", state: "QLD", lat: -23.5498, lon: 148.2392, fullName: "Emerald" },
            { id: 25, name: "Alice Springs", state: "NT", lat: -23.796, lon: 133.888, fullName: "Alice Springs" },
            { id: 23, name: "Gladstone", state: "QLD", lat: -23.855, lon: 151.2626, fullName: "Gladstone" },
            { id: 5, name: "Carnarvon", state: "WA", lat: -24.8878, lon: 113.6695, fullName: "Carnarvon" },
            { id: 44, name: "Giles", state: "WA", lat: -25.03, lon: 128.3, fullName: "Giles" },
            { id: 8, name: "Gympie", state: "QLD", lat: -25.9574, lon: 152.577, fullName: "Gympie (Mount Kanigan)" },
            { id: 67, name: "Warrego", state: "QLD", lat: -26.44, lon: 147.3492, fullName: "Warrego" },
            { id: 50, name: "Marburg", state: "QLD", lat: -27.608, lon: 152.539, fullName: "Brisbane (Marburg)" },
            { id: 66, name: "Brisbane", state: "QLD", lat: -27.7178, lon: 153.24, fullName: "Brisbane (Mt Stapylton)" },
            { id: 6, name: "Geraldton", state: "WA", lat: -28.8044, lon: 114.6972, fullName: "Geraldton" },
            { id: 62, name: "Norfolk Is", state: "NSW", lat: -29.033, lon: 167.933, fullName: "Norfolk Island" },
            { id: 53, name: "Moree", state: "NSW", lat: -29.5, lon: 149.85, fullName: "Moree" },
            { id: 28, name: "Grafton", state: "NSW", lat: -29.622, lon: 152.951, fullName: "Grafton" },
            { id: 48, name: "Kalgoorlie", state: "WA", lat: -30.7834, lon: 121.4549, fullName: "Kalgoorlie" },
            { id: 69, name: "Namoi", state: "NSW", lat: -31.0236, lon: 150.1917, fullName: "Namoi (Blackjack Mountain)" },
            { id: 27, name: "Woomera", state: "SA", lat: -31.157, lon: 136.803, fullName: "Woomera" },
            { id: 26, name: "Perth Ap", state: "WA", lat: -31.9273, lon: 115.9756, fullName: "Perth Airport" },
            { id: 33, name: "Ceduna", state: "SA", lat: -32.1298, lon: 133.6963, fullName: "Ceduna" },
            { id: 70, name: "Perth", state: "WA", lat: -32.3917, lon: 115.867, fullName: "Perth (Serpentine)" },
            { id: 4, name: "Newcastle", state: "NSW", lat: -32.73, lon: 152.025, fullName: "Newcastle" },
            { id: 71, name: "Sydney", state: "NSW", lat: -33.7008, lon: 151.2094, fullName: "Sydney (Terrey Hills)" },
            { id: 32, name: "Esperance", state: "WA", lat: -33.8303, lon: 121.8917, fullName: "Esperance" },
            { id: 54, name: "Kurnell", state: "NSW", lat: -34.0148, lon: 151.2263, fullName: "Sydney (Kurnell)" },
            { id: 97, name: "Mildura", state: "VIC", lat: -34.2871, lon: 141.5982, fullName: "Mildura" },
            { id: 3, name: "Wollongong", state: "NSW", lat: -34.2625, lon: 150.8752, fullName: "Wollongong (Appin)" },
            { id: 64, name: "Adelaide", state: "SA", lat: -34.6169, lon: 138.4689, fullName: "Adelaide (Buckland Park)" },
            { id: 31, name: "Albany", state: "WA", lat: -34.9418, lon: 117.8163, fullName: "Albany" },
            { id: 55, name: "Wagga Wagga", state: "NSW", lat: -35.167, lon: 147.467, fullName: "Wagga Wagga" },
            { id: 46, name: "Sellicks Hill", state: "SA", lat: -35.33, lon: 138.5, fullName: "Adelaide (Sellicks Hill)" },
            { id: 40, name: "Canberra", state: "NSW", lat: -35.6614, lon: 149.5122, fullName: "Canberra (Captains Flat)" },
            { id: 49, name: "Yarrawonga", state: "VIC", lat: -36.0297, lon: 146.0228, fullName: "Yarrawonga" },
            { id: 14, name: "Mt Gambier", state: "SA", lat: -37.7477, lon: 140.7746, fullName: "Mount Gambier" },
            { id: 2, name: "Melbourne", state: "VIC", lat: -37.85525, lon: 144.75544, fullName: "Melbourne (Laverton)" },
            { id: 68, name: "Bairnsdale", state: "VIC", lat: -37.8876, lon: 147.5755, fullName: "Bairnsdale" },
            { id: 52, name: "NW Tasmania", state: "TAS", lat: -41.181, lon: 145.579, fullName: "NW Tasmania (West Takone)" },
            { id: 37, name: "Hobart Ap", state: "TAS", lat: -42.83736, lon: 147.50084, fullName: "Hobart Airport" },
            { id: 76, name: "Hobart", state: "TAS", lat: -43.1122, lon: 147.8057, fullName: "Hobart (Mt Koonya)" },
            { id: 38, name: "Newdegate", state: "WA", lat: -33.097, lon: 119.009, fullName: "Newdegate" },
            { id: 95, name: "Rainbow", state: "VIC", lat: -35.9975, lon: 142.013, fullName: "Rainbow (Wimmera)" },
            { id: 94, name: "Hillston", state: "NSW", lat: -33.552, lon: 145.5286, fullName: "Hillston" },
            { id: 74, name: "Greenvale", state: "QLD", lat: -18.9976, lon: 144.9959, fullName: "Greenvale" },
            { id: 98, name: "Taroom", state: "QLD", lat: -25.6962, lon: 149.8982, fullName: "Taroom" },
            { id: 96, name: "Yeoval", state: "NSW", lat: -32.7444, lon: 148.7081, fullName: "Yeoval" }
        ];

        // All radars are available
        this.allRadarIds = this.radarStations.map(r => r.id);

        this.frames = [];
        this.lastUpdate = null;
    }

    /**
     * Initialize the service and generate initial frames
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

    /**
     * Round time to nearest BOM radar 5-minute mark (04, 09, 14, 19, 24, 29, 34, 39, 44, 49, 54, 59)
     * CRITICAL: Uses UTC time, not local time!
     */
    roundToRadarTime(date) {
        const rounded = new Date(date);
        const minutes = rounded.getUTCMinutes();

        // BOM radar times follow pattern: XX:04, XX:09, XX:14, XX:19, etc.
        // This means minutes % 5 === 4
        const remainder = minutes % 5;
        const offset = remainder === 4 ? 0 : (remainder + 1);
        const targetMinutes = minutes - offset;

        rounded.setUTCMinutes(targetMinutes);
        rounded.setUTCSeconds(0);
        rounded.setUTCMilliseconds(0);

        return rounded;
    }

    /**
     * Generate frame timestamps for the last 1 hour (12 frames at 5-minute intervals)
     * Aligned to BOM radar times: XX:04, XX:09, XX:14, XX:19, XX:24, XX:29, XX:34, XX:39, XX:44, XX:49, XX:54, XX:59
     */
    async updateFrames() {
        try {
            const frames = [];
            const now = new Date();

            // Use 10-minute delay - conservative to ensure frames are published
            const adjustedNow = new Date(now.getTime() - 10 * 60 * 1000);
            const latestFrame = this.roundToRadarTime(adjustedNow);

            const nowStr = this.formatTimestamp(now);
            const latestStr = this.formatTimestamp(latestFrame);
            const delayMinutes = Math.floor((now - latestFrame) / 60000);

            Logger.verbose(`WeatherChaser: UTC ${nowStr}, Latest frame ${latestStr} (${delayMinutes}min delay)`);
            Logger.verbose('WeatherChaser: Using 10-minute buffer for frame availability');

            // Generate 10 frames going back 50 minutes (10 × 5 minutes = 50 minutes)
            // This gives us frames from 10-60 minutes old (within Weather Chaser's retention window)
            for (let i = 0; i < 10; i++) {
                const frameTime = new Date(latestFrame.getTime() - i * 5 * 60 * 1000);

                // Format as YYYYMMDDHHmm
                const timestamp = this.formatTimestamp(frameTime);

                frames.push({
                    time: frameTime.getTime(),
                    timestamp: timestamp,
                    dateStr: frameTime.toISOString(),
                    rainViewerTime: Math.floor(frameTime.getTime() / 1000) // Unix timestamp for RainViewer fallback
                });
            }

            // Sort oldest to newest
            frames.reverse();

            this.frames = frames;
            this.lastUpdate = new Date();

            Logger.verbose(`WeatherChaser: ${frames.length} frames from ${frames[0].timestamp} to ${frames[frames.length - 1].timestamp}`);

            return true;
        } catch (error) {
            Logger.error('WeatherChaser error updating frames:', error);
            return false;
        }
    }

    /**
     * Format date as YYYYMMDDHHmm for theweatherchaser.com
     * CRITICAL: Weather Chaser uses UTC timestamps, not local time!
     */
    formatTimestamp(date) {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');

        return `${year}${month}${day}${hours}${minutes}`;
    }

    /**
     * Get frames for specific radar IDs (returns ALL radars by default)
     */
    getFrames(radarIds = null) {
        const ids = radarIds || this.allRadarIds;
        const radars = this.radarStations.filter(r => ids.includes(r.id));

        return {
            frames: this.frames,
            radars: radars,
            lastUpdate: this.lastUpdate
        };
    }

    /**
     * Get all radar stations
     */
    getAllRadars() {
        return this.radarStations;
    }

    /**
     * Get specific radar station by ID
     */
    getRadar(radarId) {
        return this.radarStations.find(r => r.id === radarId);
    }

    /**
     * Build image URL for theweatherchaser.com
     */
    buildImageUrl(radarId, timestamp) {
        return `https://theweatherchaser.com/radar/primary/${radarId}-1-m-${timestamp}.png`;
    }

    /**
     * Get service status
     */
    getStatus() {
        return {
            active: true,
            frameCount: this.frames.length,
            lastUpdate: this.lastUpdate,
            radarCount: this.radarStations.length,
            totalRadars: this.radarStations.length
        };
    }
}

// Create singleton instance
const weatherChaserService = new WeatherChaserService();

module.exports = weatherChaserService;
