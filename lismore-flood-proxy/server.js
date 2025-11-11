const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const NodeCache = require('node-cache');
const { XMLParser } = require('fast-xml-parser');
const weatherChaserService = require('./weatherChaserService');

const app = express();
const PORT = process.env.PORT || 3000;
const VERBOSE_LOGGING = process.env.VERBOSE_LOGGING === 'true' || false;

const OUTAGE_CACHE_TTL = 60;
const outageCache = new NodeCache({ stdTTL: OUTAGE_CACHE_TTL, useClones: false });

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
    
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
    bgMagenta: '\x1b[45m',
    bgCyan: '\x1b[46m'
};

class Logger {
    static logBuffer = [];
    static maxBufferSize = 10;
    static statusManager = null;

    static setStatusManager(manager) {
        this.statusManager = manager;
    }

    static timestamp() {
        return new Date().toISOString().replace('T', ' ').substring(0, 19);
    }

    static logToFile(level, message, ...args) {
        if (level === 'ERROR' || level === 'WARN') {
            const errorLog = `[${this.timestamp()}] ${level} ${message} ${args.length > 0 ? JSON.stringify(args) : ''}\n`;
            fs.appendFileSync('errors.txt', errorLog, 'utf8');
        }
    }

    static addToBuffer(formattedMessage) {
        this.logBuffer.push({ time: new Date(), message: formattedMessage });
        if (this.logBuffer.length > this.maxBufferSize) {
            this.logBuffer.shift();
        }
        // Don't render immediately - let periodic interval handle it
    }

    static info(message, ...args) {
        const formatted = `${colors.blue}INFO${colors.reset}  ${message}`;
        this.addToBuffer(formatted);
    }

    static success(message, ...args) {
        const formatted = `${colors.green}OK${colors.reset}    ${message}`;
        this.addToBuffer(formatted);
    }

    static warn(message, ...args) {
        const formatted = `${colors.yellow}WARN${colors.reset}  ${message}`;
        this.addToBuffer(formatted);
        this.logToFile('WARN', message, ...args);
    }

    static error(message, ...args) {
        const formatted = `${colors.red}ERROR${colors.reset} ${message}`;
        this.addToBuffer(formatted);
        this.logToFile('ERROR', message, ...args);
    }

    static verbose(message, ...args) {
        if (VERBOSE_LOGGING) {
            const formatted = `${colors.dim}DEBUG${colors.reset} ${message}`;
            this.addToBuffer(formatted);
        }
    }

    static api(method, path, status, duration) {
        // Don't log API calls to keep terminal clean
    }

    static header(text) {
        // Headers are now part of the status board, not standalone
        this.info(text);
    }

    static table(data) {
        // Tables are logged as formatted text in the buffer
        data.forEach(row => {
            const line = Object.entries(row).map(([k, v]) => `${k}: ${v}`).join(' | ');
            this.info(line);
        });
    }
}

// Component Status Manager for clean logging
class StatusManager {
    constructor() {
        const now = new Date();
        this.components = {
            'Proxy Server': { status: 'Connected', detail: '', lastUpdate: now },
            'BOM Data': { status: 'Checking...', detail: '', lastUpdate: now },
            'Traffic Camera': { status: 'Checking...', detail: '', lastUpdate: now },
            'Radar Map': { status: 'Checking...', detail: '', lastUpdate: now },
            'Cyclone Map': { status: 'Checking...', detail: '', lastUpdate: now },
            'Flood Map': { status: 'Connected', detail: '', lastUpdate: now },
            'Outage Map': { status: 'Connected', detail: '', lastUpdate: now }
        };
        this.serverInfo = { endpoints: [] };
        this.lastSnapshot = '';
        this.lastRender = 0;
        this.rendering = false;  // Lock to prevent overlapping renders
    }

    setServerInfo(info = {}) {
        if (!info) return;
        const merged = { ...this.serverInfo, ...info };
        if (Array.isArray(info.endpoints)) {
            merged.endpoints = info.endpoints;
        }
        this.serverInfo = merged;
        this.renderBoard(true);
    }

    updateComponent(name, status, detail = '') {
        if (!this.components[name]) {
            this.components[name] = { status, detail: detail || '', lastUpdate: new Date() };
        } else {
            this.components[name].status = status;
            this.components[name].detail = detail || '';
            this.components[name].lastUpdate = new Date();
        }

        // Don't render immediately - let periodic interval handle it
    }

    formatTime(date) {
        return date.toISOString().replace('T', ' ').substring(0, 19);
    }

    renderBoard(force = false) {
        // Prevent overlapping renders
        if (this.rendering) {
            return;
        }

        const now = Date.now();
        const snapshot = JSON.stringify(this.components, (key, value) => {
            if (value instanceof Date) {
                return value.toISOString();
            }
            return value;
        });

        if (!force && snapshot === this.lastSnapshot && now - this.lastRender < 5000) {
            return;
        }

        this.rendering = true;
        this.lastSnapshot = snapshot;
        this.lastRender = now;

        // Clear screen - Windows compatible
        process.stdout.write('\x1Bc');  // Full terminal reset

        const headerLine = colors.cyan + '═'.repeat(80) + colors.reset;
        const dividerLine = colors.cyan + '─'.repeat(80) + colors.reset;

        console.log(headerLine);
        console.log(
            colors.bright + 'System Status' + colors.reset +
            colors.gray + ' [' + this.formatTime(new Date()) + ']' + colors.reset
        );
        console.log(dividerLine);

        if (this.serverInfo) {
            if (this.serverInfo.port) {
                console.log(`${colors.gray}Server Port:${colors.reset} ${this.serverInfo.port}`);
            }
            if (this.serverInfo.dashboardUrl) {
                console.log(`${colors.gray}Dashboard:${colors.reset} ${this.serverInfo.dashboardUrl}`);
            }
            if (this.serverInfo.apiBase) {
                console.log(`${colors.gray}API Base:${colors.reset} ${this.serverInfo.apiBase}`);
            }
            if (this.serverInfo.notice) {
                console.log(`${colors.green}Note:${colors.reset} ${this.serverInfo.notice}`);
            }
            if (this.serverInfo.warning) {
                console.log(`${colors.yellow}Warning:${colors.reset} ${this.serverInfo.warning}`);
            }
            if (this.serverInfo.endpoints && this.serverInfo.endpoints.length > 0) {
                console.log('');
                console.log(`${colors.gray}Endpoints:${colors.reset}`);
                this.serverInfo.endpoints.forEach(endpoint => {
                    console.log(`  ${endpoint.path.padEnd(24)} ${endpoint.description}`);
                });
            }
            console.log('');
        }

        Object.entries(this.components).forEach(([name, info]) => {
            const statusLower = info.status.toLowerCase();
            let statusColor = colors.yellow;
            if (statusLower.includes('online') || statusLower.includes('connected')) {
                statusColor = colors.green;
            } else if (statusLower.includes('offline') || statusLower.includes('not online')) {
                statusColor = colors.red;
            }

            const label = `${colors.bright}${name.padEnd(18)}${colors.reset}`;
            const statusText = `${statusColor}${info.status.padEnd(14)}${colors.reset}`;
            const updatedText = `${colors.gray}[Updated: ${this.formatTime(info.lastUpdate)}]${colors.reset}`;
            const detailText = info.detail ? ` ${colors.gray}(${info.detail})${colors.reset}` : '';

            console.log(`${label} ${statusText} ${updatedText}${detailText}`);
        });

        console.log(headerLine);

        // Display recent logs
        if (Logger.logBuffer.length > 0) {
            console.log('');
            console.log(colors.cyan + 'Recent Activity:' + colors.reset);
            Logger.logBuffer.forEach(log => {
                const timeStr = this.formatTime(log.time);
                console.log(`${colors.gray}[${timeStr}]${colors.reset} ${log.message}`);
            });
            console.log(headerLine);
        }

        // Release lock
        this.rendering = false;
    }
}

const statusManager = new StatusManager();
Logger.setStatusManager(statusManager);

// Expose Logger globally for weatherChaserService
global.Logger = Logger;

// Initial render
statusManager.renderBoard();

// Start periodic status reporting - clear and re-render terminal every 2 seconds
setInterval(() => {
    statusManager.renderBoard();
}, 2000); // Every 2 seconds

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Silent middleware - only log errors, not every request
app.use((req, res, next) => {
    const startTime = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - startTime;

        // Ignore expected 404s (Chrome devtools, cyclone images when no cyclone)
        const isExpected404 = res.statusCode === 404 && (
            req.path.includes('.well-known') ||
            req.path.includes('devtools') ||
            req.path.includes('cyclone-image')
        );

        // Only log errors or very slow requests
        // Skip radar image requests - they're expected to be slow when Weather Chaser is down
        const isRadarImageReq = req.path.includes('/api/radar/weatherchaser/image/');

        if (res.statusCode >= 400 && !isExpected404 && !isRadarImageReq) {
            Logger.error(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
        } else if (duration > 2000 && !isRadarImageReq) {
            Logger.warn(`Slow request: ${req.method} ${req.path} ${duration}ms`);
        }

        // Update status manager based on endpoint
        // IMPORTANT: Skip radar image requests to prevent status spam (67 radars × 12 frames = 804 requests)
        const isRadarImageRequest = req.path.includes('/api/radar/weatherchaser/image/');

        if (isRadarImageRequest) {
            // Don't update status on individual image requests - too spammy
            return;
        }

        const httpDetail = `HTTP ${res.statusCode}`;

        if (req.path.includes('/proxy/webcam')) {
            statusManager.updateComponent(
                'Traffic Camera',
                res.statusCode === 200 ? 'Online' : 'Offline',
                httpDetail
            );
        } else if (req.path.startsWith('/api/radar/frames') || req.path.startsWith('/api/radar/status')) {
            statusManager.updateComponent(
                'Radar Map',
                res.statusCode === 200 ? 'Online' : 'Offline',
                httpDetail
            );
        } else if (req.path.includes('/proxy/cyclone')) {
            statusManager.updateComponent(
                'Cyclone Map',
                res.statusCode === 200 ? 'Online' : 'Offline',
                httpDetail
            );
        } else if (req.path.includes('/flood-data') || req.path.includes('/api/flood')) {
            statusManager.updateComponent(
                'Flood Map',
                res.statusCode === 200 ? 'Online' : 'Offline',
                httpDetail
            );
        } else if (req.path.includes('/api/outages')) {
            statusManager.updateComponent(
                'Outage Map',
                res.statusCode === 200 ? 'Online' : 'Offline',
                httpDetail
            );
        } else if (req.path.includes('/api/bom-connectivity')) {
            statusManager.updateComponent(
                'BOM Data',
                res.statusCode === 200 ? 'Online' : 'Offline',
                httpDetail
            );
        }
    });

    next();
});

