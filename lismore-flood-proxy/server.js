const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const VERBOSE_LOGGING = process.env.VERBOSE_LOGGING === 'true' || false;

function logInfo(message, ...args) {
    console.log(message, ...args);
}

function logVerbose(message, ...args) {
    if (VERBOSE_LOGGING) {
        console.log(message, ...args);
    }
}

function logError(message, ...args) {
    console.error('ERROR:', message, ...args);
}

app.use(cors());

app.use(express.static(path.join(__dirname, 'public')));

const RESOURCES_DIR = path.join(__dirname, '/public/resources/Rain Radar');
if (!fs.existsSync(RESOURCES_DIR)) {
    fs.mkdirSync(RESOURCES_DIR, { recursive: true });
}

app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString()
  });
});

app.get('/cleanup-radar', (req, res) => {
  try {
    cleanupRadarImages();
    res.json({
      success: true,
      message: 'Radar images cleaned successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error cleaning radar images',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🌊  Lismore Flood Dashboard Server');
  console.log('='.repeat(60));
  console.log(`✓ Server running on port ${PORT}`);
  console.log(`✓ Dashboard: http://localhost:${PORT}`);
  console.log(`✓ API: http://localhost:${PORT}/api/flood-data`);
  console.log('='.repeat(60) + '\n');
});

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://reg.bom.gov.au/products/IDR282.loop.shtml'
};

const RADAR_BASE_URL = 'https://reg.bom.gov.au';

function cleanupRadarImages() {
  try {
    if (!fs.existsSync(RESOURCES_DIR)) {
      return;
    }

    const files = fs.readdirSync(RESOURCES_DIR);
    let deletedCount = 0;

    files.forEach(file => {
      if (file.startsWith('radar_') || file.match(/IDR[0-9]{3}\.(background|topography|locations|range)\.png$/)) {
        const filePath = path.join(RESOURCES_DIR, file);
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    });

    if (deletedCount > 0) {
      logVerbose(`Cleaned ${deletedCount} old radar images`);
    }
  } catch (error) {
    console.error('Error cleaning radar images:', error.message);
  }
}

async function downloadLegendOnStartup() {
  const imageUrl = `${RADAR_BASE_URL}/products/radar_transparencies/IDR.legend.0.png`;
  const resourceFile = path.join(RESOURCES_DIR, 'Legend.png');

  if (fs.existsSync(resourceFile)) {
    return;
  }

  try {
    console.log('Downloading radar legend...');

    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      headers: BROWSER_HEADERS,
      validateStatus: null
    });

    if (response.status !== 200) {
      throw new Error(`Failed to fetch legend: HTTP ${response.status}`);
    }

    fs.writeFileSync(resourceFile, response.data);
    console.log('Legend downloaded\n');
  } catch (error) {
    console.error('Error downloading legend:', error.message);

    try {
      createFallbackLegend(resourceFile);
    } catch (err) {
      console.error('Failed to create fallback legend');
    }
  }
}

function createFallbackLegend(filePath) {
  const legendHtml = `
    <svg width="400" height="80" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="white"/>
      <text x="10" y="20" font-family="Arial" font-size="14">Radar Legend</text>
      <!-- Light to heavy rain gradient -->
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
  
  fs.writeFileSync(filePath, Buffer.from(legendHtml));
  console.log('Created fallback legend');
}

downloadLegendOnStartup();

app.get('/radar-proxy/*', async (req, res) => {
    try {
        const pathMatch = req.url.match(/\/radar-proxy(\/.+)/);

        if (!pathMatch || !pathMatch[1]) {
            return res.status(400).send('Invalid path format');
        }

        const imagePath = pathMatch[1];
        const imageUrl = `${RADAR_BASE_URL}${imagePath}`;

        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            headers: BROWSER_HEADERS,
            validateStatus: null,
            timeout: 10000
        });

        if (response.status !== 200) {
            console.error(`Radar image fetch failed: HTTP ${response.status}`);
            return res.status(response.status).send(`Error fetching radar image: ${response.status}`);
        }

        const resourceFile = path.join(RESOURCES_DIR, `radar_${encodeURIComponent(imagePath)}.png`);
        fs.writeFileSync(resourceFile, response.data);

        res.set('Content-Type', 'image/png');
        res.send(response.data);
    } catch (error) {
        console.error('Error fetching radar image:', error.message);
        res.status(500).send('Error fetching radar image');
    }
});

app.get('/map-proxy/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;

        if (!filename.match(/^IDR[0-9]{3}\.[a-z]+\.png$/)) {
            return res.status(400).send('Invalid filename format');
        }

        const imageUrl = `${RADAR_BASE_URL}/products/radar_transparencies/${filename}`;

        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            headers: BROWSER_HEADERS,
            validateStatus: null,
            timeout: 10000
        });

        if (response.status !== 200) {
            console.error(`Map layer fetch failed: HTTP ${response.status}`);
            return res.status(response.status).send(`Error fetching map layer: ${response.status}`);
        }

        const resourceFile = path.join(RESOURCES_DIR, filename);
        fs.writeFileSync(resourceFile, response.data);

        res.set('Content-Type', 'image/png');
        res.send(response.data);
    } catch (error) {
        console.error('Error fetching map layer:', error.message);
        res.status(500).send('Error fetching map layer');
    }
});

app.get('/public/resources/Rain Radar/Legend.png', (req, res) => {
  try {
    const resourceFile = path.join(RESOURCES_DIR, 'Legend.png');
    
    if (fs.existsSync(resourceFile)) {
      res.set('Content-Type', 'image/png');
      res.sendFile(resourceFile);
    } else {
      console.log('Legend file not found, attempting to download');
      downloadLegendOnStartup().then(() => {
        if (fs.existsSync(resourceFile)) {
          res.set('Content-Type', 'image/png');
          res.sendFile(resourceFile);
        } else {
          res.status(404).send('Legend not available');
        }
      }).catch(err => {
        res.status(500).send('Error fetching legend');
      });
    }
  } catch (error) {
    console.error('Error serving legend image:', error.message);
    res.status(500).send('Error serving legend image');
  }
});

app.get('/api/radar/:radarId', async (req, res) => {
    try {
        cleanupRadarImages();

        const radarId = req.params.radarId;
        if (!radarId.match(/^IDR[0-9]{3}$/)) {
            return res.status(400).json({ error: 'Invalid radar ID format' });
        }

        const loopUrl = `${RADAR_BASE_URL}/products/${radarId}.loop.shtml`;

        const response = await axios.get(loopUrl, {
            headers: BROWSER_HEADERS,
            validateStatus: null,
            timeout: 15000
        });

        if (response.status !== 200) {
            console.error(`Radar fetch failed for ${radarId}: HTTP ${response.status}`);
            return res.status(response.status).json({
                error: `Failed to fetch radar page: ${response.status}`
            });
        }

        const html = response.data;
        
        const regex = /theImageNames\s*=\s*new Array\(\);([\s\S]*?)nImages\s*=\s*([0-9]+);/;
        const match = html.match(regex);
        
        if (!match) {
            return res.status(404).json({ error: 'Could not find radar image data on the page' });
        }
        
        const imageArrayJs = match[1];
        const nImages = parseInt(match[2], 10);
        
        const imageFileRegex = /theImageNames\[([0-9]+)\]\s*=\s*"([^"]+)";/g;
        const images = [];
        let fileMatch;
        
        while ((fileMatch = imageFileRegex.exec(imageArrayJs)) !== null) {
            const index = parseInt(fileMatch[1], 10);
            const imagePath = fileMatch[2];
            
            const timestampMatch = imagePath.match(/\.(\d{12})\.png$/);
            let timestamp = new Date();
            
            if (timestampMatch) {
                const timestampStr = timestampMatch[1];
                const year = timestampStr.substring(0, 4);
                const month = parseInt(timestampStr.substring(4, 6)) - 1;
                const day = timestampStr.substring(6, 8);
                const hour = timestampStr.substring(8, 10);
                const minute = timestampStr.substring(10, 12);
                
                timestamp = new Date(Date.UTC(year, month, day, hour, minute));
            }
            
            images[index] = {
                url: `/radar-proxy${imagePath}`,
                originalUrl: `http://www.bom.gov.au${imagePath}`,
                timestamp: timestamp.toISOString()
            };
        }
        
        const $ = cheerio.load(html);
        const pageTitle = $('title').text();
        const radarName = pageTitle.split('Radar')[0].trim();
        
        const filteredImages = images.filter(img => img);
        
        filteredImages.sort((a, b) => {
            return new Date(a.timestamp) - new Date(b.timestamp);
        });
        
        const kmMatch = html.match(/Km\s*=\s*([0-9]+);/);
        const range = kmMatch ? `${kmMatch[1]}km` : '256km';

        console.log(`✓ Radar: ${radarId} (${filteredImages.length} images)`);

        res.json({
            id: radarId,
            name: radarName || radarId,
            range: range,
            images: filteredImages,
            lastUpdated: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error fetching radar data:', error.message);
        res.status(500).json({
            error: 'Failed to fetch radar data',
            details: error.message
        });
    }
});

