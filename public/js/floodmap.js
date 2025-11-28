const leveeCoordinates = [
    [153.2779234789894, -28.80564897533751], [153.2776284287106, -28.80583653192451],
    [153.2775473935466, -28.80578584679196], [153.2774086343345, -28.80589734283666],
    [153.2773869897634, -28.80594964071906], [153.2774102741197, -28.80596169296753],
    [153.2773249113709, -28.80610037084291], [153.2771329846015, -28.80599601019963],
    [153.2770561642849, -28.80609599092546], [153.2769759706041, -28.80607065351402],
    [153.2769225873773, -28.80615138249765], [153.2771238902704, -28.80627143942861],
    [153.2771042437316, -28.80631013165758], [153.2770393628764, -28.80627702301991],
    [153.2770241261831, -28.80629441993291], [153.2769220530088, -28.80624117453304],
    [153.2768766932163, -28.80632282295921], [153.2769696013465, -28.80638388213526],
    [153.2768686212507, -28.80654609791701], [153.2766122114514, -28.80641321031905],
    [153.2762852689198, -28.80687177730074], [153.27623452077, -28.80688817209607],
    [153.2759469768278, -28.80671352421123], [153.2757810011812, -28.8066576253247],
    [153.2755564149109, -28.80697526665091], [153.2757588315603, -28.80711770645244],
    [153.2757357547251, -28.80717838893401], [153.2758506705051, -28.80723784361079],
    [153.275819962155, -28.80728629171487], [153.2757402582966, -28.80729438003862],
    [153.2756002918833, -28.80749807647723], [153.2757079015264, -28.80754879741433],
    [153.2755268407124, -28.80784997889503], [153.275534526505, -28.807891520335],
    [153.2755636339584, -28.80792475454313], [153.2753084206615, -28.80829011404793],
    [153.2753498432981, -28.808315156535], [153.2753462077596, -28.80837176440883],
    [153.2755912039843, -28.80851963768052], [153.275495379482, -28.80865023484822],
    [153.2754382615978, -28.80864280421942], [153.275343368243, -28.8087559250459],
    [153.2752998891227, -28.80892014140416], [153.2749823509539, -28.80899625576804],
    [153.2745141767591, -28.80923041219856], [153.2742101627201, -28.80946447124336],
    [153.2739078774804, -28.80966753062161], [153.2734055703105, -28.81013081939378],
    [153.2730680212187, -28.81031728641019], [153.2729078113743, -28.81048653329279],
    [153.2724986320497, -28.81049177556017], [153.2724255633508, -28.81059853360265],
    [153.2723476330192, -28.81062356600956], [153.2722830179564, -28.81072680961973],
    [153.272087876255, -28.81087734874062], [153.2718494740316, -28.81118854434206],
    [153.2717288404832, -28.81137281375635], [153.2714104828596, -28.81143925272617],
    [153.2712177644198, -28.81154772674801], [153.2712141581074, -28.81186060127457],
    [153.2711843689477, -28.81202484689156], [153.2709624213483, -28.81234344931174],
    [153.2707696671584, -28.81254049551611], [153.2707214619768, -28.81267071518178],
    [153.2707080191103, -28.81282324626406], [153.2706690168997, -28.81297114289579],
    [153.2708940313762, -28.81336688046893], [153.2709231093674, -28.81356763137908],
    [153.2711906807951, -28.81358726843914]
];

