// === CAPTURA DE ERRORES GLOBAL ===
window.onerror = function(msg, src, line, col, err) {
    console.error(err);
    return false;
};

// === FUNCIONES GLOBALES ===
const ADMIN_PASSWORD = "Defensoria2026";

function adminLogin() {
    var pass = prompt("Ingrese clave de administrador:");
    if (pass === null) return;
    if (pass === ADMIN_PASSWORD) {
        window.location.href = "defensor.html";
    } else {
        alert("Clave incorrecta.");
    }
}

// Firebase Safety
const _fbDb = (typeof _db !== "undefined") ? _db : null;
const _fbStorage = (typeof _storage !== "undefined") ? _storage : null;

function fbRef(path) {
    return _fbDb ? _fbDb.ref(path) : null;
}

// Config
const GOOGLE_SHEETS_URL = "https://script.google.com/macros/s/AKfycbz9GbqHfoAQarF5pv4da2jJDcSSTz7suco2O5SyaZ8X_4sJOTVbYZhiTrj0X501uECW/exec";
let waContacts = [];
let activeSession = null;
let history = [];
let timerInterval = null;
let locationWatchId = null;

// Audio
let mediaRecorder;
let audioChunks = [];
let audioBlob = null;
let audioTimerInterval = null;
let audioSeconds = 0;

function safeSetText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

// Elementos DOM
const selectionSection = document.getElementById('selection-section');
const acpSection = document.getElementById('acp-section');
const startSection = document.getElementById('start-section');
const activeSection = document.getElementById('active-section');
const historySection = document.getElementById('history-section');

const choiceAcpBtn = document.getElementById('choice-acp');
const choicePlanBtn = document.getElementById('choice-plan');
const backBtns = document.querySelectorAll('.back-link');

const acpForm = document.getElementById('acp-form');
const startForm = document.getElementById('start-form');
const finishBtn = document.getElementById('finish-btn');
const timerDisplay = document.getElementById('timer');
const historyList = document.getElementById('history-list');

const categorySelect = document.getElementById('category');
const locationInput = document.getElementById('location');
const locationDatalist = document.getElementById('location-list');

// Listas de Lugares (Base)
const locationOptions = {
    'Espacio de movilización': ["Congreso", "Fiscalía", "Parque Universitario", "Plaza San Martín", "Plaza Dos de Mayo", "Plaza Manco Cápac", "Alameda Paseo de los Héroes Navales", "Óvalo Grau", "Óvalo Bolognesi"],
    'Establecimiento de salud': ["Hospital Arzobispo Loayza", "Hospital Dos de Mayo", "Hospital Almenara", "Hospital Rebagliati", "Hospital de Emergencias Pediátricas"],
    'Dependencia policial / Seguridad del Estado': ["Comisaría de Cotabambas", "Comisaría de Alfonso Ugarte", "Comisaría de Petit Thouars", "DIRCOTE", "DIRINCRI", "DINOES"],
    'Videovigilancia': ["Cámaras Municipalidad de Lima", "Cámaras videovigilancia Miraflores", "Centro de Control de Tránsito"]
};

// Inicialización
function init() {
    activeSession = JSON.parse(localStorage.getItem('dp_active_session'));
    history = JSON.parse(localStorage.getItem('dp_history')) || [];

    fetchDynamicLists();

    const dateInputs = document.querySelectorAll('input[type="date"]');
    const now = new Date();
    const localDate = now.toISOString().split('T')[0];
    dateInputs.forEach(input => { input.value = localDate; });

    // Listeners de Navegación
    choiceAcpBtn?.addEventListener('click', showAcpForm);
    choicePlanBtn?.addEventListener('click', showPlanForm);
    backBtns.forEach(btn => btn?.addEventListener('click', showSelectionScreen));

    // Lógica de Desplegables
    categorySelect?.addEventListener('change', () => {
        const cat = categorySelect.value;
        locationDatalist.innerHTML = "";
        const options = locationOptions[cat] || [];
        options.forEach(opt => {
            const node = document.createElement('option');
            node.value = opt;
            locationDatalist.appendChild(node);
        });
        locationInput.value = "";
    });

    if (activeSession) {
        syncWithCloud('start', session);
    showActiveSession();
    } else {
        showSelectionScreen();
    }
    renderHistory();
    exportBtn?.addEventListener('click', exportData);
}