const Config = {
    paths: {
        RESOURCES_DIR: path.join(__dirname, '/public/resources/Rain Radar')
    },
    
    urls: {
        RADAR_BASE: 'https://reg.bom.gov.au',
        BOM_BASE: 'https://www.bom.gov.au',
        BOM_FLOOD_WARNING: 'https://www.bom.gov.au/cgi-bin/wrap_fwo.pl?IDN60140.html',
        
        KML: {
            current: 'https://www.essentialenergy.com.au/Assets/kmz/current.kml',
            future: 'https://www.essentialenergy.com.au/Assets/kmz/future.kml',
            cancelled: 'https://www.essentialenergy.com.au/Assets/kmz/cancelled.kml'
        }
    },
    
    headers: {
        browser: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://reg.bom.gov.au/products/IDR282.loop.shtml'
        },
        
        html: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.bom.gov.au/',
            'Cache-Control': 'no-cache'
        }
    }
};

const FloodConfig = {
    allowedLocations: [
        'Wilsons R at Lismore (mAHD)',
        'Wilsons River at Lismore (mAHD)',
        'Wilsons R at Lismore',
        'Wilsons River at Lismore',
        'Wilsons R at Eltham',
        'Wilsons River at Eltham',
        'Leycester Ck at Rock Valley',
        'Leycester Creek at Rock Valley',
        'Coopers Ck at Corndale',
        'Coopers Creek at Corndale',
        'Richmond R at Casino',
        'Richmond River at Casino',
        'Richmond R at Coraki',
        'Richmond River at Coraki',
        'Wilsons R at Tuckurimba',
        'Wilsons River at Tuckurimba'
    ],

    officialClassificationLocations: [
        "Wilsons R at Eltham",
        "Wilsons R at Lismore (mAHD)",
        "Leycester Ck at Rock Valley",
        "Coopers Ck at Corndale"
    ],

    thresholds: {
        "Wilsons R at Eltham": { minor: 6.00, moderate: 8.20, major: 9.60 },
        "Wilsons R at Lismore (mAHD)": { minor: 4.20, moderate: 7.20, major: 9.70 },
        "Leycester Ck at Rock Valley": { minor: 6.00, moderate: 8.00, major: 9.00 },
        "Coopers Ck at Corndale": { minor: 6.00, moderate: 7.50, major: 9.50 }
    },

    riverHeightUrls: {
        "Wilsons R at Lismore (mAHD)": "https://www.bom.gov.au/fwo/IDN60231/IDN60231.058176.tbl.shtml",
        "Wilsons River at Lismore (mAHD)": "https://www.bom.gov.au/fwo/IDN60231/IDN60231.058176.tbl.shtml",
        "Wilsons R at Lismore": "https://www.bom.gov.au/fwo/IDN60231/IDN60231.058176.tbl.shtml",
        "Wilsons River at Lismore": "https://www.bom.gov.au/fwo/IDN60231/IDN60231.058176.tbl.shtml",
        "Wilsons R at Eltham": "https://www.bom.gov.au/fwo/IDN60231/IDN60231.058200.tbl.shtml",
        "Wilsons River at Eltham": "https://www.bom.gov.au/fwo/IDN60231/IDN60231.058200.tbl.shtml",
        "Leycester Ck at Rock Valley": "https://www.bom.gov.au/fwo/IDN60231/IDN60231.058199.tbl.shtml",
        "Leycester Creek at Rock Valley": "https://www.bom.gov.au/fwo/IDN60231/IDN60231.058199.tbl.shtml",
        "Coopers Ck at Corndale": "https://www.bom.gov.au/fwo/IDN60231/IDN60231.058206.tbl.shtml",
        "Coopers Creek at Corndale": "https://www.bom.gov.au/fwo/IDN60231/IDN60231.058206.tbl.shtml",
        "Richmond R at Casino": "https://www.bom.gov.au/fwo/IDN60231/IDN60231.558013.tbl.shtml",
        "Richmond River at Casino": "https://www.bom.gov.au/fwo/IDN60231/IDN60231.558013.tbl.shtml",
        "Richmond R at Coraki": "https://www.bom.gov.au/fwo/IDN60231/IDN60231.058175.tbl.shtml",
        "Richmond River at Coraki": "https://www.bom.gov.au/fwo/IDN60231/IDN60231.058175.tbl.shtml",
        "Wilsons R at Tuckurimba": "https://www.bom.gov.au/fwo/IDN60231/IDN60231.558076.tbl.shtml",
        "Wilsons River at Tuckurimba": "https://www.bom.gov.au/fwo/IDN60231/IDN60231.558076.tbl.shtml"
    }
};

const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    cdataPropName: '__cdata',
    trimValues: true,
    parseTagValue: false,
    parseAttributeValue: false,
    isArray: (name) => name === 'Placemark'
});

class FileUtils {
    static async ensureDirectory(dirPath) {
        if (!fs.existsSync(dirPath)) {
            await fs.promises.mkdir(dirPath, { recursive: true });
            Logger.verbose(`Created directory: ${dirPath}`);
        }
    }
    
    static async cleanupRadarImages() {
        try {
            const dir = Config.paths.RESOURCES_DIR;
            if (!fs.existsSync(dir)) return;
            
            const files = await fs.promises.readdir(dir);
            let deletedCount = 0;
            
            for (const file of files) {
                if (file.startsWith('radar_') || file.match(/IDR[0-9]{3}\.(background|topography|locations|range)\.png$/)) {
                    const filePath = path.join(dir, file);
                    await fs.promises.unlink(filePath);
                    deletedCount++;
                }
            }
            
            if (deletedCount > 0) {
                Logger.verbose(`Cleaned ${deletedCount} old radar images`);
            }
        } catch (error) {
            Logger.error('Error cleaning radar images:', error.message);
        }
    }
}

class DateUtils {
    static parseOutageDate(dateStr) {
        if (!dateStr || dateStr === '—' || dateStr === '' || dateStr.trim() === '') return null;
        
        try {
            const [datePart, timePart] = dateStr.trim().split(' ');
            if (!datePart) return null;
            
            const [day, month, year] = datePart.split('/');
            if (!day || !month || !year) return null;
            
            const [hour, minute, second] = (timePart || '00:00:00').split(':');
            
            const date = new Date(
                parseInt(year),
                parseInt(month) - 1,
                parseInt(day),
                parseInt(hour || 0),
                parseInt(minute || 0),
                parseInt(second || 0)
            );
            
            return isNaN(date.getTime()) ? null : date.toISOString();
        } catch (error) {
            Logger.verbose(`Failed to parse date: ${dateStr}`);
            return null;
        }
    }
}

