// === CONFIGURACIÓN Y GLOBALES ===
const _fbDb = (typeof _db !== "undefined") ? _db : null;
function fbRef(path) { return _fbDb ? _fbDb.ref(path) : null; }

let map;
let markers = {};
let currentSessionsRef = null;
let allSessionsOfDate = {};
const GOOGLE_WEBHOOK_URL = '';

// Ícono de alerta definido globalmente para uso en updateMarker y syncOtherCommissioners
const alertaIcon = L.divIcon({
    html: "<div style='font-size:24px; background:red; border-radius:50%; padding:4px; border:3px solid white; box-shadow:0 0 12px red; display:flex; align-items:center; justify-content:center;'>🚨</div>",
    className: 'alerta-pin',
    iconSize: [38, 38],
    iconAnchor: [19, 19]
});

// --- INICIALIZACIÓN ---
function initDashboard() {
    initMap();
    
    const filterDate = document.getElementById('filter-date');
    const filterProtest = document.getElementById('filter-protest');
    
    filterDate.value = new Date().toISOString().split('T')[0];
    
    filterDate.addEventListener('change', () => listenToSessions(filterDate.value));
    
    // Filtrado secundario por protesta
    filterProtest.addEventListener('change', () => applyFilters());

    document.getElementById('refresh-btn')?.addEventListener('click', () => location.reload());
    
    // Timeline
    document.getElementById('timeline-btn')?.addEventListener('click', generarLineaTiempo);
    document.getElementById('close-timeline-btn')?.addEventListener('click', () => {
        document.getElementById('timeline-modal').classList.add('hidden-modal');
    });
    document.getElementById('copy-timeline-btn')?.addEventListener('click', () => {
        const text = document.getElementById('timeline-content').innerText;
        navigator.clipboard.writeText(text).then(() => alert("Línea de tiempo copiada al portapapeles."));
    });

    // Sync BI
    document.getElementById('sync-gsheets-btn')?.addEventListener('click', exportarAGoogleSheets);

    // Descargar CSV
    document.getElementById('btn-descargar-csv')?.addEventListener('click', descargarCSV);

    // Carga inicial
    listenToSessions(filterDate.value);
}

function initMap() {
    const mapEl = document.getElementById('map-dashboard');
    if (!mapEl) return;
    map = L.map('map-dashboard').setView([-12.0464, -77.0428], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
}

function listenToSessions(selectedDate) {
    if (!_fbDb) return;
    if (currentSessionsRef) currentSessionsRef.off();
    
    clearDashboard();
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'block';

    currentSessionsRef = fbRef('sessions').orderByChild('fecha').equalTo(selectedDate);
    
    currentSessionsRef.on('value', snap => {
        allSessionsOfDate = snap.val() || {};
        if (loadingEl) loadingEl.style.display = 'none';
        
        populateProtestFilter(allSessionsOfDate);
        applyFilters();
    });
}

function populateProtestFilter(sessions) {
    const filter = document.getElementById('filter-protest');
    const currentVal = filter.value;
    const protests = new Set();
    
    Object.values(sessions).forEach(s => {
        if (s.protestName) protests.add(s.protestName);
    });

    // Mantener "Todas las protestas" y reconstruir
    filter.innerHTML = '<option value="all">Todas las protestas</option>';
    Array.from(protests).sort().forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        filter.appendChild(opt);
    });

    // Intentar restaurar selección previa si existe
    if (protests.has(currentVal)) filter.value = currentVal;
}

function applyFilters() {
    const selectedProtest = document.getElementById('filter-protest').value;
    
    let filtered = {};
    if (selectedProtest === 'all') {
        filtered = allSessionsOfDate;
    } else {
        Object.keys(allSessionsOfDate).forEach(id => {
            if (allSessionsOfDate[id].protestName === selectedProtest) {
                filtered[id] = allSessionsOfDate[id];
            }
        });
    }

    updateStatsAndMap(filtered);
    updateReportsList(filtered);
    updateGlobalFeed(filtered);
}

function clearDashboard() {
    Object.values(markers).forEach(m => map.removeLayer(m));
    markers = {};
    document.getElementById('reports-list').innerHTML = "";
    document.getElementById('global-feed').innerHTML = "";
    safeSetText('stat-active', '0');
    safeSetText('stat-incidents', '0');
    safeSetText('stat-heridos', '0');
    safeSetText('stat-fallecidos', '0');
    safeSetText('stat-detenidos', '0');
}