const leveeAreaCoordinates = [
    [153.2779234789894, -28.80564897533751], [153.2776284287106, -28.80583653192451],
    [153.2775473935466, -28.80578584679196], [153.2774086343345, -28.80589734283666],
    [153.2773869897634, -28.80594964071906], [153.2774102741197, -28.80596169296753],
    [153.2773249113709, -28.80610037084291], [153.2771329846015, -28.80599601019963],
    [153.2770561642849, -28.80609599092546], [153.2769759706041, -28.80607065351402],
    [153.2769225873773, -28.80615138249765], [153.2771238902704, -28.80627143942861],
    [153.2771042437316, -28.80631013165758], [153.2770393628764, -28.80627702301991],
    [153.2770241261831, -28.80629441993291], [153.2769220530088, -28.80624117453304],
    [153.2768766932163, -28.80632282295921], [153.2769696013465, -28.80638388213526],
    [153.2768686212507, -28.80654609791701], [153.2766122114514, -28.80641321031905],
    [153.2762852689198, -28.80687177730074], [153.27623452077, -28.80688817209607],
    [153.2759469768278, -28.80671352421123], [153.2757810011812, -28.8066576253247],
    [153.2755564149109, -28.80697526665091], [153.2757588315603, -28.80711770645244],
    [153.2757357547251, -28.80717838893401], [153.2758506705051, -28.80723784361079],
    [153.275819962155, -28.80728629171487], [153.2757402582966, -28.80729438003862],
    [153.2756002918833, -28.80749807647723], [153.2757079015264, -28.80754879741433],
    [153.2755268407124, -28.80784997889503], [153.275534526505, -28.807891520335],
    [153.2755636339584, -28.80792475454313], [153.2753084206615, -28.80829011404793],
    [153.2753498432981, -28.808315156535], [153.2753462077596, -28.80837176440883],
    [153.2755912039843, -28.80851963768052], [153.275495379482, -28.80865023484822],
    [153.2754382615978, -28.80864280421942], [153.275343368243, -28.8087559250459],
    [153.2752998891227, -28.80892014140416], [153.2749823509539, -28.80899625576804],
    [153.2745141767591, -28.80923041219856], [153.2742101627201, -28.80946447124336],
    [153.2739078774804, -28.80966753062161], [153.2734055703105, -28.81013081939378],
    [153.2730680212187, -28.81031728641019], [153.2729078113743, -28.81048653329279],
    [153.2724986320497, -28.81049177556017], [153.2724255633508, -28.81059853360265],
    [153.2723476330192, -28.81062356600956], [153.2722830179564, -28.81072680961973],
    [153.272087876255, -28.81087734874062], [153.2718494740316, -28.81118854434206],
    [153.2717288404832, -28.81137281375635], [153.2714104828596, -28.81143925272617],
    [153.2712177644198, -28.81154772674801], [153.2712141581074, -28.81186060127457],
    [153.2711843689477, -28.81202484689156], [153.2709624213483, -28.81234344931174],
    [153.2707696671584, -28.81254049551611], [153.2707214619768, -28.81267071518178],
    [153.2707080191103, -28.81282324626406], [153.2706690168997, -28.81297114289579],
    [153.2708940313762, -28.81336688046893], [153.2709231093674, -28.81356763137908],
    [153.2711906807951, -28.81358726843914], [153.2721123183181, -28.81340143781495],
    [153.2728642861514, -28.81318988160984], [153.2738334696126, -28.81335757506337],
    [153.2754301255504, -28.81362863148366], [153.2781586962226, -28.81137704412088],
    [153.2801633775867, -28.80821818373613], [153.280001902673, -28.80759419775452],
    [153.2799494446037, -28.80677742276964], [153.2788428575995, -28.80616875198943],
    [153.2779234789894, -28.80564897533751]
];

const LEVEE_HEIGHT = 10.6;
const LEVEE_WARNING_THRESHOLD = 9.0;

let leveeLine = null;
let floodMap = null;
let floodProperties = [];
let floodMarkers = null;
let floodOverlayLayer = null;
let floodMapInitialized = false;
let currentlyOpenFloodMarker = null;
let userSelectedFloodHeight = null;
let currentLismoreLevel = null;

const BASE_URL = window.location.origin || '';
const PROXY_URL = '/flood-data';

console.log('FloodMap.js loaded - initializing flood mapping system');

let embeddedCSVData = [];

const terrariumToMeters = (r, g, b) => (r * 256 + g + b / 256) - 32768;

