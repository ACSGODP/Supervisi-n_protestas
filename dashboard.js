// === CONFIGURACIÓN Y GLOBALES ===
const _fbDb = (typeof _db !== "undefined") ? _db : null;
function fbRef(path) { return _fbDb ? _fbDb.ref(path) : null; }

let map;
let markers = {};

// --- INICIALIZACIÓN ---
function initDashboard() {
    initMap();
    listenToSessions();
    
    document.getElementById('refresh-btn')?.addEventListener('click', () => location.reload());
    document.getElementById('filter-date').value = new Date().toISOString().split('T')[0];
}

function initMap() {
    const mapEl = document.getElementById('map-dashboard');
    if (!mapEl) return;
    map = L.map('map-dashboard').setView([-12.0464, -77.0428], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
}

function listenToSessions() {
    if (!_fbDb) return;
    
    fbRef('sessions').on('value', snap => {
        const sessions = snap.val() || {};
        const loadingEl = document.getElementById('loading');
        if (loadingEl) loadingEl.style.display = 'none';
        
        updateStatsAndMap(sessions);
        updateReportsList(sessions);
        updateGlobalFeed(sessions);
    });
}

function updateStatsAndMap(sessions) {
    let active = 0;
    let totalIncidents = 0;
    let heridos = 0;
    let fallecidos = 0;
    let detenidos = 0;

    const sessionIds = Object.keys(sessions);

    sessionIds.forEach(id => {
        const s = sessions[id];
        if (s.status !== 'finished') active++;

        const lat = s.currentLat || s.startLat;
        const lng = s.currentLng || s.startLng;

        if (lat && lng) {
            updateMarker(id, s, lat, lng);
        }

        if (s.incidents) {
            const incList = Object.values(s.incidents);
            totalIncidents += incList.length;
            incList.forEach(inc => {
                if (inc.clasificacion === 'Heridos') heridos += parseInt(inc.cantidad || 1);
                if (inc.clasificacion === 'Fallecidos') fallecidos += parseInt(inc.cantidad || 1);
                if (inc.clasificacion === 'Privados de la libertad') detenidos += parseInt(inc.cantidad || 1);
            });
        }
    });

    safeSetText('stat-active', active);
    safeSetText('stat-incidents', totalIncidents);
    safeSetText('stat-heridos', heridos);
    safeSetText('stat-fallecidos', fallecidos);
    safeSetText('stat-detenidos', detenidos);
}

function updateMarker(id, s, lat, lng) {
    if (!map) return;
    
    const iconColor = s.status === 'finished' ? '#95a5a6' : '#3498db';
    const customIcon = L.divIcon({
        className: 'custom-icon',
        html: '<div style="background:' + iconColor + '; width:15px; height:15px; border-radius:50%; border:3px solid white; box-shadow:0 0 5px rgba(0,0,0,0.3);"></div>',
        iconSize: [15, 15],
        iconAnchor: [7, 7]
    });

    if (markers[id]) {
        markers[id].setLatLng([lat, lng]);
    } else {
        markers[id] = L.marker([lat, lng], { icon: customIcon }).addTo(map);
        markers[id].bindTooltip(s.name, {
            permanent: true,
            direction: 'top',
            className: 'waze-tooltip'
        });
    }
}

function updateReportsList(sessions) {
    const list = document.getElementById('reports-list');
    if (!list) return;

    const sorted = Object.values(sessions).sort((a,b) => (b.startTime || 0) - (a.startTime || 0));
    
    list.innerHTML = sorted.map(s => {
        const isFinished = s.status === 'finished';
        return '<div style="background:#fff; padding:15px; border-radius:12px; margin-bottom:10px; border-left:5px solid ' + (isFinished ? '#95a5a6' : '#3498db') + '; box-shadow:0 2px 5px rgba(0,0,0,0.05);">' +
            '<div style="display:flex; justify-content:space-between;">' +
            '<strong>' + (s.location || 'N/A') + '</strong>' +
            '<span style="font-size:0.8rem; color:#666;">' + new Date(s.startTime).toLocaleTimeString() + '</span>' +
            '</div>' +
            '<p style="margin:5px 0; font-size:0.9rem;">' + s.name + ' (' + s.office + ')</p>' +
            '</div>';
    }).join('') || '<p style="text-align:center; padding:20px;">No hay reportes hoy.</p>';
}

function updateGlobalFeed(sessions) {
    const feed = document.getElementById('global-feed');
    if (!feed) return;

    let feedItems = [];
    Object.values(sessions).forEach(s => {
        if (s.incidents) {
            Object.values(s.incidents).forEach(inc => {
                feedItems.push({ ...inc, sessionLocation: s.location });
            });
        }
    });

    feedItems.sort((a,b) => b.timestamp - a.timestamp);

    feed.innerHTML = feedItems.map(inc => {
        return '<div class="chat-bubble chat-others" style="margin-bottom:10px; width:100%; max-width:100%; border-radius:8px;">' +
            '<div class="chat-author">' + inc.author + ' en ' + inc.sessionLocation + '</div>' +
            '<div style="font-weight:700; margin:5px 0; color:' + getIncidentColor(inc.clasificacion) + ';">' + inc.clasificacion + '</div>' +
            '<div>' + inc.description + '</div>' +
            (inc.imageUrl ? '<img src="' + inc.imageUrl + '" style="width:100%; border-radius:8px; margin-top:10px; cursor:pointer;" onclick="window.open(\'' + inc.imageUrl + '\')">' : '') +
            (inc.audioUrl ? '<audio controls src="' + inc.audioUrl + '" style="width:100%; height:30px; margin-top:10px;"></audio>' : '') +
            '<div class="chat-time">' + new Date(inc.timestamp).toLocaleTimeString() + '</div>' +
            '</div>';
    }).join('') || '<p style="text-align:center; padding:20px; color:#999;">Esperando incidencias...</p>';
}

function getIncidentColor(cls) {
    switch(cls) {
        case 'Heridos': return '#e67e22';
        case 'Fallecidos': return '#c0392b';
        case 'Privados de la libertad': return '#8e44ad';
        default: return '#3498db';
    }
}

function safeSetText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

initDashboard();
