// === CONFIGURACIÓN Y GLOBALES ===
const _fbDb = (typeof _db !== "undefined") ? _db : null;
function fbRef(path) { return _fbDb ? _fbDb.ref(path) : null; }

let map;
let markers = {}; // Guardar marcadores por sessionId
let allIncidents = []; // Para el feed global

// --- INICIALIZACIÓN ---
function initDashboard() {
    initMap();
    listenToSessions();
    
    // Listeners de UI
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

// --- ESCUCHA DE DATOS (Firebase) ---
function listenToSessions() {
    if (!_fbDb) return;
    
    _fbDb.ref('sessions').on('value', snap => {
        const sessions = snap.val() || {};
        const loadingEl = document.getElementById('loading');
        if (loadingEl) loadingEl.style.display = 'none';
        
        updateStatsAndMap(sessions);
        updateReportsList(sessions);
        updateGlobalFeed(sessions);
    });
}

// --- ACTUALIZACIÓN DE UI ---
function updateStatsAndMap(sessions) {
    let total = 0;
    let active = 0;
    let finished = 0;
    let totalIncidents = 0;
    let heridos = 0;
    let fallecidos = 0;
    let detenidos = 0;

    const sessionIds = Object.keys(sessions);
    total = sessionIds.length;

    sessionIds.forEach(id => {
        const s = sessions[id];
        if (s.status === 'finished') finished++;
        else active++;

        // GPS y Marcadores
        const lat = s.currentLat || s.startLat;
        const lng = s.currentLng || s.startLng;

        if (lat && lng) {
            updateMarker(id, s, lat, lng);
        }

        // Procesar Incidencias para contadores
        if (s.incidents) {
            Object.values(s.incidents).forEach(inc => {
                totalIncidents++;
                if (inc.clasificacion === 'Heridos') heridos += parseInt(inc.cantidad || 1);
                if (inc.clasificacion === 'Fallecidos') fallecidos += parseInt(inc.cantidad || 1);
                if (inc.clasificacion === 'Privados de la libertad') detenidos += parseInt(inc.cantidad || 1);
            });
        }
    });

    // Actualizar Números
    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-active').textContent = active;
    document.getElementById('stat-finished').textContent = finished;
    document.getElementById('stat-incidents').textContent = totalIncidents;
    document.getElementById('stat-heridos').textContent = heridos;
    document.getElementById('stat-fallecidos').textContent = fallecidos;
    document.getElementById('stat-detenidos').textContent = detenidos;
}

function updateMarker(id, s, lat, lng) {
    if (!map) return;
    
    const iconColor = s.status === 'finished' ? 'gray' : 'blue';
    const customIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div style='background-color:${iconColor}; width:12px; height:12px; border-radius:50%; border:2px solid white;'></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6]
    });

    if (markers[id]) {
        markers[id].setLatLng([lat, lng]);
    } else {
        markers[id] = L.marker([lat, lng], { icon: customIcon }).addTo(map)
            .bindPopup(`<b>${s.location}</b><br>${s.name}<br>Status: ${s.status}`);
    }
}

function updateReportsList(sessions) {
    const list = document.getElementById('reports-list');
    if (!list) return;

    const sorted = Object.values(sessions).sort((a,b) => (b.startTime || 0) - (a.startTime || 0));
    
    list.innerHTML = sorted.map(s => `
        <div class="report-card" style="border-left-color: ${s.status === 'finished' ? '#64748b' : '#3b82f6'};">
            <div>
                <div class="report-meta">${new Date(s.startTime).toLocaleDateString()} | ${s.type || 'Sede'}</div>
                <h3 style="margin: 5px 0;">${s.location || 'Sin ubicación'}</h3>
                <p style="margin: 0; font-size: 0.9rem;">${s.name} (${s.office})</p>
                ${s.protestName ? `<p style="margin: 5px 0 0; color: #003366; font-weight: 600;">Protesta: ${s.protestName}</p>` : ''}
            </div>
            <div style="text-align: right;">
                <span class="badge" style="background: ${s.status === 'finished' ? '#f1f5f9' : '#dbeafe'}; color: ${s.status === 'finished' ? '#64748b' : '#1e40af'};">
                    ${s.status === 'finished' ? 'Finalizada' : 'En Curso'}
                </span>
                <div style="margin-top: 10px; font-size: 0.8rem; color: #64748b;">
                    Incidencias: ${s.incidents ? Object.keys(s.incidents).length : 0}
                </div>
            </div>
        </div>
    `).join('') || '<p style="text-align:center; padding:20px;">No hay reportes hoy.</p>';
}

function updateGlobalFeed(sessions) {
    const feed = document.getElementById('global-feed');
    if (!feed) return;

    let feedItems = [];
    Object.values(sessions).forEach(s => {
        if (s.incidents) {
            Object.values(s.incidents).forEach(inc => {
                feedItems.push({ ...inc, sessionId: s.sessionId, sessionLocation: s.location });
            });
        }
    });

    feedItems.sort((a,b) => b.timestamp - a.timestamp);

    feed.innerHTML = feedItems.map(inc => `
        <div class="feed-item" style="border-bottom: 1px solid #eee; padding-bottom: 15px; margin-bottom: 15px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                    <span style="font-weight: bold; color: #003366;">${inc.author}</span>
                    <span style="font-size: 0.8rem; color: #666;"> en ${inc.sessionLocation}</span>
                </div>
                <span style="font-size: 0.75rem; color: #94a3b8;">${inc.time}</span>
            </div>
            <div style="margin-top: 8px;">
                <span class="badge" style="background: ${getIncidentColor(inc.clasificacion)}; color: white; padding: 2px 8px; border-radius: 99px; font-size: 0.75rem;">
                    ${inc.clasificacion}
                </span>
                ${inc.cantidad ? `<span style="font-weight: 700; margin-left: 5px;">[${inc.cantidad}]</span>` : ''}
            </div>
            <p style="margin: 8px 0; font-size: 0.95rem;">${inc.description}</p>
            ${inc.imageUrl ? `
                <div style="margin-top: 10px;">
                    <img src="${inc.imageUrl}" style="max-width: 100%; border-radius: 8px; cursor: pointer; border: 1px solid #e2e8f0;" onclick="viewFullImage('${inc.imageUrl}')">
                </div>
            ` : ''}
            ${inc.audioUrl ? `
                <div style="margin-top: 10px;">
                    <audio controls src="${inc.audioUrl}" style="width: 100%; height: 35px;"></audio>
                </div>
            ` : ''}
        </div>
    `).join('') || '<p style="text-align: center; color: #94a3b8; padding: 20px;">No hay incidencias reportadas hoy.</p>';
}

function getIncidentColor(cls) {
    switch(cls) {
        case 'Heridos': return '#ea580c';
        case 'Fallecidos': return '#dc2626';
        case 'Privados de la libertad': return '#9333ea';
        case 'Enfrentamientos': return '#f39c12';
        default: return '#3b82f6';
    }
}

function viewFullImage(url) {
    const modal = document.getElementById('image-modal');
    const fullImg = document.getElementById('full-image');
    if (modal && fullImg) {
        fullImg.src = url;
        modal.style.display = 'flex';
    }
}

document.getElementById('close-image-modal')?.addEventListener('click', () => {
    document.getElementById('image-modal').style.display = 'none';
});

initDashboard();
