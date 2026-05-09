// === CONFIGURACIÓN Y GLOBALES ===
const ADMIN_PASSWORD = "Defensoria2026";
const GOOGLE_SHEETS_URL = "https://script.google.com/macros/s/AKfycbz9GbqHfoAQarF5pv4da2jJDcSSTz7suco2O5SyaZ8X_4sJOTVbYZhiTrj0X501uECW/exec";

let activeSession = null;
let history = [];
let waContacts = [];
let timerInterval = null;
let locationWatchId = null;
let minimap = null;
let minimapMarker = null;

// Firebase Safety
const _fbDb = (typeof _db !== "undefined") ? _db : null;
const _fbStorage = (typeof _storage !== "undefined") ? _storage : null;
function fbRef(path) { return _fbDb ? _fbDb.ref(path) : null; }

// --- HELPERS ---
function adminLogin() {
    const pass = prompt("Ingrese clave de administrador:");
    if (pass === ADMIN_PASSWORD) window.location.href = "defensor.html";
    else if (pass !== null) alert("Clave incorrecta.");
}

function safeSetText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function slugify(text) {
    if (!text) return 'general';
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

function formatAMPM(date) {
    let hours = date.getHours();
    let minutes = date.getMinutes();
    let ampm = hours >= 12 ? 'p.m.' : 'a.m.';
    hours = hours % 12;
    hours = hours ? hours : 12; 
    minutes = minutes < 10 ? '0' + minutes : minutes;
    return hours + ':' + minutes + ' ' + ampm;
}

// --- NAVEGACIÓN ---
const sections = ['selection-section', 'acp-section', 'start-section', 'active-section'];
function showSection(id) {
    sections.forEach(s => document.getElementById(s)?.classList.add('hidden'));
    document.getElementById(id)?.classList.remove('hidden');
    if (id === 'selection-section') document.getElementById('history-section')?.classList.remove('hidden');
    else document.getElementById('history-section')?.classList.add('hidden');
}

// --- INICIALIZACIÓN ---
function init() {
    activeSession = JSON.parse(localStorage.getItem('dp_active_session'));
    history = JSON.parse(localStorage.getItem('dp_history')) || [];

    // Fechas
    const dateInput = document.getElementById('date');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

    // Listeners
    document.getElementById('choice-acp')?.addEventListener('click', () => showSection('acp-section'));
    document.getElementById('choice-plan')?.addEventListener('click', () => showSection('start-section'));
    document.querySelectorAll('.back-link').forEach(btn => btn.addEventListener('click', () => showSection('selection-section')));
    document.getElementById('export-btn')?.addEventListener('click', exportData);

    // Datalists dinámicos
    const categorySelect = document.getElementById('category');
    const locationDatalist = document.getElementById('location-list');
    const locationOptions = {
        'Espacio de movilización': ["Congreso", "Fiscalía", "Parque Universitario", "Plaza San Martín", "Plaza Dos de Mayo", "Plaza Manco Cápac", "Alameda Paseo de los Héroes Navales", "Óvalo Grau", "Óvalo Bolognesi"],
        'Establecimiento de salud': ["Hospital Arzobispo Loayza", "Hospital Dos de Mayo", "Hospital Almenara", "Hospital Rebagliati", "Hospital de Emergencias Pediátricas"],
        'Dependencia policial / Seguridad del Estado': ["Comisaría de Cotabambas", "Comisaría de Alfonso Ugarte", "Comisaría de Petit Thouars", "DIRCOTE", "DIRINCRI", "DINOES"]
    };

    categorySelect?.addEventListener('change', () => {
        const cat = categorySelect.value;
        locationDatalist.innerHTML = "";
        (locationOptions[cat] || []).forEach(opt => {
            const node = document.createElement('option');
            node.value = opt;
            locationDatalist.appendChild(node);
        });
    });

    fetchDynamicLists();
    
    if (activeSession) showActiveSession();
    else showSection('selection-section');
    
    renderHistory();
}

async function fetchDynamicLists() {
    try {
        const res = await fetch(GOOGLE_SHEETS_URL);
        const json = await res.json();
        if (json.config) {
            waContacts = json.config.contactos || [];
            const protestList = document.getElementById('protest-list-plan');
            if (protestList && json.config.protestas) {
                protestList.innerHTML = json.config.protestas.map(p => '<option value="' + p + '">').join('');
            }
        }
    } catch (e) { console.error("Sync error", e); }
}

// --- SESIÓN ACTIVA ---
function showActiveSession() {
    showSection('active-section');
    safeSetText('display-location', activeSession.location);

    initMinimap();
    startTimer(activeSession.startTime);
    listenSharedFeed();
    startLocationTracking();
}

function initMinimap() {
    if (minimap) return;
    minimap = L.map('minimapa-comisionado', { zoomControl: false }).setView([-12.0464, -77.0428], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(minimap);
    
    minimapMarker = L.marker([-12.0464, -77.0428]).addTo(minimap);
    minimapMarker.bindTooltip(activeSession.name, {
        permanent: true,
        direction: 'top',
        className: 'waze-tooltip'
    });
}

function startLocationTracking() {
    if (!navigator.geolocation) return;
    
    const geoOptions = {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
    };

    locationWatchId = navigator.geolocation.watchPosition(pos => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        
        safeSetText('display-start-geo', lat.toFixed(5) + ", " + lng.toFixed(5));
        
        if (minimap) {
            minimap.setView([lat, lng]);
            minimapMarker.setLatLng([lat, lng]);
        }
        
        const sRef = fbRef('sessions/' + activeSession.sessionId);
        if (sRef) sRef.update({ currentLat: lat, currentLng: lng, lastUpdate: Date.now() });
        
    }, err => console.warn("GPS Error", err), geoOptions);
}

function startTimer(start) {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const diff = Date.now() - start;
        const h = Math.floor(diff / 3600000).toString().padStart(2,'0');
        const m = Math.floor((diff % 3600000)/60000).toString().padStart(2,'0');
        const s = Math.floor((diff % 60000)/1000).toString().padStart(2,'0');
        safeSetText('timer', h + ":" + m + ":" + s);
    }, 1000);
}