class OutageService {
    static async fetchKML(url, retries = 5) {
        let lastError = null;

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                Logger.verbose(`Fetching KML (attempt ${attempt}/${retries}): ${url}`);

                const response = await axios.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'application/vnd.google-earth.kml+xml,application/xml,text/xml,*/*'
                    },
                    timeout: 30000,  // Increased to 30 seconds
                    validateStatus: (status) => status === 200
                });

                if (!response.data) {
                    throw new Error('Empty response from KML endpoint');
                }

                Logger.verbose(`Successfully fetched KML from ${url}`);
                return response.data;

            } catch (error) {
                lastError = error;
                const errorMsg = error.code === 'ECONNABORTED'
                    ? 'Request timeout'
                    : error.response?.status
                        ? `HTTP ${error.response.status}`
                        : error.message;

                Logger.warn(`KML fetch attempt ${attempt}/${retries} failed: ${errorMsg}`);

                if (attempt === retries) {
                    throw new Error(`Failed to fetch KML after ${retries} attempts: ${errorMsg}`);
                }

                // Exponential backoff: 2s, 4s, 8s, 16s
                const delay = Math.min(2000 * Math.pow(2, attempt - 1), 16000);
                Logger.verbose(`Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        throw lastError || new Error('Failed to fetch KML');
    }
    
    static extractCoordinates(point) {
        if (!point || !point.coordinates) return null;
        
        const coords = String(point.coordinates).trim().split(/[\s,]+/);
        if (coords.length >= 2) {
            return {
                longitude: parseFloat(coords[0]),
                latitude: parseFloat(coords[1])
            };
        }
        return null;
    }
    
    static extractPolygon(polygon) {
        if (!polygon) return null;
        
        try {
            let coordinates = null;
            if (polygon.outerBoundaryIs?.LinearRing?.coordinates) {
                coordinates = polygon.outerBoundaryIs.LinearRing.coordinates;
            } else if (polygon.LinearRing?.coordinates) {
                coordinates = polygon.LinearRing.coordinates;
            }
            
            if (!coordinates) return null;
            
            const coordString = String(coordinates).trim();
            const coordPairs = coordString.split(/\s+/);
            
            const points = [];
            for (const pair of coordPairs) {
                const [lon, lat] = pair.split(',').map(parseFloat);
                if (isFinite(lat) && isFinite(lon)) {
                    points.push([lat, lon]);
                }
            }
            
            return points.length > 0 ? points : null;
        } catch (error) {
            Logger.verbose('Failed to parse polygon:', error.message);
            return null;
        }
    }
    
    static parseDescription(html) {
        if (!html) return {};

        const result = {};

        try {
            let content = html;
            if (typeof html === 'object') {
                content = html.__cdata || html['#text'] || String(html);
            }

            let decoded = String(content).replace(/<!\[CDATA\[|\]\]>/g, '').trim();

            decoded = decoded
                .replace(/&nbsp;/g, ' ')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'");

            const patterns = {
                timeOff: /<span>Time Off:<\/span>\s*(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/i,
                timeOn: /<span>Est\.\s*Time On:<\/span>\s*(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/i,
                customers: /<span>No\.\s*of Customers affected:<\/span>\s*(\d+)/i,
                reason: /<span>Reason:<\/span>\s*([^<]+)/i,
                lastUpdated: /<span>Last Updated:<\/span>\s*(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/i
            };

            for (const [key, pattern] of Object.entries(patterns)) {
                const match = decoded.match(pattern);
                if (match && match[1]) {
                    const value = match[1].trim();
                    if (value && value !== '—' && value !== '') {
                        if (key === 'customers') {
                            const num = parseInt(value.replace(/,/g, ''));
                            result.customersAffected = isNaN(num) ? null : num;
                        } else {
                            result[key] = value;
                        }
                    }
                }
            }
        } catch (error) {
            Logger.verbose('Error parsing description:', error.message);
        }

        return result;
    }
    
    static parseKML(kmlText, category) {
        const parsed = xmlParser.parse(kmlText);
        const outages = [];
        
        if (!parsed.kml?.Document?.Folder?.Placemark) {
            Logger.verbose(`No placemarks found for category: ${category}`);
            return outages;
        }
        
        const placemarks = Array.isArray(parsed.kml.Document.Folder.Placemark) 
            ? parsed.kml.Document.Folder.Placemark 
            : [parsed.kml.Document.Folder.Placemark];
        
        for (const placemark of placemarks) {
            try {
                const id = placemark['@_id'] || 'unknown';
                const snippet = placemark.Snippet?.['#text'] || id;
                
                let coords = null;
                if (placemark.MultiGeometry?.Point) {
                    coords = this.extractCoordinates(placemark.MultiGeometry.Point);
                } else if (placemark.Point) {
                    coords = this.extractCoordinates(placemark.Point);
                }
                
                let polygonCoords = null;
                if (placemark.MultiGeometry?.Polygon) {
                    polygonCoords = this.extractPolygon(placemark.MultiGeometry.Polygon);
                } else if (placemark.Polygon) {
                    polygonCoords = this.extractPolygon(placemark.Polygon);
                }
                
                if (!coords && !polygonCoords) continue;
                
                if (!coords && polygonCoords) {
                    const lats = polygonCoords.map(p => p[0]);
                    const lons = polygonCoords.map(p => p[1]);
                    coords = {
                        latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
                        longitude: (Math.min(...lons) + Math.max(...lons)) / 2
                    };
                }
                
                const details = this.parseDescription(placemark.description);
                
                outages.push({
                    id,
                    category,
                    categoryName: category.charAt(0).toUpperCase() + category.slice(1),
                    name: snippet,
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                    polygon: polygonCoords,
                    start: DateUtils.parseOutageDate(details.timeOff),
                    end: DateUtils.parseOutageDate(details.timeOn),
                    customersAffected: details.customersAffected,
                    reason: details.reason || 'Not specified',
                    status: category.charAt(0).toUpperCase() + category.slice(1),
                    lastUpdated: DateUtils.parseOutageDate(details.lastUpdated),
                    type: placemark.styleUrl?.includes('planned') ? 'Planned Outage' : 'Unplanned Outage'
                });
            } catch (error) {
                Logger.verbose('Error parsing placemark:', error.message);
            }
        }
        
        return outages;
    }
    
    static async fetchCategory(category) {
        const cacheKey = `outage:${category}`;
        const cached = outageCache.get(cacheKey);

        if (cached) {
            Logger.verbose(`Using cached data for ${category} outages (${cached.length} items)`);
            return cached;
        }

        const url = Config.urls.KML[category];
        if (!url) {
            throw new Error(`Unknown outage category: ${category}`);
        }

        try {
            Logger.info(`Fetching ${category} outages from Essential Energy...`);
            const kmlText = await this.fetchKML(url);

            if (!kmlText || kmlText.length === 0) {
                throw new Error('Received empty KML data');
            }

            const outages = this.parseKML(kmlText, category);
            outageCache.set(cacheKey, outages);
            Logger.success(`Fetched ${outages.length} ${category} outages`);
            return outages;
        } catch (error) {
            const errorMsg = `Failed to fetch ${category} outages: ${error.message}`;
            Logger.error(errorMsg);
            throw new Error(errorMsg);
        }
    }
}

class RadarService {
    static async downloadLegend() {
        const imageUrl = `${Config.urls.RADAR_BASE}/products/radar_transparencies/IDR.legend.0.png`;
        const resourceFile = path.join(Config.paths.RESOURCES_DIR, 'Legend.png');
        
        if (fs.existsSync(resourceFile)) {
            Logger.verbose('Legend already exists');
            return;
        }
        
        try {
            Logger.info('Downloading radar legend...');
            
            const response = await axios.get(imageUrl, {
                responseType: 'arraybuffer',
                headers: Config.headers.browser,
                validateStatus: null
            });
            
            if (response.status !== 200) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            fs.writeFileSync(resourceFile, response.data);
            Logger.success('Radar legend downloaded');
        } catch (error) {
            Logger.error('Error downloading legend:', error.message);
            this.createFallbackLegend(resourceFile);
        }
    }
    
    static createFallbackLegend(filePath) {
        const legendSvg = `
            <svg width="400" height="80" xmlns="https://www.w3.org/2000/svg">
                <rect width="100%" height="100%" fill="white"/>
                <text x="10" y="20" font-family="Arial" font-size="14">Radar Legend</text>
                <linearGradient id="rainGradient" x1="0%" y1="0%" x2="100%" y1="0%" y2="0%">
                    <stop offset="0%" stop-color="#C4E4FC"/>
                    <stop offset="25%" stop-color="#77B5ED"/>
                    <stop offset="50%" stop-color="#2F80C3"/>
                    <stop offset="75%" stop-color="#FFE800"/>
                    <stop offset="100%" stop-color="#FF0000"/>
                </linearGradient>
                <rect x="10" y="30" width="380" height="30" fill="url(#rainGradient)"/>
                <text x="10" y="75" font-family="Arial" font-size="12">Light</text>
                <text x="360" y="75" font-family="Arial" font-size="12">Heavy</text>
            </svg>
        `;
        
        fs.writeFileSync(filePath, Buffer.from(legendSvg));
        Logger.info('Created fallback legend');
    }
    
    static async fetchRadarData(radarId) {
        if (!radarId.match(/^IDR[0-9]{3}$/)) {
            throw new Error('Invalid radar ID format');
        }
        
        const loopUrl = `${Config.urls.RADAR_BASE}/products/${radarId}.loop.shtml`;
        
        const response = await axios.get(loopUrl, {
            headers: Config.headers.browser,
            validateStatus: null,
            timeout: 15000
        });
        
        if (response.status !== 200) {
            throw new Error(`Failed to fetch radar page: ${response.status}`);
        }
        
        const html = response.data;
        const regex = /theImageNames\s*=\s*new Array\(\);([\s\S]*?)nImages\s*=\s*([0-9]+);/;
        const match = html.match(regex);
        
        if (!match) {
            throw new Error('Could not find radar image data on the page');
        }
        
        const imageArrayJs = match[1];
        const imageFileRegex = /theImageNames\[([0-9]+)\]\s*=\s*"([^"]+)";/g;
        const images = [];
        let fileMatch;
        
        while ((fileMatch = imageFileRegex.exec(imageArrayJs)) !== null) {
            const index = parseInt(fileMatch[1], 10);
            const imagePath = fileMatch[2];
            
            const timestampMatch = imagePath.match(/\.(\d{12})\.png$/);
            let timestamp = new Date();
            
            if (timestampMatch) {
                const ts = timestampMatch[1];
                timestamp = new Date(Date.UTC(
                    ts.substring(0, 4),
                    parseInt(ts.substring(4, 6)) - 1,
                    ts.substring(6, 8),
                    ts.substring(8, 10),
                    ts.substring(10, 12)
                ));
            }
            
            images[index] = {
                url: `/radar-proxy${imagePath}`,
                originalUrl: `${Config.urls.BOM_BASE}${imagePath}`,
                timestamp: timestamp.toISOString()
            };
        }
        
        const $ = cheerio.load(html);
        const pageTitle = $('title').text();
        const radarName = pageTitle.split('Radar')[0].trim();
        
        const filteredImages = images.filter(img => img);
        filteredImages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        const kmMatch = html.match(/Km\s*=\s*([0-9]+);/);
        const range = kmMatch ? `${kmMatch[1]}km` : '256km';
        
        return {
            id: radarId,
            name: radarName || radarId,
            range: range,
            images: filteredImages,
            lastUpdated: new Date().toISOString()
        };
    }
}

class FloodService {
    static determineFloodCategory(level, location) {
        if (!location || !FloodConfig.officialClassificationLocations.includes(location)) {
            return "N/A";
        }
        
        if (!level) return 'Unknown';
        
        const thresholds = FloodConfig.thresholds[location];
        
        if (!thresholds) {
            Logger.verbose(`Missing thresholds for location: ${location}`);
            return 'Unknown';
        }
        
        if (level >= thresholds.major) return 'Major';
        if (level >= thresholds.moderate) return 'Moderate';
        if (level >= thresholds.minor) return 'Minor';
        return 'No flooding';
    }
    
    static async fetchBomFloodData() {
        let html = null;
        
        try {
            const response = await axios.get(Config.urls.BOM_FLOOD_WARNING, {
                headers: Config.headers.html,
                timeout: 10000,
                maxRedirects: 5
            });
            
            if (response.status === 200) {
                html = response.data;
            }
        } catch (error) {
            Logger.error('Failed to fetch BOM flood data:', error.message);
            throw error;
        }
        
        if (!html) {
            throw new Error('Could not fetch data from BOM website');
        }
        
        const $ = cheerio.load(html);
        const riverData = [];
        
        $('table').each((i, tableEl) => {
            const table = $(tableEl);
            if (table.find('tr').length < 3) return;
            
            table.find('tr').each((j, rowEl) => {
                if (j === 0) return;
                
                const cells = $(rowEl).find('td');
                if (cells.length >= 4) {
                    const location = cells.eq(0).text().trim();
                    
                    if (FloodConfig.allowedLocations.some(allowed => 
                        location === allowed || location.includes(allowed.split(' ')[0])
                    )) {
                        const time = cells.eq(2).text().trim();
                        const waterLevelText = cells.eq(3).text().trim();
                        const waterLevelMatch = waterLevelText.match(/(-?\d+\.\d+)/);
                        const waterLevel = waterLevelMatch ? parseFloat(waterLevelMatch[1]) : null;
                        
                        const statusText = cells.eq(5).text().trim().toLowerCase();
                        let status = 'steady';
                        if (statusText.includes('rising')) status = 'rising';
                        else if (statusText.includes('falling')) status = 'falling';
                        
                        riverData.push({
                            location,
                            time,
                            waterLevel,
                            status,
                            floodCategory: this.determineFloodCategory(waterLevel, location)
                        });
                    }
                }
            });
        });
        
        const filteredData = riverData.filter(item => 
            FloodConfig.allowedLocations.includes(item.location)
        );
        
        return {
            success: true,
            timestamp: new Date().toISOString(),
            data: filteredData,
            source: Config.urls.BOM_FLOOD_WARNING
        };
    }
    
    static async fetchRiverHeightData(location) {
        const tableUrl = FloodConfig.riverHeightUrls[location];

        if (!tableUrl) {
            Logger.error(`No URL mapping found for location: ${location}`);
            throw new Error(`River height data not available for location: ${location}`);
        }

        Logger.verbose(`Fetching river height data for "${location}" from ${tableUrl}`);
        
        const tableResponse = await axios.get(tableUrl, {
            headers: Config.headers.html,
            timeout: 10000
        });
        
        if (tableResponse.status !== 200) {
            throw new Error(`Failed to fetch table data: ${tableResponse.status}`);
        }
        
        const $ = cheerio.load(tableResponse.data);
        const riverData = [];

        $('table tbody tr').each((i, row) => {
            const cells = $(row).find('td');
            if (cells.length >= 2) {
                const dateTime = $(cells[0]).text().trim();
                const heightText = $(cells[1]).text().trim();

                if (dateTime.match(/^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}$/)) {
                    const height = parseFloat(heightText);
                    if (!isNaN(height)) {
                        riverData.push({
                            time: dateTime,
                            height: height
                        });
                    }
                }
            }
        });
        
        if (riverData.length === 0) {
            const preContent = $('pre').text();
            if (preContent && preContent.trim().length > 0) {
                const lines = preContent.split('\n');

                for (const line of lines) {
                    const match = line.match(/(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2})\s+(\d+\.\d+)/);
                    if (match) {
                        riverData.push({
                            time: match[1],
                            height: parseFloat(match[2])
                        });
                    }
                }
            }
        }

        Logger.verbose(`Parsed ${riverData.length} river height data points for ${location}`);

        return {
            success: true,
            location: location,
            data: riverData,
            tableUrl: tableUrl
        };
    }
}

app.get('/status', (req, res) => {
    res.json({
        status: 'online',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

app.get('/api/bom-connectivity', async (req, res) => {
    try {
        const response = await axios.head(Config.urls.BOM_BASE, {
            timeout: 5000,
            validateStatus: null
        });

        res.json({
            success: response.status >= 200 && response.status < 400,
            status: response.status,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

app.get('/cleanup-radar', async (req, res) => {
    try {
        await FileUtils.cleanupRadarImages();
        res.json({
            success: true,
            message: 'Radar images cleaned successfully',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error cleaning radar images',
            error: error.message
        });
    }
});

app.get('/api/outages', async (req, res) => {
    try {
        if (req.query.refresh) {
            outageCache.flushAll();
            Logger.info('Outage cache cleared by user request');
        }

        Logger.info('Fetching outage data from Essential Energy...');

        const results = await Promise.allSettled([
            OutageService.fetchCategory('current'),
            OutageService.fetchCategory('future'),
            OutageService.fetchCategory('cancelled')
        ]);

        const current = results[0].status === 'fulfilled' ? results[0].value : [];
        const future = results[1].status === 'fulfilled' ? results[1].value : [];
        const cancelled = results[2].status === 'fulfilled' ? results[2].value : [];

        const errors = [];
        if (results[0].status === 'rejected') {
            const error = results[0].reason.message;
            Logger.error(`Current outages failed: ${error}`);
            errors.push({ category: 'current', error });
        }
        if (results[1].status === 'fulfilled') {
            Logger.success(`Future outages: ${future.length} loaded`);
        } else {
            const error = results[1].reason.message;
            Logger.error(`Future outages failed: ${error}`);
            errors.push({ category: 'future', error });
        }
        if (results[2].status === 'fulfilled') {
            Logger.success(`Cancelled outages: ${cancelled.length} loaded`);
        } else {
            const error = results[2].reason.message;
            Logger.error(`Cancelled outages failed: ${error}`);
            errors.push({ category: 'cancelled', error });
        }

        const allOutages = [...current, ...future, ...cancelled];

        let bounds = null;
        if (allOutages.length > 0) {
            const lats = allOutages.map(o => o.latitude);
            const lons = allOutages.map(o => o.longitude);
            bounds = {
                north: Math.max(...lats),
                south: Math.min(...lats),
                east: Math.max(...lons),
                west: Math.min(...lons)
            };
        }

        // If all three categories failed, return error status
        if (errors.length === 3) {
            Logger.error('All outage categories failed to fetch');
            return res.status(503).json({
                success: false,
                error: 'Essential Energy outage service is currently unavailable',
                hint: 'The Essential Energy KML feeds are not responding. Please try again later.',
                errors: errors,
                timestamp: new Date().toISOString()
            });
        }

        const responseData = {
            success: true,
            timestamp: new Date().toISOString(),
            counts: {
                current: current.length,
                future: future.length,
                cancelled: cancelled.length,
                total: allOutages.length
            },
            bounds: bounds,
            features: allOutages,
            errors: errors.length > 0 ? errors : undefined
        };

        if (allOutages.length > 0) {
            Logger.success(`Outage data loaded: ${allOutages.length} total outages`);
        } else if (errors.length > 0) {
            Logger.warn(`Outage data partially loaded with ${errors.length} errors`);
        }

        res.json(responseData);

    } catch (error) {
        Logger.error('Error in /api/outages:', error.message);
        res.status(500).json({
            success: false,
            error: 'Internal server error while fetching outages',
            detail: error.message
        });
    }
});

app.get('/api/outages/clear-cache', (req, res) => {
    outageCache.flushAll();
    Logger.info('Outage cache cleared via API');
    res.json({
        success: true,
        message: 'Outage cache cleared',
        timestamp: new Date().toISOString()
    });
});

// Legacy Radar endpoints - redirected to Weather Chaser
app.get('/api/radar/frames', async (req, res) => {
    try {
        const shouldRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
        if (shouldRefresh) {
            await weatherChaserService.updateFrames();
        }

        const radarIds = req.query.radars ? req.query.radars.split(',').map(id => parseInt(id)) : null;
        const data = weatherChaserService.getFrames(radarIds);
        const status = weatherChaserService.getStatus();

        const detailParts = [];
        if (status.frameCount) {
            detailParts.push(`Frames: ${status.frameCount}`);
        }
        if (status.radarCount) {
            detailParts.push(`Radars: ${data.radars.length}`);
        }

        statusManager.updateComponent(
            'Radar Map',
            status.active ? 'Online' : 'Offline',
            detailParts.join(' · ')
        );

        res.json({
            success: true,
            frames: data.frames,
            radars: data.radars,
            status: status,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        Logger.error('Error getting radar frames:', error.message);
        statusManager.updateComponent('Radar Map', 'Offline', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/radar/status', (req, res) => {
    try {
        const status = weatherChaserService.getStatus();
        const detailParts = [];
        if (status.frameCount) {
            detailParts.push(`Frames: ${status.frameCount}`);
        }
        if (status.lastUpdate) {
            detailParts.push(`Updated ${new Date(status.lastUpdate).toLocaleTimeString('en-AU')}`);
        }
        if (status.totalRadars) {
            detailParts.push(`${status.totalRadars} radars`);
        }

        statusManager.updateComponent(
            'Radar Map',
            status.active ? 'Online' : 'Offline',
            detailParts.join(' · ')
        );

        res.json({
            success: true,
            available: status.active && status.frameCount > 0,
            ...status,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        Logger.error('Error getting radar status:', error.message);
        statusManager.updateComponent('Radar Map', 'Offline', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Create transparent PNG for failed tiles
const TRANSPARENT_PNG_1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64'
);

// In-memory radar tile cache for performance
const radarTileCache = new Map();
const MAX_RADAR_TILE_CACHE_SIZE = 2000; // Large cache for faster repeat loads
const RADAR_TILE_CACHE_DURATION = 21600000; // 6 hours in milliseconds

function getRadarTileCacheKey(timestamp, z, x, y, quality) {
    return `${timestamp}_${z}_${x}_${y}_q${quality}`;
}

function addToRadarTileCache(key, data) {
    // Implement LRU cache - remove oldest if cache is full
    if (radarTileCache.size >= MAX_RADAR_TILE_CACHE_SIZE) {
        const firstKey = radarTileCache.keys().next().value;
        radarTileCache.delete(firstKey);
    }
    radarTileCache.set(key, {
        data: data,
        timestamp: Date.now()
    });
}

function getFromRadarTileCache(key) {
    const cached = radarTileCache.get(key);
    if (!cached) return null;

    // Check if cache is still valid
    if (Date.now() - cached.timestamp > RADAR_TILE_CACHE_DURATION) {
        radarTileCache.delete(key);
        return null;
    }

    return cached.data;
}

// RainViewer tile proxy with dynamic quality based on zoom level
app.get('/api/radar/tile/:timestamp/:z/:x/:y', async (req, res) => {
    const { timestamp, z, x, y } = req.params;

    const zoomLevel = parseInt(z);
    const requestedQuality = parseInt(req.query.quality);

    const normalizeQuality = (value) => {
        if (Number.isNaN(value)) {
            return 0;
        }

        const clamped = Math.max(0, Math.min(2, value));
        return clamped >= 2 ? 1 : clamped;
    };

    let qualityCandidates;
    if (!Number.isNaN(requestedQuality)) {
        const preferred = normalizeQuality(requestedQuality);
        qualityCandidates = [preferred];

        if (preferred === 1) {
            qualityCandidates.push(0);
        } else if (preferred === 0) {
            qualityCandidates.push(1);
        }
    } else if (zoomLevel >= 9) {
        // Prefer crisp raw tiles when zoomed in.
        qualityCandidates = [1, 0];
    } else {
        // Lower zooms can start with lighter smoothed tiles but fall back to detail when available.
        qualityCandidates = [0, 1];
    }

    const seenQualities = new Set();
    qualityCandidates = qualityCandidates.filter((quality) => {
        if (seenQualities.has(quality)) {
            return false;
        }
        seenQualities.add(quality);
        return true;
    });

    let selectedQuality = null;
    let tileBuffer = null;
    let cacheHit = false;
    let lastError = null;

    for (const candidateQuality of qualityCandidates) {
        const cacheKey = getRadarTileCacheKey(timestamp, z, x, y, candidateQuality);
        const cachedTile = getFromRadarTileCache(cacheKey);
        if (cachedTile) {
            selectedQuality = candidateQuality;
            tileBuffer = cachedTile;
            cacheHit = true;
            break;
        }

        const rainViewerUrl = `https://tilecache.rainviewer.com/v2/radar/${timestamp}/256/${z}/${x}/${y}/0/${candidateQuality}_0.png`;

        try {
            Logger.verbose(`[RADAR TILE] Cache MISS - Fetching ${z}/${x}/${y} quality=${candidateQuality} for timestamp ${timestamp}`);

            const response = await axios.get(rainViewerUrl, {
                responseType: 'arraybuffer',
                timeout: 5000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'image/png,image/*',
                    'Accept-Encoding': 'gzip, deflate',
                    'Referer': 'https://www.rainviewer.com/',
                    'Connection': 'keep-alive'
                },
                validateStatus: (status) => status === 200,
                decompress: true
            });

            addToRadarTileCache(cacheKey, response.data);
            selectedQuality = candidateQuality;
            tileBuffer = response.data;
            break;
        } catch (error) {
            const isExpectedZoomError = error.response && error.response.status === 403 && zoomLevel >= 11;

            if (error.code === 'ECONNREFUSED') {
                Logger.error(`[RADAR TILE] Connection refused to RainViewer for tile ${z}/${x}/${y}`);
                lastError = error;
                break;
            } else if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
                Logger.warn(`[RADAR TILE] Timeout fetching tile ${z}/${x}/${y}`);
                lastError = error;
                break;
            } else if (error.response) {
                if (error.response.status === 404) {
                    Logger.warn(`[RADAR TILE] Quality ${candidateQuality} unavailable for ${z}/${x}/${y} - trying fallback`);
                    lastError = error;
                    continue;
                }

                if (isExpectedZoomError) {
                    Logger.verbose(`[RADAR TILE] Tile not available at zoom ${z} (RainViewer limit is zoom 10)`);
                    lastError = error;
                    continue;
                }

                Logger.error(`[RADAR TILE] HTTP ${error.response.status} for tile ${z}/${x}/${y} - URL: ${rainViewerUrl}`);
                lastError = error;
                break;
            } else {
                Logger.error(`[RADAR TILE] Error for tile ${z}/${x}/${y}: ${error.message}`);
                lastError = error;
                break;
            }
        }
    }

    if (tileBuffer && selectedQuality !== null) {
        const cacheHeader = cacheHit ? 'HIT' : 'MISS';
        const requestedHeader = qualityCandidates.length > 0 ? qualityCandidates[0] : selectedQuality;

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=21600, immutable');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('X-Cache', cacheHeader);
        res.setHeader('X-Quality', selectedQuality.toString());
        res.setHeader('X-Quality-Requested', requestedHeader.toString());

        if (!cacheHit && selectedQuality !== requestedHeader) {
            Logger.verbose(`[RADAR TILE] Fallback quality ${selectedQuality} served for ${z}/${x}/${y}`);
        } else if (!cacheHit) {
            Logger.verbose(`[RADAR TILE] ✓ ${z}/${x}/${y} quality=${selectedQuality}`);
        }

        return res.send(tileBuffer);
    }

    if (lastError && lastError.response && lastError.response.status === 404 && qualityCandidates.length > 1) {
        Logger.warn(`[RADAR TILE] Exhausted quality fallbacks for ${z}/${x}/${y}, returning transparent tile`);
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200);
    res.send(TRANSPARENT_PNG_1x1);
});

