const axios = require('axios');
const NodeCache = require('node-cache');
const { XMLParser } = require('fast-xml-parser');
const { Logger } = require('../utils/logger');
const { Config } = require('../config/config');
const DateUtils = require('../utils/dateUtils');

const OUTAGE_CACHE_TTL = 60;
const outageCache = new NodeCache({ stdTTL: OUTAGE_CACHE_TTL, useClones: false });

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

class OutageService {
    static getCache() {
        return outageCache;
    }

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
                    timeout: 30000,
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

module.exports = OutageService;
