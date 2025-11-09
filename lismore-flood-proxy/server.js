const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const NodeCache = require('node-cache');
const { XMLParser } = require('fast-xml-parser');
const rainViewerService = require('./rainViewerService');

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
    static timestamp() {
        return new Date().toISOString().replace('T', ' ').substring(0, 19);
    }
    
    static info(message, ...args) {
        console.log(
            `${colors.gray}[${this.timestamp()}]${colors.reset} ${colors.blue}INFO${colors.reset}  ${message}`,
            ...args
        );
    }
    
    static success(message, ...args) {
        console.log(
            `${colors.gray}[${this.timestamp()}]${colors.reset} ${colors.green}OK${colors.reset}    ${message}`,
            ...args
        );
    }
    
    static warn(message, ...args) {
        console.log(
            `${colors.gray}[${this.timestamp()}]${colors.reset} ${colors.yellow}WARN${colors.reset}  ${message}`,
            ...args
        );
    }
    
    static error(message, ...args) {
        console.error(
            `${colors.gray}[${this.timestamp()}]${colors.reset} ${colors.red}ERROR${colors.reset} ${message}`,
            ...args
        );
    }
    
    static verbose(message, ...args) {
        if (VERBOSE_LOGGING) {
            console.log(
                `${colors.gray}[${this.timestamp()}] DEBUG ${colors.dim}${message}${colors.reset}`,
                ...args
            );
        }
    }
    
    static api(method, path, status, duration) {
        const statusColor = status < 300 ? colors.green : status < 400 ? colors.yellow : colors.red;
        const durationColor = duration < 100 ? colors.green : duration < 500 ? colors.yellow : colors.red;
        
        console.log(
            `${colors.gray}[${this.timestamp()}]${colors.reset} ` +
            `${colors.cyan}API${colors.reset}   ` +
            `${colors.bright}${method.padEnd(6)}${colors.reset} ` +
            `${path.padEnd(30)} ` +
            `${statusColor}${status}${colors.reset} ` +
            `${durationColor}${duration}ms${colors.reset}`
        );
    }
    
    static header(text) {
        const width = 60;
        const padding = Math.max(0, Math.floor((width - text.length - 2) / 2));
        const line = '─'.repeat(width);
        
        console.log('\n' + colors.cyan + '┌' + line + '┐' + colors.reset);
        console.log(colors.cyan + '│' + colors.reset + ' '.repeat(padding) + colors.bright + text + colors.reset + ' '.repeat(width - padding - text.length - 2) + colors.cyan + '│' + colors.reset);
        console.log(colors.cyan + '└' + line + '┘' + colors.reset);
    }
    
    static table(data) {
        console.table(data);
    }
}

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
    const startTime = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        Logger.api(req.method, req.path, res.statusCode, duration);
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
    static async fetchKML(url, retries = 3) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await axios.get(url, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 10000
                });
                
                if (response.status !== 200) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                return response.data;
            } catch (error) {
                if (attempt === retries) {
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }
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
            Logger.verbose(`Using cached data for ${category} outages`);
            return cached;
        }
        
        const url = Config.urls.KML[category];
        if (!url) {
            throw new Error(`Unknown outage category: ${category}`);
        }
        
        try {
            const kmlText = await this.fetchKML(url);
            const outages = this.parseKML(kmlText, category);
            outageCache.set(cacheKey, outages);
            Logger.verbose(`Fetched ${outages.length} ${category} outages`);
            return outages;
        } catch (error) {
            Logger.error(`Failed to fetch ${category} outages:`, error.message);
            throw error;
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
            Logger.error('Failed to fetch current outages:', results[0].reason.message);
            errors.push({ category: 'current', error: results[0].reason.message });
        }
        if (results[1].status === 'rejected') {
            Logger.error('Failed to fetch future outages:', results[1].reason.message);
            errors.push({ category: 'future', error: results[1].reason.message });
        }
        if (results[2].status === 'rejected') {
            Logger.error('Failed to fetch cancelled outages:', results[2].reason.message);
            errors.push({ category: 'cancelled', error: results[2].reason.message });
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

        res.json({
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
        });

    } catch (error) {
        Logger.error('Error in /api/outages:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
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

// RainViewer Radar endpoints
app.get('/api/radar/frames', (req, res) => {
    try {
        const frames = rainViewerService.getFrames();
        const status = rainViewerService.getStatus();
        const config = rainViewerService.getConfig();
        res.json({
            success: true,
            frames,
            status,
            config,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        Logger.error('Error getting radar frames:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/radar/status', (req, res) => {
    try {
        const status = rainViewerService.getStatus();
        res.json({
            success: true,
            ...status,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
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

// In-memory radar tile cache for performance (stores last 500 tiles)
const radarTileCache = new Map();
const MAX_RADAR_TILE_CACHE_SIZE = 500;
const RADAR_TILE_CACHE_DURATION = 3600000; // 1 hour in milliseconds

function getRadarTileCacheKey(timestamp, z, x, y) {
    return `${timestamp}_${z}_${x}_${y}`;
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

// RainViewer tile proxy (server-side fetch to avoid CORS) with aggressive caching
app.get('/api/radar/tile/:timestamp/:z/:x/:y', async (req, res) => {
    const { timestamp, z, x, y } = req.params;
    const cacheKey = getRadarTileCacheKey(timestamp, z, x, y);

    // Check in-memory cache first
    const cachedTile = getFromRadarTileCache(cacheKey);
    if (cachedTile) {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('X-Cache', 'HIT');
        return res.send(cachedTile);
    }

    // RainViewer tile URL format:
    // https://tilecache.rainviewer.com/v2/radar/{timestamp}/{tileSize}/{z}/{x}/{y}/{color}/{smooth}_{snow}.png
    // color: 0 = original, 1-8 = various color schemes (we'll use 2 for similar to BoM colors)
    // smooth: 0 = no smoothing, 1 = smooth
    // snow: 0 = ignore snow, 1 = show snow
    const rainViewerUrl = `https://tilecache.rainviewer.com/v2/radar/${timestamp}/256/${z}/${x}/${y}/2/1_1.png`;

    try {
        Logger.verbose(`[RADAR TILE] Cache MISS - Fetching ${z}/${x}/${y} for timestamp ${timestamp}`);

        const response = await axios.get(rainViewerUrl, {
            responseType: 'arraybuffer',
            timeout: 5000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'image/png,image/*',
                'Referer': 'https://www.rainviewer.com/'
            },
            validateStatus: (status) => status === 200
        });

        // Cache the tile in memory for faster subsequent requests
        addToRadarTileCache(cacheKey, response.data);

        // Set headers
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
        res.setHeader('Access-Control-Allow-Origin', '*'); // Allow CORS
        res.setHeader('X-Cache', 'MISS');

        // Send the image buffer
        res.send(response.data);
        Logger.verbose(`[RADAR TILE] Success ${z}/${x}/${y} - Cached for future requests`);

    } catch (error) {
        // Log error details (throttled, but suppress expected 403s at high zoom)
        // RainViewer radar tiles are limited to zoom 10, so 403s at zoom 11+ are expected
        const isExpectedZoomError = error.response && error.response.status === 403 && parseInt(z) >= 11;

        if (error.code === 'ECONNREFUSED') {
            Logger.error(`[RADAR TILE] Connection refused to RainViewer for tile ${z}/${x}/${y}`);
        } else if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
            Logger.warn(`[RADAR TILE] Timeout fetching tile ${z}/${x}/${y}`);
        } else if (error.response) {
            if (isExpectedZoomError) {
                // Only log once as verbose, not error - this is expected behavior
                Logger.verbose(`[RADAR TILE] Tile not available at zoom ${z} (RainViewer limit is zoom 10)`);
            } else {
                Logger.error(`[RADAR TILE] HTTP ${error.response.status} for tile ${z}/${x}/${y} - URL: ${rainViewerUrl}`);
            }
        } else {
            Logger.error(`[RADAR TILE] Error for tile ${z}/${x}/${y}: ${error.message}`);
        }

        // IMPORTANT: Return a transparent PNG instead of JSON
        // This prevents browser errors and allows map to render
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=60'); // Short cache for errors
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(200); // Return 200 with transparent tile, not an error status
        res.send(TRANSPARENT_PNG_1x1);
    }
});

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
        res.json(floodData);
    } catch (error) {
        Logger.error('Error in flood-data endpoint:', error.message);
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
        res.json(riverHeightData);
    } catch (error) {
        Logger.error('Error in river-data endpoint:', error.message);
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
        Logger.info('Checking cyclone image availability...');
        const imageUrl = 'https://www.bom.gov.au/fwo/IDQ65001.png';

        const response = await axios.head(imageUrl, {
            headers: Config.headers.browser,
            validateStatus: null,
            timeout: 5000
        });

        const available = response.status === 200;
        Logger.info(`Cyclone image ${available ? 'available' : 'not available'} (HTTP ${response.status})`);

        res.json({
            available,
            status: response.status,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        Logger.info('Cyclone image not available (connection error)');
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
            return res.status(response.status).send(`Error: ${response.status}`);
        }

        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'public, max-age=60');
        res.send(response.data);
    } catch (error) {
        Logger.error('Error fetching cyclone image:', error.message);
        res.status(500).send('Error fetching cyclone image');
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

async function initializeServer() {
    Logger.header('LISMORE FLOOD DASHBOARD SERVER');

    try {
        await FileUtils.ensureDirectory(Config.paths.RESOURCES_DIR);
        Logger.success('Directory structure verified');

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
            console.log('');
            Logger.success(`Server running on port ${PORT}`);
            Logger.info(`Dashboard: http://localhost:${PORT}`);
            Logger.info(`API Base: http://localhost:${PORT}/api`);
            console.log('');
            Logger.success(`✓ IMPORTANT: Open http://localhost:${PORT} in your browser`);
            Logger.warn(`  Do NOT open the HTML files directly from the file system`);
            console.log('');
            Logger.table([
                { Endpoint: '/api/outages', Description: 'Power outage data' },
                { Endpoint: '/api/radar/frames', Description: 'Radar animation frames' },
                { Endpoint: '/api/radar/tile/...', Description: 'Radar tile proxy' },
                { Endpoint: '/flood-data', Description: 'Current flood levels' },
                { Endpoint: '/river-data', Description: 'River height history' },
                { Endpoint: '/status', Description: 'Server health check' }
            ]);
            console.log('');
            Logger.info('Server initialization complete');
            Logger.info('Press Ctrl+C to stop the server');
            console.log(`${colors.gray}${'─'.repeat(60)}${colors.reset}\n`);
        });

        // Handle port binding errors
        server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                Logger.error(`Port ${PORT} is already in use!`);
                Logger.info('Solutions:');
                Logger.info(`  1. Stop the process using port ${PORT}`);
                Logger.info('  2. Or use a different port: set PORT=3001 && node server.js');
                console.log('');
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
            console.log('');
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