// Weather Chaser Radar endpoints (NEW SYSTEM)
// In-memory radar image cache for Weather Chaser
const weatherChaserImageCache = new Map();
const weatherChaserFailedCache = new Map(); // Track failed requests to avoid hammering API
const weatherChaserHealthStats = new Map(); // Track per-radar health statistics
const MAX_WEATHERCHASER_CACHE_SIZE = 500; // Cache up to 500 radar images
const WEATHERCHASER_CACHE_DURATION = 21600000; // 6 hours in milliseconds
const WEATHERCHASER_FAILED_CACHE_DURATION = 300000; // 5 minutes for failed requests
const WEATHERCHASER_HEALTH_RESET_INTERVAL = 3600000; // Reset health stats every hour

// Weather Chaser service health tracking
let weatherChaserServiceDown = false;
let weatherChaserLastCheck = 0;
const WEATHERCHASER_SERVICE_CHECK_INTERVAL = 60000; // Check service status every minute

function getWeatherChaserCacheKey(radarId, timestamp) {
    return `${radarId}_${timestamp}`;
}

function addToWeatherChaserCache(key, data) {
    // Implement LRU cache - remove oldest if cache is full
    if (weatherChaserImageCache.size >= MAX_WEATHERCHASER_CACHE_SIZE) {
        const firstKey = weatherChaserImageCache.keys().next().value;
        weatherChaserImageCache.delete(firstKey);
    }
    weatherChaserImageCache.set(key, {
        data: data,
        timestamp: Date.now()
    });
}