L.GridLayer.FloodOverlay = L.GridLayer.extend({
    initialize: function(opts) {
        L.setOptions(this, opts);
        this._elevation = opts.elevation ?? 12;
        this._maxDepth = opts.maxDepth ?? 15;
        this._opacity = opts.opacity ?? 0.7;
    },
    
    setElevation: function(v) {
        this._elevation = Number(v);
        this.redraw();
    },
    
    setOpacity: function(v) {
        this._opacity = v;
        if (this._container) {
            this._container.style.opacity = String(v);
        }
    },
    
    createTile: function(coords, done) {
        const tile = L.DomUtil.create('canvas', 'leaflet-tile');
        const size = this.getTileSize();
        tile.width = size.x;
        tile.height = size.y;
        const ctx = tile.getContext('2d');
        
        ctx.clearRect(0, 0, size.x, size.y);
        
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        let completed = false;
        
        let timeoutId = setTimeout(() => {
            if (!completed) {
                completed = true;
                done(null, tile);
            }
        }, 5000);
        
        img.onload = () => {
            if (completed) return;
            completed = true;
            clearTimeout(timeoutId);
            
            try {
                ctx.drawImage(img, 0, 0, size.x, size.y);
                const imageData = ctx.getImageData(0, 0, size.x, size.y);
                const data = imageData.data;
                const level = this._elevation;
                const maxDepth = Math.max(1, this._maxDepth);
                
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const h = terrariumToMeters(r, g, b);
                    
                    if (!Number.isFinite(h) || h <= -32760) {
                        data[i + 3] = 0;
                        continue;
                    }
                    
                    if (h <= level) {
                        const depth = Math.min(level - h, maxDepth);
                        const t = depth / maxDepth;
                    
                        const R = Math.round(30 + 60 * (1 - t));
                        const G = Math.round(100 + 100 * (1 - t));
                        const B = Math.round(200 + 55 * (1 - t));
                        const A = Math.round(120 + 135 * t);
                        
                        data[i] = R;
                        data[i + 1] = G;
                        data[i + 2] = B;
                        data[i + 3] = A;
                    } else {
                        data[i + 3] = 0;
                    }
                }
                
                ctx.putImageData(imageData, 0, 0);
                done(null, tile);
            } catch (err) {
                console.error('Error processing tile:', err);
                done(null, tile);
            }
        };
        
        img.onerror = () => {
            if (completed) return;
            completed = true;
            clearTimeout(timeoutId);
            done(null, tile);
        };
        
        const cacheBust = Math.floor(Date.now() / 60000);
        img.src = `/terrarium/${coords.z}/${coords.x}/${coords.y}.png?t=${cacheBust}`;
        
        return tile;
    }
});

L.gridLayer.floodOverlay = (opts) => new L.GridLayer.FloodOverlay(opts);

function isPointInPolygon(point, polygon) {
    const x = point[0];
    const y = point[1];
    
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0], yi = polygon[i][1];
        const xj = polygon[j][0], yj = polygon[j][1];
        
        const intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    
    return inside;
}

function addLeveeToMap(floodMap, floodHeight) {
    const reversedCoordinates = leveeCoordinates.map(coord => [coord[1], coord[0]]);

    let leveeColor = '#2196F3';
    let leveeWeight = 3;
    
    if (floodHeight >= LEVEE_HEIGHT) {
        leveeColor = '#e74c3c';
        leveeWeight = 4;
    } else if (floodHeight >= LEVEE_WARNING_THRESHOLD) {
        leveeColor = '#f39c12';
        leveeWeight = 4;
    }
    
    const leveeLine = L.polyline(reversedCoordinates, {
        color: leveeColor,
        weight: leveeWeight,
        opacity: 0.8
    }).addTo(floodMap);
    
    if (floodHeight >= LEVEE_HEIGHT) {
        leveeLine.bindPopup("<strong>Levee Wall - BREACHED</strong><br>Flood height exceeds levee protection height of 10.6m");
    } else if (floodHeight >= LEVEE_WARNING_THRESHOLD) {
        leveeLine.bindPopup("<strong>Levee Wall - WARNING</strong><br>Flood height is approaching levee protection height of 10.6m");
    } else {
        leveeLine.bindPopup("<strong>Levee Wall</strong><br>Protects area until water level reaches 10.6m");
    }
    
    return leveeLine;
}

function processFloodData(data) {
    floodProperties = data.map(row => {
        const floorLevel = parseFloat(row['Floor Level']);
        const gateLevel = parseFloat(row['Gate Level']);
        const roadLevel = parseFloat(row['Road Centre']);
        
        return {
            address: row['Street Details'],
            floorLevel: floorLevel,
            gateLevel: gateLevel,
            roadLevel: roadLevel,
            coordinates: [parseFloat(row['Latitude']), parseFloat(row['Longitude'])]
        };
    }).filter(property => {
        return !isNaN(property.floorLevel) && 
               !isNaN(property.gateLevel) && 
               !isNaN(property.roadLevel) &&
               !isNaN(property.coordinates[0]) &&
               !isNaN(property.coordinates[1]);
    });
}