async function fetchDynamicLists() {
    try {
        const response = await fetch(GOOGLE_SHEETS_URL);
        const json = await response.json();
        if (json.config) {
            if (json.config.contactos) waContacts = json.config.contactos;
            if (json.config.protestas) {
                const protestList = document.getElementById('protest-list-plan');
                if (protestList) {
                    protestList.innerHTML = "";
                    json.config.protestas.forEach(p => {
                        const opt = document.createElement('option');
                        opt.value = p;
                        protestList.appendChild(opt);
                    });
                }
            }
        }
    } catch (e) { console.error(e); }
}

// --- NAVEGACIÓN ---
function showSelectionScreen() {
    [acpSection, startSection, activeSection].forEach(s => s?.classList.add('hidden'));
    selectionSection?.classList.remove('hidden');
    historySection?.classList.remove('hidden');
}

function showAcpForm() {
    selectionSection?.classList.add('hidden');
    historySection?.classList.add('hidden');
    acpSection?.classList.remove('hidden');
}

function showPlanForm() {
    selectionSection?.classList.add('hidden');
    historySection?.classList.add('hidden');
    startSection?.classList.remove('hidden');
}

function showActiveSession() {
    [selectionSection, acpSection, startSection, historySection].forEach(s => s?.classList.add('hidden'));
    activeSection?.classList.remove('hidden');
    
    safeSetText('display-name', activeSession.name || 'N/A');
    safeSetText('display-office', activeSession.office || 'N/A');
    safeSetText('display-location', activeSession.location || 'N/A');
    
    const startTime = new Date(activeSession.startTime);
    safeSetText('display-start', startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    
    if (activeSession.startGeo) {
        safeSetText('display-start-geo', `${activeSession.startGeo.lat.toFixed(4)}, ${activeSession.startGeo.lng.toFixed(4)}`);
    } else {
        safeSetText('display-start-geo', 'Obteniendo...');
    }
    
    startTimer(activeSession.startTime);
    listenToFirebaseIncidents();
    startLocationTracking();
}

// --- LÓGICA CORE ---
function startTimer(startTime) {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const diff = Date.now() - startTime;
        const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
        const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
        const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
        if (timerDisplay) timerDisplay.textContent = `${h}:${m}:${s}`;
    }, 1000);
}

function startLocationTracking() {
    if ("geolocation" in navigator) {
        locationWatchId = navigator.geolocation.watchPosition(pos => {
            const _locRef = fbRef('sessions/' + activeSession.sessionId + '/currentLocation');
            if (_locRef) if (_locRef) _locRef.set({ lat: pos.coords.latitude, lng: pos.coords.longitude, timestamp: Date.now() });
        }, null, { enableHighAccuracy: true });
    }
}

acpForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(acpForm);
    saveAndStart({
        sessionId: 'ACP-' + Date.now(),
        type: 'OD',
        name: document.getElementById('acp-supervisor').value,
        office: document.getElementById('acp-office').value,
        location: document.getElementById('acp-office').value,
        startTime: Date.now(),
        incidents: []
    });
});

startForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(startForm);
    saveAndStart({
        sessionId: 'LIMA-' + Date.now(),
        type: 'Sede',
        name: document.getElementById('name').value,
        office: document.getElementById('office').value,
        location: document.getElementById('location').value,
        protestName: document.getElementById('protest-name').value,
        startTime: Date.now(),
        incidents: []
    });
});

async function saveAndStart(session) {
    try {
        const pos = await new Promise((res, rej) => {
            navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 });
        });
        session.startGeo = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch (e) { console.warn("GPS inicial falló", e); }

    activeSession = session;
    localStorage.setItem('dp_active_session', JSON.stringify(session));
    const _sRef = fbRef('sessions/' + session.sessionId);
    if (_sRef) await _sRef.set(session);
    syncWithCloud('start', session);
    showActiveSession();
}

finishBtn?.addEventListener('click', async () => {
    if (!confirm("¿Finalizar supervisión?")) return;
    const endTime = Date.now();
    activeSession.endTime = endTime;
    activeSession.duration = endTime - activeSession.startTime;
    activeSession.status = 'finished';
    
    history.unshift(activeSession);
    localStorage.setItem('dp_history', JSON.stringify(history.slice(0, 50)));
    syncWithCloud('finish', activeSession);
    localStorage.removeItem('dp_active_session');
    
    const _sRef = fbRef('sessions/' + activeSession.sessionId);
    if (_sRef) await _sRef.update({ endTime, duration: activeSession.duration, status: 'finished' });
    
    location.reload();
});

