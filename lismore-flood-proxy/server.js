const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Logging configuration - set to false to reduce verbose output
const VERBOSE_LOGGING = process.env.VERBOSE_LOGGING === 'true' || false;

// Helper logging functions
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

// Enable CORS for all routes
app.use(cors());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Create a resources directory if it doesn't exist for radar resources
const RESOURCES_DIR = path.join(__dirname, '/public/resources/Rain Radar');
if (!fs.existsSync(RESOURCES_DIR)) {
    fs.mkdirSync(RESOURCES_DIR, { recursive: true });
}

// Status route to check if the server is running
app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString()
  });
});

// Add a dedicated cleanup endpoint - this could be called by the frontend
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

// Start the server
app.listen(PORT, () => {
  logInfo(`Flood dashboard server running on port ${PORT}`);
  logInfo(`Dashboard available at http://localhost:${PORT}`);
  logInfo(`API available at http://localhost:${PORT}/api/flood-data`);
  logVerbose(`Public directory path: ${path.join(__dirname, 'public')}`);
});

// Browser-like headers to avoid being blocked
const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://reg.bom.gov.au/products/IDR282.loop.shtml'
};

// Radar configuration - updated to new BOM domain
const RADAR_BASE_URL = 'https://reg.bom.gov.au';

// Function to clean up old radar images
function cleanupRadarImages() {
  try {
    logVerbose('Cleaning up old radar images...');

    // Check if the directory exists first
    if (!fs.existsSync(RESOURCES_DIR)) {
      logVerbose('Resources directory does not exist yet, nothing to clean');
      return;
    }

    // Read all files in the directory
    const files = fs.readdirSync(RESOURCES_DIR);

    // Count for logging
    let deletedCount = 0;

    // Filter and delete radar image files
    files.forEach(file => {
      // Only delete files that match radar image naming pattern
      // This keeps the legend.png and other non-radar files
      if (file.startsWith('radar_') || file.match(/IDR[0-9]{3}\.(background|topography|locations|range)\.png$/)) {
        const filePath = path.join(RESOURCES_DIR, file);
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    });

    if (deletedCount > 0) {
      logVerbose(`Cleaned up ${deletedCount} radar image files`);
    }
  } catch (error) {
    logError('Error cleaning up radar images:', error.message);
  }
}

// Download the legend image at server startup
async function downloadLegendOnStartup() {
  const imageUrl = `${RADAR_BASE_URL}/products/radar_transparencies/IDR.legend.0.png`;
  const resourceFile = path.join(RESOURCES_DIR, 'Legend.png');

  // Check if legend already exists
  if (fs.existsSync(resourceFile)) {
    logVerbose('Legend file already exists, skipping download');
    return;
  }

  try {
    logInfo('Downloading radar legend...');

    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      headers: BROWSER_HEADERS,
      validateStatus: null
    });

    if (response.status !== 200) {
      throw new Error(`Failed to fetch legend ${imageUrl}: ${response.status}`);
    }

    // Store in resources directory
    fs.writeFileSync(resourceFile, response.data);
    logInfo('Legend downloaded successfully');
  } catch (error) {
    logError('Error downloading legend image:', error.message);

    // Create a simple fallback legend if download fails
    try {
      createFallbackLegend(resourceFile);
    } catch (err) {
      logError('Failed to create fallback legend:', err);
    }
  }
}

// Create a simple fallback legend if the download fails
function createFallbackLegend(filePath) {
  // This is a very simple fallback - you could create a better one with canvas
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
  
  // Convert SVG to PNG using a library or save as SVG
  fs.writeFileSync(filePath, Buffer.from(legendHtml));
  console.log('Created fallback legend');
}

// Download legend at startup
downloadLegendOnStartup();

// ====================== RADAR PROXY ROUTES ======================

