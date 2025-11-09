(function() {
    // Configuration
    const REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes
    const API_BASE = '/api/radar';
    const ANIMATION_SPEEDS = {
        slow: 1000,
        normal: 500,
        fast: 250
    };

    // Australia bounds for map restriction (optimized for coverage and performance)
    const AUSTRALIA_BOUNDS = [
        [-47.0, 108.0], // Southwest (expanded for better coverage)
        [-8.0, 158.0]   // Northeast (includes full continent + buffer)
    ];

    // Australia initial view
    const AUSTRALIA_CENTER = [-25.0, 133.0];
    const AUSTRALIA_ZOOM = 5;

    // Zoom-based optimization thresholds
    const ZOOM_THRESHOLDS = {
        LOW_DETAIL: 6,      // Below this: minimal tiles
        MEDIUM_DETAIL: 8,   // Below this: reduced quality
        HIGH_DETAIL: 10     // Above this: full quality
    };

    const LISMORE_COORDS = [-28.806, 153.277];
    const LISMORE_VIEW_ZOOM = 10;

    // State
    let radarMap = null;
    let radarLayers = [];
    let labelLayer = null;
    let mapBaseLayer = null;
    let satelliteBaseLayer = null;
    let currentBaseLayer = 'map';
    let frames = [];
    let currentFrameIndex = 0;
    let isPlaying = false;
    let animationInterval = null;
    let currentSpeed = 'normal';
    let radarInitialized = false;
    let refreshTimer = null;
    let lismoreMarker = null;
    let lismoreMarkerVisible = true;
    let radarOpacity = 0.9;

    // DOM Elements
    let mapContainer, loadingOverlay, errorContainer, controlsPanel;
    let timestampEl, frameCurrentEl, frameTotalEl, frameSlider;
    let btnFirst, btnPrev, btnPlay, btnPause, btnNext, btnLast;
    let btnSpeedSlow, btnSpeedNormal, btnSpeedFast;
    let btnRefresh;
    let btnViewNational, btnViewLismore, btnToggleLismore, opacitySlider;

    async function checkServerConnectivity() {
        try {
            const response = await fetch('/status', {
                method: 'GET',
                cache: 'no-cache',
                signal: AbortSignal.timeout(5000) // 5 second timeout
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

    async function initRadarMap() {
        if (radarInitialized) return;

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

        btnRefresh = document.getElementById('radar-refresh');
        btnViewNational = document.getElementById('radar-view-national');
        btnViewLismore = document.getElementById('radar-view-lismore');
        btnToggleLismore = document.getElementById('radar-toggle-lismore');
        opacitySlider = document.getElementById('radar-opacity-slider');

        if (!mapContainer) {
            console.error('Radar map container not found');
            return;
        }

        if (opacitySlider) {
            const initialOpacity = Math.round(radarOpacity * 100);
            opacitySlider.value = initialOpacity;
            opacitySlider.setAttribute('aria-valuenow', String(initialOpacity));
        }

        // Check server connectivity before initializing
        showLoading();
        const serverOnline = await checkServerConnectivity();

        if (!serverOnline) {
            hideLoading();
            const currentURL = window.location.href;
            let errorMsg = 'Cannot connect to server. ';

            if (currentURL.startsWith('file://')) {
                errorMsg += 'You are opening the file directly. Please start the server with "node server.js" and access via http://localhost:3000';
            } else {
                errorMsg += 'Please ensure the Node.js server is running on port 3000. Run "node server.js" in the lismore-flood-proxy folder.';
            }

            showError(errorMsg);
            updateRadarStatus('Server Offline');
            console.error('[RADAR] Initialization aborted - server not accessible');
            console.error('[RADAR] Current URL:', currentURL);
            console.error('[RADAR] Expected URL: http://localhost:3000');
            return;
        }

        // Initialize Leaflet map with elastic Australia bounds
        radarMap = L.map('radar-map', {
            center: AUSTRALIA_CENTER,
            zoom: AUSTRALIA_ZOOM,
            minZoom: 5,              // Increased min zoom for performance
            maxZoom: 10,             // Limited by RainViewer radar data availability
            maxBounds: AUSTRALIA_BOUNDS,
            maxBoundsViscosity: 0.6, // Elastic boundary (rubber band effect)
            preferCanvas: true,
            zoomControl: true,
            attributionControl: true,
            worldCopyJump: false,    // Disable world wrapping
            noWrap: true,            // Prevent tile wrapping
            fadeAnimation: false     // Disable tile fade transitions for instant radar frame changes
        });

        L.control.scale({
            position: 'bottomleft',
            imperial: false
        }).addTo(radarMap);

        // Add event listeners for aggressive tile management
        radarMap.on('zoomstart', function() {
            // Clear tiles from all inactive radar layers before zoom
            radarLayers.forEach((layer, i) => {
                if (i !== currentFrameIndex && layer._map) {
                    layer.setActive(false); // Clear tiles from inactive frames
                }
            });
        });

        radarMap.on('zoomend', function() {
            const currentZoom = radarMap.getZoom();

            // Notify user when they reach radar zoom limit
            if (currentZoom >= 10 && radarLayers.length > 0) {
                console.log('[RADAR] Maximum radar detail reached (zoom 10) - Base map continues to zoom');
            }

            // After zoom, prune tiles aggressively
            pruneTilesAggressively();

            // Update only the active radar frame
            const activeLayer = radarLayers[currentFrameIndex];
            if (activeLayer && activeLayer._map) {
                activeLayer._update();
            }
        });

        // Aggressive tile management during pan
        let moveTimeout;
        radarMap.on('movestart', function() {
            clearTimeout(moveTimeout);
        });

        radarMap.on('moveend', function() {
            // Small delay after pan before loading tiles
            clearTimeout(moveTimeout);
            moveTimeout = setTimeout(() => {
                // Only update the active radar frame
                const activeLayer = radarLayers[currentFrameIndex];
                if (activeLayer && activeLayer._map) {
                    activeLayer._update();
                }

                // Prune tiles from all layers
                pruneTilesAggressively();
            }, 100);
        });

        // Create custom pane for radar overlay (below labels, above tiles)
        radarMap.createPane('radarPane');
        const radarPane = radarMap.getPane('radarPane');
        radarPane.style.zIndex = 300; // Below overlayPane (400), above tilePane (200)
        radarPane.style.pointerEvents = 'none'; // Allow click-through to base map

        // Create map base layer (CartoDB Voyager WITHOUT labels) - OPTIMIZED with strict filtering
        mapBaseLayer = window.BomRadarColorMapper.createFilteredLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            minZoom: 5,
            maxZoom: 18,                    // Base map can zoom further than radar
            bounds: AUSTRALIA_BOUNDS,       // Leaflet bounds hint
            australiaBounds: AUSTRALIA_BOUNDS, // Strict filtering in _isValidTile
            updateWhenIdle: true,
            keepBuffer: 0,                  // Zero buffer - only load visible tiles
            noWrap: true,
            pane: 'tilePane'
        });

        // Create satellite base layer (ESRI World Imagery) - OPTIMIZED with strict filtering
        satelliteBaseLayer = window.BomRadarColorMapper.createFilteredLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics',
            minZoom: 5,
            maxZoom: 18,                    // Base map can zoom further than radar
            bounds: AUSTRALIA_BOUNDS,       // Leaflet bounds hint
            australiaBounds: AUSTRALIA_BOUNDS, // Strict filtering in _isValidTile
            updateWhenIdle: true,
            keepBuffer: 0,                  // Zero buffer - only load visible tiles
            noWrap: true,
            pane: 'tilePane'
        });

        // Add map layer by default
        mapBaseLayer.addTo(radarMap);
        currentBaseLayer = 'map';

        // Add Lismore focus marker by default
        lismoreMarker = L.circleMarker(LISMORE_COORDS, {
            radius: 6,
            color: '#ff5722',
            weight: 2,
            fillColor: '#ff7043',
            fillOpacity: 0.85,
            pane: 'markerPane'
        }).addTo(radarMap);
        lismoreMarker.bindTooltip('Lismore', {
            permanent: true,
            direction: 'top',
            offset: [0, -10],
            className: 'radar-lismore-tooltip'
        });
        lismoreMarker.bringToFront();
        lismoreMarkerVisible = true;
        setActiveViewButton('national');

        // Fix map size after initialization
        setTimeout(() => {
            radarMap.invalidateSize();
        }, 100);

        // Handle window resize
        window.addEventListener('resize', () => {
            if (radarMap && radarInitialized) {
                radarMap.invalidateSize();
            }
        });

        // Setup event listeners
        setupEventListeners();

        radarInitialized = true;
        console.log('[RADAR] Map initialized with Australia bounds:', AUSTRALIA_BOUNDS);
        console.log('[RADAR] Map configured: maxZoom=10, maxBoundsViscosity=0.6 (elastic), noWrap=true');

        // Load initial radar data
        loadRadarData();

        // Setup auto-refresh
        setupAutoRefresh();

        // Update status
        updateRadarStatus('Online');
    }

    function setupEventListeners() {
        // Control buttons
        btnFirst.addEventListener('click', () => setFrame(0));
        btnPrev.addEventListener('click', previousFrame);
        btnPlay.addEventListener('click', play);
        btnPause.addEventListener('click', pause);
        btnNext.addEventListener('click', nextFrame);
        btnLast.addEventListener('click', () => setFrame(frames.length - 1));

        // Frame slider
        frameSlider.addEventListener('input', (e) => {
            setFrame(parseInt(e.target.value));
        });

        // Speed controls
        btnSpeedSlow.addEventListener('click', () => setSpeed('slow'));
        btnSpeedNormal.addEventListener('click', () => setSpeed('normal'));
        btnSpeedFast.addEventListener('click', () => setSpeed('fast'));

        // Refresh button
        if (btnRefresh) {
            btnRefresh.addEventListener('click', () => loadRadarData(true));
        }

        // Legend toggle button
        const legendToggle = document.getElementById('radar-legend-toggle');
        const legend = document.getElementById('radar-legend');
        if (legendToggle && legend) {
            legendToggle.addEventListener('click', () => {
                const isVisible = legend.style.display !== 'none';
                legend.style.display = isVisible ? 'none' : 'block';
            });
        }

        // Base layer toggle button (Map/Satellite)
        const baseLayerToggle = document.getElementById('radar-baselayer-toggle');
        if (baseLayerToggle) {
            baseLayerToggle.addEventListener('click', toggleBaseLayer);
        }

        if (btnViewNational) {
            btnViewNational.addEventListener('click', () => {
                resetToNationalView();
                setActiveViewButton('national');
            });
        }

        if (btnViewLismore) {
            btnViewLismore.addEventListener('click', () => {
                focusOnLismore();
                setActiveViewButton('lismore');
            });
        }

        if (btnToggleLismore) {
            btnToggleLismore.addEventListener('click', toggleLismoreMarkerVisibility);
        }

        if (opacitySlider) {
            const updateOpacity = () => {
                const value = parseInt(opacitySlider.value, 10);
                setRadarOpacity(value);
            };
            opacitySlider.addEventListener('input', updateOpacity);
            opacitySlider.addEventListener('change', updateOpacity);
        }
    }

    function toggleBaseLayer() {
        const toggleBtn = document.getElementById('radar-baselayer-toggle');

        if (currentBaseLayer === 'map') {
            // Switch to satellite
            radarMap.removeLayer(mapBaseLayer);
            satelliteBaseLayer.addTo(radarMap);
            currentBaseLayer = 'satellite';
            toggleBtn.classList.add('satellite');
            toggleBtn.title = 'Switch to map view';
            console.log('[RADAR] Switched to satellite view');
        } else {
            // Switch to map
            radarMap.removeLayer(satelliteBaseLayer);
            mapBaseLayer.addTo(radarMap);
            currentBaseLayer = 'map';
            toggleBtn.classList.remove('satellite');
            toggleBtn.title = 'Switch to satellite view';
            console.log('[RADAR] Switched to map view');
        }

        // Ensure label layer stays on top
        if (labelLayer && radarMap.hasLayer(labelLayer)) {
            labelLayer.bringToFront();
        }

        if (lismoreMarker && lismoreMarkerVisible) {
            lismoreMarker.bringToFront();
        }
    }

    function resetToNationalView() {
        if (!radarMap) return;
        radarMap.setView(AUSTRALIA_CENTER, AUSTRALIA_ZOOM);
    }

    function focusOnLismore() {
        if (!radarMap) return;
        radarMap.setView(LISMORE_COORDS, LISMORE_VIEW_ZOOM);
    }

    function setActiveViewButton(mode) {
        if (!btnViewNational || !btnViewLismore) return;
        btnViewNational.classList.toggle('active', mode === 'national');
        btnViewLismore.classList.toggle('active', mode === 'lismore');
        btnViewNational.setAttribute('aria-pressed', String(mode === 'national'));
        btnViewLismore.setAttribute('aria-pressed', String(mode === 'lismore'));
    }

    function toggleLismoreMarkerVisibility() {
        if (!radarMap || !lismoreMarker) return;

        if (lismoreMarkerVisible) {
            radarMap.removeLayer(lismoreMarker);
        } else {
            lismoreMarker.addTo(radarMap);
            lismoreMarker.bringToFront();
        }

        lismoreMarkerVisible = !lismoreMarkerVisible;

        if (btnToggleLismore) {
            btnToggleLismore.classList.toggle('active', lismoreMarkerVisible);
            btnToggleLismore.setAttribute('aria-pressed', String(lismoreMarkerVisible));
        }
    }

    function setRadarOpacity(valuePercent) {
        const numericValue = Number.isFinite(valuePercent) ? valuePercent : radarOpacity * 100;
        const clamped = Math.max(0, Math.min(100, numericValue));
        const normalized = Math.round(clamped) / 100;
        radarOpacity = Math.max(normalized, 0.3); // Keep overlay at least 30% visible

        if (opacitySlider) {
            opacitySlider.value = String(Math.round(radarOpacity * 100));
            opacitySlider.setAttribute('aria-valuenow', opacitySlider.value);
        }

        applyRadarOpacityToLayers();
    }

    function applyRadarOpacityToLayers() {
        radarLayers.forEach((layer, index) => {
            if (!layer.setOpacity) return;
            const targetOpacity = index === currentFrameIndex ? radarOpacity : 0;
            layer.setOpacity(targetOpacity);
        });
    }

    async function loadRadarData(force = false) {
        showLoading();

        try {
            const url = force ? `${API_BASE}/frames?refresh=1` : `${API_BASE}/frames`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            if (!data.success || !data.frames || data.frames.length === 0) {
                throw new Error('No radar frames available');
            }

            frames = data.frames.sort((a, b) => a.time - b.time); // Sort oldest to newest

            console.log(`[RADAR] Loaded ${frames.length} frames from RainViewer`);

            await loadRadarLayers();

            hideLoading();
            showControls();

            // Start on the most recent frame (this will activate tile loading for that frame)
            setFrame(frames.length - 1);

            if (force) {
                showNotification('Radar data refreshed', 'success');
            }

            updateRadarStatus('Online');

            console.log('[RADAR] Initial frame loaded - Lazy loading active');

        } catch (error) {
            console.error('[RADAR] Error loading radar data:', error);

            let errorMessage = 'Unable to load radar data';
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                errorMessage = 'Cannot connect to server. Please ensure the server is running on port 3000 and access the dashboard via http://localhost:3000';
            } else {
                errorMessage += ': ' + error.message;
            }

            showError(errorMessage);
            updateRadarStatus('Connection Error');
        }
    }

    function loadRadarLayers() {
        // Clear existing layers
        radarLayers.forEach(layer => {
            if (radarMap.hasLayer(layer)) {
                radarMap.removeLayer(layer);
            }
        });
        radarLayers = [];

        // PERFORMANCE: Only load last 8 frames (2 hours of data) instead of all frames
        const framesToLoad = frames.slice(-8);
        console.log(`[RADAR] Loading ${framesToLoad.length} frames (last 2 hours) for better performance`);

        // Create tile layers for each frame with LAZY LOADING
        // Only the active frame will load tiles, all others stay dormant
        // Using RainViewer's pre-colored tiles (skipColorMapping: true)
        for (let i = 0; i < framesToLoad.length; i++) {
            const frame = framesToLoad[i];
            const isActive = false; // All start inactive - will activate on first frame switch

            const layer = window.BomRadarColorMapper.createColorMappedLayer(frame.tileUrl, {
                opacity: 0,
                pane: 'radarPane',
                attribution: '&copy; <a href="https://www.rainviewer.com">RainViewer</a>',
                tileSize: 256,
                minZoom: 5,
                maxZoom: 10,                    // RainViewer radar data limit (prevents 403 errors)
                maxNativeZoom: 10,              // Native tile availability limit
                className: 'rainviewer-layer',
                updateWhenIdle: true,          // Only load when map is idle
                updateWhenZooming: false,       // Don't load during zoom
                keepBuffer: 0,                  // ZERO buffer - only visible tiles
                noWrap: true,                   // Prevent world wrapping
                bounds: AUSTRALIA_BOUNDS,       // Leaflet bounds hint
                australiaBounds: AUSTRALIA_BOUNDS, // Strict filtering in _isValidTile
                isActive: isActive,             // LAZY LOADING: Inactive frames don't load tiles
                skipColorMapping: true
            });

            // Add to map but keep invisible and inactive
            layer.addTo(radarMap);
            radarLayers.push(layer);
        }

        // Update frames reference to match loaded frames
        frames = framesToLoad;

        console.log(`[RADAR] Created ${radarLayers.length} radar layers with LAZY LOADING - only active frame loads tiles`);
        console.log('[RADAR] STRICT tile filtering: getTileUrl override blocks ALL tiles outside Australia bounds');
        console.log('[RADAR] Zero buffer, aggressive pruning, no transitions - INSTANT frame switching');
        console.log('[RADAR] Radar zoom limited to 10 (RainViewer limitation) - Base map continues beyond');

        // Add label layer ON TOP of radar (z-index 400)
        if (labelLayer) {
            radarMap.removeLayer(labelLayer);
        }

        // Create label pane if it doesn't exist
        if (!radarMap.getPane('labelPane')) {
            radarMap.createPane('labelPane');
            radarMap.getPane('labelPane').style.zIndex = 400; // Above radar (300)
            radarMap.getPane('labelPane').style.pointerEvents = 'none';
        }

        labelLayer = window.BomRadarColorMapper.createFilteredLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', {
            attribution: '',
            subdomains: 'abcd',
            minZoom: 5,
            maxZoom: 18,                    // Labels can zoom with base map
            bounds: AUSTRALIA_BOUNDS,       // Leaflet bounds hint
            australiaBounds: AUSTRALIA_BOUNDS, // Strict filtering in _isValidTile
            updateWhenIdle: true,
            keepBuffer: 0,                  // Zero buffer - only load visible tiles
            noWrap: true,
            pane: 'labelPane'
        });
        labelLayer.addTo(radarMap);

        console.log('[RADAR] Label layer added on top');

        // Update slider max
        frameSlider.max = frames.length - 1;
        frameTotalEl.textContent = frames.length;
    }

    /**
     * Aggressively prune tiles from all layers to free memory
     * Only keeps tiles in current view + minimal buffer
     */
    function pruneTilesAggressively() {
        if (!radarMap) return;

        const allLayers = [mapBaseLayer, satelliteBaseLayer, labelLayer, ...radarLayers].filter(Boolean);

        allLayers.forEach(layer => {
            if (layer && layer._map && layer._tiles) {
                const tileKeys = Object.keys(layer._tiles);

                // Get current tile range
                const tileRange = layer._pxBoundsToTileRange ?
                    layer._pxBoundsToTileRange(layer._map.getPixelBounds()) : null;

                tileKeys.forEach(key => {
                    const tile = layer._tiles[key];
                    if (!tile) return;

                    // If we have a tile range, check if tile is outside it
                    if (tileRange && tile.coords) {
                        const isInRange =
                            tile.coords.x >= tileRange.min.x &&
                            tile.coords.x <= tileRange.max.x &&
                            tile.coords.y >= tileRange.min.y &&
                            tile.coords.y <= tileRange.max.y &&
                            tile.coords.z === layer._tileZoom;

                        // Remove tiles outside current view
                        if (!isInRange) {
                            layer._removeTile(key);
                        }
                    }
                });
            }
        });

        console.log('[RADAR] Aggressively pruned tiles outside current view');
    }

    function setFrame(index) {
        if (index < 0 || index >= frames.length) return;

        const previousIndex = currentFrameIndex;

        // LAZY LOADING: Deactivate all layers except the new one
        radarLayers.forEach((layer, i) => {
            if (i !== index) {
                if (layer.setOpacity) {
                    layer.setOpacity(0);
                }
                if (i === previousIndex && layer.setActive) {
                    // Deactivate previous frame and clear its tiles
                    layer.setActive(false);
                }
            }
        });

        // Activate and show ONLY the current frame
        if (radarLayers[index]) {
            if (radarLayers[index].setActive) {
                radarLayers[index].setActive(true);  // LAZY LOADING: Enable tile loading
            }

            // Force immediate tile load for active frame
            if (radarLayers[index]._map) {
                setTimeout(() => {
                    radarLayers[index]._update();
                }, 50);
            }
        }

        currentFrameIndex = index;

        applyRadarOpacityToLayers();

        // Update UI
        updateFrameUI();

        // Log frame switch (throttled to avoid spam during animation)
        if (!isPlaying || index === frames.length - 1 || index === 0) {
            console.log(`[RADAR] Switched to frame ${index + 1}/${frames.length} - Only this frame loads tiles`);
        }
    }

    function updateFrameUI() {
        const frame = frames[currentFrameIndex];
        if (!frame) return;

        // Update timestamp
        const date = new Date(frame.date);
        const isPrediction = frame.isPrediction;

        let timeString = date.toLocaleString('en-AU', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
        });

        if (isPrediction) {
            timeString += ' (Forecast)';
        }

        timestampEl.textContent = timeString;

        // Update frame counter
        frameCurrentEl.textContent = currentFrameIndex + 1;

        // Update slider
        frameSlider.value = currentFrameIndex;
    }

    function nextFrame() {
        if (currentFrameIndex < frames.length - 1) {
            setFrame(currentFrameIndex + 1);
        } else {
            // On last frame, pause for one frame duration before looping
            if (isPlaying) {
                // Pause the interval temporarily
                if (animationInterval) {
                    clearInterval(animationInterval);
                    animationInterval = null;
                }
                // Wait one frame duration, then loop back and restart
                setTimeout(() => {
                    if (isPlaying) {
                        setFrame(0); // Loop back to start
                        animate(); // Restart animation
                    }
                }, ANIMATION_SPEEDS[currentSpeed]);
            } else {
                setFrame(0); // Loop back to start
            }
        }
    }

    function previousFrame() {
        if (currentFrameIndex > 0) {
            setFrame(currentFrameIndex - 1);
        } else {
            setFrame(frames.length - 1); // Loop to end
        }
    }

    function play() {
        if (isPlaying) return;

        isPlaying = true;
        btnPlay.style.display = 'none';
        btnPause.style.display = 'flex';

        animate();
    }

    function pause() {
        if (!isPlaying) return;

        isPlaying = false;
        btnPlay.style.display = 'flex';
        btnPause.style.display = 'none';

        if (animationInterval) {
            clearInterval(animationInterval);
            animationInterval = null;
        }
    }

    function animate() {
        if (animationInterval) {
            clearInterval(animationInterval);
        }

        animationInterval = setInterval(() => {
            if (!isPlaying) return;
            nextFrame();

            // Periodic cleanup every 10 frames during animation
            if (currentFrameIndex % 10 === 0) {
                setTimeout(() => pruneTilesAggressively(), 500);
            }
        }, ANIMATION_SPEEDS[currentSpeed]);
    }

    function setSpeed(speed) {
        currentSpeed = speed;

        // Update button states
        btnSpeedSlow.classList.remove('active');
        btnSpeedNormal.classList.remove('active');
        btnSpeedFast.classList.remove('active');

        if (speed === 'slow') btnSpeedSlow.classList.add('active');
        if (speed === 'normal') btnSpeedNormal.classList.add('active');
        if (speed === 'fast') btnSpeedFast.classList.add('active');

        // Restart animation if playing
        if (isPlaying) {
            animate();
        }
    }

    function setupAutoRefresh() {
        if (refreshTimer) {
            clearInterval(refreshTimer);
        }

        refreshTimer = setInterval(() => {
            console.log('[RADAR] Auto-refreshing data...');
            loadRadarData(false);
        }, REFRESH_INTERVAL);
    }

    function showLoading() {
        if (loadingOverlay) loadingOverlay.style.display = 'flex';
        if (errorContainer) errorContainer.style.display = 'none';
        if (controlsPanel) controlsPanel.style.display = 'none';
    }

    function hideLoading() {
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    }

    function showControls() {
        if (controlsPanel) controlsPanel.style.display = 'block';
    }

    function showError(message) {
        hideLoading();
        if (errorContainer) {
            errorContainer.style.display = 'flex';
            const errorMsg = document.getElementById('radar-error-message');
            if (errorMsg) errorMsg.textContent = message;
        }
    }

    function updateRadarStatus(status) {
        const radarStatusValue = document.getElementById('radar-status-value');
        if (radarStatusValue) {
            if (status === 'Online') {
                radarStatusValue.textContent = 'Online';
                radarStatusValue.className = 'status-value online';
            } else {
                radarStatusValue.textContent = status;
                radarStatusValue.className = 'status-value offline';
            }
        }
    }

    function showNotification(message, type) {
        // Use existing notification system if available
        if (typeof window.showNotification === 'function') {
            window.showNotification(message, type);
        } else {
            console.log(`[RADAR] ${type.toUpperCase()}: ${message}`);
        }
    }

    function resetRadarMap() {
        if (!radarInitialized || !radarMap) return;

        // Stop animation if playing
        pause();

        // Reset map view to initial state
        radarMap.setView(AUSTRALIA_CENTER, AUSTRALIA_ZOOM);

        // Reset speed to normal
        setSpeed('normal');

        // Reset to most recent frame if frames are loaded
        if (frames.length > 0) {
            setFrame(frames.length - 1);
        }

        // Reset to map view if currently on satellite
        if (currentBaseLayer === 'satellite') {
            const toggleBtn = document.getElementById('radar-baselayer-toggle');
            if (radarMap.hasLayer(satelliteBaseLayer)) {
                radarMap.removeLayer(satelliteBaseLayer);
            }
            if (!radarMap.hasLayer(mapBaseLayer)) {
                mapBaseLayer.addTo(radarMap);
            }
            currentBaseLayer = 'map';
            if (toggleBtn) {
                toggleBtn.classList.remove('satellite');
                toggleBtn.title = 'Switch to satellite view';
            }
        }

        console.log('[RADAR] Map reset to initial state');
    }

    // Export resetRadarMap for tab switching
    window.resetRadarMap = resetRadarMap;

    // Initialize when radar tab is clicked
    const radarTab = document.getElementById('tab-radar');
    if (radarTab) {
        radarTab.addEventListener('click', function() {
            // Small delay to ensure tab content is visible
            setTimeout(() => {
                if (!radarInitialized) {
                    initRadarMap();
                } else if (radarMap) {
                    // Fix map rendering after tab switch
                    radarMap.invalidateSize();
                    console.log('[RADAR] Map size invalidated after tab switch');
                }
            }, 100);
        });
    }

    // Also handle any tab switching events
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('tab-button') || e.target.closest('.tab-button')) {
            const clickedTab = e.target.classList.contains('tab-button') ? e.target : e.target.closest('.tab-button');
            if (clickedTab && clickedTab.id === 'tab-radar' && radarMap && radarInitialized) {
                setTimeout(() => {
                    radarMap.invalidateSize();
                }, 150);
            }
        }
    });

    // Export for status checking
    window.radarMapInitialized = false;

    // Update global flag when initialized
    const originalInit = initRadarMap;
    initRadarMap = function() {
        originalInit();
        window.radarMapInitialized = true;
    };

})();