// --- INCIDENCIAS ---
function listenToFirebaseIncidents() {
    const iRef = fbRef('sessions/' + activeSession.sessionId + '/incidents');
    if (iRef) {
        iRef.on('value', snap => {
            const val = snap.val();
            activeSession.incidents = val ? Object.keys(val).map(k => ({ id: k, ...val[k] })).sort((a,b) => a.timestamp - b.timestamp) : [];
            renderTimeline();
        });
    }
}

function renderTimeline() {
    const container = document.getElementById('incidents-timeline');
    if (!container) return;
    container.innerHTML = (activeSession.incidents || []).map(inc => `
        <div class="chat-bubble chat-mine">
            <div class="chat-author">${inc.author}</div>
            <div class="timeline-desc"><strong>${inc.clasificacion}</strong> ${inc.cantidad ? `(${inc.cantidad})` : ''} - ${inc.description}</div>
            ${inc.imageUrl ? `<img src="${inc.imageUrl}" class="chat-img" onclick="window.open('${inc.imageUrl}')">` : ''}
            ${inc.audioUrl ? `<audio controls src="${inc.audioUrl}" class="chat-audio"></audio>` : ''}
            <div class="chat-time">${inc.time}</div>
        </div>
    `).join('') || '<p style="text-align:center;color:#888;margin-top:20px;">Sin registros aún.</p>';
    container.scrollTop = container.scrollHeight;
}

const incidentModal = document.getElementById('incident-modal');
const saveIncidentBtn = document.getElementById('save-incident-btn');

window.openModal = function(mode) {
    incidentModal?.classList.remove('hidden-modal');
    document.getElementById('modal-title').textContent = mode === 'actualizacion' ? 'Enviar Actualización' : 'Nueva Incidencia';
    document.getElementById('incident-class-group').classList.toggle('hidden', mode === 'actualizacion');
    const now = new Date();
    document.getElementById('incident-time').value = now.getHours().toString().padStart(2,'0') + ":" + now.getMinutes().toString().padStart(2,'0');
};

document.getElementById('cancel-incident-btn')?.addEventListener('click', () => incidentModal?.classList.add('hidden-modal'));

saveIncidentBtn?.addEventListener('click', async () => {
    const desc = document.getElementById('incident-desc').value;
    if (!desc) return alert("Ingresa descripción");
    
    saveIncidentBtn.disabled = true;
    saveIncidentBtn.textContent = "Guardando...";
    
    const newInc = {
        timestamp: Date.now(),
        time: document.getElementById('incident-time').value,
        clasificacion: document.getElementById('incident-class').value || 'Actualización',
        cantidad: document.getElementById('incident-qty').value,
        description: desc,
        author: activeSession.name
    };

    try {
        const photo = document.getElementById('incident-photo').files[0];
        if (photo && _fbStorage) {
            const ref = _fbStorage.ref(`incidents/${activeSession.sessionId}/${Date.now()}_${photo.name}`);
            await ref.put(photo);
            newInc.imageUrl = await ref.getDownloadURL();
        }
        if (audioBlob && _fbStorage) {
            const ref = _fbStorage.ref(`incidents/${activeSession.sessionId}/${Date.now()}_audio.webm`);
            await ref.put(audioBlob);
            newInc.audioUrl = await ref.getDownloadURL();
        }
        const iRef = fbRef('sessions/' + activeSession.sessionId + '/incidents');
        if (iRef) await iRef.push(newInc);
        syncWithCloud('incident', activeSession, { incident: newInc });
        incidentModal.classList.add('hidden-modal');
        resetAudioUI();
        if (['Heridos', 'Fallecidos', 'Privados de la libertad', 'Uso desmedido de la fuerza'].includes(newInc.clasificacion)) { openWaModal(newInc); }
    } catch (e) { alert(e.message); }
    finally {
        saveIncidentBtn.disabled = false;
        saveIncidentBtn.textContent = "Guardar";
    }
});

