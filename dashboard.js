// Configuración
const GOOGLE_SHEETS_URL = "https://script.google.com/macros/s/AKfycbz9GbqHfoAQarF5pv4da2jJDcSSTz7suco2O5SyaZ8X_4sJOTVbYZhiTrj0X501uECW/exec";

// Elementos
const filterDate = document.getElementById('filter-date');
const refreshBtn = document.getElementById('refresh-btn');
const reportsList = document.getElementById('reports-list');

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
    fetchData();
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
    try {
        const res = await fetch(GOOGLE_SHEETS_URL);
        const json = await res.json();
        // Procesar datos históricos si es necesario
    } catch (e) { console.error(e); }
}

function updateDashboard(sessions) {
    if (!reportsList) return;
    const sessionIds = Object.keys(sessions);
    reportsList.innerHTML = sessionIds.map(id => {
        const s = sessions[id];
        return `
            <div class="report-card">
                <h3>${s.location}</h3>
                <p>${s.name} - ${s.office}</p>
                <p>Status: ${s.status || 'Active'}</p>
            </div>
        `;
    }).join('');
}

initDashboard();
