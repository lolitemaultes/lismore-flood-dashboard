const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors());

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

// Updated river-data endpoint with exact name matching
app.get('/river-data', async (req, res) => {
  try {
    // Get location parameter from the query string
    const location = req.query.location;
    
    if (!location) {
      return res.status(400).json({
        success: false,
        message: 'Location parameter is required'
      });
    }
    
    console.log(`Fetching river height history for: "${location}"`);
    
    const floodWarningUrl = 'http://www.bom.gov.au/cgi-bin/wrap_fwo.pl?IDN60140.html';
    
    try {
      console.log(`Fetching main flood warning page: ${floodWarningUrl}`);
      const response = await axios.get(floodWarningUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache'
        }
      });
      
      if (response.status !== 200) {
        throw new Error(`Failed to fetch flood data page: ${response.status}`);
      }
      
      // Load the HTML content
      const $ = cheerio.load(response.data);
      
      // EXACT MATCHING: Use the exact location name to find the row
      console.log(`Searching for exact location match: "${location}"`);
      
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
            
            console.log(`Found exact location match: "${locationText}"`);
            exactLocationMatch = true;
            
            // Look for Table link in this row
            $(row).find('a').each((j, link) => {
              const linkText = $(link).text().trim();
              if (linkText === 'Table') {
                tableUrl = $(link).attr('href');
                if (!tableUrl.startsWith('http')) {
                  tableUrl = 'http://www.bom.gov.au' + tableUrl;
                }
                console.log(`Found Table link: ${tableUrl}`);
                return false; // Break the inner loop
              }
            });
            
            if (tableUrl) return false; // Break the outer loop if we found the URL
          }
        }
      });
      
      // If we couldn't find an exact match, log this for debugging
      if (!exactLocationMatch) {
        console.log(`Warning: Could not find exact match for location: "${location}"`);
        console.log('Listing all locations in the page for debugging:');
        
        // List all location cells for debugging
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
      
      // If we still can't find the URL after all these attempts
      if (!tableUrl) {
        console.log('No table URL found after exact matching attempt');
        
        return res.status(404).json({
          success: false,
          message: 'Could not find table URL for the exact location: ' + location,
          suggestion: 'Location name may be different in BOM data'
        });
      }
      
      console.log(`Fetching table data from: ${tableUrl}`);
      
      // Now fetch the actual table data
      const tableResponse = await axios.get(tableUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache'
        }
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
        console.log('Found pre-formatted data');
        
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
        console.log('No data found in pre tag, checking tables');
        
        // Try various table selectors
        const tableSelectors = ['table.tabledata', 'table'];
        
        for (const selector of tableSelectors) {
          tableHtml(selector).each((i, table) => {
            tableHtml(table).find('tr').each((j, row) => {
              const cells = tableHtml(row).find('td');
              if (cells.length >= 2) {
                const timeStr = tableHtml(cells[0]).text().trim();
                const heightStr = tableHtml(cells[1]).text().trim();
                
                // Check if this looks like a time and height
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
          
          if (riverData.length > 0) break; // Stop if we found data
        }
      }
      
      if (riverData.length === 0) {
        console.log('No river data found in the response.');
        return res.status(404).json({
          success: false,
          message: 'No river data found in table response',
          tableUrlUsed: tableUrl
        });
      }
      
      console.log(`Successfully extracted ${riverData.length} data points for "${location}"`);
      
      return res.json({
        success: true,
        location: location, // Return the EXACT location name that was requested
        data: riverData,
        tableUrl: tableUrl // Include the URL for debugging
      });
      
    } catch (error) {
      console.error('Error fetching river height data:', error);
      return res.status(500).json({
        success: false,
        message: error.message,
        details: error.stack
      });
    }
    
  } catch (error) {
    console.error('Error in river-data endpoint:', error);
    return res.status(500).json({
      success: false,
      message: 'Error processing river height data',
      error: error.toString()
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Flood data proxy server running on port ${PORT}`);
  console.log(`Dashboard available at http://localhost:${PORT}`);
  console.log(`API available at http://localhost:${PORT}/flood-data`);
  console.log(`Public directory path: ${path.join(__dirname, 'public')}`);
});
