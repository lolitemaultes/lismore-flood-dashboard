/**
 * Rainbow API dBZ to BoM Color Mapper
 * Direct dBZ reading from raw dbz_u8 tiles
 *
 * Rainbow API provides tiles with color=dbz_u8 where:
 * - Red channel encodes dBZ value: dbz = R - 32
 * - R = 0 means no data (skip pixel)
 * - R = 1-127 maps to -31 to 95 dBZ
 */

// EXACT BoM dBZ color scale - THE AUTHORITATIVE SOURCE
const BOM_DBZ_COLORS = [
    { min: -12, max: 23, r: 242, g: 242, b: 242, hex: '#f2f2f2', name: 'Very Light' },
    { min: 23, max: 28, r: 207, g: 211, b: 255, hex: '#cfd3ff', name: 'Very Light' },
    { min: 28, max: 31, r: 170, g: 180, b: 255, hex: '#aab4ff', name: 'Light' },
    { min: 31, max: 34, r: 0, g: 51, b: 255, hex: '#0033ff', name: 'Moderate' },
    { min: 34, max: 37, r: 31, g: 107, b: 255, hex: '#1f6bff', name: 'Moderate' },
    { min: 37, max: 40, r: 47, g: 227, b: 227, hex: '#2fe3e3', name: 'Moderate' },
    { min: 40, max: 43, r: 18, g: 127, b: 127, hex: '#127f7f', name: 'Moderate' },
    { min: 43, max: 46, r: 47, g: 160, b: 95, hex: '#2fa05f', name: 'Heavy' },
    { min: 46, max: 49, r: 255, g: 255, b: 102, hex: '#ffff66', name: 'Heavy' },
    { min: 49, max: 52, r: 255, g: 210, b: 26, hex: '#ffd21a', name: 'Heavy' },
    { min: 52, max: 55, r: 255, g: 163, b: 26, hex: '#ffa31a', name: 'Very Heavy' },
    { min: 55, max: 58, r: 255, g: 127, b: 26, hex: '#ff7f1a', name: 'Very Heavy' },
    { min: 58, max: 61, r: 255, g: 77, b: 26, hex: '#ff4d1a', name: 'Intense' },
    { min: 61, max: 64, r: 255, g: 0, b: 0, hex: '#ff0000', name: 'Extreme' },
    { min: 64, max: 999, r: 91, g: 0, b: 0, hex: '#5b0000', name: 'Extreme' }
];

/**
 * Extract dBZ value from raw dbz_u8 tile pixel
 * Formula: dbz = red_channel - 32
 *
 * @param {number} r - Red channel value (0-255)
 * @returns {number} - dBZ value or 0 for no data
 */
function getDbzFromPixel(r) {
    // R = 0 means no data
    if (r === 0) return 0;

    // Direct formula from Rainbow API: dbz = R - 32
    return r - 32;
}

/**
 * Get EXACT BoM color for a given dBZ value
 *
 * @param {number} dbz - dBZ value
 * @returns {Object|null} - RGB object {r, g, b} or null if below threshold
 */
function getBomColorForDbz(dbz) {
    // Below minimum threshold (-12 dBZ) - treat as no significant precipitation
    if (dbz < BOM_DBZ_COLORS[0].min) return null;

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

    // Override getTileUrl to BLOCK URL generation for out-of-bounds tiles
    getTileUrl: function(coords) {
        // CRITICAL: Check bounds BEFORE generating URL
        if (!this._tileIsInAustraliaBounds(coords)) {
            // Log blocked tiles for debugging (throttled to avoid spam)
            if (!this._blockedTileCount) this._blockedTileCount = 0;
            this._blockedTileCount++;
            if (this._blockedTileCount <= 5) {
                console.warn(`[RADAR] BLOCKED radar tile outside Australia: zoom ${coords.z}, x ${coords.x}, y ${coords.y}`);
            } else if (this._blockedTileCount === 6) {
                console.warn(`[RADAR] Additional radar tiles blocked (logging suppressed to prevent spam)`);
            }
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

        // If layer is not active (hidden), don't load tiles
        if (!this._isActive) {
            return false;
        }

        return true;
    },

    // Method to activate/deactivate tile loading
    setActive: function(active) {
        this._isActive = active;
        if (!active) {
            // Immediately clear all tiles when deactivated
            this._removeAllTiles();
        }
    },

    createTile: function(coords, done) {
        // Double-check validity before creating tile
        if (!this._isValidTile(coords)) {
            const emptyTile = document.createElement('canvas');
            emptyTile.width = this.options.tileSize;
            emptyTile.height = this.options.tileSize;
            done(null, emptyTile);
            return emptyTile;
        }

        const tile = document.createElement('canvas');
        tile.width = this.options.tileSize;
        tile.height = this.options.tileSize;

        const ctx = tile.getContext('2d', { willReadFrequently: true });
        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
            try {
                // Draw tile to canvas
                ctx.drawImage(img, 0, 0);

                // If skipColorMapping is true, tiles are already colored by RainViewer
                // Just apply the canvas as-is with appropriate opacity
                if (this._skipColorMapping) {
                    done(null, tile);
                    return;
                }

                // LEGACY: Color mapping for raw dBZ data (if using Rainbow API)
                // This code path is kept for backward compatibility
                const imageData = ctx.getImageData(0, 0, tile.width, tile.height);
                const data = imageData.data;

                // Process each pixel: Read R channel → Get dBZ → Apply EXACT BoM color
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];

                    // Get dBZ directly from red channel
                    const dbz = getDbzFromPixel(r);

                    if (dbz >= BOM_DBZ_COLORS[0].min) {
                        // Get EXACT BoM color for this dBZ value
                        const bomColor = getBomColorForDbz(dbz);

                        if (bomColor) {
                            // Replace with exact BoM color
                            data[i] = bomColor.r;
                            data[i + 1] = bomColor.g;
                            data[i + 2] = bomColor.b;
                            // Set full opacity for precipitation
                            data[i + 3] = 255;
                        } else {
                            // Below threshold - make transparent
                            data[i + 3] = 0;
                        }
                    } else {
                        // No data or below threshold - make transparent
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
            this._tileErrorCount++;
            const now = Date.now();

            // Throttle error logging to prevent console spam
            if (now - this._lastErrorTime > this._errorThrottleMs) {
                // Check if this is a zoom level issue (403 errors typically mean tile doesn't exist)
                const zoom = coords.z;
                if (zoom > 10) {
                    console.warn(`[RADAR] Tile unavailable at zoom ${zoom} - RainViewer radar limited to zoom 10`);
                } else {
                    console.warn(`[RADAR] Tile load error (${this._tileErrorCount} failed tiles)`);
                    if (this._tileErrorCount === 1) {
                        // Only show detailed error on first failure
                        console.error('[RADAR] If tiles continue to fail, check:');
                        console.error('[RADAR] 1. Server is running: http://localhost:3000/status');
                        console.error('[RADAR] 2. Check server terminal for error messages');
                        console.error('[RADAR] 3. Tile URL pattern:', this._url);
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

console.log('[RADAR] Color Mapper loaded with STRICT bounds filtering - getTileUrl blocks non-Australia tiles');
console.log('[RADAR] Using RainViewer pre-colored tiles (BoM color mapping available for raw dBZ data if needed)');