app.get('/flood-data', async (req, res) => {
  try {
    const floodData = await fetchBomFloodData();
    res.json(floodData);
  } catch (error) {
    console.error('Error in flood-data endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing flood data',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/flood-data', async (req, res) => {
  try {
    cleanupRadarImages();
    
    const floodData = await fetchBomFloodData();

    res.json(floodData);
  } catch (error) {
    console.error('Error in flood data proxy endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching flood data',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

async function fetchBomFloodData() {
  const urls = [
    'http://www.bom.gov.au/cgi-bin/wrap_fwo.pl?IDN60140.html'
  ];

  let html = null;
  let successUrl = null;

  for (const url of urls) {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.bom.gov.au/',
          'Cache-Control': 'no-cache'
        },
        timeout: 10000,
        maxRedirects: 5
      });

      if (response.status === 200) {
        html = response.data;
        successUrl = url;
        break;
      }
    } catch (error) {
      logVerbose(`Failed to fetch from ${url}`);
    }
  }

  if (!html) {
    console.error('Could not fetch data from BOM');
    return {
      success: false,
      message: 'Could not fetch data from BOM website. Service may be temporarily unavailable.',
      timestamp: new Date().toISOString()
    };
  }

  const $ = cheerio.load(html);

  let riverData = [];

  const sectionHeaders = $('a[name="Wilsons_River"], a[name="Richmond_River"], th:contains("Wilsons River"), th:contains("Richmond River")');

  if (sectionHeaders.length > 0) {
    sectionHeaders.each((i, header) => {
      const section = $(header);
      const sectionName = section.text().trim() || 'River Section';
      
      let table = section.closest('table');
      if (!table.length) {
        table = section.closest('tr').parents('table').first();
      }
      
      if (table.length) {
        let currentRow = section.closest('tr').next();
        
        while (currentRow.length && !currentRow.find('th.rowlevel1').length) {
          const cells = currentRow.find('td');

          if (cells.length >= 4) {
            const location = cells.eq(0).text().trim();
            const time = cells.eq(2).text().trim();

            let waterLevelText = cells.eq(3).text().trim();
            let waterLevelMatch = waterLevelText.match(/(-?\d+\.\d+)/);
            let waterLevel = waterLevelMatch ? parseFloat(waterLevelMatch[1]) : null;

            const statusText = cells.eq(5).text().trim().toLowerCase();
            let status = 'steady';
            if (statusText.includes('rising')) status = 'rising';
            else if (statusText.includes('falling')) status = 'falling';

            riverData.push({
              location,
              time,
              waterLevel,
              status,
              floodCategory: determineFloodCategory(waterLevel, location)
            });
          }

          currentRow = currentRow.next();
        }
      }
    });
  }
  
  if (riverData.length === 0) {
    $('table').each((i, tableEl) => {
      const table = $(tableEl);

      if (table.find('tr').length < 3) return;

      table.find('tr').each((j, rowEl) => {
        if (j === 0) return;

        const cells = $(rowEl).find('td');

        if (cells.length >= 4) {
          const location = cells.eq(0).text().trim();

          if (location.toLowerCase().includes('wilson') ||
              location.toLowerCase().includes('richmond') ||
              location.toLowerCase().includes('lismore')) {

            const time = cells.eq(2).text().trim();

            let waterLevelText = cells.eq(3).text().trim();
            let waterLevelMatch = waterLevelText.match(/(-?\d+\.\d+)/);
            let waterLevel = waterLevelMatch ? parseFloat(waterLevelMatch[1]) : null;

            const statusText = cells.eq(5).text().trim().toLowerCase();
            let status = 'steady';
            if (statusText.includes('rising')) status = 'rising';
            else if (statusText.includes('falling')) status = 'falling';

            riverData.push({
              location,
              time,
              waterLevel,
              status,
              floodCategory: determineFloodCategory(waterLevel, location)
            });
          }
        }
      });
    });
  }

  if (riverData.length === 0) {
    console.error('No river data found in BOM page');
    return {
      success: false,
      message: 'No river data found in BOM website. Structure may have changed.',
      timestamp: new Date().toISOString()
    };
  }

  const filteredData = riverData.filter(item => ALLOWED_LOCATIONS.includes(item.location));

  if (filteredData.length === 0 && riverData.length > 0) {
    console.error('No locations matched filter. Sample locations from BOM:');
    riverData.slice(0, 5).forEach(item => {
      console.error(`   "${item.location}"`);
    });
  } else {
    console.log(`✓ Flood data: ${filteredData.length} locations`);
  }

  return {
    success: true,
    timestamp: new Date().toISOString(),
    data: filteredData,
    source: successUrl
  };
}

const ALLOWED_LOCATIONS = [
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
];

async function calculateTrendStatus(location) {
  try {
    const historicalData = await fetchRiverHeightData(location);

    if (!historicalData.success || !historicalData.data || historicalData.data.length < 3) {
      return 'steady';
    }

    const numPoints = Math.min(10, historicalData.data.length);
    const recentPoints = historicalData.data.slice(0, numPoints);

    const levels = recentPoints.map(point => point.height).filter(level => level !== null && !isNaN(level));

    if (levels.length < 3) {
      return 'steady';
    }

    const firstLevel = levels[levels.length - 1];
    const lastLevel = levels[0];
    const totalChange = lastLevel - firstLevel;

    let sumChanges = 0;
    let changeCount = 0;
    for (let i = 0; i < levels.length - 1; i++) {
      const change = levels[i] - levels[i + 1];
      sumChanges += change;
      changeCount++;
    }
    const avgChange = sumChanges / changeCount;

    const STEADY_THRESHOLD = 0.02;

    if (Math.abs(avgChange) < STEADY_THRESHOLD && Math.abs(totalChange) < STEADY_THRESHOLD * 2) {
      return 'steady';
    } else if (avgChange > 0 || totalChange > 0) {
      return 'rising';
    } else {
      return 'falling';
    }

  } catch (error) {
    console.error(`Error calculating trend: ${error.message}`);
    return 'steady';
  }
}

const officialClassificationLocations = [
  "Wilsons R at Eltham",
  "Wilsons R at Lismore (mAHD)",
  "Leycester Ck at Rock Valley",
  "Coopers Ck at Corndale",
];

const floodLevelThresholds = {
  "Wilsons R at Eltham": { minor: 6.00, moderate: 8.20, major: 9.60 },
  "Wilsons R at Lismore (mAHD)": { minor: 4.20, moderate: 7.20, major: 9.70 },
  "Leycester Ck at Rock Valley": { minor: 6.00, moderate: 8.00, major: 9.00 },
  "Coopers Ck at Corndale": { minor: 6.00, moderate: 7.50, major: 9.50 },
};

function determineFloodCategory(level, location) {
  if (!location || !officialClassificationLocations.includes(location)) {
    return "N/A";
  }
  
  if (!level) return 'Unknown';
  
  const thresholds = floodLevelThresholds[location];
  
  if (!thresholds) {
    console.error(`Missing thresholds for official location: ${location}`);
    return 'Unknown';
  }
  
  if (level >= thresholds.major) return 'Major';
  if (level >= thresholds.moderate) return 'Moderate';
  if (level >= thresholds.minor) return 'Minor';
  return 'No flooding';
}

app.get('/river-data', async (req, res) => {
  try {
    const location = req.query.location;
    if (!location) {
      return res.status(400).json({
        success: false,
        message: 'Location parameter is required'
      });
    }
    
    const riverHeightData = await fetchRiverHeightData(location);
    res.json(riverHeightData);
  } catch (error) {
    console.error('Error in river-data endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing river height data',
      error: error.toString()
    });
  }
});

app.get('/api/river-height', async (req, res) => {
  try {
    const location = req.query.location;
    
    if (!location) {
      return res.status(400).json({
        success: false,
        message: 'Location parameter is required'
      });
    }
    
    const riverHeightData = await fetchRiverHeightData(location);
    
    res.json(riverHeightData);
  } catch (error) {
    console.error('Error in river height proxy endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing river height data',
      error: error.toString()
    });
  }
});

