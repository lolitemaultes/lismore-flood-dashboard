/**
 * RainViewer Raw dBZ to Custom BoM Color Mapper
 *
 * Fetches RainViewer color=0 (raw encoded) tiles and applies exact custom BoM colors:
 * - Extracts raw dBZ from red channel: dBZ = (R & 127) - 32
 * - Applies user-specified exact BoM color bins (stepped, non-gradient)
 * - Crisp pixel rendering with nearest-neighbour interpolation
 * - Blocky, easy-to-read radar appearance matching Australian BoM radars
 *
 * RainViewer encoding format:
 * - R = 0: No radar data (transparent)
 * - R = 1-127: Rain data, dBZ = (R & 127) - 32 = -31 to 95 dBZ
 * - R = 129-255: Snow data (bit 7 set), same dBZ extraction
 */

// EXACT BoM dBZ color scale - Stepped (non-gradient) palette for blocky, easy-to-read appearance
// Pale blues/cyans → drizzle/light rain
// Deeper blue → teal → green → moderate showers
// Yellow → orange → heavy rain with sharp edges
// Red → magenta/dark red → very heavy rain, downpours, thunderstorms, possible hail
const BOM_DBZ_COLORS = [
    { min: 12, max: 23, r: 242, g: 242, b: 242, hex: '#f2f2f2', name: 'Very Light Drizzle' },
    { min: 23, max: 28, r: 207, g: 211, b: 255, hex: '#cfd3ff', name: 'Light Rain' },
    { min: 28, max: 31, r: 170, g: 180, b: 255, hex: '#aab4ff', name: 'Light Rain' },
    { min: 31, max: 34, r: 0,   g: 51,  b: 255, hex: '#0033ff', name: 'Light-Moderate' },
    { min: 34, max: 37, r: 31,  g: 107, b: 255, hex: '#1f6bff', name: 'Moderate' },
    { min: 37, max: 40, r: 47,  g: 227, b: 227, hex: '#2fe3e3', name: 'Moderate' },
    { min: 40, max: 43, r: 18,  g: 127, b: 127, hex: '#127f7f', name: 'Moderate-Heavy' },
    { min: 43, max: 46, r: 47,  g: 160, b: 95,  hex: '#2fa05f', name: 'Heavy' },
    { min: 46, max: 49, r: 255, g: 255, b: 102, hex: '#ffff66', name: 'Heavy' },
    { min: 49, max: 52, r: 255, g: 210, b: 26,  hex: '#ffd21a', name: 'Heavy' },
    { min: 52, max: 55, r: 255, g: 163, b: 26,  hex: '#ffa31a', name: 'Very Heavy' },
    { min: 55, max: 58, r: 255, g: 127, b: 26,  hex: '#ff7f1a', name: 'Very Heavy' },
    { min: 58, max: 61, r: 255, g: 77,  b: 26,  hex: '#ff4d1a', name: 'Extreme' },
    { min: 61, max: 64, r: 255, g: 0,   b: 0,   hex: '#ff0000', name: 'Extreme' },
    { min: 64, max: 999, r: 91,  g: 0,   b: 0,   hex: '#5b0000', name: 'Extreme Heavy' }
];

/**
 * Extract dBZ value from RainViewer radar tile pixel
 * RainViewer encodes dBZ in red channel with formula: dBZ = (R & 127) - 32
 * Bit 7 (R & 128) indicates snow, which we ignore for precipitation intensity
 *
 * @param {number} r - Red channel value (0-255)
 * @returns {number} - dBZ value or 0 for no data
 */
function getDbzFromPixel(r) {
    // R = 0 means no data
    if (r === 0) return 0;

    // Extract dBZ from lower 7 bits: dBZ = (R & 127) - 32
    // This gives us -31 to 95 dBZ range regardless of snow flag
    return (r & 127) - 32;
}

/**
 * Get EXACT BoM color for a given dBZ value
 *
 * @param {number} dbz - dBZ value
 * @returns {Object|null} - RGB object {r, g, b} or null if below threshold
 */