// Audio
const recordAudioBtn = document.getElementById('record-audio-btn');
const stopAudioBtn = document.getElementById('stop-audio-btn');

recordAudioBtn?.addEventListener('click', async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.onstop = () => {
        audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        document.getElementById('audio-preview').src = URL.createObjectURL(audioBlob);
        document.getElementById('audio-preview').classList.remove('hidden');
    };
    mediaRecorder.start();
    recordAudioBtn.classList.add('hidden');
    stopAudioBtn.classList.remove('hidden');
});

stopAudioBtn?.addEventListener('click', () => {
    mediaRecorder?.stop();
    stopAudioBtn.classList.add('hidden');
    recordAudioBtn.classList.remove('hidden');
});

function resetAudioUI() {
    audioBlob = null;
    document.getElementById('audio-preview').classList.add('hidden');
}

function renderHistory() {
    if (!historyList) return;
    historyList.innerHTML = history.length ? history.map(item => `
        <div class="history-item">
            <strong>${item.location}</strong> - ${item.date || new Date(item.startTime).toLocaleDateString()}<br>
            ${item.name} (${item.office})
        </div>
    `).join('') : '<p class="empty-msg">No hay registros previos.</p>';
}

// Drag & Drop
function setupDropzone(dropzoneId, inputId, contentId, previewId) {
    const dz = document.getElementById(dropzoneId);
    const input = document.getElementById(inputId);
    const content = document.getElementById(contentId);
    const preview = document.getElementById(previewId);
    if (!dz || !input) return;
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz.addEventListener('drop', e => {
        e.preventDefault();
        dz.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            input.files = e.dataTransfer.files;
            handleFile(e.dataTransfer.files[0]);
        }
    });
    input.addEventListener('change', () => { if (input.files[0]) handleFile(input.files[0]); });
    function handleFile(file) {
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = e => { preview.src = e.target.result; preview.style.display = 'block'; content.style.display = 'none'; };
            reader.readAsDataURL(file);
        }
    }
}
setupDropzone('dropzone-sede', 'media', 'dropzone-content-sede', 'preview-sede');
setupDropzone('dropzone-incident', 'incident-photo', 'dropzone-content-incident', 'preview-incident');


// --- SINCRONIZACIÓN Y EXPORTACIÓN ---
async function syncWithCloud(type, session, extra = {}) {
    if (!GOOGLE_SHEETS_URL) return;
    const payload = {
        action: 'log_supervision',
        type: type,
        session_id: session.sessionId,
        supervisor: session.name,
        office: session.office,
        location: session.location,
        timestamp: Date.now(),
        ...extra
    };
    try {
        await fetch(GOOGLE_SHEETS_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (e) { console.error("Error sync cloud", e); }
}

function exportData() {
    if (history.length === 0) return alert("No hay datos");
    let csv = 'Fecha,Tipo,Oficina,Comisionado,Ubicación,Inicio,Fin,Duración\n';
    history.forEach(h => {
        csv += \,\,\,\,\,\,\,\\n;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reporte.csv';
    a.click();
}

async function readFileAndCompress(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve({ base64: e.target.result, name: file.name, type: file.type });
        reader.readAsDataURL(file);
    });
}


// --- WHATSAPP MODAL ---
const waModal = document.getElementById('wa-modal');
const waContactSelect = document.getElementById('wa-contact-select');
let currentWaData = null;

function openWaModal(inc) {
    if (!waModal || !waContactSelect) return;
    waContactSelect.innerHTML = '<option value="" disabled selected>Selecciona contacto...</option>';
    waContacts.forEach((c, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = \ (\);
        waContactSelect.appendChild(opt);
    });
    currentWaData = inc;
    waModal.classList.remove('hidden-modal');
}

document.getElementById('wa-cancel-btn')?.addEventListener('click', () => waModal.classList.add('hidden-modal'));
document.getElementById('wa-send-btn')?.addEventListener('click', () => {
    const idx = waContactSelect.value;
    if (idx === "") return alert("Selecciona contacto");
    const c = waContacts[idx];
    const msg = ALERTA: \\nLugar: \\nHora: \\nDetalle: \;
    const phone = c.numero.toString().replace(/\D/g,'');
    window.open(https://wa.me/\?text=\, '_blank');
    waModal.classList.add('hidden-modal');
});

init();