// --- FEED COMPARTIDO ---
function listenSharedFeed() {
    const slug = slugify(activeSession.protestName || activeSession.location);
    const feedRef = fbRef('shared_feeds/' + slug + '/incidents');
    if (feedRef) {
        feedRef.on('value', snap => {
            const data = snap.val();
            const list = data ? Object.values(data).sort((a,b) => b.timestamp - a.timestamp) : [];
            renderTimeline(list);
        });
    }
}

function renderTimeline(list) {
    const container = document.getElementById('incidents-timeline');
    if (!container) return;
    
    container.innerHTML = list.map(inc => {
        const isMe = inc.author === activeSession.name;
        const timeStr = formatAMPM(new Date(inc.timestamp));
        
        return '<div class="chat-bubble ' + (isMe ? 'chat-mine' : 'chat-others') + '">' +
            '<div class="chat-author">' + inc.author + ' (' + inc.office + ')</div>' +
            '<div style="margin: 5px 0;">' +
            '<span style="background: ' + getIncidentColor(inc.clasificacion) + '; color:white; padding:2px 6px; border-radius:4px; font-size:0.75rem; font-weight:700;">' + inc.clasificacion + '</span>' +
            (inc.cantidad ? '<span style="font-weight:800; margin-left:5px;">[' + inc.cantidad + ']</span>' : '') +
            '</div>' +
            '<div style="word-wrap: break-word;">' + inc.description + '</div>' +
            (inc.imageUrl ? '<img src="' + inc.imageUrl + '" class="chat-img" onclick="window.open(\'' + inc.imageUrl + '\')">' : '') +
            (inc.audioUrl ? '<audio controls src="' + inc.audioUrl + '" style="width:100%; margin-top:10px; height:35px;"></audio>' : '') +
            '<div class="chat-time">' + timeStr + '</div>' +
            '</div>';
    }).join('') || '<p style="text-align:center; padding:40px; color:#999;">Esperando incidencias...</p>';
}