function getBomColorForDbz(dbz) {
    // Below minimum threshold (12 dBZ) - no significant precipitation
    if (dbz < 12) return null;

    // Find matching bin
    for (const range of BOM_DBZ_COLORS) {
        if (dbz >= range.min && dbz < range.max) {
            return { r: range.r, g: range.g, b: range.b };
        }
    }

    // Above maximum range (64+ dBZ) - use extreme color
    const maxRange = BOM_DBZ_COLORS[BOM_DBZ_COLORS.length - 1];
    return { r: maxRange.r, g: maxRange.g, b: maxRange.b };
}

/**
 * Custom Leaflet TileLayer that remaps raw dBZ to EXACT BoM dBZ colors
 * Uses canvas-based pixel manipulation with direct red channel reading
 */
L.TileLayer.BomColorMapped = L.TileLayer.extend({
    initialize: function(url, options) {
        L.TileLayer.prototype.initialize.call(this, url, options);
        this._tileErrorCount = 0;
        this._lastErrorTime = 0;
        this._errorThrottleMs = 5000; // Only log errors every 5 seconds
        this._skipColorMapping = options.skipColorMapping || false; // Option to skip color mapping
        this._australiaBounds = options.australiaBounds || null; // Australia bounds for filtering
        this._isActive = options.isActive !== undefined ? options.isActive : true; // Track if layer should load tiles
    },

    // STRICT bounds checking - called before any tile operations
    _tileIsInAustraliaBounds: function(coords) {
        if (!this._australiaBounds) {
            return true; // No bounds restriction
        }

        const tileBounds = this._tileCoordsToBounds(coords);
        const australiaBounds = L.latLngBounds(this._australiaBounds);

        return australiaBounds.intersects(tileBounds);
    },

    // Override getTileUrl to BLOCK URL generation for out-of-bounds tiles and add quality parameter
    getTileUrl: function(coords) {
        // CRITICAL FIX: Round zoom level to integer
        // RainViewer only supports integer zoom levels (5,6,7,8,9,10)
        // But Leaflet with zoomSnap:0.5 creates fractional zooms (7.5, 8.5, etc)
        const originalZ = coords.z;
        coords.z = Math.round(coords.z);

        // EXPANDED AUSTRALIA BOUNDS CHECK (includes maritime zones)
        // Slightly larger bounds for better coverage
        const STRICT_AUSTRALIA_LAT_MIN = -46.0;  // Southern Ocean
        const STRICT_AUSTRALIA_LAT_MAX = -8.0;   // Papua New Guinea border
        const STRICT_AUSTRALIA_LON_MIN = 110.0;  // Indian Ocean
        const STRICT_AUSTRALIA_LON_MAX = 156.0;  // Pacific Ocean

        // Convert tile coordinates to lat/lng bounds
        const tileBounds = this._tileCoordsToBounds(coords);
        const north = tileBounds.getNorth();
        const south = tileBounds.getSouth();
        const west = tileBounds.getWest();
        const east = tileBounds.getEast();

        // Check if tile is completely outside Australia
        if (north < STRICT_AUSTRALIA_LAT_MIN || south > STRICT_AUSTRALIA_LAT_MAX ||
            east < STRICT_AUSTRALIA_LON_MIN || west > STRICT_AUSTRALIA_LON_MAX) {

            if (!this._blockedTileCount) this._blockedTileCount = 0;
            this._blockedTileCount++;
            if (this._blockedTileCount <= 3) {
                console.log(`[RADAR] Blocked tile outside Australia: ${coords.z}/${coords.x}/${coords.y}`);
            }
            coords.z = originalZ; // Restore original
            return ''; // Return empty string - no request will be made
        }

        // Additional check using the configured bounds
        if (!this._tileIsInAustraliaBounds(coords)) {
            coords.z = originalZ; // Restore original
            return ''; // Return empty string - no request will be made
        }

        // Get base URL from parent (with rounded zoom)
        let url = L.TileLayer.prototype.getTileUrl.call(this, coords);

        // Restore original zoom level
        coords.z = originalZ;

        // Determine quality based on zoom level (not from options)
        // RainViewer quality: 0=smoothed, 1=universal, 2=high detail
        // Quality 2 NOT reliably available - causes 404s even at zoom 10
        // Use quality 1 (universal) - best compatibility with no errors
        let quality;
        if (coords.z < 7) {
            quality = 0; // LOW quality for distant view
        } else {
            quality = 1; // UNIVERSAL quality - works everywhere, no 404s
        }

        // Add quality parameter to URL
        if (url) {
            const separator = url.includes('?') ? '&' : '?';
            url += `${separator}quality=${quality}`;
        }

        return url;
    },

    // Override to check if tile is within Australia bounds
    _isValidTile: function(coords) {
        // First check standard Leaflet validation
        if (!L.TileLayer.prototype._isValidTile.call(this, coords)) {
            return false;
        }

        // STRICT Australia bounds check
        if (!this._tileIsInAustraliaBounds(coords)) {
            return false;
        }

        // REMOVED isActive check - let Leaflet handle viewport-based tile loading naturally
        // Tiles are only loaded for the current viewport, improving performance dramatically

        return true;
    },

    createTile: function(coords, done) {
        // Double-check validity before creating tile
        if (!this._isValidTile(coords)) {
            const emptyTile = document.createElement('canvas');
            emptyTile.width = this.options.tileSize || 256;
            emptyTile.height = this.options.tileSize || 256;
            done(null, emptyTile);
            return emptyTile;
        }
    
        const tile = document.createElement('canvas');
        tile.width = this.options.tileSize || 256;
        tile.height = this.options.tileSize || 256;
    
        const ctx = tile.getContext('2d', { 
            willReadFrequently: true,
            imageSmoothingEnabled: false  // Disable smoothing for crisp pixels
        });
        
        const img = new Image();
        img.crossOrigin = 'anonymous';
    
        img.onload = () => {
            try {
                // Draw tile to canvas
                ctx.drawImage(img, 0, 0);
    
                // If skipColorMapping is true, use RainViewer's pre-colored tiles directly
                // Otherwise, extract raw dBZ and apply custom BoM colors
                if (this._skipColorMapping) {
                    done(null, tile);
                    return;
                }

                // Custom dBZ to BoM color mapping (ACTIVE)
                // Extract raw dBZ from RainViewer color=0 tiles: dBZ = (R & 127) - 32
                const imageData = ctx.getImageData(0, 0, tile.width, tile.height);
                const data = imageData.data;

                // Process each pixel: Read raw dBZ from red channel → Apply exact BoM color
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const a = data[i + 3];

                    // R = 0 means no radar data - make transparent
                    if (r === 0 || a < 10) {
                        data[i] = 0;
                        data[i + 1] = 0;
                        data[i + 2] = 0;
                        data[i + 3] = 0;
                        continue;
                    }

                    // Extract dBZ from red channel: dBZ = (R & 127) - 32
                    const dbz = getDbzFromPixel(r);

                    // Skip if below minimum threshold or invalid
                    if (dbz <= 0) {
                        data[i + 3] = 0;
                        continue;
                    }

                    // Get EXACT BoM color for this dBZ value
                    const bomColor = getBomColorForDbz(dbz);

                    if (bomColor) {
                        // Apply exact BoM stepped color (crisp, blocky appearance)
                        data[i] = bomColor.r;
                        data[i + 1] = bomColor.g;
                        data[i + 2] = bomColor.b;
                        data[i + 3] = 255; // Fully opaque
                    } else {
                        // Below 12 dBZ threshold - no significant precipitation, make transparent
                        data[i] = 0;
                        data[i + 1] = 0;
                        data[i + 2] = 0;
                        data[i + 3] = 0;
                    }
                }
    
                // Put remapped pixels back to canvas
                ctx.putImageData(imageData, 0, 0);
                done(null, tile);
    
            } catch (e) {
                console.error('[RADAR] Color mapping error:', e);
                done(e, tile);
            }
        };
    
        img.onerror = (err) => {
            this._tileErrorCount = (this._tileErrorCount || 0) + 1;
            const now = Date.now();

            // Throttle error logging to prevent console spam (only log every 10 seconds)
            if (!this._lastErrorTime || now - this._lastErrorTime > 10000) {
                // Check if this is a zoom level issue (403 errors typically mean tile doesn't exist)
                const zoom = coords.z;
                if (zoom > 10) {
                    console.warn(`[RADAR] Tile unavailable at zoom ${zoom} - RainViewer radar limited to zoom 10`);
                } else if (this._tileErrorCount <= 5) {
                    // Only log first 5 errors to avoid spam
                    if (this._tileErrorCount === 1) {
                        // Only show message on first failure
                        console.log('[RADAR] Some tiles may fail during zoom - this is normal');
                        console.log('[RADAR] If no tiles load at all, check: http://localhost:3000/status');
                    }
                }
                this._lastErrorTime = now;
            }

            // Return a blank tile instead of erroring
            done(null, tile);
        };
    
        // Load the tile from proxy
        img.src = this.getTileUrl(coords);
    
        return tile;
    }
});