function getFloodStatusWithLevee(floodHeight, property) {
    const isInLeveeArea = isPointInPolygon([property.coordinates[1], property.coordinates[0]], leveeAreaCoordinates);
    
    const floorAffected = property.floorLevel <= floodHeight;
    const gateAffected = property.gateLevel <= floodHeight;
    const roadAffected = property.roadLevel <= floodHeight;
    
    let wouldBeAffected = false;
    let normalStatus = 'safe';
    
    if (floorAffected) {
        wouldBeAffected = true;
        normalStatus = 'critical';
    } else if (gateAffected) {
        wouldBeAffected = true;
        normalStatus = 'warning';
    } else if (roadAffected) {
        wouldBeAffected = true;
        normalStatus = 'alert';
    }
    
    if (isInLeveeArea && wouldBeAffected && floodHeight <= LEVEE_HEIGHT) {
        property.leveeProtected = true;
        property.normalStatus = normalStatus;
        return 'safe';
    }
    
    property.leveeProtected = false;
    return normalStatus;
}

function getStatusColor(status) {
    const COLORS = {
        critical: '#e74c3c',
        warning: '#f39c12',
        alert: '#f1c40f',
        safe: '#2ecc71'
    };
    
    return COLORS[status] || COLORS.safe;
}

function createPopupContent(property, floodHeight, status) {
    const addressParts = property.address.match(/^(\d+)\s+(.+?)\s+([A-Z\s]+)$/);
    let streetNumber = '', streetName = '';
    
    if (addressParts) {
        streetNumber = addressParts[1];
        streetName = addressParts[2];
    } else {
        streetName = property.address;
    }
    
    const floorAffected = property.floorLevel <= floodHeight;
    const gateAffected = property.gateLevel <= floodHeight;
    const roadAffected = property.roadLevel <= floodHeight;
    
    let content = `
        <div style="font-family:'Inter',sans-serif;line-height:1.5;">
            <div style="font-size:16px;font-weight:600;margin-bottom:12px;border-bottom:1px solid #eee;padding-bottom:8px;">
                ${streetNumber} ${streetName}
            </div>
            
            <div style="margin-bottom:8px;">
                <div style="font-weight:500;margin-bottom:4px;">Status: <span style="color:${getStatusColor(status)};font-weight:600;">${getStatusText(status)}</span></div>
            </div>
            
            <div style="display:grid;grid-template-columns:auto 1fr;gap:6px 8px;margin-bottom:10px;">
                <div style="font-weight:500;">Floor Level:</div>
                <div>${property.floorLevel.toFixed(2)}m ${floorAffected && !property.leveeProtected ? '<span style="color:#e74c3c;font-weight:bold;">AFFECTED</span>' : ''}</div>
                
                <div style="font-weight:500;">Gate Level:</div>
                <div>${property.gateLevel.toFixed(2)}m ${gateAffected && !property.leveeProtected ? '<span style="color:#f39c12;font-weight:bold;">AFFECTED</span>' : ''}</div>
                
                <div style="font-weight:500;">Road Level:</div>
                <div>${property.roadLevel.toFixed(2)}m ${roadAffected && !property.leveeProtected ? '<span style="color:#f1c40f;font-weight:bold;">AFFECTED</span>' : ''}</div>
            </div>
        </div>
    `;
    
    if (property.leveeProtected) {
        content += `
        <div style="background-color:#e3f2fd;padding:10px;margin-top:10px;border-radius:6px;">
            <span style="color:#1976d2;font-weight:600;">Protected by Levee</span>
        </div>`;
    }
    
    return content;
}

function getStatusText(status) {
    switch (status) {
        case 'critical': return 'Critical - Floor Level Affected';
        case 'warning': return 'Warning - Gate Level Affected';
        case 'alert': return 'Alert - Road Level Affected';
        case 'safe': return 'Safe - Not Affected';
        default: return 'Unknown';
    }
}

function updateFloodMapWithCurrentLevelRespectingUserChoice() {
    if (floodMapInitialized) {
        const floodHeightSlider = document.getElementById('flood-height-slider');
        const floodHeightDisplay = document.getElementById('flood-height-display');
        
        if (userSelectedFloodHeight !== null) {
            floodHeightSlider.value = userSelectedFloodHeight;
            floodHeightDisplay.textContent = userSelectedFloodHeight.toFixed(1) + 'm';
            updateFloodVisualizationWithLevee(userSelectedFloodHeight);
        } else if (currentLismoreLevel !== null) {
            floodHeightSlider.value = currentLismoreLevel;
            floodHeightDisplay.textContent = currentLismoreLevel.toFixed(1) + 'm';
            updateFloodVisualizationWithLevee(currentLismoreLevel);
        }
    }
}

