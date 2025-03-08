const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// More detailed CORS configuration
app.use(cors({
  origin: '*', // Allow all origins for now
  methods: ['GET'], // Only allow GET requests
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400 // Cache preflight response for 24 hours
}));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// API route for flood data
app.get('/flood-data', async (req, res) => {
  try {
    // Try multiple possible URLs for the BOM flood data
    const urls = [
      'http://www.bom.gov.au/nsw/flood/northern.shtml',
      'http://www.bom.gov.au/nsw/warnings/flood/northern-rivers.shtml',
      'http://www.bom.gov.au/nsw/flood/richmond-wilsons.shtml',
      'http://www.bom.gov.au/cgi-bin/wrap_fwo.pl?IDN60140.html' // This might be the current endpoint
    ];
    
    let html = null;
    let successUrl = null;
    
    console.log('Attempting to fetch BOM data from multiple possible URLs...');

    // Proxy for radar images
    app.get('/proxy/radar', async (req, res) => {
      try {
        const timestamp = req.query.t || new Date().getTime();
        const response = await axios.get(`https://www.bom.gov.au/radar/IDR282.gif?t=${timestamp}`, {
          responseType: 'arraybuffer',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.bom.gov.au/',
            'Origin': 'https://www.bom.gov.au'
          },
          timeout: 10000
        });
        
        res.set('Content-Type', 'image/gif');
        res.set('Cache-Control', 'public, max-age=60'); // Cache for 60 seconds
        res.send(response.data);
      } catch (error) {
        console.error('Error proxying radar image:', error.message);
        // Return a fallback image or error response
        res.status(500).send('Error fetching radar image: ' + error.message);
      }
    });
    
    // Proxy for cyclone map
    app.get('/proxy/cyclone', async (req, res) => {
      try {
        const timestamp = req.query.t || new Date().getTime();
        const response = await axios.get(`https://www.bom.gov.au/fwo/IDQ65001.png?t=${timestamp}`, {
          responseType: 'arraybuffer',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.bom.gov.au/',
            'Origin': 'https://www.bom.gov.au'
          },
          timeout: 10000
        });
        
        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'public, max-age=60'); // Cache for 60 seconds
        res.send(response.data);
      } catch (error) {
        console.error('Error proxying cyclone image:', error.message);
        // Return a fallback image or error response
        res.status(500).send('Error fetching cyclone image: ' + error.message);
      }
    });
    
    // Try each URL until one works
    for (const url of urls) {
      try {
        console.log(`Trying URL: ${url}`);
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
          console.log(`Successfully fetched data from: ${url}`);
          break;
        }
      } catch (error) {
        console.log(`Failed to fetch from ${url}: ${error.message}`);
      }
    }
    
    // If we couldn't fetch from any URL, return error
    if (!html) {
      console.log('Could not fetch data from any BOM URL');
      return res.status(503).json({
        success: false,
        message: 'Could not fetch data from BOM website. Service may be temporarily unavailable.',
        timestamp: new Date().toISOString()
      });
    }
    
    // Parse the HTML to extract river data
    console.log('Parsing HTML from BOM website...');
    const $ = cheerio.load(html);
    
    // Initialize array for river data
    let riverData = [];
    
    // First attempt: Look for Wilson/Richmond river section specifically
    console.log('Looking for Wilsons River section...');
    const sectionHeaders = $('a[name="Wilsons_River"], a[name="Richmond_River"], th:contains("Wilsons River"), th:contains("Richmond River")');
    
    if (sectionHeaders.length > 0) {
      console.log('Found river section headers');
      
      // For each river section, extract data
      sectionHeaders.each((i, header) => {
        const section = $(header);
        const sectionName = section.text().trim() || 'River Section';
        console.log(`Processing section: ${sectionName}`);
        
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
              const time = cells.eq(1).text().trim();
              
              // Parse water level
              let waterLevelText = cells.eq(2).text().trim();
              const waterLevelMatch = waterLevelText.match(/(\d+\.\d+)/);
              const waterLevel = waterLevelMatch ? parseFloat(waterLevelMatch[1]) : null;
              
              // Parse status
              const statusText = cells.eq(3).text().trim().toLowerCase();
              let status = 'steady';
              if (statusText.includes('rising')) status = 'rising';
              else if (statusText.includes('falling')) status = 'falling';
              
              // Add to data array
              riverData.push({
                location,
                time,
                waterLevel,
                status,
                floodCategory: determineFloodCategory(waterLevel)
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
              
              const time = cells.eq(1).text().trim();
              
              // Parse water level
              let waterLevelText = cells.eq(2).text().trim();
              const waterLevelMatch = waterLevelText.match(/(\d+\.\d+)/);
              const waterLevel = waterLevelMatch ? parseFloat(waterLevelMatch[1]) : null;
              
              // Parse status
              const statusText = cells.eq(3).text().trim().toLowerCase();
              let status = 'steady';
              if (statusText.includes('rising')) status = 'rising';
              else if (statusText.includes('falling')) status = 'falling';
              
              riverData.push({
                location,
                time,
                waterLevel,
                status,
                floodCategory: determineFloodCategory(waterLevel)
              });
            }
          }
        });
      });
    }
    
    // If we still don't have data, return an error
    if (riverData.length === 0) {
      console.log('No river data found in BOM page');
      return res.status(404).json({
        success: false,
        message: 'No river data found in BOM website. Structure may have changed.',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`Found ${riverData.length} river data entries`);
    
    // Send the data as JSON
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: riverData,
      source: successUrl
    });
    
  } catch (error) {
    console.error('Error in flood-data endpoint:', error);
    
    // Return error information
    res.status(500).json({
      success: false,
      message: 'Error processing flood data',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Determine flood category based on water level
function determineFloodCategory(level) {
  if (!level) return 'Unknown';
  
  if (level >= 9.70) return 'Major';
  if (level >= 7.20) return 'Moderate';
  if (level >= 4.20) return 'Minor';
  return 'No flooding';
}

// Status route to check if the server is running
app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString()
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Flood data proxy server running on port ${PORT}`);
  console.log(`Dashboard available at http://localhost:${PORT}`);
  console.log(`API available at http://localhost:${PORT}/flood-data`);
  console.log(`Public directory path: ${path.join(__dirname, 'public')}`);
});