/**
 * Factory function to create color-mapped tile layer
 */
L.tileLayer.bomColorMapped = function(url, options) {
    return new L.TileLayer.BomColorMapped(url, options);
};

/**
 * Filtered TileLayer - extends standard TileLayer with Australia bounds filtering
 */
L.TileLayer.Filtered = L.TileLayer.extend({
    initialize: function(url, options) {
        L.TileLayer.prototype.initialize.call(this, url, options);
        this._australiaBounds = options.australiaBounds || null;
    },

    // STRICT bounds checking helper
    _tileIsInAustraliaBounds: function(coords) {
        if (!this._australiaBounds) {
            return true; // No bounds restriction
        }

        const tileBounds = this._tileCoordsToBounds(coords);
        const australiaBounds = L.latLngBounds(this._australiaBounds);

        return australiaBounds.intersects(tileBounds);
    },

    // Override getTileUrl to BLOCK URL generation for out-of-bounds tiles
    getTileUrl: function(coords) {
        // CRITICAL: Check bounds BEFORE generating URL
        if (!this._tileIsInAustraliaBounds(coords)) {
            // Silently block - only log for debugging
            // console.log(`[MAP] Blocked base tile outside Australia: zoom ${coords.z}, x ${coords.x}, y ${coords.y}`);
            return ''; // Return empty string - no request will be made
        }

        // Call parent getTileUrl for valid tiles
        return L.TileLayer.prototype.getTileUrl.call(this, coords);
    },

    // Override to check if tile is within Australia bounds
    _isValidTile: function(coords) {
        // First check standard Leaflet validation
        if (!L.TileLayer.prototype._isValidTile.call(this, coords)) {
            return false;
        }

        // STRICT Australia bounds check
        if (!this._tileIsInAustraliaBounds(coords)) {
            return false;
        }

        return true;
    }
});

/**
 * Factory function for filtered tile layer
 */
L.tileLayer.filtered = function(url, options) {
    return new L.TileLayer.Filtered(url, options);
};

/**
 * Export for use in radarmap.js
 */
window.BomRadarColorMapper = {
    BOM_DBZ_COLORS: BOM_DBZ_COLORS,
    createColorMappedLayer: function(url, options) {
        return L.tileLayer.bomColorMapped(url, options);
    },
    createFilteredLayer: function(url, options) {
        return L.tileLayer.filtered(url, options);
    },
    // Expose for debugging
    getDbzFromPixel: getDbzFromPixel,
    getBomColorForDbz: getBomColorForDbz
};

console.log('[RADAR] Color Mapper loaded with custom BoM color mapping');
console.log('[RADAR] Extracting raw dBZ from RainViewer color=0 tiles: dBZ = (R & 127) - 32');
console.log('[RADAR] Applying exact BoM stepped color palette for consistent, authentic radar display');