function updateFloodVisualizationWithLevee(floodHeight) {
    if (!floodMapInitialized || floodProperties.length === 0) {
        return;
    }

    const floodLoadingOverlay = document.getElementById('flood-loading-overlay');
    floodLoadingOverlay.style.display = 'flex';
    
    if (floodOverlayLayer) {
        floodOverlayLayer.setElevation(floodHeight);
    }
    
    floodMarkers.clearLayers();
    
    if (leveeLine) {
        floodMap.removeLayer(leveeLine);
    }
    
    leveeLine = addLeveeToMap(floodMap, floodHeight);
    
    const stats = {
        critical: 0,
        warning: 0,
        alert: 0,
        safe: 0,
        leveeProtected: 0
    };
    
    document.getElementById('flood-stats-height').textContent = floodHeight.toFixed(1) + 'm';

    floodProperties.forEach((property) => {
        const status = getFloodStatusWithLevee(floodHeight, property);

        stats[status]++;

        if (!property.leveeProtected) {
            const floorAffected = property.floorLevel <= floodHeight;
            const gateAffected = property.gateLevel <= floodHeight;
            const roadAffected = property.roadLevel <= floodHeight;

            if (floorAffected && status === 'critical') {
                if (gateAffected) stats.warning++;
                if (roadAffected) stats.alert++;
            }
            else if (gateAffected && status === 'warning') {
                if (roadAffected) stats.alert++;
            }
        }

        if (property.leveeProtected) {
            stats.leveeProtected++;
        }
        
        let color;
        if (property.leveeProtected) {
            color = '#2196F3';
        } else {
            color = getStatusColor(status);
        }
        
        const marker = L.circleMarker(property.coordinates, {
            color: 'white',
            weight: 1.5,
            fillColor: color,
            fillOpacity: 0.8,
            radius: 8
        });

        const popupContent = createPopupContent(property, floodHeight, status);

        marker.bindPopup(popupContent, {
            autoPan: false,
            closeButton: true,
            maxWidth: 300
        });

        marker.on('click', function(e) {
            L.DomEvent.stopPropagation(e);

            const isCurrentlyOpen = currentlyOpenFloodMarker === marker && marker.isPopupOpen();

            if (isCurrentlyOpen) {
                return;
            }

            currentlyOpenFloodMarker = marker;

            const offset = 0.0005;
            const bounds = L.latLngBounds(
                [property.coordinates[0] - offset, property.coordinates[1] - offset],
                [property.coordinates[0] + offset, property.coordinates[1] + offset]
            );

            floodMap.flyToBounds(bounds, {
                paddingTopLeft: [50, 250],
                paddingBottomRight: [50, 80],
                maxZoom: 16,
                duration: 0.6,
                easeLinearity: 0.25
            });

            setTimeout(() => {
                marker.openPopup();
            }, 650);
        });

        floodMarkers.addLayer(marker);
    });

    document.getElementById('flood-stat-critical').textContent = stats.critical;
    document.getElementById('flood-stat-warning').textContent = stats.warning;
    document.getElementById('flood-stat-alert').textContent = stats.alert;

    floodLoadingOverlay.style.display = 'none';
}

