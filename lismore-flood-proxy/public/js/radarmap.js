(function() {
    // Configuration
    const REFRESH_INTERVAL = 6 * 60 * 1000; // 6 minutes
    const API_BASE = '/api/radar';
    const ANIMATION_SPEEDS = {
        slow: 1000,
        normal: 500,
        fast: 250
    };

    // Australia bounds for map restriction
    const AUSTRALIA_BOUNDS = [
        [-44.0, 113.0], // Southwest
        [-10.0, 154.0]  // Northeast
    ];

    // National radar bounds (approximate georeferencing for IDR00004)
    const RADAR_BOUNDS = [
        [-44.5, 112.5], // Southwest
        [-9.5, 154.5]   // Northeast
    ];

    // NSW initial view
    const NSW_CENTER = [-32.5, 147.0];
    const NSW_ZOOM = 6;

    // State
    let radarMap = null;
    let radarOverlays = [];
    let frames = [];
    let currentFrameIndex = 0;
    let isPlaying = false;
    let animationInterval = null;
    let currentSpeed = 'normal';
    let radarInitialized = false;
    let refreshTimer = null;

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

        // Initialize Leaflet map
        radarMap = L.map('radar-map', {
            center: NSW_CENTER,
            zoom: NSW_ZOOM,
            minZoom: 4,
            maxZoom: 10,
            maxBounds: AUSTRALIA_BOUNDS,
            maxBoundsViscosity: 0.75
        });

        // Add OSM tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 10
        }).addTo(radarMap);

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

            console.log(`[RADAR] Loaded ${frames.length} frames`);

            await loadFrameOverlays();

            hideLoading();
            showControls();

            // Start on the most recent frame
            setFrame(frames.length - 1);

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

    async function loadFrameOverlays() {
        // Clear existing overlays
        radarOverlays.forEach(overlay => {
            if (radarMap.hasLayer(overlay)) {
                radarMap.removeLayer(overlay);
            }
        });
        radarOverlays = [];

        // Create image overlays for each frame
        for (const frame of frames) {
            const imageUrl = `${API_BASE}/image/${frame.filename}`;
            const overlay = L.imageOverlay(imageUrl, RADAR_BOUNDS, {
                opacity: 0,
                interactive: false
            });

            overlay.addTo(radarMap);
            radarOverlays.push(overlay);
        }

        console.log(`[RADAR] Created ${radarOverlays.length} overlays`);

        // Update slider max
        frameSlider.max = frames.length - 1;
        frameTotalEl.textContent = frames.length;
    }

    function setFrame(index) {
        if (index < 0 || index >= frames.length) return;

        // Hide all overlays
        radarOverlays.forEach(overlay => overlay.setOpacity(0));

        // Show current frame
        radarOverlays[index].setOpacity(0.7);

        currentFrameIndex = index;

        // Update UI
        updateFrameUI();
    }

    function updateFrameUI() {
        const frame = frames[currentFrameIndex];
        if (!frame) return;

        // Update timestamp
        const date = new Date(frame.date);
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
        if (currentFrameIndex < frames.length - 1) {
            setFrame(currentFrameIndex + 1);
        } else {
            setFrame(0); // Loop back to start
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

    // Initialize when radar tab is clicked
    const radarTab = document.getElementById('tab-radar');
    if (radarTab) {
        radarTab.addEventListener('click', function() {
            // Small delay to ensure tab content is visible
            setTimeout(() => {
                if (!radarInitialized) {
                    initRadarMap();
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