function getFromWeatherChaserCache(key) {
    const cached = weatherChaserImageCache.get(key);
    if (!cached) return null;

    // Check if cache is still valid
    if (Date.now() - cached.timestamp > WEATHERCHASER_CACHE_DURATION) {
        weatherChaserImageCache.delete(key);
        return null;
    }

    return cached.data;
}

function markWeatherChaserFailed(key, errorType) {
    weatherChaserFailedCache.set(key, {
        errorType: errorType,
        timestamp: Date.now()
    });
}

function isWeatherChaserFailed(key) {
    const failed = weatherChaserFailedCache.get(key);
    if (!failed) return false;

    // Check if failure is still recent
    if (Date.now() - failed.timestamp > WEATHERCHASER_FAILED_CACHE_DURATION) {
        weatherChaserFailedCache.delete(key);
        return false;
    }

    return true;
}

function updateRadarHealth(radarId, success) {
    if (!weatherChaserHealthStats.has(radarId)) {
        weatherChaserHealthStats.set(radarId, {
            successCount: 0,
            failCount: 0,
            lastSuccess: null,
            lastFail: null,
            lastReset: Date.now()
        });
    }

    const stats = weatherChaserHealthStats.get(radarId);

    // Reset stats if they're too old
    if (Date.now() - stats.lastReset > WEATHERCHASER_HEALTH_RESET_INTERVAL) {
        stats.successCount = 0;
        stats.failCount = 0;
        stats.lastReset = Date.now();
    }

    if (success) {
        stats.successCount++;
        stats.lastSuccess = Date.now();
    } else {
        stats.failCount++;
        stats.lastFail = Date.now();
    }

    weatherChaserHealthStats.set(radarId, stats);
}

function getRadarHealthRate(radarId) {
    const stats = weatherChaserHealthStats.get(radarId);
    if (!stats || (stats.successCount + stats.failCount) === 0) {
        return null;
    }

    const total = stats.successCount + stats.failCount;
    return (stats.successCount / total) * 100;
}

function checkWeatherChaserServiceHealth() {
    // Count how many radars are failing
    let totalRadars = 0;
    let failingRadars = 0;

    weatherChaserHealthStats.forEach((stats, radarId) => {
        totalRadars++;
        const healthRate = getRadarHealthRate(radarId);
        // Only count as failing if health rate is below 5% (very low)
        if (healthRate !== null && healthRate < 5) {
            failingRadars++;
        }
    });

    // If more than 80% of radars are failing, mark service as down
    // This is more lenient - some radars being slow is normal
    const previousState = weatherChaserServiceDown;
    weatherChaserServiceDown = totalRadars > 10 && (failingRadars / totalRadars) > 0.8;

    if (previousState !== weatherChaserServiceDown) {
        if (weatherChaserServiceDown) {
            Logger.error('[WEATHER CHASER] Service appears to be DOWN - most radars failing');
        } else {
            Logger.success('[WEATHER CHASER] Service RECOVERED');
        }
    }

    return weatherChaserServiceDown;
}

