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
let otherMarkers = {}; // Almacena marcadores de otros comisionados { sessionId: marker }

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

function showAcpForm() { showSection('acp-section'); }
function showPlanForm() { showSection('start-section'); }

// --- DOCUMENTOS DE GESTIÓN ---
const documentosGestion = [
    { titulo: 'Lineamientos de Supervisión', url: '#' },
    { titulo: 'Cartilla de Derechos', url: '#' },
    { titulo: 'Protocolo de Intervención', url: '#' }
];

function renderToolkit() {
    const list = document.getElementById('toolkit-list');
    const modalList = document.getElementById('modal-docs-list');
    if (!list) return;

    const html = documentosGestion.map(doc => 
        `<a href="${doc.url}" target="_blank" style="text-decoration:none; color:var(--primary); font-size:0.9rem; padding:8px; background:#f0f2f5; border-radius:8px;">📄 ${doc.titulo}</a>`
    ).join('');

    list.innerHTML = html;
    if (modalList) modalList.innerHTML = html;
}

// --- INICIALIZACIÓN ---
function init() {
    activeSession = JSON.parse(localStorage.getItem('dp_active_session'));
    history = JSON.parse(localStorage.getItem('dp_history')) || [];

    // Fechas
    const dateLima = document.getElementById('date');
    if (dateLima) dateLima.value = new Date().toISOString().split('T')[0];
    const dateAcp = document.getElementById('acp-date');
    if (dateAcp) dateAcp.value = new Date().toISOString().split('T')[0];

    // Listeners
    document.getElementById('choice-acp')?.addEventListener('click', showAcpForm);
    document.getElementById('choice-plan')?.addEventListener('click', showPlanForm);
    document.querySelectorAll('.back-link').forEach(btn => btn.addEventListener('click', () => showSection('selection-section')));
    document.getElementById('export-btn')?.addEventListener('click', exportData);

    // Docs Modal
    document.getElementById('view-docs-btn')?.addEventListener('click', () => {
        document.getElementById('docs-modal').classList.remove('hidden-modal');
    });
    document.getElementById('close-docs-btn')?.addEventListener('click', () => {
        document.getElementById('docs-modal').classList.add('hidden-modal');
    });

    renderToolkit();
    
    // Listener de Categoría para Lima
    const categorySelect = document.getElementById('category');
    categorySelect?.addEventListener('change', populateLocationDatalist);

    // Listener de Categoría para ACP
    const acpCategorySelect = document.getElementById('acp-category');
    acpCategorySelect?.addEventListener('change', () => populateLocationDatalist(true));

    initFirebaseCatalogos();
    
    if (activeSession) showActiveSession();
    else showSection('selection-section');
    
    renderHistory();
}

// === GESTIÓN DE CATÁLOGOS DINÁMICOS (LIMA) ===
const originalLocationOptions = {
    'Espacio de movilización': [
        "Congreso", "Fiscalía", "Parque Universitario", "Plaza San Martín", "Plaza Dos de Mayo",
        "Plaza Manco Cápac", "Alameda Paseo de los Héroes Navales", "Óvalo Grau", "Óvalo Bolognesi"
    ],
    'Dependencia policial': [
        "Comisaría Alfonso Ugarte", "Comisaría Cotabambas", "Comisaría de Mujeres",
        "Comisaría PNP San Andrés", "División de Asuntos Sociales", "Comisaría de Piedra Liza",
        "DIRCOTE", "DIRINCRI", "DINOES", "Comisaría de Petit Thouars"
    ],
    'Establecimiento de salud': [
        "Hospital Nacional Arzobispo Loayza", "Emergencias Grau", "Hospital Nacional Guillermo Almenara",
        "Hospital Edgardo Rebagliati Martins", "Hospital Nacional Dos de Mayo",
        "Hospital PNP Augusto B. Leguía", "Hospital Nacional PNP Luis N Saenz",
        "Hospital de Emergencias Pediátricas"
    ],
    'Cámara': [
        "Centro de Monitoreo", "Cámaras - Municipalidad", "Cámaras - PNP",
        "Cámaras videovigilancia Miraflores", "Centro de Control de Tránsito"
    ]
};

let catalogosCache = { protestas: [], puntos: {} };