// Proxy for BOM radar images
app.get('/radar-proxy/*', async (req, res) => {
    try {
        // Get the part after /radar-proxy/
        const pathMatch = req.url.match(/\/radar-proxy(\/.+)/);

        if (!pathMatch || !pathMatch[1]) {
            return res.status(400).send('Invalid path format');
        }

        const imagePath = pathMatch[1];
        const imageUrl = `${RADAR_BASE_URL}${imagePath}`;

        // Always fetch fresh data without caching
        logVerbose(`Fetching radar image: ${imagePath}`);

        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            headers: BROWSER_HEADERS,
            validateStatus: null,
            timeout: 10000
        });

        if (response.status !== 200) {
            logError(`Failed to fetch radar image ${imagePath}: ${response.status}`);
            return res.status(response.status).send(`Error fetching radar image: ${response.status}`);
        }

        // Store in resources directory but don't check for cache
        const resourceFile = path.join(RESOURCES_DIR, `radar_${encodeURIComponent(imagePath)}.png`);
        fs.writeFileSync(resourceFile, response.data);

        res.set('Content-Type', 'image/png');
        res.send(response.data);
    } catch (error) {
        logError('Error fetching radar image:', error.message);
        res.status(500).send('Error fetching radar image');
    }
});

// Proxy for map background layers with CORRECTED path
app.get('/map-proxy/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;

        // Make sure the filename is in the expected format to prevent attacks
        if (!filename.match(/^IDR[0-9]{3}\.[a-z]+\.png$/)) {
            return res.status(400).send('Invalid filename format');
        }

        // CORRECTED URL path for transparencies with new BOM domain
        const imageUrl = `${RADAR_BASE_URL}/products/radar_transparencies/${filename}`;

        logVerbose(`Fetching map layer: ${filename}`);

        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            headers: BROWSER_HEADERS,
            validateStatus: null,
            timeout: 10000
        });

        if (response.status !== 200) {
            logError(`Failed to fetch map layer ${filename}: ${response.status}`);
            return res.status(response.status).send(`Error fetching map layer: ${response.status}`);
        }

        // Store in resources directory
        const resourceFile = path.join(RESOURCES_DIR, filename);
        fs.writeFileSync(resourceFile, response.data);

        res.set('Content-Type', 'image/png');
        res.send(response.data);
    } catch (error) {
        logError('Error fetching map layer:', error.message);
        res.status(500).send('Error fetching map layer');
    }
});