// Get radar frames for Weather Chaser system
app.get('/api/radar/weatherchaser/frames', async (req, res) => {
    try {
        const shouldRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
        if (shouldRefresh) {
            Logger.info('[WEATHER CHASER] Manual refresh requested - clearing failed cache and regenerating frames');
            weatherChaserFailedCache.clear(); // Clear failed requests on manual refresh
            await weatherChaserService.updateFrames();
        }

        const radarIds = req.query.radars ? req.query.radars.split(',').map(id => parseInt(id)) : null;
        const data = weatherChaserService.getFrames(radarIds);
        const status = weatherChaserService.getStatus();

        const detailParts = [];
        if (status.frameCount) {
            detailParts.push(`Frames: ${status.frameCount}`);
        }
        if (status.radarCount) {
            detailParts.push(`Radars: ${data.radars.length}`);
        }

        statusManager.updateComponent(
            'Radar Map',
            status.active ? 'Online' : 'Offline',
            detailParts.join(' · ')
        );

        res.json({
            success: true,
            frames: data.frames,
            radars: data.radars,
            status: status,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        Logger.error('Error getting Weather Chaser radar frames:', error.message);
        statusManager.updateComponent('Radar Map', 'Offline', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get Weather Chaser radar status
app.get('/api/radar/weatherchaser/status', (req, res) => {
    try {
        const status = weatherChaserService.getStatus();
        const detailParts = [];
        if (status.frameCount) {
            detailParts.push(`Frames: ${status.frameCount}`);
        }
        if (status.lastUpdate) {
            detailParts.push(`Updated ${new Date(status.lastUpdate).toLocaleTimeString('en-AU')}`);
        }
        if (status.totalRadars) {
            detailParts.push(`${status.totalRadars} radars`);
        }

        statusManager.updateComponent(
            'Radar Map',
            status.active ? 'Online' : 'Offline',
            detailParts.join(' · ')
        );

        res.json({
            success: true,
            ...status,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        statusManager.updateComponent('Radar Map', 'Offline', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get Weather Chaser health statistics
app.get('/api/radar/weatherchaser/health', (req, res) => {
    try {
        const healthData = [];
        const serviceDown = checkWeatherChaserServiceHealth();

        weatherChaserHealthStats.forEach((stats, radarId) => {
            const radarInfo = weatherChaserService.getRadar(radarId);
            const healthRate = getRadarHealthRate(radarId);

            healthData.push({
                radarId: radarId,
                radarName: radarInfo ? radarInfo.fullName : `Radar ${radarId}`,
                successCount: stats.successCount,
                failCount: stats.failCount,
                healthRate: healthRate,
                lastSuccess: stats.lastSuccess,
                lastFail: stats.lastFail,
                status: healthRate === null ? 'unknown' : healthRate > 50 ? 'healthy' : healthRate > 10 ? 'degraded' : 'failing'
            });
        });

        // Sort by health rate (worst first)
        healthData.sort((a, b) => (a.healthRate || 100) - (b.healthRate || 100));

        res.json({
            success: true,
            serviceDown: serviceDown,
            totalRadars: healthData.length,
            healthyRadars: healthData.filter(r => r.status === 'healthy').length,
            degradedRadars: healthData.filter(r => r.status === 'degraded').length,
            failingRadars: healthData.filter(r => r.status === 'failing').length,
            radars: healthData,
            queueLength: weatherChaserRequestQueue.length,
            activeRequests: weatherChaserActiveRequests,
            cacheStats: {
                imagesCached: weatherChaserImageCache.size,
                failedCached: weatherChaserFailedCache.size
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Diagnostic endpoint - check timestamp generation
app.get('/api/radar/weatherchaser/diagnostic', (req, res) => {
    try {
        const now = new Date();
        const service = weatherChaserService;
        const frames = service.frames;

        const diagnostic = {
            serverTime: {
                iso: now.toISOString(),
                timestamp: service.formatTimestamp(now),
                utc: now.toUTCString()
            },
            frameGeneration: {
                latestFrame: frames.length > 0 ? frames[frames.length - 1].timestamp : 'none',
                oldestFrame: frames.length > 0 ? frames[0].timestamp : 'none',
                totalFrames: frames.length,
                frames: frames.map(f => ({
                    timestamp: f.timestamp,
                    age: `${Math.floor((now - new Date(f.time)) / 60000)} min ago`,
                    iso: f.dateStr
                }))
            },
            validation: {
                minAgeRequired: '15 minutes',
                buffer: '20 minutes',
                explanation: 'Weather Chaser uses UTC timestamps - some radars publish slower than others, 15 min minimum age required'
            },
            recommendations: frames.length > 0 ? frames.map(f => {
                const frameTime = new Date(f.time);
                const ageMs = now - frameTime;
                const ageMin = Math.floor(ageMs / 60000);
                const shouldWork = ageMin >= 15;

                return {
                    timestamp: f.timestamp,
                    ageMinutes: ageMin,
                    shouldWork: shouldWork,
                    status: shouldWork ? 'SAFE' : 'TOO RECENT - WILL FAIL'
                };
            }) : []
        };

        res.json({
            success: true,
            ...diagnostic
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Request queue for Weather Chaser to prevent overwhelming the API
const weatherChaserRequestQueue = [];
let weatherChaserActiveRequests = 0;
const MAX_CONCURRENT_WEATHERCHASER_REQUESTS = 5; // Only 5 concurrent requests
const WEATHERCHASER_REQUEST_DELAY = 100; // 100ms between requests

async function processWeatherChaserQueue() {
    if (weatherChaserActiveRequests >= MAX_CONCURRENT_WEATHERCHASER_REQUESTS || weatherChaserRequestQueue.length === 0) {
        return;
    }

    const request = weatherChaserRequestQueue.shift();
    if (!request) return;

    weatherChaserActiveRequests++;

    try {
        await request.execute();
    } catch (error) {
        // Error already handled in request.execute
    } finally {
        weatherChaserActiveRequests--;

        // Process next request after delay
        setTimeout(() => {
            processWeatherChaserQueue();
        }, WEATHERCHASER_REQUEST_DELAY);
    }
}

// Proxy radar images from theweatherchaser.com
app.get('/api/radar/weatherchaser/image/:radarId/:timestamp', async (req, res) => {
    const { radarId, timestamp } = req.params;
    const cacheKey = getWeatherChaserCacheKey(radarId, timestamp);

    try {
        // Check cache first
        const cachedImage = getFromWeatherChaserCache(cacheKey);

        if (cachedImage) {
            Logger.verbose(`[WEATHER CHASER] Cache HIT - Radar ${radarId} @ ${timestamp}`);
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=21600, immutable');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('X-Cache', 'HIT');
            updateRadarHealth(parseInt(radarId), true);
            return res.send(cachedImage);
        }

        // Check if this request recently failed
        if (isWeatherChaserFailed(cacheKey)) {
            Logger.verbose(`[WEATHER CHASER] Recently failed - Returning transparent for Radar ${radarId} @ ${timestamp}`);
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=60');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('X-Radar-Status', 'recently-failed');
            res.status(200);
            return res.send(TRANSPARENT_PNG_1x1);
        }

        // Validate timestamp - don't request future frames or frames that are too recent
        const requestTime = parseWeatherChaserTimestamp(timestamp);
        const now = new Date();
        const timeDiff = requestTime - now;

        // Reject if frame is in the future OR less than 8 minutes old OR more than 90 minutes old
        const ageMinutes = Math.floor(-timeDiff / 60000);

        if (timeDiff > -480000) { // Less than 8 minutes in the past (or in the future)
            Logger.verbose(`[WEATHER CHASER] Timestamp ${timestamp} is too recent (${ageMinutes} min old) - skipping`);
            markWeatherChaserFailed(cacheKey, 'too-recent');
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=60');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('X-Radar-Status', 'too-recent');
            res.status(200);
            return res.send(TRANSPARENT_PNG_1x1);
        }

        if (ageMinutes > 90) { // More than 90 minutes old - likely expired
            Logger.verbose(`[WEATHER CHASER] Timestamp ${timestamp} is too old (${ageMinutes} min old) - likely expired`);
            markWeatherChaserFailed(cacheKey, 'too-old');
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=300');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('X-Radar-Status', 'too-old');
            res.status(200);
            return res.send(TRANSPARENT_PNG_1x1);
        }

        // Circuit breaker: If service is known to be down, fail immediately
        if (weatherChaserServiceDown) {
            Logger.verbose(`[WEATHER CHASER] Service marked as DOWN - returning fallback for ${radarId} @ ${timestamp}`);
            markWeatherChaserFailed(cacheKey, 'service-down');
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=60');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('X-Radar-Status', 'service-down');
            res.status(200);
            return res.send(TRANSPARENT_PNG_1x1);
        }

        // Add to queue and wait for execution
        const requestPromise = new Promise((resolve, reject) => {
            weatherChaserRequestQueue.push({
                radarId,
                timestamp,
                execute: async () => {
                    try {
                        const imageUrl = weatherChaserService.buildImageUrl(radarId, timestamp);
                        const radarInfo = weatherChaserService.getRadar(parseInt(radarId));
                        const radarName = radarInfo ? radarInfo.fullName : `Radar ${radarId}`;

                        Logger.verbose(`[WEATHER CHASER] Queue processing - Fetching ${radarName} (ID:${radarId}) @ ${timestamp}`);

                        // Only 1 retry - if it fails, the service is down
                        let lastError = null;
                        const maxRetries = 1; // Reduced from 2 - no point retrying when service is down

                        for (let attempt = 1; attempt <= maxRetries; attempt++) {
                            try {
                                const response = await axios.get(imageUrl, {
                                    responseType: 'arraybuffer',
                                    timeout: 5000, // Reduced from 8000 to 5000 - fail faster
                                    headers: {
                                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                        'Accept': 'image/png,image/*',
                                        'Accept-Encoding': 'gzip, deflate',
                                        'Connection': 'keep-alive',
                                        'Cache-Control': 'no-cache'
                                    },
                                    validateStatus: (status) => status === 200,
                                    decompress: true
                                });

                                const sizeKB = (response.data.length / 1024).toFixed(2);
                                addToWeatherChaserCache(cacheKey, response.data);
                                updateRadarHealth(parseInt(radarId), true);

                                if (attempt > 1) {
                                    Logger.success(`[WEATHER CHASER] ✓ ${radarName} @ ${timestamp} fetched on retry ${attempt} (${sizeKB} KB)`);
                                } else {
                                    Logger.verbose(`[WEATHER CHASER] ✓ ${radarName} @ ${timestamp} fetched (${sizeKB} KB)`);
                                }

                                resolve(response.data);
                                return;
                            } catch (retryError) {
                                lastError = retryError;

                                // No retry delays - removed since maxRetries is now 1
                            }
                        }

                        // All retries failed
                        throw lastError;

                    } catch (error) {
                        const radarInfo = weatherChaserService.getRadar(parseInt(radarId));
                        const radarName = radarInfo ? radarInfo.fullName : `Radar ${radarId}`;
                        const imageUrl = weatherChaserService.buildImageUrl(radarId, timestamp);

                        let errorType = 'unknown';

                        if (error.response) {
                            errorType = `http-${error.response.status}`;

                            if (error.response.status === 404) {
                                Logger.verbose(`[WEATHER CHASER] Image not found: ${radarName} @ ${timestamp}`);
                                markWeatherChaserFailed(cacheKey, 'not-found');
                                updateRadarHealth(parseInt(radarId), false);
                            } else if (error.response.status === 500 || error.response.status === 503) {
                                const now = new Date();
                                const requestTime = parseWeatherChaserTimestamp(timestamp);
                                const ageMinutes = Math.floor((now - requestTime) / 60000);

                                // Only log as ERROR if frame is old (30+ min) - otherwise it's just a slow radar
                                if (ageMinutes >= 30) {
                                    Logger.error(`[WEATHER CHASER] HTTP ${error.response.status} for ${radarName} @ ${timestamp} (${ageMinutes} min old) - radar may be offline`);
                                } else {
                                    Logger.verbose(`[WEATHER CHASER] HTTP ${error.response.status} for ${radarName} @ ${timestamp} (${ageMinutes} min old) - not published yet`);
                                }

                                markWeatherChaserFailed(cacheKey, errorType);
                                updateRadarHealth(parseInt(radarId), false);

                                // Only check service health occasionally, not on every failure
                                if (Math.random() < 0.1) { // 10% chance
                                    checkWeatherChaserServiceHealth();
                                }
                            } else {
                                Logger.error(`[WEATHER CHASER] HTTP ${error.response.status} for ${radarName} @ ${timestamp}`);
                                Logger.error(`[WEATHER CHASER] URL was: ${imageUrl}`);
                                markWeatherChaserFailed(cacheKey, errorType);
                                updateRadarHealth(parseInt(radarId), false);
                            }
                        } else if (error.code === 'ECONNREFUSED') {
                            Logger.error(`[WEATHER CHASER] Connection refused for ${radarName}`);
                            errorType = 'connection-refused';
                            markWeatherChaserFailed(cacheKey, errorType);
                            updateRadarHealth(parseInt(radarId), false);
                            weatherChaserServiceDown = true;
                        } else if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
                            Logger.warn(`[WEATHER CHASER] Timeout fetching ${radarName} @ ${timestamp}`);
                            errorType = 'timeout';
                            markWeatherChaserFailed(cacheKey, errorType);
                            updateRadarHealth(parseInt(radarId), false);
                        } else {
                            Logger.error(`[WEATHER CHASER] Error fetching ${radarName} @ ${timestamp}: ${error.message}`);
                            markWeatherChaserFailed(cacheKey, errorType);
                            updateRadarHealth(parseInt(radarId), false);
                        }

                        reject(error);
                    }
                }
            });

            // Start processing queue
            processWeatherChaserQueue();
        });

        // Wait for the queued request to complete
        try {
            const imageData = await requestPromise;

            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=21600, immutable');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('X-Cache', 'MISS');
            res.setHeader('X-Radar-Health', getRadarHealthRate(parseInt(radarId))?.toFixed(1) || 'N/A');
            res.send(imageData);
        } catch (error) {
            // Return transparent image on error
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=60');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('X-Radar-Status', 'error');
            res.setHeader('X-Radar-Health', getRadarHealthRate(parseInt(radarId))?.toFixed(1) || 'N/A');
            res.status(200);
            res.send(TRANSPARENT_PNG_1x1);
        }

    } catch (error) {
        Logger.error(`[WEATHER CHASER] Unexpected error: ${error.message}`);
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=60');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('X-Radar-Status', 'error');
        res.status(200);
        res.send(TRANSPARENT_PNG_1x1);
    }
});

function parseWeatherChaserTimestamp(timestamp) {
    const year = parseInt(timestamp.substring(0, 4));
    const month = parseInt(timestamp.substring(4, 6)) - 1;
    const day = parseInt(timestamp.substring(6, 8));
    const hours = parseInt(timestamp.substring(8, 10));
    const minutes = parseInt(timestamp.substring(10, 12));
    // CRITICAL: Weather Chaser uses UTC timestamps!
    return new Date(Date.UTC(year, month, day, hours, minutes));
}

// Old radar endpoint (keep for backwards compatibility, will be deprecated)
app.get('/api/radar/:radarId', async (req, res) => {
    try {
        await FileUtils.cleanupRadarImages();
        const radarData = await RadarService.fetchRadarData(req.params.radarId);
        res.json(radarData);
    } catch (error) {
        Logger.error('Error fetching radar data:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/radar-proxy/*', async (req, res) => {
    try {
        const pathMatch = req.url.match(/\/radar-proxy(\/.+)/);
        if (!pathMatch || !pathMatch[1]) {
            return res.status(400).send('Invalid path format');
        }
        
        const imagePath = pathMatch[1];
        const imageUrl = `${Config.urls.RADAR_BASE}${imagePath}`;
        
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            headers: Config.headers.browser,
            validateStatus: null,
            timeout: 10000
        });
        
        if (response.status !== 200) {
            Logger.error(`Radar image fetch failed: HTTP ${response.status}`);
            return res.status(response.status).send(`Error: ${response.status}`);
        }
        
        const resourceFile = path.join(Config.paths.RESOURCES_DIR, `radar_${encodeURIComponent(imagePath)}.png`);
        fs.writeFileSync(resourceFile, response.data);
        
        res.set('Content-Type', 'image/png');
        res.send(response.data);
    } catch (error) {
        Logger.error('Error fetching radar image:', error.message);
        res.status(500).send('Error fetching radar image');
    }
});

app.get('/map-proxy/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        
        if (!filename.match(/^IDR[0-9]{3}\.[a-z]+\.png$/)) {
            return res.status(400).send('Invalid filename format');
        }
        
        const imageUrl = `${Config.urls.RADAR_BASE}/products/radar_transparencies/${filename}`;
        
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            headers: Config.headers.browser,
            validateStatus: null,
            timeout: 10000
        });
        
        if (response.status !== 200) {
            Logger.error(`Map layer fetch failed: HTTP ${response.status}`);
            return res.status(response.status).send(`Error: ${response.status}`);
        }
        
        const resourceFile = path.join(Config.paths.RESOURCES_DIR, filename);
        fs.writeFileSync(resourceFile, response.data);
        
        res.set('Content-Type', 'image/png');
        res.send(response.data);
    } catch (error) {
        Logger.error('Error fetching map layer:', error.message);
        res.status(500).send('Error fetching map layer');
    }
});

app.get('/public/resources/Rain Radar/Legend.png', async (req, res) => {
    try {
        const resourceFile = path.join(Config.paths.RESOURCES_DIR, 'Legend.png');
        
        if (!fs.existsSync(resourceFile)) {
            await RadarService.downloadLegend();
        }
        
        if (fs.existsSync(resourceFile)) {
            res.set('Content-Type', 'image/png');
            res.sendFile(resourceFile);
        } else {
            res.status(404).send('Legend not available');
        }
    } catch (error) {
        Logger.error('Error serving legend:', error.message);
        res.status(500).send('Error serving legend image');
    }
});

app.get('/flood-data', async (req, res) => {
    try {
        await FileUtils.cleanupRadarImages();
        const floodData = await FloodService.fetchBomFloodData();
        statusManager.updateComponent('BOM Data', 'Online', 'Flood data refreshed');
        res.json(floodData);
    } catch (error) {
        Logger.error('Error in flood-data endpoint:', error.message);
        statusManager.updateComponent('BOM Data', 'Offline', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

app.get('/river-data', async (req, res) => {
    try {
        const location = req.query.location;
        if (!location) {
            return res.status(400).json({
                success: false,
                message: 'Location parameter is required'
            });
        }
        
        const riverHeightData = await FloodService.fetchRiverHeightData(location);
        statusManager.updateComponent('BOM Data', 'Online', `River data for ${location}`);
        res.json(riverHeightData);
    } catch (error) {
        Logger.error('Error in river-data endpoint:', error.message);
        statusManager.updateComponent('BOM Data', 'Offline', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

const tileCache = new NodeCache({ stdTTL: 3600, useClones: false, maxKeys: 1000 });

const TRANSPARENT_TILE_256 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAOxAAADsQBlSsOGwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAANSURBVHja7cEBDQAAAMKg909tDjegAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4GcAHBIAAWq3sR4AAAAASUVORK5CYII=',
    'base64'
);

app.get('/terrarium/:z/:x/:y.png', async (req, res) => {
    res.set('Content-Type', 'image/png');
    res.set('Access-Control-Allow-Origin', '*');
    
    try {
        const { z, x, y } = req.params;
        
        const zNum = parseInt(z, 10);
        const xNum = parseInt(x, 10);
        const yNum = parseInt(y, 10);
        
        if (!Number.isFinite(zNum) || !Number.isFinite(xNum) || !Number.isFinite(yNum)) {
            res.set('Cache-Control', 'public, max-age=3600');
            return res.send(TRANSPARENT_TILE_256);
        }
        
        if (zNum < 0 || zNum > 15 || xNum < 0 || yNum < 0) {
            res.set('Cache-Control', 'public, max-age=3600');
            return res.send(TRANSPARENT_TILE_256);
        }
        
        const cacheKey = `tile:${z}:${x}:${y}`;
        const cached = tileCache.get(cacheKey);
        if (cached) {
            res.set('Cache-Control', 'public, max-age=86400, immutable');
            res.set('X-Cache', 'HIT');
            return res.send(cached);
        }
        
        const upstreamUrls = [
            `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
            `https://elevation-tiles-prod.s3.amazonaws.com/terrarium/${z}/${x}/${y}.png`
        ];
        
        for (const upstream of upstreamUrls) {
            try {
                const response = await axios.get(upstream, {
                    responseType: 'arraybuffer',
                    headers: { 
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'image/png,image/*;q=0.8'
                    },
                    timeout: 5000,
                    validateStatus: (status) => status === 200,
                    maxRedirects: 3
                });
                
                if (response.data && response.data.length > 0) {
                    tileCache.set(cacheKey, response.data);
                    
                    res.set('Cache-Control', 'public, max-age=86400, immutable');
                    res.set('X-Cache', 'MISS');
                    return res.send(response.data);
                }
            } catch (err) {
                continue;
            }
        }
        
        res.set('Cache-Control', 'public, max-age=300');
        res.set('X-Cache', 'EMPTY');
        return res.send(TRANSPARENT_TILE_256);
        
    } catch (error) {
        res.set('Cache-Control', 'public, max-age=60');
        res.set('X-Cache', 'ERROR');
        return res.send(TRANSPARENT_TILE_256);
    }
});

app.get('/elevation', async (req, res) => {
    try {
        const lat = parseFloat(req.query.lat);
        const lng = parseFloat(req.query.lng);
        const z = parseInt(req.query.z || '14', 10);
        
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return res.status(400).json({ error: 'lat/lng required' });
        }
        
        const n = Math.pow(2, z);
        const xt = Math.floor(((lng + 180) / 360) * n);
        const latRad = (lat * Math.PI) / 180;
        const yt = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
        const xRel = ((lng + 180) / 360) * n - xt;
        const yRel = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n - yt;
        const px = Math.max(0, Math.min(255, Math.round(xRel * 256)));
        const py = Math.max(0, Math.min(255, Math.round(yRel * 256)));
        
        return res.json({ 
            ok: true, 
            z, 
            tile: { x: xt, y: yt }, 
            pixel: { x: px, y: py },
            url: `/terrarium/${z}/${xt}/${yt}.png` 
        });
    } catch (e) {
        Logger.error('Elevation lookup error:', e.message);
        res.status(500).json({ error: 'elevation lookup failed' });
    }
});

app.get('/api/flood-properties', (req, res) => {
    const floodDataPath = path.join(__dirname, 'public', 'floodmap-data.json');

    try {
        if (fs.existsSync(floodDataPath)) {
            const data = fs.readFileSync(floodDataPath, 'utf8');
            res.json(JSON.parse(data));
        } else {
            res.status(404).json({
                success: false,
                error: 'Flood data file not found'
            });
        }
    } catch (error) {
        Logger.error('Error reading flood data:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to load flood data'
        });
    }
});

app.get('/api/check-cyclone', async (req, res) => {
    try {
        const imageUrl = 'https://www.bom.gov.au/fwo/IDQ65001.png';

        const response = await axios.head(imageUrl, {
            headers: Config.headers.browser,
            validateStatus: null,
            timeout: 5000
        });

        const available = response.status === 200;
        // Only log if status changed or if verbose logging is enabled
        if (VERBOSE_LOGGING || available) {
            Logger.verbose(`Cyclone image ${available ? 'available' : 'not available'} (HTTP ${response.status})`);
        }

        statusManager.updateComponent(
            'Cyclone Map',
            available ? 'Online' : 'Offline',
            `HTTP ${response.status}`
        );

        res.json({
            available,
            status: response.status,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        Logger.verbose('Cyclone image not available (connection error)');
        statusManager.updateComponent('Cyclone Map', 'Offline', error.message);
        res.json({
            available: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

app.get('/api/check-radar', async (req, res) => {
    try {
        Logger.info('Checking radar image availability...');
        const radarUrl = 'https://www.bom.gov.au/radar/IDR282.gif';

        const response = await axios.head(radarUrl, {
            headers: Config.headers.browser,
            validateStatus: null,
            timeout: 5000
        });

        const available = response.status === 200;
        Logger.info(`Radar image ${available ? 'available' : 'not available'} (HTTP ${response.status})`);

        res.json({
            available,
            status: response.status,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        Logger.info('Radar image not available (connection error)');
        res.json({
            available: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

app.get('/proxy/cyclone-image', async (req, res) => {
    try {
        const imageUrl = 'https://www.bom.gov.au/fwo/IDQ65001.png';

        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            headers: Config.headers.browser,
            validateStatus: null,
            timeout: 10000
        });

        if (response.status !== 200) {
            // 404 is expected when no active cyclone - don't log as error
            if (response.status === 404) {
                return res.status(404).send('No cyclone image available');
            }
            return res.status(response.status).send(`Error: ${response.status}`);
        }

        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'public, max-age=60');
        res.send(response.data);
    } catch (error) {
        // Only log if not a 404
        if (error.response && error.response.status !== 404) {
            Logger.error('Error fetching cyclone image:', error.message);
        }
        res.status(error.response ? error.response.status : 500).send('Error fetching cyclone image');
    }
});

app.get('/proxy/webcam', async (req, res) => {
    try {
        const webcamUrl = 'https://webcams.transport.nsw.gov.au/livetraffic-webcams/cameras/bruxner_highway_lismore.jpeg';

        const response = await axios.get(webcamUrl, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/jpeg,image/*,*/*;q=0.8'
            },
            validateStatus: null,
            timeout: 10000
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

app.get('/proxy/radar-image', async (req, res) => {
    try {
        const radarUrl = 'https://www.bom.gov.au/radar/IDR282.gif';

        const response = await axios.get(radarUrl, {
            responseType: 'arraybuffer',
            headers: Config.headers.browser,
            validateStatus: null,
            timeout: 10000
        });

        if (response.status !== 200) {
            Logger.error(`Radar GIF fetch failed: HTTP ${response.status}`);
            return res.status(response.status).send(`Error: ${response.status}`);
        }

        res.set('Content-Type', 'image/gif');
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        res.send(response.data);
    } catch (error) {
        Logger.error('Error fetching radar GIF:', error.message);
        res.status(500).send('Error fetching radar GIF');
    }
});

app.get('/proxy/bom/*', async (req, res) => {
    try {
        const pathMatch = req.url.match(/\/proxy\/bom(\/.+)/);
        if (!pathMatch || !pathMatch[1]) {
            return res.status(400).send('Invalid path format');
        }

        const resourcePath = pathMatch[1];
        const resourceUrl = `https://www.bom.gov.au${resourcePath}`;

        const response = await axios.get(resourceUrl, {
            responseType: 'arraybuffer',
            headers: Config.headers.browser,
            validateStatus: null,
            timeout: 10000
        });

        if (response.status !== 200) {
            Logger.error(`BOM resource fetch failed: HTTP ${response.status}`);
            return res.status(response.status).send(`Error: ${response.status}`);
        }

        const contentType = response.headers['content-type'] || 'application/octet-stream';
        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'public, max-age=60');
        res.send(response.data);
    } catch (error) {
        Logger.error('Error fetching BOM resource:', error.message);
        res.status(500).send('Error fetching BOM resource');
    }
});

/**
 * Prefetch all radar images and store in cache
 * This ensures images are ready immediately when frontend requests them
 */
async function prefetchAllRadarImages() {
    try {
        const status = weatherChaserService.getStatus();
        if (!status.active || !status.frameCount) {
            Logger.warn('[PREFETCH] Weather Chaser service not active, skipping prefetch');
            return;
        }

        const allRadars = weatherChaserService.getAllRadars();
        const { frames } = weatherChaserService.getFrames();

        if (!frames || frames.length === 0) {
            Logger.warn('[PREFETCH] No frames available, skipping prefetch');
            return;
        }

        const totalImages = allRadars.length * frames.length;
        Logger.info(`[PREFETCH] Starting prefetch of ${totalImages} images (${allRadars.length} radars × ${frames.length} frames)`);

        let successCount = 0;
        let failCount = 0;
        let cachedCount = 0;

        // Prefetch with concurrency limit to avoid overwhelming the server
        const CONCURRENT_PREFETCH = 10;
        const chunks = [];

        for (let i = 0; i < allRadars.length; i += CONCURRENT_PREFETCH) {
            chunks.push(allRadars.slice(i, i + CONCURRENT_PREFETCH));
        }

        for (const radarChunk of chunks) {
            const promises = radarChunk.flatMap(radar =>
                frames.map(async frame => {
                    const cacheKey = getWeatherChaserCacheKey(radar.id, frame.timestamp);

                    // Skip if already cached
                    if (getFromWeatherChaserCache(cacheKey)) {
                        cachedCount++;
                        return { success: true, cached: true };
                    }

                    // Skip if recently failed
                    if (isWeatherChaserFailed(cacheKey)) {
                        failCount++;
                        return { success: false, reason: 'recently-failed' };
                    }

                    // Skip if service is down
                    if (weatherChaserServiceDown) {
                        failCount++;
                        return { success: false, reason: 'service-down' };
                    }

                    try {
                        const imageUrl = weatherChaserService.buildImageUrl(radar.id, frame.timestamp);
                        const response = await axios.get(imageUrl, {
                            responseType: 'arraybuffer',
                            timeout: 5000,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                'Accept': 'image/png,image/*',
                                'Accept-Encoding': 'gzip, deflate'
                            },
                            validateStatus: (status) => status === 200
                        });

                        addToWeatherChaserCache(cacheKey, response.data);
                        updateRadarHealth(radar.id, true);
                        successCount++;
                        return { success: true, cached: false };
                    } catch (error) {
                        markWeatherChaserFailed(cacheKey, error.response?.status || 'error');
                        updateRadarHealth(radar.id, false);
                        failCount++;
                        return { success: false, reason: error.message };
                    }
                })
            );

            await Promise.all(promises);

            // Small delay between chunks
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        const total = successCount + failCount + cachedCount;
        Logger.success(`[PREFETCH] Complete: ${successCount} fetched, ${cachedCount} cached, ${failCount} failed (${total} total)`);
    } catch (error) {
        Logger.error('[PREFETCH] Error during prefetch:', error.message);
    }
}

async function initializeServer() {
    Logger.header('LISMORE FLOOD DASHBOARD SERVER');

    try {
        await FileUtils.ensureDirectory(Config.paths.RESOURCES_DIR);
        Logger.success('Directory structure verified');

        // Initialize Weather Chaser radar service
        await weatherChaserService.initialize();
        Logger.success('Weather Chaser radar service initialized');

        // Prefetch all radar images on startup
        Logger.info('Prefetching all radar images...');
        await prefetchAllRadarImages();
        Logger.success('All radar images prefetched and cached');

        // Periodic health check, cleanup, and image refresh (every 5 minutes)
        setInterval(async () => {
            checkWeatherChaserServiceHealth();

            // Refresh radar images periodically
            Logger.info('[PERIODIC] Refreshing radar images...');
            await prefetchAllRadarImages();

            // Log health summary
            let healthyCount = 0;
            let degradedCount = 0;
            let failingCount = 0;

            weatherChaserHealthStats.forEach((stats, radarId) => {
                const healthRate = getRadarHealthRate(radarId);
                if (healthRate !== null) {
                    if (healthRate > 50) healthyCount++;
                    else if (healthRate > 10) degradedCount++;
                    else failingCount++;
                }
            });

            if (weatherChaserHealthStats.size > 0) {
                Logger.verbose(`[WEATHER CHASER] Health: ${healthyCount} healthy, ${degradedCount} degraded, ${failingCount} failing radars`);
                Logger.verbose(`[WEATHER CHASER] Queue: ${weatherChaserRequestQueue.length} pending, ${weatherChaserActiveRequests} active requests`);
                Logger.verbose(`[WEATHER CHASER] Cache: ${weatherChaserImageCache.size} images, ${weatherChaserFailedCache.size} failed`);
            }
        }, 5 * 60 * 1000);

        await RadarService.downloadLegend();

        const CLEANUP_INTERVAL = 5 * 60 * 1000;
        setInterval(async () => {
            try {
                await FileUtils.cleanupRadarImages();
                Logger.verbose('Periodic cleanup completed');
            } catch (error) {
                Logger.error('Periodic cleanup error:', error.message);
            }
        }, CLEANUP_INTERVAL);
        Logger.info('Periodic cleanup scheduled (every 5 minutes)');

        const server = app.listen(PORT, () => {
            Logger.success(`Server running on port ${PORT}`);
            Logger.info('Server initialization complete');

            statusManager.setServerInfo({
                port: PORT,
                dashboardUrl: `http://localhost:${PORT}`,
                apiBase: `http://localhost:${PORT}/api`,
                notice: `Open http://localhost:${PORT} in your browser`,
                warning: 'Do NOT open the HTML files directly from the file system',
                endpoints: [
                    { path: '/api/outages', description: 'Power outage data' },
                    { path: '/api/radar/weatherchaser/frames', description: 'Weather Chaser radar frames' },
                    { path: '/api/radar/weatherchaser/image/...', description: 'Weather Chaser image proxy' },
                    { path: '/api/radar/weatherchaser/health', description: 'Radar health statistics' },
                    { path: '/api/radar/weatherchaser/diagnostic', description: 'Timestamp diagnostics' },
                    { path: '/flood-data', description: 'Current flood levels' },
                    { path: '/river-data', description: 'River height history' },
                    { path: '/status', description: 'Server health check' }
                ]
            });
        });

        // Handle port binding errors
        server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                Logger.error(`Port ${PORT} is already in use!`);
                Logger.info('Solutions:');
                Logger.info(`  1. Stop the process using port ${PORT}`);
                Logger.info('  2. Or use a different port: set PORT=3001 && node server.js');
                Logger.info('To find what\'s using the port:');
                Logger.info(`  Windows: netstat -ano | findstr :${PORT}`);
                Logger.info('  Then use Task Manager to stop that process');
            } else {
                Logger.error('Server error:', error.message);
            }
            process.exit(1);
        });

        // Graceful shutdown
        process.on('SIGINT', () => {
            Logger.info('Shutting down server...');
            server.close(() => {
                Logger.success('Server stopped');
                process.exit(0);
            });
        });

    } catch (error) {
        Logger.error('Failed to initialize server:', error.message);
        Logger.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

initializeServer();