app.get('/api/flood-properties', (req, res) => {
  const floodDataPath = path.join(__dirname, 'public', 'flood-data.json');
  
  try {
    if (fs.existsSync(floodDataPath)) {
      const data = fs.readFileSync(floodDataPath, 'utf8');
      res.json(JSON.parse(data));
    } else {
      res.status(404).json({ error: 'Flood data file not found' });
    }
  } catch (error) {
    console.error('Error reading flood data:', error);
    res.status(500).json({ error: 'Failed to load flood data' });
  }
});

async function fetchRiverHeightData(location) {
  const floodWarningUrl = 'http://www.bom.gov.au/cgi-bin/wrap_fwo.pl?IDN60140.html';

  try {
    const response = await axios.get(floodWarningUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      },
      timeout: 10000
    });

    if (response.status !== 200) {
      throw new Error(`Failed to fetch flood data page: ${response.status}`);
    }

    const $ = cheerio.load(response.data);

    let tableUrl = null;
    let exactLocationMatch = false;

    $('tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length > 0) {
        const locationCell = $(cells[0]);
        const locationText = locationCell.text().trim();

        if (locationText === location ||
            locationText.replace(/\s+/g, ' ') === location.replace(/\s+/g, ' ')) {

          exactLocationMatch = true;

          $(row).find('a').each((j, link) => {
            const linkText = $(link).text().trim();
            if (linkText === 'Table') {
              tableUrl = $(link).attr('href');
              if (!tableUrl.startsWith('http')) {
                tableUrl = 'http://www.bom.gov.au' + tableUrl;
              }
              return false;
            }
          });

          if (tableUrl) return false;
        }
      }
    });

    if (!tableUrl) {
      console.error(`No table URL found for: "${location}"`);
      return {
        success: false,
        message: 'Could not find table URL for the exact location: ' + location,
        suggestion: 'Location name may be different in BOM data'
      };
    }

    const tableResponse = await axios.get(tableUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      },
      timeout: 10000
    });
    
    if (tableResponse.status !== 200) {
      throw new Error(`Failed to fetch table data: ${tableResponse.status}`);
    }
    
    const tableHtml = cheerio.load(tableResponse.data);
    let riverData = [];

    const preContent = tableHtml('pre').text();
    if (preContent && preContent.trim().length > 0) {
      const lines = preContent.split('\n');
      
      for (const line of lines) {
        const match = line.match(/(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2})\s+(\d+\.\d+)/);
        if (match) {
          const timeStr = match[1];
          const heightStr = match[2];
          
          const height = parseFloat(heightStr);
          if (!isNaN(height)) {
            riverData.push({
              time: timeStr,
              height: height
            });
          }
        }
      }
    }
    
    if (riverData.length === 0) {
      const tableSelectors = [
        'table#tableStyle1',
        'table.tableStyle1',
        'table.tabledata',
        'table'
      ];

      for (const selector of tableSelectors) {
        const matchingTables = tableHtml(selector);

        matchingTables.each((i, table) => {
          tableHtml(table).find('tr').each((j, row) => {
            const headers = tableHtml(row).find('th');
            if (headers.length >= 2) {
              return;
            }

            const cells = tableHtml(row).find('td');
            if (cells.length >= 2) {
              const timeStr = tableHtml(cells[0]).text().trim();
              const heightStr = tableHtml(cells[1]).text().trim();

              if (timeStr.match(/\d{2}\/\d{2}\/\d{4}/) || timeStr.match(/\d{2}:\d{2}/)) {
                const height = parseFloat(heightStr);
                if (!isNaN(height)) {
                  riverData.push({
                    time: timeStr,
                    height: height
                  });
                }
              }
            }
          });
        });

        if (riverData.length > 0) {
          break;
        }
      }
    }

    if (riverData.length === 0) {
      console.error(`No river data found for: "${location}"`);
      return {
        success: false,
        message: 'No river data found in table response',
        tableUrlUsed: tableUrl
      };
    }

    return {
      success: true,
      location: location,
      data: riverData,
      tableUrl: tableUrl
    };

  } catch (error) {
    console.error('Error fetching river height data:', error.message);
    return {
      success: false,
      message: error.message,
      details: error.stack
    };
  }
}
