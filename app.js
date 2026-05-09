// === CAPTURA DE ERRORES GLOBAL (diagnóstico) ===
window.onerror = function(msg, src, line, col, err) {
    var info = "JS ERROR en línea " + line + ": " + msg;
    document.body.style.background = "#fee";
    var div = document.createElement("div");
    div.style.cssText = "position:fixed;top:0;left:0;right:0;background:red;color:white;padding:10px;z-index:99999;font-size:14px;word-break:break-all;";
    div.textContent = info;
    document.body.appendChild(div);
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

// Firebase Safety Wrappers
const _fbDb = (typeof _db !== "undefined") ? _db : null;
const _fbStorage = (typeof _storage !== "undefined") ? _storage : null;

function fbRef(path) {
    return _fbDb ? _fbDb.ref(path) : null;
}

// Configuration
const GOOGLE_SHEETS_URL = "https://script.google.com/macros/s/AKfycbz9GbqHfoAQarF5pv4da2jJDcSSTz7suco2O5SyaZ8X_4sJOTVbYZhiTrj0X501uECW/exec";
let waContacts = [];
let activeSession = null;
let history = [];
let timerInterval = null;
let locationWatchId = null;

// Audio Variables
let mediaRecorder;
let audioChunks = [];
let audioBlob = null;
let audioTimerInterval = null;
let audioSeconds = 0;

// DOM Elements
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

const exportBtn = document.getElementById('export-btn');
const locationDatalist = document.getElementById('location-list');
const categorySelect = document.getElementById('category');

// Initialization
function init() {
    activeSession = JSON.parse(localStorage.getItem('dp_active_session'));
    history = JSON.parse(localStorage.getItem('dp_history')) || [];

    fetchDynamicLists();

    const dateInputs = document.querySelectorAll('input[type="date"]');
    const now = new Date();
    const localDate = now.toISOString().split('T')[0];
    dateInputs.forEach(input => { input.value = localDate; });

    if (activeSession) {
        showActiveSession();
    } else {
        showSelectionScreen();
    }
    renderHistory();
}

async function fetchDynamicLists() {
    try {
        const response = await fetch(GOOGLE_SHEETS_URL);
        const json = await response.json();
        if (json.config && json.config.contactos) {
            waContacts = json.config.contactos;
        }
    } catch (e) { console.error("Error fetching lists", e); }
}

// Navigation
function showSelectionScreen() {
    [acpSection, startSection, activeSection, historySection].forEach(s => s?.classList.add('hidden'));
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
    
    document.getElementById('display-name').textContent = activeSession.name;
    document.getElementById('display-office').textContent = activeSession.office;
    document.getElementById('display-location').textContent = activeSession.location;
    
    startTimer(activeSession.startTime);
    listenToFirebaseIncidents();
    startLocationTracking();
}

// Timer & Tracking
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
        locationWatchId = navigator.geolocation.watchPosition(async (pos) => {
            const { latitude: lat, longitude: lng } = pos.coords;
            const _locRef = fbRef('sessions/' + activeSession.sessionId + '/currentLocation');
            if (_locRef) _locRef.set({ lat, lng, timestamp: Date.now() });
        }, (err) => console.warn(err), { enableHighAccuracy: true });
    }
}

// Form Handlers
acpForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(acpForm);
    const session = {
        sessionId: 'ACP-' + Date.now(),
        type: 'OD',
        name: data.get('name'),
        office: data.get('office'),
        location: data.get('location'),
        startTime: Date.now(),
        incidents: []
    };
    saveAndStart(session);
});

startForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(startForm);
    const session = {
        sessionId: 'PLAN-' + Date.now(),
        type: 'Sede',
        name: data.get('name'),
        office: data.get('office'),
        location: data.get('location'),
        protestName: data.get('protest-name'),
        startTime: Date.now(),
        incidents: []
    };
    saveAndStart(session);
});

