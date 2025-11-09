(function() {
    // Configuration
    const REFRESH_INTERVAL = 6 * 60 * 1000; // 6 minutes
    const API_BASE = '/api/radar';
    const ANIMATION_SPEEDS = {
        slow: 1000,
        normal: 500,
        fast: 250
    };

    // Expanded Australia bounds with more rubber - allows zooming to edges
    const AUSTRALIA_BOUNDS = [
        [-50.0, 108.0], // Southwest (expanded)
        [-8.0, 160.0]   // Northeast (expanded)
    ];

    // NSW initial view
    const NSW_CENTER = [-32.5, 147.0];
    const NSW_ZOOM = 6;

    // State
    let radarMap = null;
    let radarOverlayGroups = {}; // Organized by radar ID, then timestamp index
    let radarConfigs = []; // Radar configurations from server
    let timestamps = [];
    let currentFrameIndex = 0;
    let isPlaying = false;
    let animationInterval = null;
    let currentSpeed = 'normal';
    let radarInitialized = false;
    let refreshTimer = null;
    let isPausingOnLastFrame = false;

    // DOM Elements
    let mapContainer, loadingOverlay, errorContainer, controlsPanel;
    let timestampEl, frameCurrentEl, frameTotalEl, frameSlider;
    let btnFirst, btnPrev, btnPlay, btnPause, btnNext, btnLast;
    let btnSpeedSlow, btnSpeedNormal, btnSpeedFast;
    let btnRefresh;

    function initRadarMap() {
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

        if (!mapContainer) {
            console.error('Radar map container not found');
            return;
        }

        // Initialize Leaflet map with expanded bounds
        radarMap = L.map('radar-map', {
            center: NSW_CENTER,
            zoom: NSW_ZOOM,
            minZoom: 4,
            maxZoom: 10,
            maxBounds: AUSTRALIA_BOUNDS,
            maxBoundsViscosity: 0.3, // More flexible boundaries
            preferCanvas: true
        });

        // Add OSM tile layer with fallback and error handling
        const tileUrls = [
            'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://tiles.wmflabs.org/osm/{z}/{x}/{y}.png'
        ];

        let currentTileUrlIndex = 0;

        function createTileLayer(url) {
            const layer = L.tileLayer(url, {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                maxZoom: 10,
                crossOrigin: true,
                errorTileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
            });

            layer.on('tileerror', function(error) {
                console.warn('[RADAR] Tile load error:', error.tile.src);
                // Try fallback server if available
                if (currentTileUrlIndex < tileUrls.length - 1) {
                    currentTileUrlIndex++;
                    console.log('[RADAR] Switching to fallback tile server:', tileUrls[currentTileUrlIndex]);
                    radarMap.removeLayer(layer);
                    const newLayer = createTileLayer(tileUrls[currentTileUrlIndex]);
                    newLayer.addTo(radarMap);
                }
            });

            return layer;
        }

        const tileLayer = createTileLayer(tileUrls[currentTileUrlIndex]);
        tileLayer.addTo(radarMap);

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
        console.log('[RADAR] Map initialized');

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
        btnLast.addEventListener('click', () => setFrame(timestamps.length - 1));

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

            if (!data.success || !data.timestamps || data.timestamps.length === 0) {
                throw new Error('No radar frames available');
            }

            timestamps = data.timestamps;
            radarConfigs = data.radarConfig || [];
            const radarFrames = data.radars || {};

            console.log(`[RADAR] Loaded ${timestamps.length} timestamps across ${radarConfigs.length} radars`);

            await loadFrameOverlays(radarFrames);

            hideLoading();
            showControls();

            // Start on the most recent frame
            setFrame(timestamps.length - 1);

            if (force) {
                showNotification('Radar data refreshed', 'success');
            }

            updateRadarStatus('Online');

        } catch (error) {
            console.error('[RADAR] Error loading radar data:', error);
            showError('Unable to load radar data: ' + error.message);
            updateRadarStatus('Connection Error');
        }
    }

    async function loadFrameOverlays(radarFrames) {
        // Clear existing overlays
        for (const radarId in radarOverlayGroups) {
            for (const overlays of radarOverlayGroups[radarId]) {
                if (overlays && radarMap.hasLayer(overlays)) {
                    radarMap.removeLayer(overlays);
                }
            }
        }
        radarOverlayGroups = {};

        // Create overlays for each radar at each timestamp
        let totalOverlays = 0;
        for (const radarConfig of radarConfigs) {
            const radarId = radarConfig.id;
            const radarData = radarFrames[radarId] || [];

            radarOverlayGroups[radarId] = [];

            // For each timestamp, find the matching frame for this radar
            for (let timestampIndex = 0; timestampIndex < timestamps.length; timestampIndex++) {
                const timestamp = timestamps[timestampIndex];
                const frameData = radarData.find(f => f.timestamp === timestamp);

                if (frameData) {
                    const imageUrl = `${API_BASE}/image/${frameData.filename}`;
                    const bounds = radarConfig.bounds; // Use radar-specific bounds

                    const overlay = L.imageOverlay(imageUrl, bounds, {
                        opacity: 0,
                        interactive: false,
                        className: 'radar-overlay-image',
                        crossOrigin: 'anonymous'
                    });

                    // Add load event to improve rendering
                    overlay.on('load', function() {
                        const img = this.getElement();
                        if (img) {
                            img.style.imageRendering = 'crisp-edges';
                            img.style.imageRendering = '-webkit-optimize-contrast';
                            img.style.imageRendering = 'pixelated';
                        }
                    });

                    overlay.addTo(radarMap);
                    radarOverlayGroups[radarId][timestampIndex] = overlay;
                    totalOverlays++;
                } else {
                    // No data for this radar at this timestamp
                    radarOverlayGroups[radarId][timestampIndex] = null;
                }
            }
        }

        console.log(`[RADAR] Created ${totalOverlays} overlays across ${radarConfigs.length} radars`);

        // Update slider max
        frameSlider.max = timestamps.length - 1;
        frameTotalEl.textContent = timestamps.length;
    }

    function setFrame(index) {
        if (index < 0 || index >= timestamps.length) return;

        // Hide all overlays from all radars
        for (const radarId in radarOverlayGroups) {
            for (const overlay of radarOverlayGroups[radarId]) {
                if (overlay) {
                    overlay.setOpacity(0);
                }
            }
        }

        // Show all radar overlays for current timestamp
        for (const radarId in radarOverlayGroups) {
            const overlay = radarOverlayGroups[radarId][index];
            if (overlay) {
                overlay.setOpacity(0.7);
            }
        }

        currentFrameIndex = index;

        // Update UI
        updateFrameUI();
    }

    function updateFrameUI() {
        if (currentFrameIndex < 0 || currentFrameIndex >= timestamps.length) return;

        const timestamp = timestamps[currentFrameIndex];

        // Parse timestamp: YYYYMMDDHHmm
        const year = timestamp.substring(0, 4);
        const month = timestamp.substring(4, 6);
        const day = timestamp.substring(6, 8);
        const hour = timestamp.substring(8, 10);
        const minute = timestamp.substring(10, 12);

        const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00+10:00`);

        // Update timestamp
        timestampEl.textContent = date.toLocaleString('en-AU', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
        });

        // Update frame counter
        frameCurrentEl.textContent = currentFrameIndex + 1;

        // Update slider
        frameSlider.value = currentFrameIndex;
    }

    function nextFrame() {
        if (currentFrameIndex < timestamps.length - 1) {
            setFrame(currentFrameIndex + 1);
        } else {
            // On last frame - pause before looping
            if (isPlaying && !isPausingOnLastFrame) {
                isPausingOnLastFrame = true;
                setTimeout(() => {
                    if (isPlaying) {
                        setFrame(0); // Loop back to start
                        isPausingOnLastFrame = false;
                    }
                }, ANIMATION_SPEEDS[currentSpeed]); // Pause for one frame duration
            } else if (!isPlaying) {
                setFrame(0); // Manual navigation just loops
            }
        }
    }

    function previousFrame() {
        if (currentFrameIndex > 0) {
            setFrame(currentFrameIndex - 1);
        } else {
            setFrame(timestamps.length - 1); // Loop to end
        }
    }

    function play() {
        if (isPlaying) return;

        isPlaying = true;
        isPausingOnLastFrame = false;
        btnPlay.style.display = 'none';
        btnPause.style.display = 'flex';

        animate();
    }

    function pause() {
        if (!isPlaying) return;

        isPlaying = false;
        isPausingOnLastFrame = false;
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
            if (!isPlaying || isPausingOnLastFrame) return;
            nextFrame();
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
            isPausingOnLastFrame = false;
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

    function resetRadarView() {
        // Stop any playing animation
        if (isPlaying) {
            pause();
        }

        // Reset to initial view
        if (radarMap) {
            radarMap.setView(NSW_CENTER, NSW_ZOOM);
        }

        // Reset to most recent frame
        if (timestamps.length > 0) {
            setFrame(timestamps.length - 1);
        }

        // Reset speed to normal
        setSpeed('normal');

        // Fix map size
        setTimeout(() => {
            if (radarMap) {
                radarMap.invalidateSize();
            }
        }, 100);

        console.log('[RADAR] View reset to initial state');
    }

    // Initialize when radar tab is clicked
    const radarTab = document.getElementById('tab-radar');
    if (radarTab) {
        radarTab.addEventListener('click', function() {
            // Small delay to ensure tab content is visible
            setTimeout(() => {
                if (!radarInitialized) {
                    initRadarMap();
                } else {
                    // Reset view when returning to radar tab
                    resetRadarView();
                }
            }, 100);
        });
    }

    // Export for status checking
    window.radarMapInitialized = false;

    // Update global flag when initialized
    const originalInit = initRadarMap;
    initRadarMap = function() {
        originalInit();
        window.radarMapInitialized = true;
    };

})();
