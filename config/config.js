const path = require('path');
require('dotenv').config(); // Load env vars

const radarStations = require('./radarStations.json');

const Config = {
    paths: {
        RESOURCES_DIR: path.join(__dirname, '../public/resources/Rain Radar')
    },
    
    urls: {
        RADAR_BASE: process.env.RADAR_BASE || 'https://reg.bom.gov.au',
        BOM_BASE: process.env.BOM_BASE || 'https://www.bom.gov.au',
        BOM_FLOOD_WARNING: process.env.BOM_FLOOD_WARNING || 'https://www.bom.gov.au/cgi-bin/wrap_fwo.pl?IDN60140.html',
        
        KML: {
            current: process.env.KML_CURRENT || 'https://www.essentialenergy.com.au/Assets/kmz/current.kml',
            future: process.env.KML_FUTURE || 'https://www.essentialenergy.com.au/Assets/kmz/future.kml',
            cancelled: process.env.KML_CANCELLED || 'https://www.essentialenergy.com.au/Assets/kmz/cancelled.kml'
        }
    },
    
    radarStations: radarStations,

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

module.exports = { Config, FloodConfig };