function updateStatsAndMap(sessions) {
    let active = 0;
    let totalIncidents = 0;
    let heridos = 0;
    let fallecidos = 0;
    let detenidos = 0;

    const activeIds = Object.keys(sessions);
    // Limpiar marcadores que ya no aplican al filtro
    Object.keys(markers).forEach(id => {
        if (!activeIds.includes(id)) {
            map.removeLayer(markers[id]);
            delete markers[id];
        }
    });

    activeIds.forEach(id => {
        const s = sessions[id];
        if (s.status !== 'finished') active++;

        const lat = s.currentLat || s.startLat;
        const lng = s.currentLng || s.startLng;

        if (lat && lng) updateMarker(id, s, lat, lng);

        if (s.incidents) {
            Object.values(s.incidents).forEach(inc => {
                totalIncidents++;
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

// Rastrear estado de alerta anterior por ID
const markerAlertState = {};

function updateMarker(id, s, lat, lng) {
    const hasAlert = s.alertaActiva === true;
    const normalIcon = new L.Icon.Default();
    const iconToUse = hasAlert ? alertaIcon : normalIcon;

    if (markers[id]) {
        markers[id].setLatLng([lat, lng]);
        // Forzar setIcon si el estado de alerta cambió
        if (markerAlertState[id] !== hasAlert) {
            markers[id].setIcon(iconToUse);
            markerAlertState[id] = hasAlert;
        }
    } else {
        markers[id] = L.marker([lat, lng], { icon: iconToUse }).addTo(map);
        markers[id].bindTooltip(s.name + ' (' + s.office + ')', {
            direction: 'top',
            className: 'waze-tooltip'
        });
        markerAlertState[id] = hasAlert;
    }
}

let latestFilteredSessions = {}; // Para el acordeón

function updateReportsList(sessions) {
    latestFilteredSessions = sessions;
    const list = document.getElementById('reports-list');
    if (!list) return;

    const sorted = Object.values(sessions).sort((a,b) => (b.startTime || 0) - (a.startTime || 0));
    
    list.innerHTML = sorted.map(s => {
        const isFinished = s.status === 'finished';
        const reportCount = s.incidents ? Object.keys(s.incidents).length : 0;
        const pName = s.protestName || 'Sin protesta asignada';
        
        return `<div class="supervision-card" onclick="toggleProtestStats(this, '${pName}')" style="background:#fff; padding:15px; border-radius:12px; margin-bottom:12px; border-left:5px solid ${isFinished ? '#95a5a6' : '#27ae60'}; box-shadow:0 4px 10px rgba(0,0,0,0.05);">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                <div>
                    <span class="badge-status ${isFinished ? 'badge-finished' : 'badge-active'}">${isFinished ? 'Finalizado' : 'Activo'}</span>
                    <div style="font-weight:800; font-size:1.05rem; margin-top:5px; color:var(--primary);">${s.location || 'N/A'}</div>
                </div>
                <span style="font-size:0.75rem; color:#999; font-weight:600;">${formatTime(s.startTime)}</span>
            </div>
            <div style="font-size:0.9rem; color:#555; margin-bottom:10px;">
                <strong>${s.name}</strong> (${s.office})<br>
                <span style="color:var(--accent); font-size:0.8rem;">📍 ${pName}</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #f0f0f0; padding-top:8px;">
                <span class="report-counter">🔔 ${reportCount} reportes</span>
                <span style="font-size:0.7rem; color:#aaa;">Marcha 🔽</span>
            </div>
            <div class="protest-stats-panel">
                <h4 style="font-size:0.8rem; margin-bottom:8px; color:var(--primary);">Resumen de esta Marcha:</h4>
                <div class="stats-row"><span>👥 Total Asignados:</span><span class="total-asignados">-</span></div>
                <div class="stats-row"><span style="color:var(--success);">🟢 Activos:</span><span class="activos-protesta">-</span></div>
                <div class="stats-row"><span style="color:#95a5a6;">🔴 Finalizados:</span><span class="finalizados-protesta">-</span></div>
            </div>
        </div>`;
    }).join('') || '<p style="text-align:center; padding:20px;">No hay reportes hoy.</p>';
}

function toggleProtestStats(card, protestName) {
    const panel = card.querySelector('.protest-stats-panel');
    const isExpanded = panel.classList.contains('expanded');
    document.querySelectorAll('.protest-stats-panel.expanded').forEach(p => { if (p !== panel) p.classList.remove('expanded'); });

    if (!isExpanded) {
        const group = Object.values(allSessionsOfDate).filter(s => (s.protestName || 'Sin protesta asignada') === protestName);
        panel.querySelector('.total-asignados').textContent = group.length;
        panel.querySelector('.activos-protesta').textContent = group.filter(s => s.status !== 'finished').length;
        panel.querySelector('.finalizados-protesta').textContent = group.filter(s => s.status === 'finished').length;
        panel.classList.add('expanded');
    } else {
        panel.classList.remove('expanded');
    }
}

function updateGlobalFeed(sessions) {
    const feed = document.getElementById('global-feed');
    if (!feed) return;

    let feedItems = [];
    Object.values(sessions).forEach(s => {
        if (s.incidents) {
            Object.values(s.incidents).forEach(inc => {
                feedItems.push({ ...inc, sessionLocation: s.location, protestRoom: s.protestName });
            });
        }
    });

    feedItems.sort((a,b) => b.timestamp - a.timestamp);
    feed.innerHTML = feedItems.map(inc => `
        <div class="chat-bubble chat-others" style="margin-bottom:12px; width:100%; max-width:100%; border-radius:8px;">
            <div class="chat-author">${inc.author} en ${inc.sessionLocation} (${inc.protestRoom || 'OD'})</div>
            <div style="font-weight:700; margin:5px 0; color:${getIncidentColor(inc.clasificacion)};">${inc.clasificacion}</div>
            <div>${inc.description}</div>
            ${inc.imageUrl ? `<img src="${inc.imageUrl}" style="width:100%; border-radius:8px; margin-top:10px; cursor:pointer;" onclick="window.open('${inc.imageUrl}')">` : ''}
            ${inc.audioUrl ? `<audio controls src="${inc.audioUrl}" style="width:100%; height:30px; margin-top:10px;"></audio>` : ''}
            <div class="chat-time">${new Date(inc.timestamp).toLocaleTimeString()}</div>
        </div>`).join('') || '<p style="text-align:center; padding:20px; color:#999;">Esperando incidencias...</p>';
}

function generarLineaTiempo() {
    const selectedProtest = document.getElementById('filter-protest').value;
    let sessions = selectedProtest === 'all' ? allSessionsOfDate : Object.values(allSessionsOfDate).filter(s => s.protestName === selectedProtest);

    let allIncidents = [];
    Object.values(sessions).forEach(s => {
        if (s.incidents) {
            Object.values(s.incidents).forEach(inc => {
                allIncidents.push({ ...inc, location: s.location, supervisor: s.name });
            });
        }
    });

    allIncidents.sort((a,b) => a.timestamp - b.timestamp);
    const timelineText = allIncidents.map(inc => {
        const time = new Date(inc.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `[${time}] - ${inc.location}: ${inc.clasificacion} - ${inc.description} (${inc.supervisor})`;
    }).join('\n\n');

    document.getElementById('timeline-content').innerText = timelineText || "No hay incidencias.";
    document.getElementById('timeline-modal').classList.remove('hidden-modal');
}

async function exportarAGoogleSheets() {
    if (!GOOGLE_WEBHOOK_URL) return alert("Error: GOOGLE_WEBHOOK_URL vacía.");
    const btn = document.getElementById('sync-gsheets-btn');
    btn.disabled = true; btn.innerText = "Sincronizando... ⏳";

    const dataPayload = Object.values(allSessionsOfDate).map(s => ({
        fecha: s.fecha, comisionado: s.name, oficina: s.office, protesta: s.protestName || "OD/MOD",
        punto: s.location, hora_inicio: formatTime(s.startTime), 
        hora_fin: s.endTime ? formatTime(s.endTime) : "En curso", status: s.status === 'finished' ? 'Finalizado' : 'Activo'
    }));

    try {
        await fetch(GOOGLE_WEBHOOK_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ action: 'sync_bi', data: dataPayload }) });
        alert("Sincronización exitosa ✅");
    } catch (e) { alert("Error: " + e.message); }
    finally { btn.disabled = false; btn.innerText = "🔄 Sincronizar BI"; }
}

function getIncidentColor(cls) {
    switch(cls) {
        case 'Heridos': return '#e67e22';
        case 'Fallecidos': return '#c0392b';
        case 'Privados de la libertad': return '#8e44ad';
        default: return '#3498db';
    }
}
function formatTime(ts) { return ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""; }
function safeSetText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }

function descargarCSV() {
    const sessions = allSessionsOfDate;
    if (!sessions || Object.keys(sessions).length === 0) {
        alert("No hay datos para exportar en la fecha seleccionada.");
        return;
    }

    const headers = ["Fecha", "Comisionado", "Oficina", "Protesta", "Punto", "Inicio", "Fin", "Estado"];
    const rows = Object.values(sessions).map(s => [
        s.fecha || "",
        s.name || "",
        s.office || "",
        s.protestName || "OD/MOD",
        s.location || "",
        formatTime(s.startTime),
        s.endTime ? formatTime(s.endTime) : "En curso",
        s.status === 'finished' ? 'Finalizado' : 'Activo'
    ]);

    // Escapar comas dentro de los campos
    const escape = v => '"' + String(v).replace(/"/g, '""') + '"';
    const csvContent = [headers.map(escape).join(",")]
        .concat(rows.map(r => r.map(escape).join(",")))
        .join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const fecha = document.getElementById("filter-date").value || "hoy";
    a.href = url;
    a.download = "padron_supervisiones_" + fecha + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

initDashboard();