async function saveAndStart(session) {
    activeSession = session;
    localStorage.setItem('dp_active_session', JSON.stringify(session));
    const _sRef = fbRef('sessions/' + session.sessionId);
    if (_sRef) await _sRef.set(session);
    showActiveSession();
}

finishBtn?.addEventListener('click', async () => {
    if (!confirm("¿Finalizar supervisión?")) return;
    const endTime = Date.now();
    activeSession.endTime = endTime;
    activeSession.duration = endTime - activeSession.startTime;
    
    history.unshift(activeSession);
    localStorage.setItem('dp_history', JSON.stringify(history.slice(0, 50)));
    localStorage.removeItem('dp_active_session');
    
    const _sRef = fbRef('sessions/' + activeSession.sessionId);
    if (_sRef) await _sRef.update({ endTime, duration: activeSession.duration, status: 'finished' });
    
    if (locationWatchId) navigator.geolocation.clearWatch(locationWatchId);
    if (timerInterval) clearInterval(timerInterval);
    
    location.reload();
});

// Incidents Logic
function listenToFirebaseIncidents() {
    const iRef = fbRef('sessions/' + activeSession.sessionId + '/incidents');
    if (iRef) {
        iRef.on('value', (snap) => {
            const val = snap.val();
            if (val) {
                activeSession.incidents = Object.keys(val).map(k => ({ id: k, ...val[k] })).sort((a,b) => a.timestamp - b.timestamp);
                renderTimeline();
            }
        });
    }
}

function renderTimeline() {
    const container = document.getElementById('incidents-timeline');
    if (!container) return;
    if (!activeSession.incidents || activeSession.incidents.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#888;margin-top:20px;">Sin registros aún.</p>';
        return;
    }
    container.innerHTML = activeSession.incidents.map(inc => `
        <div class="chat-bubble chat-mine">
            <div class="chat-author">${inc.author}</div>
            <div class="timeline-desc"><strong>${inc.clasificacion}</strong> ${inc.cantidad ? `(${inc.cantidad})` : ''} - ${inc.description}</div>
            ${inc.imageUrl ? `<img src="${inc.imageUrl}" class="chat-img" onclick="window.open('${inc.imageUrl}')">` : ''}
            ${inc.audioUrl ? `<audio controls src="${inc.audioUrl}" class="chat-audio"></audio>` : ''}
            <div class="chat-time">${inc.time}</div>
        </div>
    `).join('');
    container.scrollTop = container.scrollHeight;
}

// Modal handling
const incidentModal = document.getElementById('incident-modal');
const saveIncidentBtn = document.getElementById('save-incident-btn');

window.openModal = function(mode) {
    incidentModal?.classList.remove('hidden-modal');
    document.getElementById('modal-title').textContent = mode === 'actualizacion' ? 'Enviar Actualización' : 'Nueva Incidencia';
    document.getElementById('incident-class-group').classList.toggle('hidden', mode === 'actualizacion');
};

document.getElementById('cancel-incident-btn')?.addEventListener('click', () => incidentModal?.classList.add('hidden-modal'));

saveIncidentBtn?.addEventListener('click', async () => {
    const desc = document.getElementById('incident-desc').value;
    if (!desc) return alert("Ingresa descripción");
    
    saveIncidentBtn.disabled = true;
    saveIncidentBtn.textContent = "Guardando...";
    
    const newInc = {
        timestamp: Date.now(),
        time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}),
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
        
        incidentModal.classList.add('hidden-modal');
        resetAudioUI();
    } catch (e) { alert(e.message); }
    finally {
        saveIncidentBtn.disabled = false;
        saveIncidentBtn.textContent = "Guardar";
    }
});

// Audio functions
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
    if (history.length === 0) {
        historyList.innerHTML = '<p class="empty-msg">No hay registros previos.</p>';
        return;
    }
    historyList.innerHTML = history.map(item => `
        <div class="history-item">
            <strong>${item.location}</strong> - ${item.date || new Date(item.startTime).toLocaleDateString()}<br>
            ${item.name} (${item.office})
        </div>
    `).join('');
}

init();
