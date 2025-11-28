/**
 * Radar Image Overlay Handler for Weather Chaser radar system
 * Manages Leaflet ImageOverlay layers for radar images
 */

(function() {
    'use strict';

    /**
     * Calculate accurate bounds for a radar station
     * BOM/Weather Chaser radar images are 512km × 512km (256km radius from center)
     *
     * CRITICAL: Must account for longitude distortion at different latitudes
     * - 1 degree latitude ≈ 111.32 km (constant everywhere)
     * - 1 degree longitude = 111.32 km × cos(latitude) (varies by latitude)
     */
    function calculateRadarBounds(lat, lon, radiusKm = 256) {
        // Convert kilometers to degrees
        // Latitude: simple conversion (111.32 km per degree)
        const latOffset = radiusKm / 111.32;

        // Longitude: adjust for latitude (degrees get smaller as you move toward poles)
        // At equator: 1 degree = 111.32 km
        // At poles: 1 degree = 0 km
        // Formula: degrees = km / (111.32 × cos(latitude))
        const lonOffset = radiusKm / (111.32 * Math.cos(lat * Math.PI / 180));

        const south = lat - latOffset;
        const north = lat + latOffset;
        const west = lon - lonOffset;
        const east = lon + lonOffset;

        return [[south, west], [north, east]];
    }

    /**
     * Create a radar image overlay for a specific radar and timestamp
     */
    window.createRadarImageOverlay = function(radarId, radarLat, radarLon, timestamp, radiusKm = 256) {
        const bounds = calculateRadarBounds(radarLat, radarLon, radiusKm);
        const imageUrl = `/api/radar/weatherchaser/image/${radarId}/${timestamp}`;

        const overlay = L.imageOverlay(imageUrl, bounds, {
            opacity: 0,  // Start invisible to prevent blue flash
            crossOrigin: 'anonymous',
            className: 'radar-overlay',
            interactive: false,
            pane: 'radarPane'
        });

        // Add metadata to the overlay object
        overlay.radarId = radarId;
        overlay.timestamp = timestamp;
        overlay.isLoaded = false;
        overlay.hasError = false;

        // Track loading state
        overlay.on('load', function(e) {
            // Check if the loaded image is the 1x1 transparent PNG fallback
            const img = e.target._image;
            if (img && (img.naturalWidth === 1 && img.naturalHeight === 1)) {
                // This is a fallback image - keep it hidden
                overlay.isLoaded = false;
                overlay.hasError = true;
                overlay.setOpacity(0);
                if (e.target._image) {
                    e.target._image.style.display = 'none';
                }
            } else {
                // Real radar image loaded successfully - show it
                overlay.isLoaded = true;
                overlay.hasError = false;
                overlay.setOpacity(0.7);  // Set to 70% opacity for radar overlay
            }
        });

        overlay.on('error', function(e) {
            overlay.isLoaded = false;
            overlay.hasError = true;
            overlay.setOpacity(0);
            // Hide the broken image
            if (e.target._image) {
                e.target._image.style.display = 'none';
            }
        });

        return overlay;
    };

    /**
     * Calculate radar coverage circle for display (optional)
     */
    window.createRadarCoverageCircle = function(radarLat, radarLon, radarName, radiusKm = 512) {
        const circle = L.circle([radarLat, radarLon], {
            radius: radiusKm * 1000, // Convert to meters
            color: '#00ff00',
            fillColor: '#00ff00',
            fillOpacity: 0.05,
            opacity: 0.3,
            weight: 1,
            interactive: false
        });

        // Add popup with radar info
        circle.bindPopup(`
            <div class="radar-info-popup">
                <strong>${radarName}</strong><br>
                Coverage: ~${radiusKm}km<br>
                Location: ${radarLat.toFixed(3)}°, ${radarLon.toFixed(3)}°
            </div>
        `);

        return circle;
    };

    /**
     * Preload a radar image to check availability
     */
    window.preloadRadarImage = function(radarId, timestamp) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const imageUrl = `/api/radar/weatherchaser/image/${radarId}/${timestamp}`;

            img.onload = function() {
                resolve({ success: true, radarId, timestamp });
            };

            img.onerror = function() {
                reject({ success: false, radarId, timestamp });
            };

            // Set timeout for image loading
            const timeout = setTimeout(() => {
                reject({ success: false, radarId, timestamp, reason: 'timeout' });
            }, 10000);

            img.onload = function() {
                clearTimeout(timeout);
                resolve({ success: true, radarId, timestamp });
            };

            img.src = imageUrl;
        });
    };

    /**
     * Get radar overlay z-index based on radar priority
     * Ensures overlays layer correctly (closest radars on top)
     */
    window.getRadarZIndex = function(radarId, lismoreRadars) {
        const index = lismoreRadars.indexOf(radarId);
        if (index === -1) return 300; // Default
        return 300 + index; // Higher index = higher priority = on top
    };

    /**
     * Create custom pane for radar overlays if it doesn't exist
     */
    window.ensureRadarPane = function(map) {
        if (!map.getPane('radarPane')) {
            const radarPane = map.createPane('radarPane');
            radarPane.style.zIndex = 300;
            radarPane.style.pointerEvents = 'none';
        }

        // Also ensure label pane is above radar
        if (!map.getPane('labelPane')) {
            const labelPane = map.createPane('labelPane');
            labelPane.style.zIndex = 400;
            labelPane.style.pointerEvents = 'none';
        }
    };

    /**
     * Format timestamp for display
     */
    window.formatRadarTimestamp = function(timestamp) {
        // Parse YYYYMMDDHHmm format (UTC timestamps from Weather Chaser)
        const year = parseInt(timestamp.substring(0, 4));
        const month = parseInt(timestamp.substring(4, 6)) - 1;
        const day = parseInt(timestamp.substring(6, 8));
        const hours = parseInt(timestamp.substring(8, 10));
        const minutes = parseInt(timestamp.substring(10, 12));

        // CRITICAL: Create date in UTC, not local time
        const date = new Date(Date.UTC(year, month, day, hours, minutes));

        return {
            date: date,
            shortTime: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
            longTime: date.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }),
            fullDate: date.toLocaleDateString('en-AU', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
            })
        };
    };

    /**
     * Calculate time ago from timestamp
     */
    window.getTimeAgo = function(timestamp) {
        const formatted = window.formatRadarTimestamp(timestamp);
        const now = new Date();
        const diff = now - formatted.date;
        const minutes = Math.floor(diff / 60000);

        if (minutes < 1) return 'Just now';
        if (minutes === 1) return '1 minute ago';
        if (minutes < 60) return `${minutes} minutes ago`;

        const hours = Math.floor(minutes / 60);
        if (hours === 1) return '1 hour ago';
        if (hours < 24) return `${hours} hours ago`;

        return formatted.fullDate;
    };
})();
