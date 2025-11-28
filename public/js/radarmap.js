/**
 * Weather Chaser Radar Map Controller
 * Manages Brisbane and Grafton radar overlays with animation and smooth transitions
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

    // Radar Definitions
    const RADARS = {
        brisbane: {
            id: 66,
            name: "Brisbane (Mt Stapylton)",
            lat: -27.7178,
            lon: 153.24,
            radiusKm: 376, // 752km span
            zoom: 7
        },
        grafton: {
            id: 28,
            name: "Grafton",
            lat: -29.622,
            lon: 152.951,
            radiusKm: 512, // 1024km span
            zoom: 7
        }
    };

    // State
    let radarMap = null;
    let radarOverlays = {}; // { radarId: { frameIndex: overlay } }
    let frames = [];
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
    let visibleOverlays = []; // Track currently visible overlays
    let currentRadarKey = 'brisbane'; // 'brisbane' or 'grafton'

    // DOM Elements
    let mapContainer, loadingOverlay, errorContainer, controlsPanel;
    let timestampEl, frameCurrentEl, frameTotalEl, frameSlider;
    let btnFirst, btnPrev, btnPlay, btnPause, btnNext, btnLast;
    let btnSpeedSlow, btnSpeedNormal, btnSpeedFast, btnSpeedVeryFast;
    let btnRefresh, btnToggleBase, btnToggleLegend, btnToggleLocation;
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
            return response.ok;
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

        console.log('[RADAR] Initializing Radar Map (Brisbane/Grafton)...');

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
        btnToggleLocation = document.getElementById('radar-location-toggle');
        legendEl = document.getElementById('radar-legend');

        if (!mapContainer) {
            console.error('[RADAR] Radar map container not found');
            return;
        }

        showLoading();
        const serverOnline = await checkServerConnectivity();

        if (!serverOnline) {
            hideLoading();
            showError('Cannot connect to server. Please ensure the Node.js server is running.');
            updateRadarStatus('Server Offline');
            return;
        }

        // Initialize Leaflet map centered on Brisbane initially
        const initialRadar = RADARS[currentRadarKey];
        radarMap = L.map('radar-map', {
            center: [initialRadar.lat, initialRadar.lon],
            zoom: initialRadar.zoom,
            minZoom: 4,
            maxZoom: 12,
            zoomControl: true,
            attributionControl: true,
            zoomAnimation: true,
            fadeAnimation: true,
            maxBoundsViscosity: 0.6 // Rubber effect for boundaries
        });

        window.ensureRadarPane(radarMap);

        // Base Layers
        mapBaseLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
            maxZoom: 20
        });

        satelliteBaseLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; Esri',
            maxZoom: 19
        });

        mapBaseLayer.addTo(radarMap);

        // Labels
        labelLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', {
            attribution: '',
            pane: 'labelPane'
        }).addTo(radarMap);

        setupControls();
        updatePlayPauseButtons();
        updateSpeedButtons();

        // Fit bounds to initial radar
        fitToRadar(currentRadarKey, false);

        // Load Data
        await loadRadarData(false);

        // Auto-refresh
        refreshTimer = setInterval(() => {
            console.log('[RADAR] Auto-refreshing data...');
            loadRadarData(true);
        }, REFRESH_INTERVAL);

        radarInitialized = true;
        console.log('[RADAR] Initialization complete');
    }

    /**
     * Fit map to specific radar bounds
     */
    function fitToRadar(key, animate = true) {
        const radar = RADARS[key];
        if (!radar) return;

        // Release previous bounds to allow free movement during transition
        radarMap.setMaxBounds(null);

        // Use the helper to calculate bounds based on radius
        // We use a slightly larger radius for the view bounds to add padding
        const viewRadius = radar.radiusKm * 1.1;
        
        // Simple approximation for view:
        const latOffset = viewRadius / 111.32;
        const south = radar.lat - latOffset;
        const north = radar.lat + latOffset;
        const west = radar.lon - (viewRadius / (111.32 * Math.cos(radar.lat * Math.PI / 180)));
        const east = radar.lon + (viewRadius / (111.32 * Math.cos(radar.lat * Math.PI / 180)));

        const viewBounds = [[south, west], [north, east]];

        // Calculate Max Bounds (Restriction Boundary)
        // Allow panning 50% beyond the radar edge (1.5x radius) -> Updated to 2.0x
        const boundaryRadius = radar.radiusKm * 2.0; 
        const boundLatOffset = boundaryRadius / 111.32;
        const boundSouth = radar.lat - boundLatOffset;
        const boundNorth = radar.lat + boundLatOffset;
        const boundWest = radar.lon - (boundaryRadius / (111.32 * Math.cos(radar.lat * Math.PI / 180)));
        const boundEast = radar.lon + (boundaryRadius / (111.32 * Math.cos(radar.lat * Math.PI / 180)));
        
        const maxBounds = [[boundSouth, boundWest], [boundNorth, boundEast]];

        if (animate) {
            radarMap.flyToBounds(viewBounds, {
                padding: [20, 20],
                duration: 0.4, // Faster swoosh duration
                easeLinearity: 0.25
            });
            
            // Set max bounds after animation completes
            setTimeout(() => {
                radarMap.setMaxBounds(maxBounds);
            }, 500); // Slightly longer than duration
        } else {
            radarMap.fitBounds(viewBounds, { padding: [20, 20] });
            radarMap.setMaxBounds(maxBounds);
        }
        
        // Update button title
        if (btnToggleLocation) {
            const nextKey = key === 'brisbane' ? 'grafton' : 'brisbane';
            const nextRadar = RADARS[nextKey];
            btnToggleLocation.title = `Switch to ${nextRadar.name}`;
            // Update icon or style if needed
             if (key === 'grafton') {
                btnToggleLocation.classList.add('active');
            } else {
                btnToggleLocation.classList.remove('active');
            }
        }
    }

    /**
     * Toggle Radar Location
     */
    function toggleRadarLocation() {
        const newKey = currentRadarKey === 'brisbane' ? 'grafton' : 'brisbane';
        currentRadarKey = newKey;
        console.log(`[RADAR] Switching to ${RADARS[newKey].name}`);
        
        // Fly to new location
        fitToRadar(newKey, true);
        
        // Update visible frames
        showFrame(currentFrameIndex);
    }

    /**
     * Setup control button event listeners
     */
    function setupControls() {
        if (btnFirst) btnFirst.addEventListener('click', () => { stopAnimation(); showFrame(0); });
        if (btnPrev) btnPrev.addEventListener('click', () => { stopAnimation(); showFrame(currentFrameIndex - 1); });
        if (btnPlay) btnPlay.addEventListener('click', startAnimation);
        if (btnPause) btnPause.addEventListener('click', stopAnimation);
        if (btnNext) btnNext.addEventListener('click', () => { stopAnimation(); showFrame(currentFrameIndex + 1); });
        if (btnLast) btnLast.addEventListener('click', () => { stopAnimation(); showFrame(frames.length - 1); });

        if (btnSpeedSlow) btnSpeedSlow.addEventListener('click', () => setSpeed('slow'));
        if (btnSpeedNormal) btnSpeedNormal.addEventListener('click', () => setSpeed('normal'));
        if (btnSpeedFast) btnSpeedFast.addEventListener('click', () => setSpeed('fast'));
        if (btnSpeedVeryFast) btnSpeedVeryFast.addEventListener('click', () => setSpeed('veryfast'));

        if (btnRefresh) btnRefresh.addEventListener('click', () => loadRadarData(true));
        if (btnToggleBase) btnToggleBase.addEventListener('click', toggleBaseLayer);
        if (btnToggleLegend) btnToggleLegend.addEventListener('click', toggleLegend);
        
        if (btnToggleLocation) {
            btnToggleLocation.addEventListener('click', toggleRadarLocation);
        }

        if (frameSlider) {
            frameSlider.addEventListener('input', (e) => {
                stopAnimation();
                showFrame(parseInt(e.target.value));
            });
        }
    }

    /**
     * Load radar data
     */
    async function loadRadarData(isRefresh = false) {
        try {
            showLoading();
            console.log(`[RADAR] ${isRefresh ? 'Refreshing' : 'Loading'} radar data...`);

            const url = `${API_BASE}/frames${isRefresh ? '?refresh=1' : ''}`;
            const response = await fetch(url, { cache: 'no-cache' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Failed to load radar data');

            frames = data.frames || [];
            if (frames.length === 0) throw new Error('No radar frames available');

            if (isRefresh) clearAllOverlays();

            createRadarOverlays();
            updateFrameControls();
            showFrame(frames.length - 1);
            updateRadarStatus('Online');

            setTimeout(() => { hideLoading(); hideError(); showControls(); }, 500);

        } catch (error) {
            console.error('[RADAR] Error loading radar data:', error);
            hideLoading();
            hideControls();
            showError(`Failed to load radar data: ${error.message}`);
            updateRadarStatus('Error');
        }
    }

    /**
     * Create overlays for Brisbane and Grafton
     */
    function createRadarOverlays() {
        radarOverlays = {};
        
        // Initialize storage for our specific radars
        Object.keys(RADARS).forEach(key => {
            radarOverlays[key] = {};
        });

        // Create overlays
        frames.forEach((frame, frameIndex) => {
            Object.keys(RADARS).forEach(key => {
                const radar = RADARS[key];
                const overlay = window.createRadarImageOverlay(
                    radar.id,
                    radar.lat,
                    radar.lon,
                    frame.timestamp,
                    radar.radiusKm
                );
                radarOverlays[key][frameIndex] = overlay;
            });
        });
        
        console.log(`[RADAR] Created overlays for ${frames.length} frames`);
    }

    /**
     * Show specific frame for the CURRENT radar
     */
    function showFrame(frameIndex) {
        if (frameIndex < 0 || frameIndex >= frames.length) return;
        currentFrameIndex = frameIndex;

        // Remove ALL currently visible overlays
        visibleOverlays.forEach(overlay => {
            if (radarMap.hasLayer(overlay)) radarMap.removeLayer(overlay);
        });
        visibleOverlays = [];

        // Add overlay for the CURRENT radar only
        const currentRadarOverlays = radarOverlays[currentRadarKey];
        if (currentRadarOverlays && currentRadarOverlays[frameIndex]) {
            const overlay = currentRadarOverlays[frameIndex];
            overlay.addTo(radarMap);
            visibleOverlays.push(overlay);
        }

        updateFrameDisplay();
    }

    /**
     * Update frame display (slider, text)
     */
    function updateFrameDisplay() {
        const frame = frames[currentFrameIndex];
        if (frameCurrentEl) frameCurrentEl.textContent = currentFrameIndex + 1;
        if (frameTotalEl) frameTotalEl.textContent = frames.length;
        if (frameSlider) frameSlider.value = currentFrameIndex;

        if (timestampEl && frame) {
            const formatted = window.formatRadarTimestamp(frame.timestamp);
            const timeAgo = window.getTimeAgo(frame.timestamp);
            timestampEl.textContent = `${formatted.fullDate} (${timeAgo})`;
        }
    }

    function updateFrameControls() {
        if (frameSlider) {
            frameSlider.max = frames.length - 1;
            frameSlider.value = currentFrameIndex;
        }
        if (frameTotalEl) frameTotalEl.textContent = frames.length;
    }

    function startAnimation() {
        if (isPlaying) return;
        isPlaying = true;
        updatePlayPauseButtons();
        animationInterval = setInterval(() => {
            let nextIndex = currentFrameIndex + 1;
            if (nextIndex >= frames.length) nextIndex = 0;
            showFrame(nextIndex);
        }, ANIMATION_SPEEDS[currentSpeed]);
    }

    function stopAnimation() {
        if (!isPlaying) return;
        isPlaying = false;
        updatePlayPauseButtons();
        if (animationInterval) {
            clearInterval(animationInterval);
            animationInterval = null;
        }
    }

    function setSpeed(speed) {
        currentSpeed = speed;
        updateSpeedButtons();
        if (isPlaying) {
            stopAnimation();
            startAnimation();
        }
    }

    function updatePlayPauseButtons() {
        if (btnPlay) btnPlay.style.display = isPlaying ? 'none' : 'inline-block';
        if (btnPause) btnPause.style.display = isPlaying ? 'inline-block' : 'none';
    }

    function updateSpeedButtons() {
        if (btnSpeedSlow) btnSpeedSlow.classList.toggle('active', currentSpeed === 'slow');
        if (btnSpeedNormal) btnSpeedNormal.classList.toggle('active', currentSpeed === 'normal');
        if (btnSpeedFast) btnSpeedFast.classList.toggle('active', currentSpeed === 'fast');
        if (btnSpeedVeryFast) btnSpeedVeryFast.classList.toggle('active', currentSpeed === 'veryfast');
    }

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
    }

    function toggleLegend() {
        if (!legendEl) return;
        const isHidden = legendEl.style.display === 'none' || !legendEl.style.display;
        legendEl.style.display = isHidden ? 'block' : 'none';
        if (btnToggleLegend) btnToggleLegend.title = isHidden ? 'Hide rainfall legend' : 'Show rainfall legend';
    }

    function clearAllOverlays() {
        visibleOverlays.forEach(overlay => {
            if (overlay && radarMap.hasLayer(overlay)) radarMap.removeLayer(overlay);
        });
        radarOverlays = {};
        visibleOverlays = [];
    }

    function showLoading() { if (loadingOverlay) loadingOverlay.style.display = 'flex'; }
    function hideLoading() { if (loadingOverlay) loadingOverlay.style.display = 'none'; }
    
    function showError(message) {
        if (errorContainer) {
            errorContainer.innerHTML = message;
            errorContainer.style.display = 'block';
        }
    }
    
    function hideError() { if (errorContainer) errorContainer.style.display = 'none'; }
    function showControls() { if (controlsPanel) controlsPanel.style.display = 'block'; }
    function hideControls() { if (controlsPanel) controlsPanel.style.display = 'none'; }

    function updateRadarStatus(status) {
        // Global status is managed by index.html's checkRadarAvailability
        // We log here for debugging but do not overwrite the UI to prevent conflicts
        console.log(`[RADAR MAP] Status change: ${status}`);
        
        // Legacy code removed to prevent fighting with global status checker
        /*
        const statusEl = document.getElementById('radar-status-value');
        if (statusEl) {
            statusEl.textContent = status;
            statusEl.className = status === 'Online' ? 'status-value online' : (status === 'Error' ? 'status-value offline' : 'status-value');
        }
        */
    }

    function resetRadarView() {
        if (radarMap && radarInitialized) {
            if (isPlaying) stopAnimation();
            fitToRadar(currentRadarKey, true);
        }
    }

    function initOnTabShow() {
        const radarTab = document.getElementById('tab-radar');
        if (radarTab) {
            radarTab.addEventListener('click', () => {
                setTimeout(() => {
                    if (!radarInitialized) {
                        initRadarMap();
                    } else if (radarMap) {
                        radarMap.invalidateSize();
                        resetRadarView();
                    }
                }, 100);
            });
        }

        const radarContent = document.getElementById('content-radar');
        if (radarContent && radarContent.classList.contains('active')) {
            setTimeout(initRadarMap, 100);
        }
    }

    window.resetRadarView = resetRadarView;

    window.addEventListener('beforeunload', () => {
        if (refreshTimer) clearInterval(refreshTimer);
        stopAnimation();
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initOnTabShow);
    } else {
        initOnTabShow();
    }
})();