const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { Logger } = require('../utils/logger');
const { Config } = require('../config/config');

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
}

module.exports = RadarService;