function initFloodMapWithLevee() {
    if (floodMapInitialized) {
        return;
    }

    const floodHeightSlider = document.getElementById('flood-height-slider');
    const floodHeightDisplay = document.getElementById('flood-height-display');
    const useCurrentLevelBtn = document.getElementById('use-current-level');
    const floodLoadingOverlay = document.getElementById('flood-loading-overlay');
    const refreshFloodMapBtn = document.getElementById('refresh-floodmap');

    floodMap = L.map('flood-map').setView([-28.8167, 153.2833], 14);

    floodMapInitialized = true;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18
    }).addTo(floodMap);

    try {
        floodOverlayLayer = L.gridLayer.floodOverlay({
            tileSize: 256,
            updateWhenIdle: false,
            detectRetina: false,
            elevation: 12,
            maxDepth: 15,
            opacity: 0.7,
            errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
        }).addTo(floodMap);
        
        console.log('Flood overlay layer initialized');
        
        setTimeout(() => {
            console.log('Note: Some elevation tiles may load slowly. The map will show flooded areas as tiles become available.');
        }, 2000);
    } catch (error) {
        console.error('Failed to initialize flood overlay:', error);
        showNotification('Flood visualization may be limited. Property markers will still function.', 'warning');
    }

    floodMarkers = L.layerGroup().addTo(floodMap);

    floodMap.getContainer().addEventListener('wheel', () => {
        currentlyOpenFloodMarker = null;
        floodMap.closePopup();
    }, { passive: true });

    floodMap.on('zoomstart dragstart movestart', () => {
        currentlyOpenFloodMarker = null;
        floodMap.closePopup();
    });

    const LISMORE_BOUNDS = [
        [-28.8767, 153.2233],
        [-28.7767, 153.3433]
    ];
    
    floodMap.setMaxBounds(LISMORE_BOUNDS);
    floodMap.options.minZoom = 12;
    floodMap.options.maxZoom = 18;
    
    if (embeddedCSVData && embeddedCSVData.length > 0) {
        processFloodData(embeddedCSVData);
    }
    
    let initialHeight;
    if (currentLismoreLevel !== null) {
        initialHeight = currentLismoreLevel;
        floodHeightSlider.value = initialHeight;
        floodHeightDisplay.textContent = initialHeight.toFixed(1) + 'm';
    } else {
        initialHeight = parseFloat(floodHeightSlider.value);
    }
    
    userSelectedFloodHeight = null;
    
    updateFloodVisualizationWithLevee(initialHeight);
    
    floodHeightSlider.addEventListener('input', function() {
        const height = parseFloat(this.value);
        userSelectedFloodHeight = height;
        floodHeightDisplay.textContent = height.toFixed(1) + 'm';
        updateFloodVisualizationWithLevee(height);
    });
    
    useCurrentLevelBtn.addEventListener('click', function() {
        if (currentLismoreLevel !== null) {
            userSelectedFloodHeight = currentLismoreLevel;
            floodHeightSlider.value = currentLismoreLevel;
            floodHeightDisplay.textContent = currentLismoreLevel.toFixed(1) + 'm';
            updateFloodVisualizationWithLevee(currentLismoreLevel);
            showNotification('Map updated to current Wilsons River level: ' + currentLismoreLevel.toFixed(2) + 'm', 'info');
        } else {
            showNotification('Current river level data not available', 'error');
        }
    });
    
    refreshFloodMapBtn.addEventListener('click', function() {
        const height = parseFloat(floodHeightSlider.value);
        userSelectedFloodHeight = null;
        if (currentLismoreLevel !== null) {
            floodHeightSlider.value = currentLismoreLevel;
            floodHeightDisplay.textContent = currentLismoreLevel.toFixed(1) + 'm';
            updateFloodVisualizationWithLevee(currentLismoreLevel);
            showNotification('Map updated to current Wilsons River level: ' + currentLismoreLevel.toFixed(2) + 'm', 'info');
        } else {
            updateFloodVisualizationWithLevee(height);
        }
    });
    
    const showMarkersToggle = document.getElementById('flood-show-markers');
    if (showMarkersToggle) {
        showMarkersToggle.addEventListener('click', function() {
            this.classList.toggle('active');
            if (this.classList.contains('active')) {
                floodMap.addLayer(floodMarkers);
                console.log('Property markers shown');
            } else {
                floodMap.removeLayer(floodMarkers);
                console.log('Property markers hidden');
            }
        });
    }
    
    floodMapInitialized = true;

    floodLoadingOverlay.style.display = 'none';
}

function resetFloodMap() {
    if (floodMap && floodMapInitialized) {
        floodMap.setView([-28.8167, 153.2833], 14, { animate: false });

        floodMap.closePopup();

        if (currentlyOpenFloodMarker) {
            currentlyOpenFloodMarker = null;
        }

        const floodHeightSlider = document.getElementById('flood-height-slider');
        const floodHeightDisplay = document.getElementById('flood-height-display');

        if (floodHeightSlider && floodHeightDisplay && currentLismoreLevel !== null) {
            userSelectedFloodHeight = null;
            floodHeightSlider.value = currentLismoreLevel;
            floodHeightDisplay.textContent = currentLismoreLevel.toFixed(1) + 'm';
            updateFloodVisualizationWithLevee(currentLismoreLevel);
        }
    }
}
