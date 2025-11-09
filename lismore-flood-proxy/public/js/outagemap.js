(function() {
    const OUTAGE_API = '/api/outages';
    const outageColors = { current: '#ff4d4f', future: '#f7ba1e', cancelled: '#7aa2f7' };
    const OUTAGE_REFRESH_INTERVAL = 5 * 60 * 1000;

    let outageMap = null;
    let outageLayerGroups = {
        current: null,
        future: null,
        cancelled: null
    };
    let allOutageBounds = [];
    let outageMapInitialized = false;
    let currentlyOpenMarker = null;
    let cachedOutageData = null;
    let outageRefreshTimer = null;
    
    function initializeOutageMap() {
        if (outageMapInitialized) return;
        
        const maxBounds = [
            [-29.2, 152.7],
            [-28.4, 153.9]
        ];
        
        outageMap = L.map('outage-map', { 
            zoomControl: true,
            maxBounds: maxBounds,
            maxBoundsViscosity: 0.75,
            minZoom: 10,
            maxZoom: 18,
            zoom: 10
        }).setView([-28.836252984829166, 153.30047607421878], 10);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            minZoom: 10,
            maxZoom: 18,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(outageMap);
        
        outageLayerGroups.current = L.layerGroup().addTo(outageMap);
        outageLayerGroups.future = L.layerGroup();
        outageLayerGroups.cancelled = L.layerGroup();

        outageMapInitialized = true;
        window.outageMapInitialized = true;
        
        let isProgrammaticMove = false;
        
        outageMap.getContainer().addEventListener('wheel', () => {
            if (currentlyOpenMarker && !isProgrammaticMove) {
                currentlyOpenMarker = null;
                outageMap.closePopup();
            }
        }, { passive: true });
        
        let touchStarted = false;
        outageMap.getContainer().addEventListener('touchstart', () => {
            touchStarted = true;
        }, { passive: true });
        
        outageMap.getContainer().addEventListener('touchmove', () => {
            if (touchStarted && currentlyOpenMarker && !isProgrammaticMove) {
                currentlyOpenMarker = null;
                outageMap.closePopup();
                touchStarted = false;
            }
        }, { passive: true });
        
        outageMap.on('zoomstart', () => {
            if (currentlyOpenMarker && !isProgrammaticMove) {
                currentlyOpenMarker = null;
                outageMap.closePopup();
            }
        });
        
        outageMap.on('dragstart', () => {
            if (currentlyOpenMarker && !isProgrammaticMove) {
                currentlyOpenMarker = null;
                outageMap.closePopup();
            }
        });
        
        outageMap._isProgrammaticMove = function(val) {
            isProgrammaticMove = val;
        };
    }
    
    function createOutageCircle(lat, lon, color, small = false) {
        return L.circleMarker([lat, lon], {
            radius: small ? 5 : 8,
            weight: small ? 1.5 : 2,
            opacity: 1,
            fillOpacity: small ? 0.9 : 0.7,
            color: small ? '#fff' : '#fff',
            fillColor: color
        });
    }
    
    function createOutagePolygon(coordinates, color) {
        const polygon = L.polygon(coordinates, {
            weight: 2,
            opacity: 0.8,
            color: color,
            fillColor: color,
            fillOpacity: 0.35,
            smoothFactor: 1
        });
        
        polygon.on('mouseover', function(e) {
            this.setStyle({
                weight: 3,
                fillOpacity: 0.5
            });
            e.target._path.style.cursor = 'pointer';
        });
        
        polygon.on('mouseout', function() {
            this.setStyle({
                weight: 2,
                fillOpacity: 0.35
            });
        });
        
        return polygon;
    }
    
    function createOutageMarker(outage, color) {
        if (outage.polygon && outage.polygon.length > 0) {
            const group = L.layerGroup();
            const polygon = createOutagePolygon(outage.polygon, color);
            polygon.addTo(group);
            const centerMarker = createOutageCircle(outage.latitude, outage.longitude, color, true);
            centerMarker.addTo(group);
            group._polygon = polygon;
            group._centerMarker = centerMarker;
            return group;
        } else {
            return createOutageCircle(outage.latitude, outage.longitude, color, false);
        }
    }
    
    function bindOutagePopup(marker, popupContent, lat, lng, polygon) {
        const popupOptions = {
            maxWidth: 350,
            autoPan: false,
            closeButton: true,
            offset: [0, -10]
        };
        
        const clickHandler = function(e) {
            if (e) {
                L.DomEvent.stopPropagation(e);
            }
        
            const clickedMarker = marker._centerMarker || marker;
            const isCurrentlyOpen = currentlyOpenMarker === clickedMarker && clickedMarker.isPopupOpen();
        
            if (isCurrentlyOpen) {
                return;
            }
        
            outageMap.closePopup();
            currentlyOpenMarker = clickedMarker;
        
            if (outageMap._isProgrammaticMove) {
                outageMap._isProgrammaticMove(true);
            }
        
            let zoomLevel = 17;
            let centerLat = lat;
            let centerLng = lng;
            
            if (polygon && Array.isArray(polygon) && polygon.length >= 3) {
                let minLat = polygon[0][0], maxLat = polygon[0][0];
                let minLng = polygon[0][1], maxLng = polygon[0][1];
                
                for (const coord of polygon) {
                    minLat = Math.min(minLat, coord[0]);
                    maxLat = Math.max(maxLat, coord[0]);
                    minLng = Math.min(minLng, coord[1]);
                    maxLng = Math.max(maxLng, coord[1]);
                }
                
                const verticalSpan = maxLat - minLat;
                const horizontalSpan = maxLng - minLng;
                const maxSpan = Math.max(verticalSpan, horizontalSpan);
                
                if (maxSpan > 0.1) zoomLevel = 10;
                else if (maxSpan > 0.05) zoomLevel = 11;
                else if (maxSpan > 0.02) zoomLevel = 12;
                else if (maxSpan > 0.01) zoomLevel = 13;
                else if (maxSpan > 0.005) zoomLevel = 14;
                else if (maxSpan > 0.002) zoomLevel = 15;
                else if (maxSpan > 0.001) zoomLevel = 16;
                else zoomLevel = 17;
                
                centerLat = lat;
                centerLng = lng;
            }
            
            const originalView = outageMap.getCenter();
            const originalZoom = outageMap.getZoom();
            
            outageMap.setView([centerLat, centerLng], zoomLevel, {animate: false});
            
            const point = outageMap.latLngToContainerPoint([centerLat, centerLng]);
            const panOffset = zoomLevel >= 16 ? -180 : (zoomLevel >= 14 ? -140 : -100);
            const adjustedPoint = L.point(point.x, point.y + panOffset);
            const adjustedLatLng = outageMap.containerPointToLatLng(adjustedPoint);
            
            outageMap.setView(originalView, originalZoom, {animate: false});
            
            outageMap.flyTo(adjustedLatLng, zoomLevel, {
                duration: 0.7,
                easeLinearity: 0.25
            });
            
            setTimeout(() => {
                if (marker._centerMarker && marker._centerMarker._popup) {
                    marker._centerMarker.openPopup();
                } else if (marker._popup) {
                    marker.openPopup();
                } else {
                    const targetMarker = marker._centerMarker || marker;
                    targetMarker.bindPopup(popupContent, popupOptions).openPopup();
                }
                
                if (outageMap._isProgrammaticMove) {
                    setTimeout(() => {
                        outageMap._isProgrammaticMove(false);
                    }, 100);
                }
            }, 1100);
        };
        
        if (marker._polygon && marker._centerMarker) {
            marker._centerMarker.bindPopup(popupContent, popupOptions);
            marker._polygon.on('click', clickHandler);
            marker._centerMarker.on('click', clickHandler);
        } else if (marker._layers) {
            const layers = Object.values(marker._layers);
            const centerMarker = layers.find(l => l._latlng);
            if (centerMarker) {
                centerMarker.bindPopup(popupContent, popupOptions);
                marker.on('click', clickHandler);
            }
        } else {
            marker.bindPopup(popupContent, popupOptions);
            marker.on('click', clickHandler);
        }
    }
    
    function formatOutageDate(dt) {
        if (!dt) return null;
        try {
            const date = new Date(dt);
            if (isNaN(date.getTime())) return null;
            
            const day = date.getDate();
            const month = date.toLocaleString('en-US', { month: 'short' });
            const year = date.getFullYear();
            const time = date.toLocaleString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: true 
            }).toLowerCase();
            
            return `${day} ${month} ${year}, ${time}`;
        } catch {
            return null;
        }
    }
    
    function escapeHtml(s) {
        if (s == null) return '';
        const div = document.createElement('div');
        div.textContent = String(s);
        return div.innerHTML;
    }
    
    function applyOutageVisibility() {
        const selectedCategory = document.querySelector('input[name="outage-category"]:checked').value;

        for (const [k, layer] of Object.entries(outageLayerGroups)) {
            if (k === selectedCategory) {
                if (!outageMap.hasLayer(layer)) layer.addTo(outageMap);
            } else {
                if (outageMap.hasLayer(layer)) outageMap.removeLayer(layer);
            }
        }
    }

    function renderOutageData(data, force = false) {
        if (!outageMapInitialized || !data) {
            return;
        }

        for (const layer of Object.values(outageLayerGroups)) {
            layer.clearLayers();
        }

        if (outageMap) {
            outageMap.closePopup();
            currentlyOpenMarker = null;
        }

        allOutageBounds = [];
        const counts = { current: 0, future: 0, cancelled: 0 };
        let currentCustomers = 0;

        const lockedBounds = {
            south: -29.076575403045364,
            north: -28.595374292349927,
            west: 152.86651611328128,
            east: 153.73443603515628
        };

        for (const f of data.features) {
            if (!Number.isFinite(f.latitude) || !Number.isFinite(f.longitude)) continue;

            if (f.latitude <= lockedBounds.south || f.latitude >= lockedBounds.north ||
                f.longitude <= lockedBounds.west || f.longitude >= lockedBounds.east) {
                continue;
            }

            counts[f.category] = (counts[f.category] || 0) + 1;

            if (f.category === 'current' && f.customersAffected) {
                currentCustomers += f.customersAffected;
            }

            const marker = createOutageMarker(f, outageColors[f.category]);
            const cust = f.customersAffected != null ? f.customersAffected.toLocaleString() : 'Not specified';
            const startTime = f.start ? formatOutageDate(f.start) : 'Not specified';
            const endTime = f.end ? formatOutageDate(f.end) : 'Not specified';
            const reason = f.reason && f.reason !== 'Not specified' ? f.reason : 'Not specified';

            const popupContent = `
                <div>
                    <div class="outage-popup-title">${escapeHtml(f.name)}</div>
                    <div class="outage-popup-row">
                        <span class="outage-popup-label">Status</span>
                        <span class="outage-popup-value">
                            <span class="outage-popup-badge ${f.category}">${escapeHtml(f.status || f.categoryName)}</span>
                        </span>
                    </div>
                    <div class="outage-popup-row">
                        <span class="outage-popup-label">Time Off</span>
                        <span class="outage-popup-value">${escapeHtml(startTime)}</span>
                    </div>
                    <div class="outage-popup-row">
                        <span class="outage-popup-label">Est. Time On</span>
                        <span class="outage-popup-value">${escapeHtml(endTime)}</span>
                    </div>
                    <div class="outage-popup-row">
                        <span class="outage-popup-label">Customers</span>
                        <span class="outage-popup-value"><strong>${escapeHtml(cust)}</strong></span>
                    </div>
                    <div class="outage-popup-row">
                        <span class="outage-popup-label">Reason</span>
                        <span class="outage-popup-value">${escapeHtml(reason)}</span>
                    </div>
                    ${f.lastUpdated ? `
                    <div class="outage-popup-footer">
                        Last updated: ${escapeHtml(formatOutageDate(f.lastUpdated))}
                    </div>
                    ` : ''}
                </div>
            `;

            bindOutagePopup(marker, popupContent, f.latitude, f.longitude, f.polygon);
            marker.addTo(outageLayerGroups[f.category]);
            allOutageBounds.push([f.latitude, f.longitude]);
        }

        document.getElementById('outage-stat-current').textContent = counts.current || 0;
        document.getElementById('outage-stat-future').textContent = counts.future || 0;
        document.getElementById('outage-stat-cancelled').textContent = counts.cancelled || 0;

        applyOutageVisibility();

        const total = counts.current + counts.future + counts.cancelled;
        document.getElementById('outage-last-update').textContent = new Date().toLocaleTimeString('en-AU');

        if (data.errors && data.errors.length > 0) {
            const errorCategories = data.errors.map(e => e.category).join(', ');
            console.warn('Some outage categories failed to load:', data.errors);
            if (total === 0) {
                showNotification(`Warning: Could not load outage data from some sources (${errorCategories}). Service may be temporarily unavailable.`, 'warning');
            } else if (!force) {
                showNotification(`Loaded ${total} outages. Note: ${errorCategories} outages unavailable.`, 'warning');
            }
        }

        if (force) {
            const loadingOverlay = document.getElementById('loading-overlay');
            if (loadingOverlay) {
                loadingOverlay.style.display = 'none';
            }
            if (data.errors && data.errors.length > 0 && total === 0) {
                showNotification('Outage data service is currently unavailable. Please try again later.', 'error');
            } else {
                showNotification(`Successfully refreshed outage data - ${total} outages loaded`, 'success');
            }

            if (outageMap) {
                outageMap.setView([-28.836252984829166, 153.30047607421878], 10, { animate: true, duration: 0.5 });
            }
        }
    }

    async function loadOutageData(force = false) {
        const refreshBtn = document.getElementById('refresh-outages');
        if (refreshBtn) refreshBtn.disabled = true;

        if (force) {
            const loadingOverlay = document.getElementById('loading-overlay');
            const loadingText = loadingOverlay.querySelector('p');
            if (loadingOverlay) {
                loadingText.textContent = 'Refreshing power outage data...';
                loadingOverlay.style.display = 'flex';
            }
        }

        try {
            const url = force ? OUTAGE_API + '?refresh=1' : OUTAGE_API;
            const res = await fetch(url);

            if (!res.ok) {
                const text = await res.text();
                let errorMsg = 'Failed to load outages';
                try {
                    const json = JSON.parse(text);
                    errorMsg = json.error || json.hint || errorMsg;
                } catch {
                    errorMsg = text.slice(0, 200);
                }
                throw new Error(errorMsg);
            }

            const data = await res.json();

            cachedOutageData = data;

            if (!outageMapInitialized) {
                console.log('Outage data fetched and cached. Map not yet initialized.');
                return;
            }

            renderOutageData(data, force);
            
        } catch (error) {
            console.error('Load outage error:', error);
            
            const loadingOverlay = document.getElementById('loading-overlay');
            if (loadingOverlay) {
                loadingOverlay.style.display = 'none';
            }
            
            showNotification('Error loading outage data: ' + error.message, 'error');
        } finally {
            if (refreshBtn) refreshBtn.disabled = false;
        }
    }
    
    const outageTab = document.getElementById('tab-outage');
    if (outageTab) {
        outageTab.addEventListener('click', function() {
            setTimeout(() => {
                if (!outageMapInitialized) {
                    initializeOutageMap();
                    if (cachedOutageData) {
                        renderOutageData(cachedOutageData, false);
                    } else {
                        loadOutageData(true);
                    }
                } else {
                    outageMap.invalidateSize();
                }
            }, 100);
        });
    }
    
    document.querySelectorAll('input[name="outage-category"]').forEach(radio => {
        radio.addEventListener('change', applyOutageVisibility);
    });
    
    setTimeout(() => {
        const refreshBtn = document.getElementById('refresh-outages');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => loadOutageData(true));
        }
    }, 100);
    
    const fitBoundsBtn = document.getElementById('outage-fit-bounds');
    if (fitBoundsBtn) {
        fitBoundsBtn.addEventListener('click', () => {
            if (allOutageBounds.length > 0) {
                const selectedCategory = document.querySelector('input[name="outage-category"]:checked').value;
                
                const categoryBounds = [];
                outageLayerGroups[selectedCategory].eachLayer(layer => {
                    if (layer._latlng) {
                        categoryBounds.push([layer._latlng.lat, layer._latlng.lng]);
                    } else if (layer._layers) {
                        Object.values(layer._layers).forEach(sublayer => {
                            if (sublayer._latlng) {
                                categoryBounds.push([sublayer._latlng.lat, sublayer._latlng.lng]);
                            }
                        });
                    }
                });
                
                if (categoryBounds.length > 0) {
                    if (categoryBounds.length === 1) {
                        outageMap.setView(categoryBounds[0], 13, { animate: true });
                        showNotification(`Showing ${categoryBounds.length} ${selectedCategory} outage`, 'info');
                    } else {
                        const bounds = L.latLngBounds(categoryBounds);
                        outageMap.fitBounds(bounds.pad(0.1), { animate: true });
                        showNotification(`Showing ${categoryBounds.length} ${selectedCategory} outages`, 'info');
                    }
                } else {
                    outageMap.setView([-28.836252984829166, 153.30047607421878], 10);
                    showNotification(`No ${selectedCategory} outages in this region`, 'warning');
                }
            } else {
                showNotification('No outages to display', 'warning');
            }
        });
    }
    
    const locateMeBtn = document.getElementById('outage-locate-me');
    if (locateMeBtn) {
        locateMeBtn.addEventListener('click', () => {
            if ('geolocation' in navigator) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const { latitude, longitude } = position.coords;
                        outageMap.setView([latitude, longitude], 13);
                        L.marker([latitude, longitude])
                            .addTo(outageMap)
                            .bindPopup('📍 Your Location')
                            .openPopup();
                        showNotification('Centered on your location', 'success');
                    },
                    (error) => {
                        showNotification('Could not get your location: ' + error.message, 'error');
                    }
                );
            } else {
                showNotification('Geolocation not supported by your browser', 'warning');
            }
        });
    }

    function startOutageDataRefresh() {
        loadOutageData(false);

        if (outageRefreshTimer) {
            clearInterval(outageRefreshTimer);
        }
        outageRefreshTimer = setInterval(() => {
            loadOutageData(false);
        }, OUTAGE_REFRESH_INTERVAL);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startOutageDataRefresh);
    } else {
        startOutageDataRefresh();
    }

    window.refreshOutageData = function() {
        return loadOutageData(true);
    };

    window.resetOutageMap = function() {
        if (outageMap && outageMapInitialized) {
            outageMap.setView([-28.836252984829166, 153.30047607421878], 10, { animate: false });

            outageMap.closePopup();

            if (currentlyOpenMarker) {
                currentlyOpenMarker = null;
            }

            const currentRadio = document.querySelector('input[name="outage-category"][value="current"]');
            if (currentRadio && !currentRadio.checked) {
                currentRadio.checked = true;
                applyOutageVisibility();
            }
        }
    };
})();
