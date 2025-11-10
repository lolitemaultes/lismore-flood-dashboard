// Wait for BomRadarColorMapper to be available
if (typeof window.BomRadarColorMapper === 'undefined') {
    console.log('[RADAR] Waiting for BomRadarColorMapper to load...');
    let attempts = 0;
    const waitForColorMapper = setInterval(() => {
        attempts++;
        if (typeof window.BomRadarColorMapper !== 'undefined') {
            clearInterval(waitForColorMapper);
            console.log('[RADAR] BomRadarColorMapper loaded, initializing radar map...');
            initializeRadarMapModule();
        } else if (attempts > 50) {
            clearInterval(waitForColorMapper);
            console.error('[RADAR] BomRadarColorMapper failed to load after 5 seconds');
        }
    }, 100);
} else {
    initializeRadarMapModule();
}

function initializeRadarMapModule() {
(function() {
    const REFRESH_INTERVAL = 10 * 60 * 1000;
    const API_BASE = '/api/radar';
    const ANIMATION_SPEEDS = {
        slow: 1000,
        normal: 500,
        fast: 250
    };

    const AUSTRALIA_BOUNDS = [
        [-48.0, 105.0],
        [-7.0, 160.0]
    ];

    const AUSTRALIA_CENTER = [-25.0, 133.0];
    const AUSTRALIA_ZOOM = 5;

    // State
    let radarMap = null;
    let radarLayers = [];
    let currentLayer = null;
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
    let tileLoadCount = 0;
    let tileErrorCount = 0;

    // DOM Elements
    let mapContainer, loadingOverlay, errorContainer, controlsPanel;
    let timestampEl, frameCurrentEl, frameTotalEl, frameSlider;
    let btnFirst, btnPrev, btnPlay, btnPause, btnNext, btnLast;
    let btnSpeedSlow, btnSpeedNormal, btnSpeedFast;
    let btnRefresh;

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

    async function initRadarMap() {
        if (radarInitialized) return;

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

        showLoading();
        const serverOnline = await checkServerConnectivity();

        if (!serverOnline) {
            hideLoading();
            showError('Cannot connect to server. Please ensure the Node.js server is running on port 3000.');
            updateRadarStatus('Server Offline');
            return;
        }

        radarMap = L.map('radar-map', {
            center: AUSTRALIA_CENTER,
            zoom: AUSTRALIA_ZOOM,
            minZoom: 5,
            maxZoom: 10,
            maxBounds: AUSTRALIA_BOUNDS,
            maxBoundsViscosity: 0.6,
            preferCanvas: true,
            zoomControl: true,
            attributionControl: true,
            worldCopyJump: false,
            noWrap: true,
            zoomAnimation: true,
            zoomAnimationThreshold: 10,
            fadeAnimation: false,
            markerZoomAnimation: true,
            wheelPxPerZoomLevel: 120,
            zoomSnap: 1,  // INTEGER zoom only - no 7.5, 8.5
            zoomDelta: 1  // Jump by whole zoom levels
        });

        let zoomTimeout;
        let moveTimeout;
        let isZooming = false;

        radarMap.on('zoomstart', function() {
            isZooming = true;
            clearTimeout(zoomTimeout);
        });

        radarMap.on('zoomend', function() {
            const currentZoom = radarMap.getZoom();

            clearTimeout(zoomTimeout);
            zoomTimeout = setTimeout(() => {
                isZooming = false;

                // Update base map and labels
                const activeBaseLayer = currentBaseLayer === 'map' ? mapBaseLayer : satelliteBaseLayer;
                if (activeBaseLayer && activeBaseLayer._map) {
                    activeBaseLayer._update();
                }
                if (labelLayer && labelLayer._map) {
                    labelLayer._update();
                }

                // Update current layer - Leaflet requests tiles at current zoom naturally
                if (currentLayer && currentLayer._map) {
                    currentLayer._update();
                }
            }, 50);
        });

        radarMap.on('movestart', function() {
            clearTimeout(moveTimeout);
        });

        radarMap.on('moveend', function() {
            if (isZooming) return;

            clearTimeout(moveTimeout);
            moveTimeout = setTimeout(() => {
                const activeBaseLayer = currentBaseLayer === 'map' ? mapBaseLayer : satelliteBaseLayer;
                if (activeBaseLayer && activeBaseLayer._map) {
                    activeBaseLayer._update();
                }
                if (labelLayer && labelLayer._map) {
                    labelLayer._update();
                }

                if (currentLayer && currentLayer._map) {
                    currentLayer._update();
                }
            }, 50);
        });

        // Create custom pane for radar overlay
        radarMap.createPane('radarPane');
        radarMap.getPane('radarPane').style.zIndex = 300;
        radarMap.getPane('radarPane').style.pointerEvents = 'none';

        // Create base layers
        mapBaseLayer = window.BomRadarColorMapper.createFilteredLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            minZoom: 5,
            maxZoom: 18,
            bounds: AUSTRALIA_BOUNDS,
            australiaBounds: AUSTRALIA_BOUNDS,
            updateWhenIdle: false,
            updateWhenZooming: true,
            keepBuffer: 2,
            noWrap: true,
            pane: 'tilePane'
        });

        satelliteBaseLayer = window.BomRadarColorMapper.createFilteredLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics',
            minZoom: 5,
            maxZoom: 18,
            bounds: AUSTRALIA_BOUNDS,
            australiaBounds: AUSTRALIA_BOUNDS,
            updateWhenIdle: false,
            updateWhenZooming: true,
            keepBuffer: 2,
            noWrap: true,
            pane: 'tilePane'
        });

        mapBaseLayer.addTo(radarMap);
        currentBaseLayer = 'map';

        setTimeout(() => radarMap.invalidateSize(), 100);

        window.addEventListener('resize', () => {
            if (radarMap && radarInitialized) {
                radarMap.invalidateSize();
            }
        });

        setupEventListeners();

        radarInitialized = true;
        console.log('[RADAR] ✓ Map initialized');

        loadRadarData();
        setupAutoRefresh();
        updateRadarStatus('Online');
    }

    function setupEventListeners() {
        btnFirst.addEventListener('click', () => setFrame(0));
        btnPrev.addEventListener('click', previousFrame);
        btnPlay.addEventListener('click', play);
        btnPause.addEventListener('click', pause);
        btnNext.addEventListener('click', nextFrame);
        btnLast.addEventListener('click', () => setFrame(frames.length - 1));

        frameSlider.addEventListener('input', (e) => {
            setFrame(parseInt(e.target.value));
        });

        btnSpeedSlow.addEventListener('click', () => setSpeed('slow'));
        btnSpeedNormal.addEventListener('click', () => setSpeed('normal'));
        btnSpeedFast.addEventListener('click', () => setSpeed('fast'));

        if (btnRefresh) {
            btnRefresh.addEventListener('click', () => loadRadarData(true));
        }

        const legendToggle = document.getElementById('radar-legend-toggle');
        const legend = document.getElementById('radar-legend');
        if (legendToggle && legend) {
            legendToggle.addEventListener('click', () => {
                legend.style.display = legend.style.display !== 'none' ? 'none' : 'block';
            });
        }

        const baseLayerToggle = document.getElementById('radar-baselayer-toggle');
        if (baseLayerToggle) {
            baseLayerToggle.addEventListener('click', toggleBaseLayer);
        }
    }

    function toggleBaseLayer() {
        const toggleBtn = document.getElementById('radar-baselayer-toggle');

        if (currentBaseLayer === 'map') {
            radarMap.removeLayer(mapBaseLayer);
            satelliteBaseLayer.addTo(radarMap);
            currentBaseLayer = 'satellite';
            toggleBtn.classList.add('satellite');
            toggleBtn.title = 'Switch to map view';
        } else {
            radarMap.removeLayer(satelliteBaseLayer);
            mapBaseLayer.addTo(radarMap);
            currentBaseLayer = 'map';
            toggleBtn.classList.remove('satellite');
            toggleBtn.title = 'Switch to satellite view';
        }

        if (labelLayer && radarMap.hasLayer(labelLayer)) {
            labelLayer.bringToFront();
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

            frames = data.frames.sort((a, b) => a.time - b.time);

            console.log(`[RADAR] ✓ Loaded ${frames.length} frames`);

            await loadRadarLayers();

            hideLoading();
            showControls();

            setFrame(frames.length - 1);

            if (force) {
                showNotification('Radar data refreshed', 'success');
            }

            const latestFrame = frames[frames.length - 1];
            let detailText = null;
            if (latestFrame && latestFrame.date) {
                detailText = `Updated ${formatRadarTimestamp(latestFrame.date)}`;
            }

            updateRadarStatus('Online', detailText);

            if (typeof window.checkRadarAvailability === 'function') {
                window.checkRadarAvailability();
            }

        } catch (error) {
            console.error('[RADAR] Error loading radar data:', error);
            showError('Unable to load radar data: ' + error.message);
            updateRadarStatus('Offline', 'Connection error');
        }
    }

    async function loadRadarLayers() {
        const previousLayers = radarLayers.slice();
        previousLayers.forEach(layer => {
            if (!layer) return;
            if (radarMap && radarMap.hasLayer(layer)) {
                radarMap.removeLayer(layer);
            }
            if (typeof layer.off === 'function') {
                layer.off();
            }
        });

        currentLayer = null;
        radarLayers = [];
        tileLoadCount = 0;
        tileErrorCount = 0;

        const framesToLoad = frames.slice(-6);

        console.log(`[RADAR] Creating ${framesToLoad.length} frames`);

        framesToLoad.forEach((frame) => {
            const layer = window.BomRadarColorMapper.createColorMappedLayer(frame.tileUrl, {
                opacity: 0,
                pane: 'radarPane',
                attribution: '&copy; <a href="https://www.rainviewer.com">RainViewer</a>',
                tileSize: 256,
                minZoom: 5,
                maxZoom: 10,
                maxNativeZoom: 10,
                className: 'rainviewer-layer bom-radar-crisp',
                updateWhenIdle: false,
                updateWhenZooming: true,
                keepBuffer: 2,
                updateInterval: 50,
                tms: false,
                noWrap: true,
                bounds: AUSTRALIA_BOUNDS,
                australiaBounds: AUSTRALIA_BOUNDS,
                skipColorMapping: false
            });

            layer._radarReady = false;
            layer._radarFirstTileReady = false;
            layer._radarTileLoads = 0;

            layer.on('loading', function() {
                layer._radarReady = false;
                layer._radarFirstTileReady = false;
            });

            layer.on('tileload', function() {
                tileLoadCount++;
                layer._radarTileLoads += 1;

                if (!layer._radarFirstTileReady) {
                    layer._radarFirstTileReady = true;
                }

                if (tileLoadCount === 1) {
                    console.log(`[RADAR] ✓ First tile loaded successfully!`);
                }
            });

            layer.on('tileerror', function() {
                tileErrorCount++;
            });

            layer.on('load', function() {
                layer._radarReady = true;
            });

            radarLayers.push(layer);
        });

        frames = framesToLoad;

        radarLayers.forEach(layer => {
            if (radarMap && !radarMap.hasLayer(layer)) {
                layer.addTo(radarMap);
            }
            layer.setOpacity(0);
            if (typeof layer._update === 'function') {
                layer._update();
            }
        });

        // Create label pane
        if (!radarMap.getPane('labelPane')) {
            radarMap.createPane('labelPane');
            radarMap.getPane('labelPane').style.zIndex = 400;
            radarMap.getPane('labelPane').style.pointerEvents = 'none';
        }

        // Add label layer
        if (labelLayer) {
            radarMap.removeLayer(labelLayer);
        }

        labelLayer = window.BomRadarColorMapper.createFilteredLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', {
            attribution: '',
            subdomains: 'abcd',
            minZoom: 5,
            maxZoom: 18,
            bounds: AUSTRALIA_BOUNDS,
            australiaBounds: AUSTRALIA_BOUNDS,
            updateWhenIdle: false,
            updateWhenZooming: true,
            keepBuffer: 2,
            noWrap: true,
            pane: 'labelPane'
        });
        labelLayer.addTo(radarMap);

        frameSlider.max = frames.length - 1;
        frameTotalEl.textContent = frames.length;

        console.log('[RADAR] ✓ Layers created');
    }

    function setFrame(index) {
        if (index < 0 || index >= frames.length) return;

        const nextLayer = radarLayers[index];
        if (!nextLayer) return;

        const previousLayer = currentLayer && currentLayer !== nextLayer ? currentLayer : null;

        currentLayer = nextLayer;
        currentFrameIndex = index;
        updateFrameUI();

        if (radarMap && !radarMap.hasLayer(nextLayer)) {
            nextLayer.addTo(radarMap);
        }

        if (typeof nextLayer._update === 'function') {
            nextLayer._update();
        }

        const logStatus = () => {
            const tileCount = nextLayer._tiles ? Object.keys(nextLayer._tiles).length : 0;
            const loads = typeof nextLayer._radarTileLoads === 'number' ? nextLayer._radarTileLoads : tileLoadCount;
            console.log(`[RADAR] Frame ${index + 1}/${frames.length} - ${tileCount} tiles, ${loads} loaded, ${tileErrorCount} errors`);

            if (tileCount === 0 && tileErrorCount > 10) {
                console.warn('[RADAR] ⚠️ No tiles loading - may be no rain data in current area');
            }
        };

        const revealNextLayer = () => {
            nextLayer.setOpacity(1);
            if (typeof nextLayer.bringToFront === 'function') {
                nextLayer.bringToFront();
            }
            if (previousLayer && radarMap && radarMap.hasLayer(previousLayer)) {
                previousLayer.setOpacity(0);
            }
            if (labelLayer && radarMap && radarMap.hasLayer(labelLayer) && typeof labelLayer.bringToFront === 'function') {
                labelLayer.bringToFront();
            }
            setTimeout(logStatus, 250);
        };

        if (!previousLayer) {
            revealNextLayer();
            return;
        }

        nextLayer.setOpacity(0);

        if (nextLayer._radarFirstTileReady) {
            revealNextLayer();
            return;
        }

        let revealed = false;
        const cleanupAndReveal = () => {
            if (revealed) return;
            revealed = true;
            nextLayer.off('tileload', onFirstTileLoaded);
            nextLayer.off('load', onLayerLoaded);
            revealNextLayer();
        };

        const onFirstTileLoaded = () => {
            cleanupAndReveal();
        };

        const onLayerLoaded = () => {
            cleanupAndReveal();
        };

        nextLayer.on('tileload', onFirstTileLoaded);
        nextLayer.on('load', onLayerLoaded);

        setTimeout(() => {
            if (!revealed && nextLayer._radarFirstTileReady) {
                cleanupAndReveal();
            }
        }, 500);
    }

    function updateFrameUI() {
        const frame = frames[currentFrameIndex];
        if (!frame) return;

        const date = new Date(frame.date);
        let timeString = date.toLocaleString('en-AU', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
        });

        if (frame.isPrediction) {
            timeString += ' (Forecast)';
        }

        timestampEl.textContent = timeString;
        frameCurrentEl.textContent = currentFrameIndex + 1;
        frameSlider.value = currentFrameIndex;
    }

    function nextFrame() {
        if (currentFrameIndex < frames.length - 1) {
            setFrame(currentFrameIndex + 1);
        } else {
            if (isPlaying) {
                if (animationInterval) {
                    clearInterval(animationInterval);
                    animationInterval = null;
                }
                setTimeout(() => {
                    if (isPlaying) {
                        setFrame(0);
                        animate();
                    }
                }, ANIMATION_SPEEDS[currentSpeed]);
            } else {
                setFrame(0);
            }
        }
    }

    function previousFrame() {
        if (currentFrameIndex > 0) {
            setFrame(currentFrameIndex - 1);
        } else {
            setFrame(frames.length - 1);
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

        btnSpeedSlow.classList.remove('active');
        btnSpeedNormal.classList.remove('active');
        btnSpeedFast.classList.remove('active');

        if (speed === 'slow') btnSpeedSlow.classList.add('active');
        if (speed === 'normal') btnSpeedNormal.classList.add('active');
        if (speed === 'fast') btnSpeedFast.classList.add('active');

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
            loadRadarData(true);
            if (typeof window.checkRadarAvailability === 'function') {
                window.checkRadarAvailability();
            }
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
        updateRadarStatus('Offline', message);
    }

    function formatRadarTimestamp(dateString) {
        try {
            const date = new Date(dateString);
            return date.toLocaleString('en-AU', {
                hour: '2-digit',
                minute: '2-digit',
                timeZoneName: 'short'
            });
        } catch (error) {
            console.error('[RADAR] Failed to format timestamp:', error);
            return null;
        }
    }

    function updateRadarStatus(status, detailText = null) {
        const radarStatusValue = document.getElementById('radar-status-value');
        if (radarStatusValue) {
            const isOnline = status === 'Online';
            const detail = detailText ? ` — ${detailText}` : '';
            radarStatusValue.textContent = `${status}${detail}`;
            radarStatusValue.className = `status-value ${isOnline ? 'online' : 'offline'}`;
            radarStatusValue.title = detailText ? `${status} • ${detailText}` : status;
        }
    }

    function showNotification(message, type) {
        if (typeof window.showNotification === 'function') {
            window.showNotification(message, type);
        } else {
            console.log(`[RADAR] ${type.toUpperCase()}: ${message}`);
        }
    }

    function resetRadarMap() {
        if (!radarInitialized || !radarMap) return;

        pause();
        radarMap.setView(AUSTRALIA_CENTER, AUSTRALIA_ZOOM);
        setSpeed('normal');

        if (frames.length > 0) {
            setFrame(frames.length - 1);
        }

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

    window.resetRadarMap = resetRadarMap;
    window.setRadarStatusIndicator = updateRadarStatus;
    window.triggerRadarRefresh = function() {
        loadRadarData(true);
    };

    const radarTab = document.getElementById('tab-radar');
    if (radarTab) {
        radarTab.addEventListener('click', function() {
            setTimeout(() => {
                if (!radarInitialized) {
                    initRadarMap();
                } else if (radarMap) {
                    radarMap.invalidateSize();
                }
            }, 100);
        });
    }

    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('tab-button') || e.target.closest('.tab-button')) {
            const clickedTab = e.target.classList.contains('tab-button') ? e.target : e.target.closest('.tab-button');
            if (clickedTab && clickedTab.id === 'tab-radar' && radarMap && radarInitialized) {
                setTimeout(() => radarMap.invalidateSize(), 150);
            }
        }
    });

    window.radarMapInitialized = false;

    const originalInit = initRadarMap;
    initRadarMap = function() {
        originalInit();
        window.radarMapInitialized = true;
    };

})();
}
