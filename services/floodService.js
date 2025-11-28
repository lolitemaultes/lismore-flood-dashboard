const axios = require('axios');
const cheerio = require('cheerio');
const { Logger } = require('../utils/logger');
const { Config, FloodConfig } = require('../config/config');

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

module.exports = FloodService;