function initFirebaseCatalogos() {
    const catRef = fbRef('configuracion/catalogos');
    if (!catRef) return;

    catRef.on('value', snap => {
        const data = snap.val();
        if (!data) return;

        catalogosCache = data;
        
        // Poblar datalist de protestas
        const protestList = document.getElementById('protest-list-plan');
        if (protestList) {
            protestList.innerHTML = (data.protestas || []).map(p => `<option value="${p}">`).join('');
        }

        // Actualizar datalists de puntos si hay una categoría seleccionada
        populateLocationDatalist();
        populateLocationDatalist(true);
    });

    // Cargar contactos de Google Sheets (mantenemos esto por ahora si el usuario no pidió quitarlo)
    fetchGoogleConfig();
}

function populateLocationDatalist(isAcp = false) {
    const catSelectId = isAcp ? 'acp-category' : 'category';
    const listId = isAcp ? 'location-list-acp' : 'location-list';
    
    const catSelect = document.getElementById(catSelectId);
    const datalist = document.getElementById(listId);
    
    if (!catSelect || !datalist) return;
    
    const cat = catSelect.value;
    
    // FUSIÓN DE CATÁLOGOS: Original (Lima) + Dinámico (Firebase)
    const localPoints = originalLocationOptions[cat] || [];
    const remotePoints = (catalogosCache.puntos && catalogosCache.puntos[cat]) ? catalogosCache.puntos[cat] : [];
    
    // Combinar y eliminar duplicados
    const mergedPoints = [...new Set([...localPoints, ...remotePoints])];
    
    datalist.innerHTML = mergedPoints.map(p => `<option value="${p}">`).join('');
}

async function fetchGoogleConfig() {
    try {
        const res = await fetch(GOOGLE_SHEETS_URL);
        const json = await res.json();
        if (json.config) {
            waContacts = json.config.contactos || [];
        }
    } catch (e) { console.error("Google sync error", e); }
}

// --- SESIÓN ACTIVA ---
function showActiveSession() {
    showSection('active-section');
    safeSetText('display-location', activeSession.location);

    initMinimap();
    startTimer(activeSession.startTime);
    listenSharedFeed();
    startLocationTracking();
    syncOtherCommissioners(); // Multiplayer Map
}

function initMinimap() {
    if (minimap) return;
    minimap = L.map('minimapa-comisionado', { zoomControl: false }).setView([-12.0464, -77.0428], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(minimap);
    
    minimapMarker = L.marker([-12.0464, -77.0428]).addTo(minimap);
    minimapMarker.bindTooltip("Tú: " + activeSession.name, {
        permanent: true,
        direction: 'top',
        className: 'waze-tooltip'
    });
}

function syncOtherCommissioners() {
    const sessionsRef = fbRef('sessions');
    if (!sessionsRef || !activeSession.protestName) return;

    sessionsRef.on('value', snap => {
        const data = snap.val();
        if (!data) return;

        Object.keys(data).forEach(sid => {
            if (sid === activeSession.sessionId) return; 

            const s = data[sid];
            // AISLAMIENTO ESTRICTO POR PROTESTA
            const isSameProtest = (s.protestName === activeSession.protestName) && (s.protestName !== undefined);
            const isActive = s.status === 'active';

            if (isSameProtest && isActive && s.currentLat && s.currentLng) {
                updateOtherMarker(sid, s);
            } else {
                removeOtherMarker(sid);
            }
        });
    });
}

function updateOtherMarker(sid, s) {
    const latlng = [s.currentLat, s.currentLng];

    // REGLA ESTRICTA: solo alertaActiva===true activa el pin de emergencia
    const hasCritical = s.alertaActiva === true;

    let marker;
    if (hasCritical) {
        // ESTADO DE EMERGENCIA 🚨
        marker = L.divIcon({
            html: '🚨',
            className: 'alert-marker',
            iconSize: [40, 40],
            iconAnchor: [20, 40]
        });
    } else {
        // ESTADO NORMAL: pin azul estándar de Leaflet (sin divIcon)
        marker = new L.Icon.Default();
    }

    if (otherMarkers[sid]) {
        otherMarkers[sid].setLatLng(latlng);
        otherMarkers[sid].setIcon(marker);
    } else {
        otherMarkers[sid] = L.marker(latlng, { icon: marker }).addTo(minimap);
        otherMarkers[sid].bindTooltip(s.name + ' (' + s.office + ')', {
            permanent: true,
            direction: 'top',
            className: 'waze-tooltip'
        });
    }
}


function removeOtherMarker(sid) {
    if (otherMarkers[sid]) {
        minimap.removeLayer(otherMarkers[sid]);
        delete otherMarkers[sid];
    }
}

function startLocationTracking() {
    if (!navigator.geolocation) return;
    
    const geoOptions = { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 };

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
        
    }, err => {
        console.warn("GPS Update Error", err);
        safeSetText('display-start-geo', 'Ubicación aprox. (señal débil)');
    }, geoOptions);
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
            // Ordenamos cronológicamente (más antiguo primero) para que al insertar aparezca abajo
            const list = data ? Object.values(data).sort((a,b) => a.timestamp - b.timestamp) : [];
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

    // AUTO-SCROLL AL FINAL (WhatsApp Style)
    container.scrollTop = container.scrollHeight;
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
acpForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = "Procesando...";

    const photoFile = document.getElementById('acp-photo').files[0];
    let photoUrl = "";
    if (photoFile && _fbStorage) {
        const ref = _fbStorage.ref('starts/' + Date.now());
        await ref.put(photoFile);
        photoUrl = await ref.getDownloadURL();
    }

    startSession({
        sessionId: 'ACP-' + Date.now(),
        type: 'OD',
        fecha: document.getElementById('acp-date').value,
        turno: document.getElementById('acp-turno').value,
        name: document.getElementById('acp-supervisor').value,
        office: document.getElementById('acp-office').value,
        category: document.getElementById('acp-category').value,
        location: document.getElementById('acp-location').value,
        startTime: Date.now(),
        initialPhoto: photoUrl
    });
});