function getIncidentColor(cls) {
    switch(cls) {
        case 'Heridos': return '#e67e22';
        case 'Fallecidos': return '#c0392b';
        case 'Privados de la libertad': return '#8e44ad';
        default: return '#3498db';
    }
}

// --- FORM HANDLERS ---
const acpForm = document.getElementById('acp-form');
acpForm?.addEventListener('submit', e => {
    e.preventDefault();
    startSession({
        sessionId: 'ACP-' + Date.now(),
        type: 'OD',
        name: document.getElementById('acp-supervisor').value,
        office: document.getElementById('acp-office').value,
        location: document.getElementById('acp-office').value,
        startTime: Date.now()
    });
});

const startForm = document.getElementById('start-form');
startForm?.addEventListener('submit', e => {
    e.preventDefault();
    startSession({
        sessionId: 'LIMA-' + Date.now(),
        type: 'Sede',
        office: document.getElementById('office').value,
        name: document.getElementById('name').value,
        protestName: document.getElementById('protest-name').value,
        location: document.getElementById('location').value,
        startTime: Date.now()
    });
});

async function startSession(session) {
    try {
        const pos = await new Promise((res,rej) => navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:true, timeout:10000}));
        session.startLat = pos.coords.latitude;
        session.startLng = pos.coords.longitude;
        session.currentLat = session.startLat;
        session.currentLng = session.startLng;
    } catch(e) { console.warn("GPS Omitido", e); }

    activeSession = session;
    localStorage.setItem('dp_active_session', JSON.stringify(session));
    
    const sRef = fbRef('sessions/' + session.sessionId);
    if (sRef) await sRef.set({ ...session, status: 'active', lastUpdate: Date.now() });
    
    syncWithCloud('start', session);
    showActiveSession();
}

// --- INCIDENCIAS ---
const incidentModal = document.getElementById('incident-modal');
const saveIncidentBtn = document.getElementById('save-incident-btn');
let mediaRecorder;
let audioChunks = [];
let audioBlob = null;

document.getElementById('add-incident-btn')?.addEventListener('click', () => openIncidentModal('incidencia'));
document.getElementById('add-update-btn')?.addEventListener('click', () => openIncidentModal('actualizacion'));
document.getElementById('cancel-incident-btn')?.addEventListener('click', () => incidentModal.classList.add('hidden-modal'));

function openIncidentModal(mode) {
    incidentModal.classList.remove('hidden-modal');
    document.getElementById('modal-title').textContent = mode === 'actualizacion' ? 'Enviar Actualización' : 'Reportar Incidencia';
    document.getElementById('incident-class-group').style.display = mode === 'actualizacion' ? 'none' : 'block';
}

saveIncidentBtn?.addEventListener('click', async () => {
    const desc = document.getElementById('incident-desc').value;
    if (!desc) return alert("Describe el suceso.");

    saveIncidentBtn.disabled = true;
    saveIncidentBtn.textContent = "Enviando...";

    const inc = {
        timestamp: Date.now(),
        clasificacion: document.getElementById('incident-class').value,
        cantidad: document.getElementById('incident-qty').value,
        description: desc,
        author: activeSession.name,
        office: activeSession.office
    };

    try {
        const photo = document.getElementById('incident-photo').files[0];
        if (photo && _fbStorage) {
            const ref = _fbStorage.ref('incidents/' + activeSession.sessionId + '/' + Date.now());
            await ref.put(photo);
            inc.imageUrl = await ref.getDownloadURL();
        }
        if (audioBlob && _fbStorage) {
            const ref = _fbStorage.ref('incidents/' + activeSession.sessionId + '/' + Date.now() + '.webm');
            await ref.put(audioBlob);
            inc.audioUrl = await ref.getDownloadURL();
        }

        const slug = slugify(activeSession.protestName || activeSession.location);
        const feedRef = fbRef('shared_feeds/' + slug + '/incidents');
        if (feedRef) await feedRef.push(inc);
        
        const sRef = fbRef('sessions/' + activeSession.sessionId + '/incidents');
        if (sRef) await sRef.push(inc);

        syncWithCloud('incident', activeSession, { incident: inc });
        
        if (['Heridos', 'Fallecidos', 'Privados de la libertad'].includes(inc.clasificacion)) {
            openWaModal(inc);
        }

        incidentModal.classList.add('hidden-modal');
        resetIncidentForm();
    } catch(e) { alert("Error: " + e.message); }
    finally {
        saveIncidentBtn.disabled = false;
        saveIncidentBtn.textContent = "Enviar ➡️";
    }
});

