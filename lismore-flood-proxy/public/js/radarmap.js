/**
 * Weather Chaser Radar Map Controller
 * Manages multiple radar overlays with animation
 */

(function() {
    'use strict';

    // Configuration
    const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
    const API_BASE = '/api/radar/weatherchaser';
    const ANIMATION_SPEEDS = {
        slow: 1500,
        normal: 800,
        fast: 400,
        veryfast: 200
    };

    // Australia - show entire continent
    const AUSTRALIA_CENTER = [-25.0, 133.0];
    const AUSTRALIA_ZOOM = 5;
    const AUSTRALIA_BOUNDS = [[-48.0, 105.0], [-7.0, 160.0]]; // All of Australia

    // State
    let radarMap = null;
    let radarOverlays = {}; // { radarId: { frameIndex: overlay } }
    let frames = [];
    let radars = [];
    let currentFrameIndex = 0;
    let isPlaying = false;
    let animationInterval = null;
    let currentSpeed = 'normal';
    let radarInitialized = false;
    let refreshTimer = null;
    let currentBaseLayer = 'map';
    let mapBaseLayer = null;
    let satelliteBaseLayer = null;
    let labelLayer = null;
    let visibleOverlays = []; // Track currently visible overlays for fast switching

    // DOM Elements
    let mapContainer, loadingOverlay, errorContainer, controlsPanel;
    let timestampEl, frameCurrentEl, frameTotalEl, frameSlider;
    let btnFirst, btnPrev, btnPlay, btnPause, btnNext, btnLast;
    let btnSpeedSlow, btnSpeedNormal, btnSpeedFast, btnSpeedVeryFast;
    let btnRefresh, btnToggleBase, btnToggleLegend;
    let legendEl;

    /**
     * Check server connectivity
     */
    async function checkServerConnectivity() {
        try {
            const response = await fetch('/status', {
                method: 'GET',
                cache: 'no-cache',
                signal: AbortSignal.timeout(5000)
            });

            if (response.ok) {
                console.log('[RADAR] Server connectivity verified');
                return true;
            } else {
                console.error('[RADAR] Server returned status:', response.status);
                return false;
            }
        } catch (error) {
            console.error('[RADAR] Server connectivity check failed:', error.message);
            return false;
        }
    }

    /**
     * Initialize radar map
     */
    async function initRadarMap() {
        if (radarInitialized) return;

        console.log('[RADAR] Initializing Weather Chaser radar map...');

        // Get DOM elements
        mapContainer = document.getElementById('radar-map');
        loadingOverlay = document.getElementById('radar-loading');
        errorContainer = document.getElementById('radar-error');
        controlsPanel = document.getElementById('radar-controls');

        timestampEl = document.getElementById('radar-timestamp');
        frameCurrentEl = document.getElementById('radar-frame-current');
        frameTotalEl = document.getElementById('radar-frame-total');
        frameSlider = document.getElementById('radar-frame-slider');

        btnFirst = document.getElementById('radar-btn-first');
        btnPrev = document.getElementById('radar-btn-prev');
        btnPlay = document.getElementById('radar-btn-play');
        btnPause = document.getElementById('radar-btn-pause');
        btnNext = document.getElementById('radar-btn-next');
        btnLast = document.getElementById('radar-btn-last');

        btnSpeedSlow = document.getElementById('radar-speed-slow');
        btnSpeedNormal = document.getElementById('radar-speed-normal');
        btnSpeedFast = document.getElementById('radar-speed-fast');
        btnSpeedVeryFast = document.getElementById('radar-speed-veryfast');

        btnRefresh = document.getElementById('radar-refresh');
        btnToggleBase = document.getElementById('radar-baselayer-toggle');
        btnToggleLegend = document.getElementById('radar-legend-toggle');
        legendEl = document.getElementById('radar-legend');

        if (!mapContainer) {
            console.error('[RADAR] Radar map container not found');
            return;
        }

        showLoading();
        const serverOnline = await checkServerConnectivity();

        if (!serverOnline) {
            hideLoading();
            showError('Cannot connect to server. Please ensure the Node.js server is running on port 3000.');
            updateRadarStatus('Server Offline');
            return;
        }

        // Create Leaflet map with performance optimizations
        radarMap = L.map('radar-map', {
            center: AUSTRALIA_CENTER,
            zoom: AUSTRALIA_ZOOM,
            minZoom: 4,
            maxZoom: 10,
            maxBounds: AUSTRALIA_BOUNDS,
            maxBoundsViscosity: 0.6,
            preferCanvas: true, // Use canvas renderer for better performance
            zoomControl: true,
            attributionControl: true,
            worldCopyJump: false,
            noWrap: true,
            zoomAnimation: true,
            fadeAnimation: false,
            markerZoomAnimation: false,
            zoomAnimationThreshold: 4
        });

        // Create custom panes
        window.ensureRadarPane(radarMap);

        // Create base layers
        mapBaseLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20,
            minZoom: 0
        });

        satelliteBaseLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
            maxZoom: 19,
            minZoom: 0
        });

        // Add default base layer
        mapBaseLayer.addTo(radarMap);

        // Create label layer (always on top)
        labelLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', {
            attribution: '',
            subdomains: 'abcd',
            maxZoom: 20,
            minZoom: 0,
            pane: 'labelPane'
        }).addTo(radarMap);

        // Setup controls
        setupControls();

        // Initialize button states
        updatePlayPauseButtons();
        updateSpeedButtons();

        // Load radar data
        await loadRadarData(false);

        // Setup auto-refresh (every 5 minutes)
        refreshTimer = setInterval(() => {
            console.log('[RADAR] Auto-refreshing data...');
            loadRadarData(true);
        }, REFRESH_INTERVAL);

        radarInitialized = true;
        console.log('[RADAR] Initialization complete');
    }

    /**
     * Setup control button event listeners
     */
    function setupControls() {
        if (btnFirst) {
            btnFirst.addEventListener('click', () => {
                stopAnimation();
                showFrame(0);
            });
        }

        if (btnPrev) {
            btnPrev.addEventListener('click', () => {
                stopAnimation();
                showFrame(currentFrameIndex - 1);
            });
        }

        if (btnPlay) {
            btnPlay.addEventListener('click', () => {
                startAnimation();
            });
        }

        if (btnPause) {
            btnPause.addEventListener('click', () => {
                stopAnimation();
            });
        }

        if (btnNext) {
            btnNext.addEventListener('click', () => {
                stopAnimation();
                showFrame(currentFrameIndex + 1);
            });
        }

        if (btnLast) {
            btnLast.addEventListener('click', () => {
                stopAnimation();
                showFrame(frames.length - 1);
            });
        }

        if (btnSpeedSlow) {
            btnSpeedSlow.addEventListener('click', () => setSpeed('slow'));
        }

        if (btnSpeedNormal) {
            btnSpeedNormal.addEventListener('click', () => setSpeed('normal'));
        }

        if (btnSpeedFast) {
            btnSpeedFast.addEventListener('click', () => setSpeed('fast'));
        }

        if (btnSpeedVeryFast) {
            btnSpeedVeryFast.addEventListener('click', () => setSpeed('veryfast'));
        }

        if (btnRefresh) {
            btnRefresh.addEventListener('click', () => {
                console.log('[RADAR] Manual refresh triggered');
                loadRadarData(true);
            });
        }

        if (btnToggleBase) {
            btnToggleBase.addEventListener('click', toggleBaseLayer);
        }

        if (btnToggleLegend) {
            btnToggleLegend.addEventListener('click', toggleLegend);
        }

        if (frameSlider) {
            frameSlider.addEventListener('input', (e) => {
                stopAnimation();
                showFrame(parseInt(e.target.value));
            });
        }
    }

    /**
     * Load radar data from server
     */
    async function loadRadarData(isRefresh = false) {
        try {
            showLoading();
            console.log(`[RADAR] ${isRefresh ? 'Refreshing' : 'Loading'} radar data...`);

            const url = `${API_BASE}/frames${isRefresh ? '?refresh=1' : ''}`;
            const response = await fetch(url, {
                method: 'GET',
                cache: 'no-cache'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to load radar data');
            }

            frames = data.frames || [];
            radars = data.radars || [];

            console.log(`[RADAR] Loaded ${frames.length} frames for ${radars.length} radars`);

            if (frames.length === 0) {
                throw new Error('No radar frames available');
            }

            // Clear old overlays if refreshing
            if (isRefresh) {
                clearAllOverlays();
            }

            // Create overlays for all radars and frames
            createRadarOverlays();

            // Update UI
            updateFrameControls();

            // Show most recent frame
            showFrame(frames.length - 1);

            // Keep loading overlay visible briefly while images load from cache
            updateRadarStatus('Online');

            setTimeout(() => {
                hideLoading();
                hideError();
                showControls();
            }, 500); // Brief delay to ensure smooth transition

        } catch (error) {
            console.error('[RADAR] Error loading radar data:', error);
            hideLoading();
            hideControls();
            showError(`Failed to load radar data: ${error.message}<br><br>Please ensure the server is running and try refreshing the page.`);
            updateRadarStatus('Error');
        }
    }

    /**
     * Create image overlays for all radars and frames
     */
    function createRadarOverlays() {
        radarOverlays = {};

        radars.forEach((radar, radarIndex) => {
            radarOverlays[radar.id] = {};

            frames.forEach((frame, frameIndex) => {
                const overlay = window.createRadarImageOverlay(
                    radar.id,
                    radar.lat,
                    radar.lon,
                    frame.timestamp
                );

                // Store metadata for debugging
                overlay.radarIndex = radarIndex;

                radarOverlays[radar.id][frameIndex] = overlay;
            });
        });

        console.log(`[RADAR] Created ${radars.length} radar overlays with ${frames.length} frames each`);
    }

    /**
     * Show specific frame across all radars
     * Optimized: only removes/adds overlays that changed
     */
    function showFrame(frameIndex) {
        if (frameIndex < 0 || frameIndex >= frames.length) {
            return;
        }

        currentFrameIndex = frameIndex;

        // Fast path: hide currently visible overlays
        visibleOverlays.forEach(overlay => {
            if (radarMap.hasLayer(overlay)) {
                radarMap.removeLayer(overlay);
            }
        });
        visibleOverlays = [];

        // Show current frame for all radars
        radars.forEach(radar => {
            const overlay = radarOverlays[radar.id][frameIndex];
            if (overlay) {
                overlay.addTo(radarMap);
                visibleOverlays.push(overlay);
            }
        });

        // Update UI
        updateFrameDisplay();
    }

    /**
     * Update frame counter and slider
     */
    function updateFrameDisplay() {
        const frame = frames[currentFrameIndex];

        if (frameCurrentEl) {
            frameCurrentEl.textContent = currentFrameIndex + 1;
        }

        if (frameTotalEl) {
            frameTotalEl.textContent = frames.length;
        }

        if (frameSlider) {
            frameSlider.value = currentFrameIndex;
        }

        if (timestampEl && frame) {
            const formatted = window.formatRadarTimestamp(frame.timestamp);
            const timeAgo = window.getTimeAgo(frame.timestamp);
            timestampEl.textContent = `${formatted.fullDate} (${timeAgo})`;
        }
    }

    /**
     * Update frame controls (slider max, etc.)
     */
    function updateFrameControls() {
        if (frameSlider) {
            frameSlider.max = frames.length - 1;
            frameSlider.value = currentFrameIndex;
        }

        if (frameTotalEl) {
            frameTotalEl.textContent = frames.length;
        }
    }

    /**
     * Start animation
     */
    function startAnimation() {
        if (isPlaying) return;

        isPlaying = true;
        updatePlayPauseButtons();

        animationInterval = setInterval(() => {
            let nextIndex = currentFrameIndex + 1;
            if (nextIndex >= frames.length) {
                nextIndex = 0; // Loop back to start
            }
            showFrame(nextIndex);
        }, ANIMATION_SPEEDS[currentSpeed]);

        console.log(`[RADAR] Animation started (${currentSpeed} speed)`);
    }

    /**
     * Stop animation
     */
    function stopAnimation() {
        if (!isPlaying) return;

        isPlaying = false;
        updatePlayPauseButtons();

        if (animationInterval) {
            clearInterval(animationInterval);
            animationInterval = null;
        }

        console.log('[RADAR] Animation stopped');
    }

    /**
     * Set animation speed
     */
    function setSpeed(speed) {
        currentSpeed = speed;
        updateSpeedButtons();

        // Restart animation with new speed if playing
        if (isPlaying) {
            stopAnimation();
            startAnimation();
        }

        console.log(`[RADAR] Speed set to ${speed}`);
    }

    /**
     * Update play/pause button visibility
     */
    function updatePlayPauseButtons() {
        if (btnPlay) {
            btnPlay.style.display = isPlaying ? 'none' : 'inline-block';
        }
        if (btnPause) {
            btnPause.style.display = isPlaying ? 'inline-block' : 'none';
        }
    }

    /**
     * Update speed button active states
     */
    function updateSpeedButtons() {
        if (btnSpeedSlow) {
            btnSpeedSlow.classList.toggle('active', currentSpeed === 'slow');
        }
        if (btnSpeedNormal) {
            btnSpeedNormal.classList.toggle('active', currentSpeed === 'normal');
        }
        if (btnSpeedFast) {
            btnSpeedFast.classList.toggle('active', currentSpeed === 'fast');
        }
        if (btnSpeedVeryFast) {
            btnSpeedVeryFast.classList.toggle('active', currentSpeed === 'veryfast');
        }
    }

    /**
     * Toggle between map and satellite base layers
     */
    function toggleBaseLayer() {
        if (currentBaseLayer === 'map') {
            radarMap.removeLayer(mapBaseLayer);
            satelliteBaseLayer.addTo(radarMap);
            currentBaseLayer = 'satellite';
            if (btnToggleBase) {
                btnToggleBase.classList.add('active');
                btnToggleBase.title = 'Switch to map view';
            }
        } else {
            radarMap.removeLayer(satelliteBaseLayer);
            mapBaseLayer.addTo(radarMap);
            currentBaseLayer = 'map';
            if (btnToggleBase) {
                btnToggleBase.classList.remove('active');
                btnToggleBase.title = 'Switch to satellite view';
            }
        }
        console.log(`[RADAR] Switched to ${currentBaseLayer} view`);
    }

    /**
     * Toggle the radar legend visibility
     */
    function toggleLegend() {
        if (!legendEl) {
            console.warn('[RADAR] Legend element not found');
            return;
        }

        const isHidden = legendEl.style.display === 'none' || !legendEl.style.display;
        legendEl.style.display = isHidden ? 'block' : 'none';

        if (btnToggleLegend) {
            btnToggleLegend.title = isHidden ? 'Hide rainfall legend' : 'Show rainfall legend';
        }

        console.log(`[RADAR] Legend ${isHidden ? 'shown' : 'hidden'}`);
    }

    /**
     * Clear all radar overlays from map
     */
    function clearAllOverlays() {
        // Fast clear using tracked visible overlays
        visibleOverlays.forEach(overlay => {
            if (overlay && radarMap.hasLayer(overlay)) {
                radarMap.removeLayer(overlay);
            }
        });

        radarOverlays = {};
        visibleOverlays = [];
    }

    /**
     * Show loading overlay
     */
    function showLoading() {
        if (loadingOverlay) {
            loadingOverlay.style.display = 'flex';
        }
    }

    /**
     * Hide loading overlay
     */
    function hideLoading() {
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
    }

    /**
     * Show error message
     */
    function showError(message) {
        if (errorContainer) {
            errorContainer.innerHTML = message;
            errorContainer.style.display = 'block';
        }
    }

    /**
     * Hide error message
     */
    function hideError() {
        if (errorContainer) {
            errorContainer.style.display = 'none';
        }
    }

    /**
     * Show controls panel
     */
    function showControls() {
        if (controlsPanel) {
            controlsPanel.style.display = 'block';
        }
    }

    /**
     * Hide controls panel
     */
    function hideControls() {
        if (controlsPanel) {
            controlsPanel.style.display = 'none';
        }
    }

    /**
     * Update radar status in UI
     */
    function updateRadarStatus(status) {
        const statusEl = document.getElementById('radar-status-value');
        if (statusEl) {
            statusEl.textContent = status;

            // Update CSS class based on status
            if (status === 'Online') {
                statusEl.className = 'status-value online';
            } else if (status === 'Error' || status === 'Server Offline') {
                statusEl.className = 'status-value offline';
            } else {
                statusEl.className = 'status-value';
            }
        }
    }

    /**
     * Reset radar map view to default
     */
    function resetRadarView() {
        if (radarMap && radarInitialized) {
            // Stop any animation
            if (isPlaying) {
                stopAnimation();
            }

            // Reset to default Australia view
            radarMap.setView(AUSTRALIA_CENTER, AUSTRALIA_ZOOM, { animate: true });

            // Close any open popups
            radarMap.closePopup();
        }
    }

    /**
     * Initialize on tab show
     */
    function initOnTabShow() {
        const radarTab = document.getElementById('tab-radar');
        if (radarTab) {
            radarTab.addEventListener('click', () => {
                setTimeout(() => {
                    if (!radarInitialized) {
                        initRadarMap();
                    } else if (radarMap) {
                        radarMap.invalidateSize();
                        // Reset view when switching back to radar tab
                        resetRadarView();
                    }
                }, 100);
            });
        }

        // Also check if radar tab is already active
        const radarContent = document.getElementById('content-radar');
        if (radarContent && radarContent.classList.contains('active')) {
            setTimeout(() => {
                initRadarMap();
            }, 100);
        }
    }

    // Expose reset function globally
    window.resetRadarView = resetRadarView;

    /**
     * Cleanup on page unload
     */
    window.addEventListener('beforeunload', () => {
        if (refreshTimer) {
            clearInterval(refreshTimer);
        }
        stopAnimation();
    });

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initOnTabShow);
    } else {
        initOnTabShow();
    }
})();