const startForm = document.getElementById('start-form');
startForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = "Procesando...";

    const photoFile = document.getElementById('main-photo').files[0];
    let photoUrl = "";
    if (photoFile && _fbStorage) {
        const ref = _fbStorage.ref('starts/' + Date.now());
        await ref.put(photoFile);
        photoUrl = await ref.getDownloadURL();
    }

    startSession({
        sessionId: 'LIMA-' + Date.now(),
        type: 'Sede',
        fecha: document.getElementById('date').value,
        turno: document.getElementById('turno').value,
        office: document.getElementById('office').value,
        name: document.getElementById('name').value,
        protestName: document.getElementById('protest-name').value,
        location: document.getElementById('location').value,
        startTime: Date.now(),
        initialPhoto: photoUrl
    });
});

async function startSession(session) {
    try {
        const pos = await new Promise((res,rej) => {
            navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:true, timeout:5000});
        });
        session.startLat = pos.coords.latitude;
        session.startLng = pos.coords.longitude;
        session.currentLat = session.startLat;
        session.currentLng = session.startLng;
    } catch(e) { 
        console.warn("GPS inicial omitido", e);
        session.startLat = -12.0464;
        session.startLng = -77.0428;
        session.currentLat = session.startLat;
        session.currentLng = session.startLng;
    }

    activeSession = session;
    localStorage.setItem('dp_active_session', JSON.stringify(session));
    
    const sRef = fbRef('sessions/' + session.sessionId);
    if (sRef) await sRef.set({ ...session, status: 'active', lastUpdate: Date.now() });
    
    const cloudData = {
        fecha: session.fecha,
        tipo_registro: session.type,
        turno: session.turno,
        oficina: session.office,
        supervisor: session.name,
        nombre_protesta: session.protestName || "N/A",
        categoria: session.category || "General",
        punto: session.location,
        inicio: formatAMPM(new Date(session.startTime)),
        lat_inicio: session.startLat,
        lng_inicio: session.startLng,
        mediaData: "",
        archivo: session.initialPhoto || "",
        sessionId: session.sessionId
    };

    syncWithCloud('start', cloudData);
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
    const rawDesc = document.getElementById('incident-desc').value;
    const qty = document.getElementById('incidencia-cantidad').value;
    const category = document.getElementById('incident-class').value;
    
    if (!rawDesc) return alert("Describe el suceso.");

    saveIncidentBtn.disabled = true;
    saveIncidentBtn.textContent = "Enviando...";

    const finalDesc = category + (qty ? ' (' + qty + ')' : '') + ' - ' + rawDesc;

    const inc = {
        timestamp: Date.now(),
        clasificacion: category,
        cantidad: qty,
        description: finalDesc,
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

        // === ETIQUETAR ALERTA EN FIREBASE ===
        // Usamos .child() explícito para garantizar la escritura del campo
        const isCritical = ['Heridos', 'Fallecidos', 'Privados de la libertad'].includes(inc.clasificacion);
        const alertaRef = fbRef('sessions/' + activeSession.sessionId + '/alertaActiva');
        if (alertaRef) {
            await alertaRef.set(isCritical);
            console.log('[ALERTA] alertaActiva escrita en Firebase:', isCritical);
        }

        syncWithCloud('incident', activeSession, { incident: inc });
        
        if (isCritical) {
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
    document.getElementById('incidencia-cantidad').value = "";
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