function resetIncidentForm() {
    document.getElementById('incident-desc').value = "";
    document.getElementById('incident-qty').value = "";
    document.getElementById('incident-photo').value = "";
    audioBlob = null;
    document.getElementById('audio-preview').classList.add('hidden');
}

// WhatsApp
const waModal = document.getElementById('wa-modal');
let currentWaInc = null;
function openWaModal(inc) {
    currentWaInc = inc;
    const select = document.getElementById('wa-contact-select');
    select.innerHTML = waContacts.map((c, i) => '<option value="' + i + '">' + c.nombre + ' (' + c.cargo + ')</option>').join('');
    waModal.classList.remove('hidden-modal');
}
document.getElementById('wa-cancel-btn')?.addEventListener('click', () => waModal.classList.add('hidden-modal'));
document.getElementById('wa-send-btn')?.addEventListener('click', () => {
    const c = waContacts[document.getElementById('wa-contact-select').value];
    if (!c) return;
    const msg = "*ALERTA*\nTipo: " + currentWaInc.clasificacion + "\nLugar: " + activeSession.location + "\nDetalle: " + currentWaInc.description;
    window.open("https://wa.me/" + c.numero.toString().replace(/\D/g,'') + "?text=" + encodeURIComponent(msg), '_blank');
    waModal.classList.add('hidden-modal');
});

// Audio Record
document.getElementById('record-audio-btn')?.addEventListener('click', async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.onstop = () => {
        audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const preview = document.getElementById('audio-preview');
        preview.src = URL.createObjectURL(audioBlob);
        preview.classList.remove('hidden');
    };
    mediaRecorder.start();
    document.getElementById('record-audio-btn').classList.add('hidden');
    document.getElementById('stop-audio-btn').classList.remove('hidden');
});
document.getElementById('stop-audio-btn')?.addEventListener('click', () => {
    mediaRecorder?.stop();
    document.getElementById('stop-audio-btn').classList.add('hidden');
    document.getElementById('record-audio-btn').classList.remove('hidden');
});

// --- FINALIZAR ---
document.getElementById('finish-btn')?.addEventListener('click', async () => {
    if (!confirm("¿Deseas finalizar la supervisión?")) return;
    
    activeSession.endTime = Date.now();
    activeSession.status = 'finished';
    history.unshift(activeSession);
    localStorage.setItem('dp_history', JSON.stringify(history.slice(0,20)));
    localStorage.removeItem('dp_active_session');

    const sRef = fbRef('sessions/' + activeSession.sessionId);
    if (sRef) await sRef.update({ status: 'finished', endTime: activeSession.endTime });
    
    syncWithCloud('finish', activeSession);
    location.reload();
});

// Sync
async function syncWithCloud(action, session, extra = {}) {
    if (!GOOGLE_SHEETS_URL) return;
    try {
        fetch(GOOGLE_SHEETS_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({ action, session, ...extra })
        });
    } catch(e) { console.error(e); }
}

function renderHistory() {
    const list = document.getElementById('history-list');
    if (!list) return;
    list.innerHTML = history.map(h => '<div style="padding:10px; border-bottom:1px solid #eee;"><strong>' + h.location + '</strong> - ' + new Date(h.startTime).toLocaleDateString() + '</div>').join('') || '<p style="color:#999;font-size:0.9rem;">Sin registros previos.</p>';
}

function exportData() {
    if (!history.length) return alert("Nada que exportar.");
    const csv = "Fecha,Lugar,Comisionado,Oficina\n" + history.map(h => new Date(h.startTime).toLocaleDateString() + "," + h.location + "," + h.name + "," + h.office).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'reporte.csv'; a.click();
}

init();