// Updated legend route to serve the local file
app.get('/public/resources/Rain Radar/Legend.png', (req, res) => {
  try {
    const resourceFile = path.join(RESOURCES_DIR, 'Legend.png');
    
    if (fs.existsSync(resourceFile)) {
      // Set appropriate content type and send the file
      res.set('Content-Type', 'image/png');
      res.sendFile(resourceFile);
    } else {
      // If the file doesn't exist for some reason, try to download it
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

// Get the actual image filenames from the BOM loop page
app.get('/api/radar/:radarId', async (req, res) => {
    try {
        // Clean up old radar images first
        cleanupRadarImages();

        const radarId = req.params.radarId;
        // Make sure the radar ID is in the expected format
        if (!radarId.match(/^IDR[0-9]{3}$/)) {
            return res.status(400).json({ error: 'Invalid radar ID format' });
        }

        // Fetch the radar loop page to extract the image filenames
        const loopUrl = `${RADAR_BASE_URL}/products/${radarId}.loop.shtml`;
        logInfo(`Fetching radar data for ${radarId}...`);

        const response = await axios.get(loopUrl, {
            headers: BROWSER_HEADERS,
            validateStatus: null,
            timeout: 15000
        });

        if (response.status !== 200) {
            logError(`Failed to fetch radar page for ${radarId}: ${response.status}`);
            return res.status(response.status).json({
                error: `Failed to fetch radar page: ${response.status}`
            });
        }
        
        const html = response.data;
        
        // Extract the JavaScript array of image filenames
        const regex = /theImageNames\s*=\s*new Array\(\);([\s\S]*?)nImages\s*=\s*([0-9]+);/;
        const match = html.match(regex);
        
        if (!match) {
            return res.status(404).json({ error: 'Could not find radar image data on the page' });
        }
        
        const imageArrayJs = match[1];
        const nImages = parseInt(match[2], 10);
        
        // Parse the JavaScript array of image filenames
        const imageFileRegex = /theImageNames\[([0-9]+)\]\s*=\s*"([^"]+)";/g;
        const images = [];
        let fileMatch;
        
        while ((fileMatch = imageFileRegex.exec(imageArrayJs)) !== null) {
            const index = parseInt(fileMatch[1], 10);
            const imagePath = fileMatch[2];
            
            // Extract the timestamp from the filename
            const timestampMatch = imagePath.match(/\.(\d{12})\.png$/);
            let timestamp = new Date();
            
            if (timestampMatch) {
                const timestampStr = timestampMatch[1];
                // Parse YYYYMMDDHHNN format
                const year = timestampStr.substring(0, 4);
                const month = parseInt(timestampStr.substring(4, 6)) - 1; // JS months are 0-based
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
        
        // Get radar name and range from the page title
        const $ = cheerio.load(html);
        const pageTitle = $('title').text();
        const radarName = pageTitle.split('Radar')[0].trim();
        
        // Filter out any undefined elements in the array
        const filteredImages = images.filter(img => img);
        
        // Sort images by timestamp to ensure correct order
        filteredImages.sort((a, b) => {
            return new Date(a.timestamp) - new Date(b.timestamp);
        });
        
        // Extract Km range from the JavaScript
        const kmMatch = html.match(/Km\s*=\s*([0-9]+);/);
        const range = kmMatch ? `${kmMatch[1]}km` : '256km';
        
        logInfo(`Successfully fetched ${filteredImages.length} radar images for ${radarId}`);

        res.json({
            id: radarId,
            name: radarName || radarId,
            range: range,
            images: filteredImages,
            lastUpdated: new Date().toISOString()
        });
    } catch (error) {
        logError('Error fetching radar data:', error.message);
        res.status(500).json({
            error: 'Failed to fetch radar data',
            details: error.message
        });
    }
});

// ====================== FLOOD DATA ROUTES ======================

// Legacy route for compatibility
app.get('/flood-data', async (req, res) => {
  try {
    // Redirect to the new API endpoint
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

// New API endpoint for flood data
app.get('/api/flood-data', async (req, res) => {
  try {
    // Clean up old radar images whenever flood data is refreshed
    cleanupRadarImages();
    
    // Get the flood data using the existing function
    const floodData = await fetchBomFloodData();
    
    // Send the result back to the client
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

// Extract the data fetching logic to a separate function
async function fetchBomFloodData() {
  // Try multiple possible URLs for the BOM flood data
  const urls = [
    'http://www.bom.gov.au/cgi-bin/wrap_fwo.pl?IDN60140.html' // This might be the current endpoint
  ];

  let html = null;
  let successUrl = null;

  logVerbose('Fetching BOM flood data...');

  // Try each URL until one works
  for (const url of urls) {
    try {
      logVerbose(`Trying URL: ${url}`);
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.bom.gov.au/',
          'Cache-Control': 'no-cache'
        },
        timeout: 10000,
        maxRedirects: 5 // Limit redirect chain
      });

      if (response.status === 200) {
        html = response.data;
        successUrl = url;
        logVerbose(`Successfully fetched flood data`);
        break;
      }
    } catch (error) {
      logError(`Failed to fetch from ${url}:`, error.message);
    }
  }

  // If we couldn't fetch from any URL, return error
  if (!html) {
    logError('Could not fetch data from any BOM URL');
    return {
      success: false,
      message: 'Could not fetch data from BOM website. Service may be temporarily unavailable.',
      timestamp: new Date().toISOString()
    };
  }

  // Parse the HTML to extract river data
  logVerbose('Parsing flood data from BOM...');
  const $ = cheerio.load(html);

  // Initialize array for river data
  let riverData = [];

  // First attempt: Look for Wilson/Richmond river section specifically
  logVerbose('Looking for river sections...');
  const sectionHeaders = $('a[name="Wilsons_River"], a[name="Richmond_River"], th:contains("Wilsons River"), th:contains("Richmond River")');

  if (sectionHeaders.length > 0) {
    logVerbose('Found river section headers');

    // For each river section, extract data
    sectionHeaders.each((i, header) => {
      const section = $(header);
      const sectionName = section.text().trim() || 'River Section';
      logVerbose(`Processing section: ${sectionName}`);
      
      // Find the table containing the data
      let table = section.closest('table');
      if (!table.length) {
        table = section.closest('tr').parents('table').first();
      }
      
      if (table.length) {
        // Find all rows after the section header
        let currentRow = section.closest('tr').next();
        
        while (currentRow.length && !currentRow.find('th.rowlevel1').length) {
          const cells = currentRow.find('td');

          if (cells.length >= 4) {
            // Extract data from the row
            const location = cells.eq(0).text().trim();

            // Enhanced debug logging - show ALL cells for problem diagnosis
            if (VERBOSE_LOGGING && location.includes('Wilsons') && location.includes('Lismore')) {
              console.log(`\n========================================`);
              console.log(`PARSING ROW FOR: ${location}`);
              console.log(`Total cells in row: ${cells.length}`);
              for (let i = 0; i < cells.length; i++) {
                console.log(`  Cell ${i}: "${cells.eq(i).text().trim()}"`);
              }
              console.log(`========================================\n`);
            }

            // BOM table format: [Location, Auto/Manual, Time, Water Level, Unit/AHD, Status, ...]
            const time = cells.eq(2).text().trim(); // Cell 2 is the actual time

            // Parse water level - Cell 3 contains the water level (can be negative for AHD)
            let waterLevelText = cells.eq(3).text().trim();
            let waterLevelMatch = waterLevelText.match(/(-?\d+\.\d+)/); // Allow negative numbers
            let waterLevel = waterLevelMatch ? parseFloat(waterLevelMatch[1]) : null;

            if (VERBOSE_LOGGING && location.includes('Wilsons') && location.includes('Lismore')) {
              console.log(`Extracted: Time="${time}", WaterLevel=${waterLevel}m`);
            }

            // Parse status - typically in Cell 5
            const statusText = cells.eq(5).text().trim().toLowerCase();
            let status = 'steady';
            if (statusText.includes('rising')) status = 'rising';
            else if (statusText.includes('falling')) status = 'falling';

            // When creating riverData objects:
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
  
  // If we couldn't find data using the first method, try a more general approach
  if (riverData.length === 0) {
    console.log('Using general table parsing approach');
    
    // Find all tables that might contain river data
    $('table').each((i, tableEl) => {
      const table = $(tableEl);
      
      // Skip small tables
      if (table.find('tr').length < 3) return;
      
      table.find('tr').each((j, rowEl) => {
        // Skip the first row (headers)
        if (j === 0) return;
        
        const cells = $(rowEl).find('td');
        
        if (cells.length >= 4) {
          const location = cells.eq(0).text().trim();

          // Only include rows related to Wilsons or Richmond River
          if (location.toLowerCase().includes('wilson') ||
              location.toLowerCase().includes('richmond') ||
              location.toLowerCase().includes('lismore')) {

            // Enhanced debug logging for fallback parsing
            if (VERBOSE_LOGGING && location.includes('Wilsons') && location.includes('Lismore')) {
              console.log(`\n========================================`);
              console.log(`[FALLBACK] PARSING ROW FOR: ${location}`);
              console.log(`Total cells in row: ${cells.length}`);
              for (let i = 0; i < cells.length; i++) {
                console.log(`  Cell ${i}: "${cells.eq(i).text().trim()}"`);
              }
              console.log(`========================================\n`);
            }

            // BOM table format: [Location, Auto/Manual, Time, Water Level, Unit/AHD, Status, ...]
            const time = cells.eq(2).text().trim(); // Cell 2 is the actual time

            // Parse water level - Cell 3 contains the water level (can be negative for AHD)
            let waterLevelText = cells.eq(3).text().trim();
            let waterLevelMatch = waterLevelText.match(/(-?\d+\.\d+)/); // Allow negative numbers
            let waterLevel = waterLevelMatch ? parseFloat(waterLevelMatch[1]) : null;

            if (VERBOSE_LOGGING && location.includes('Wilsons') && location.includes('Lismore')) {
              console.log(`[FALLBACK] Extracted: Time="${time}", WaterLevel=${waterLevel}m`);
            }

            // Parse status - typically in Cell 5
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
  
  // If we still don't have data, return an error
  if (riverData.length === 0) {
    logError('No river data found in BOM page');
    return {
      success: false,
      message: 'No river data found in BOM website. Structure may have changed.',
      timestamp: new Date().toISOString()
    };
  }

  logInfo(`Fetched ${riverData.length} river height data points`);

  // Debug: Log all location names and water levels to see what we're getting from BOM
  if (VERBOSE_LOGGING) {
    console.log('\n========================================');
    console.log('ACTUAL LOCATION DATA FROM BOM:');
    console.log('========================================');
    riverData.forEach(item => {
      console.log(`Location: "${item.location}"`);
      console.log(`  Water Level: ${item.waterLevel}m`);
      console.log(`  Time: ${item.time}`);
      console.log(`  Status: ${item.status}`);
      console.log('');
    });
    console.log('ALLOWED LOCATIONS:');
    ALLOWED_LOCATIONS.forEach(loc => console.log(`  - "${loc}"`));
    console.log('========================================\n');
  }

  // Filter to only allowed locations
  const filteredData = riverData.filter(item => ALLOWED_LOCATIONS.includes(item.location));

  logInfo(`Filtered to ${filteredData.length} allowed locations`);

  // If no locations match, log a warning with the first few actual locations
  if (filteredData.length === 0 && riverData.length > 0) {
    logError('No locations matched filter! First 5 actual location names:');
    riverData.slice(0, 5).forEach(item => {
      console.error(`  - "${item.location}"`);
    });
  }

  // Use BOM's status directly (no trend calculation override)
  // BOM provides accurate rising/falling/steady status from their official data
  logInfo('Using BOM status directly from summary table');

  // Log the final data being returned
  if (VERBOSE_LOGGING) {
    console.log('\n========================================');
    console.log('FINAL DATA BEING RETURNED TO FRONTEND:');
    console.log('========================================');
    filteredData.forEach(item => {
      console.log(`Location: "${item.location}"`);
      console.log(`  Water Level: ${item.waterLevel}m`);
      console.log(`  Time: ${item.time}`);
      console.log(`  Status: ${item.status} (from BOM)`);
      console.log('');
    });
    console.log('========================================\n');
  }

  // Return the filtered data with BOM's official status
  return {
    success: true,
    timestamp: new Date().toISOString(),
    data: filteredData,
    source: successUrl
  };
}

// Define which locations to include in the dashboard
// Try multiple variations of location names that BOM might use
const ALLOWED_LOCATIONS = [
  // Wilsons River at Lismore - try all variations
  'Wilsons R at Lismore (mAHD)',
  'Wilsons River at Lismore (mAHD)',
  'Wilsons R at Lismore',
  'Wilsons River at Lismore',

  // Wilsons River at Eltham
  'Wilsons R at Eltham',
  'Wilsons River at Eltham',

  // Leycester Creek at Rock Valley
  'Leycester Ck at Rock Valley',
  'Leycester Creek at Rock Valley',

  // Coopers Creek at Corndale
  'Coopers Ck at Corndale',
  'Coopers Creek at Corndale',

  // Richmond River at Casino
  'Richmond R at Casino',
  'Richmond River at Casino',

  // Richmond River at Coraki
  'Richmond R at Coraki',
  'Richmond River at Coraki',

  // Wilsons River at Tuckurimba
  'Wilsons R at Tuckurimba',
  'Wilsons River at Tuckurimba'
];

// Helper function to calculate trend-based status from historical data
async function calculateTrendStatus(location) {
  try {
    logVerbose(`Calculating trend for: ${location}`);

    // Fetch historical data for this location
    const historicalData = await fetchRiverHeightData(location);

    if (!historicalData.success || !historicalData.data || historicalData.data.length < 3) {
      logVerbose(`Not enough data to calculate trend for ${location}`);
      return 'steady'; // Default to steady if we don't have enough data
    }

    // Get the last 5-10 data points (or as many as available)
    const numPoints = Math.min(10, historicalData.data.length);
    const recentPoints = historicalData.data.slice(0, numPoints);

    // Extract water levels (using 'height' property from fetchRiverHeightData)
    const levels = recentPoints.map(point => point.height).filter(level => level !== null && !isNaN(level));

    if (levels.length < 3) {
      return 'steady';
    }

    // Calculate the change between first and last point
    const firstLevel = levels[levels.length - 1]; // Oldest
    const lastLevel = levels[0]; // Most recent
    const totalChange = lastLevel - firstLevel;

    // Also calculate average change between consecutive points
    let sumChanges = 0;
    let changeCount = 0;
    for (let i = 0; i < levels.length - 1; i++) {
      const change = levels[i] - levels[i + 1];
      sumChanges += change;
      changeCount++;
    }
    const avgChange = sumChanges / changeCount;

    // Determine status based on thresholds
    // Use 0.02m (2cm) as the threshold for steady
    const STEADY_THRESHOLD = 0.02;

    if (Math.abs(avgChange) < STEADY_THRESHOLD && Math.abs(totalChange) < STEADY_THRESHOLD * 2) {
      return 'steady';
    } else if (avgChange > 0 || totalChange > 0) {
      return 'rising';
    } else {
      return 'falling';
    }

  } catch (error) {
    logError(`Error calculating trend for ${location}:`, error.message);
    return 'steady'; // Default to steady on error
  }
}

// Define which locations have official BoM flood classifications
const officialClassificationLocations = [
  "Wilsons R at Eltham",
  "Wilsons R at Lismore (mAHD)",
  "Leycester Ck at Rock Valley",
  "Coopers Ck at Corndale",
  // Add any other locations with official BoM classifications
];

// Define flood thresholds for specific locations
const floodLevelThresholds = {
  "Wilsons R at Eltham": { minor: 6.00, moderate: 8.20, major: 9.60 },
  "Wilsons R at Lismore (mAHD)": { minor: 4.20, moderate: 7.20, major: 9.70 },
  "Leycester Ck at Rock Valley": { minor: 6.00, moderate: 8.00, major: 9.00 },
  "Coopers Ck at Corndale": { minor: 6.00, moderate: 7.50, major: 9.50 },
};

// Updated function to check if a location has official classifications first
function determineFloodCategory(level, location) {
  // First check if this location has official classifications
  if (!location || !officialClassificationLocations.includes(location)) {
    return "N/A"; // No official classification
  }
  
  if (!level) return 'Unknown';
  
  // Get thresholds for this location
  const thresholds = floodLevelThresholds[location];
  
  // If we don't have specific thresholds for this official location,
  // we should log this as an error but still return something
  if (!thresholds) {
    console.error(`Missing thresholds for official location: ${location}`);
    return 'Unknown';
  }
  
  if (level >= thresholds.major) return 'Major';
  if (level >= thresholds.moderate) return 'Moderate';
  if (level >= thresholds.minor) return 'Minor';
  return 'No flooding';
}

// Legacy endpoint for river data
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

// New API endpoint for river height data
app.get('/api/river-height', async (req, res) => {
  try {
    // Get location parameter from the query string
    const location = req.query.location;
    
    if (!location) {
      return res.status(400).json({
        success: false,
        message: 'Location parameter is required'
      });
    }
    
    // Fetch the river height data
    const riverHeightData = await fetchRiverHeightData(location);
    
    // Return the data
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

// Serve flood property data
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

// Extract the river height data fetching logic to a separate function
async function fetchRiverHeightData(location) {
  logInfo(`\n========================================`);
  logInfo(`FETCHING RIVER HEIGHT DATA`);
  logInfo(`Requested location: "${location}"`);
  logInfo(`========================================`);

  const floodWarningUrl = 'http://www.bom.gov.au/cgi-bin/wrap_fwo.pl?IDN60140.html';

  try {
    logVerbose(`Fetching flood warning page...`);
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

    // Load the HTML content
    const $ = cheerio.load(response.data);

    // EXACT MATCHING: Use the exact location name to find the row
    logVerbose(`Searching for location: "${location}"`);

    let tableUrl = null;
    let exactLocationMatch = false;

    // Step 1: Look for exact location match in table rows
    $('tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length > 0) {
        const locationCell = $(cells[0]);
        const locationText = locationCell.text().trim();

        // Check if this is our exact location
        if (locationText === location ||
            // Handle slight variations like parentheses or small formatting differences
            locationText.replace(/\s+/g, ' ') === location.replace(/\s+/g, ' ')) {

          logInfo(`✓ Found location match: "${locationText}"`);
          exactLocationMatch = true;

          // Look for Table link in this row
          $(row).find('a').each((j, link) => {
            const linkText = $(link).text().trim();
            if (linkText === 'Table') {
              tableUrl = $(link).attr('href');
              if (!tableUrl.startsWith('http')) {
                tableUrl = 'http://www.bom.gov.au' + tableUrl;
              }
              logInfo(`✓ Found table URL: ${tableUrl}`);
              return false; // Break the inner loop
            }
          });

          if (tableUrl) return false; // Break the outer loop if we found the URL
        }
      }
    });

    // If we couldn't find an exact match, log this for debugging
    if (!exactLocationMatch) {
      logError(`Could not find location: "${location}"`);
      if (VERBOSE_LOGGING) {
        // List all location cells for debugging
        console.log('Available locations:');
        $('tr').each((i, row) => {
          const cells = $(row).find('td');
          if (cells.length > 0) {
            const locationText = $(cells[0]).text().trim();
            if (locationText) {
              console.log(`- "${locationText}"`);
            }
          }
        });
      }
    }

    // If we still can't find the URL after all these attempts
    if (!tableUrl) {
      logError('No table URL found for location');
      
      return {
        success: false,
        message: 'Could not find table URL for the exact location: ' + location,
        suggestion: 'Location name may be different in BOM data'
      };
    }
    
    logVerbose(`Fetching table data for ${location}...`);

    // Now fetch the actual table data
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
    
    // Parse the table data
    const tableHtml = cheerio.load(tableResponse.data);
    let riverData = [];
    
    // First try: Look for a pre tag which often contains the data
    const preContent = tableHtml('pre').text();
    if (preContent && preContent.trim().length > 0) {
      logVerbose('Found pre-formatted data');

      // Split by lines and parse each line
      const lines = preContent.split('\n');
      
      for (const line of lines) {
        // Match patterns like: 10/03/2025 12:44 7.77
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
    
    // If pre tag approach didn't work, try tables
    if (riverData.length === 0) {
      logVerbose('No data in pre tag, checking tables');

      // Try various table selectors - prioritize the specific BOM table format
      const tableSelectors = [
        'table#tableStyle1',      // Specific BOM table format
        'table.tableStyle1',       // Class-based variant
        'table.tabledata',         // Legacy format
        'table'                    // Generic fallback
      ];

      if (VERBOSE_LOGGING) {
        // Log all tables found for debugging
        console.log(`\nFound ${tableHtml('table').length} total tables on the page`);
        tableHtml('table').each((i, table) => {
          const tableId = tableHtml(table).attr('id') || 'no-id';
          const tableClass = tableHtml(table).attr('class') || 'no-class';
          const rowCount = tableHtml(table).find('tr').length;
          console.log(`  Table ${i}: id="${tableId}" class="${tableClass}" rows=${rowCount}`);
        });
      }

      for (const selector of tableSelectors) {
        const matchingTables = tableHtml(selector);
        if (matchingTables.length > 0) {
          logVerbose(`Trying selector: ${selector} (found ${matchingTables.length} tables)`);
        }

        matchingTables.each((i, table) => {
          let headerFound = false;

          tableHtml(table).find('tr').each((j, row) => {
            // Check if this is a header row
            const headers = tableHtml(row).find('th');
            if (headers.length >= 2) {
              const header1 = tableHtml(headers[0]).text().trim().toLowerCase();
              const header2 = tableHtml(headers[1]).text().trim().toLowerCase();

              // Verify this is the correct header format
              if ((header1.includes('date') || header1.includes('time')) &&
                  (header2.includes('water') || header2.includes('level'))) {
                headerFound = true;
                logVerbose(`Found table header: "${tableHtml(headers[0]).text().trim()}" | "${tableHtml(headers[1]).text().trim()}"`);
              }
              return; // Skip header row
            }

            // Process data rows
            const cells = tableHtml(row).find('td');
            if (cells.length >= 2) {
              const timeStr = tableHtml(cells[0]).text().trim();
              const heightStr = tableHtml(cells[1]).text().trim();

              if (VERBOSE_LOGGING && riverData.length < 3) {
                console.log(`  Row ${j}: time="${timeStr}" height="${heightStr}"`);
              }

              // Check if this looks like a time and height
              if (timeStr.match(/\d{2}\/\d{2}\/\d{4}/) || timeStr.match(/\d{2}:\d{2}/)) {
                const height = parseFloat(heightStr);
                if (!isNaN(height) && height > 0) {
                  riverData.push({
                    time: timeStr,
                    height: height  // Keep consistent with frontend expectations
                  });
                }
              }
            }
          });

          if (VERBOSE_LOGGING && riverData.length > 0) {
            console.log(`Extracted ${riverData.length} data points from this table`);
          }
        });

        if (riverData.length > 0) {
          logVerbose(`Successfully extracted data using selector: ${selector}`);
          break; // Stop if we found data
        }
      }
    }
    
    if (riverData.length === 0) {
      logError('No river data found in response');
      return {
        success: false,
        message: 'No river data found in table response',
        tableUrlUsed: tableUrl
      };
    }

    logInfo(`Extracted ${riverData.length} data points for ${location}`);

    // Log sample data for debugging - show FIRST and LAST entries
    if (VERBOSE_LOGGING && riverData.length > 0) {
      console.log(`\n========================================`);
      console.log(`DATA ORDER CHECK FOR: ${location}`);
      console.log(`Total points: ${riverData.length}`);
      console.log(`\nFIRST 3 data points (as parsed from table):`);
      riverData.slice(0, 3).forEach((point, idx) => {
        console.log(`  [${idx}] Time: ${point.time}, Height: ${point.height}`);
      });
      console.log(`\nLAST 3 data points (as parsed from table):`);
      riverData.slice(-3).forEach((point, idx) => {
        console.log(`  [${riverData.length - 3 + idx}] Time: ${point.time}, Height: ${point.height}`);
      });
      console.log(`========================================\n`);
    }

    return {
      success: true,
      location: location, // Return the EXACT location name that was requested
      data: riverData,
      tableUrl: tableUrl // Include the URL for debugging
    };

  } catch (error) {
    logError('Error fetching river height data:', error.message);
    return {
      success: false,
      message: error.message,
      details: error.stack
    };
  }
}
