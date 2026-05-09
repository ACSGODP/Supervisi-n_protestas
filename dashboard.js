// Configuración
const GOOGLE_SHEETS_URL = "https://script.google.com/macros/s/AKfycbz9GbqHfoAQarF5pv4da2jJDcSSTz7suco2O5SyaZ8X_4sJOTVbYZhiTrj0X501uECW/exec";

// Elementos
const filterDate = document.getElementById('filter-date');
const refreshBtn = document.getElementById('refresh-btn');
const reportsList = document.getElementById('reports-list');

const statTotal = document.getElementById('stat-total');
const statActive = document.getElementById('stat-active');
const statFinished = document.getElementById('stat-finished');

const _fbDb = (typeof _db !== "undefined") ? _db : null;

let map;

function initDashboard() {
    if (filterDate) {
        filterDate.value = new Date().toISOString().split('T')[0];
        filterDate.addEventListener('change', fetchData);
    }
    
    refreshBtn?.addEventListener('click', fetchData);
    
    initMap();
    listenToFirebaseGlobal();
}

function initMap() {
    const mapEl = document.getElementById('map-dashboard');
    if (!mapEl) return;
    map = L.map('map-dashboard').setView([-12.0464, -77.0428], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
}

function listenToFirebaseGlobal() {
    if (!_fbDb) return;
    _fbDb.ref('sessions').on('value', (snap) => {
        const data = snap.val();
        if (data) {
            updateDashboard(data);
        }
    });
}

async function fetchData() {
    // Aquí podrías cargar datos históricos de Google Sheets si fuera necesario
}

function updateDashboard(sessions) {
    if (!reportsList) return;
    const sessionIds = Object.keys(sessions);
    const sessionsArr = sessionIds.map(id => sessions[id]);
    
    // Stats
    if (statTotal) statTotal.textContent = sessionsArr.length;
    const activeCount = sessionsArr.filter(s => s.status !== 'finished').length;
    const finishedCount = sessionsArr.filter(s => s.status === 'finished').length;
    if (statActive) statActive.textContent = activeCount;
    if (statFinished) statFinished.textContent = finishedCount;

    // List
    reportsList.innerHTML = sessionsArr.sort((a,b) => (b.startTime || 0) - (a.startTime || 0)).map(s => {
        const statusStr = s.status === 'finished' ? 'Finalizada' : 'En curso';
        const badgeClass = s.status === 'finished' ? 'badge-finished' : 'badge-active';
        const titleText = s.location || s.protestName || 'Supervisión';
        const subtitleText = (s.name || 'Comisionado') + " - " + (s.office || 'Sede');
        
        return '<div class="report-card">' +
            '<h3>' + titleText + '</h3>' +
            '<p><strong>' + subtitleText + '</strong></p>' +
            '<p>Tipo: ' + (s.type || 'N/A') + '</p>' +
            '<p>Status: <span class="badge ' + badgeClass + '">' + statusStr + '</span></p>' +
            '</div>';
    }).join('');
}

initDashboard();
