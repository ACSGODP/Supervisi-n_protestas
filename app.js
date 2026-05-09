
// Guardas de seguridad: Firebase puede no estar disponible (file://, offline, etc.)
const _fbDb      = (typeof _db      !== "undefined") ? _db      : null;
const _fbStorage = (typeof _storage !== "undefined") ? _storage : null;

// Wrapper seguro para evitar errores si Firebase no carga
function fbRef(path) {
    return _fbDb ? _fbDb.ref(path) : null;
}

// Registro de Service Worker para PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registrado'))
            .catch(err => console.log('Error en Service Worker', err));
    });
}

// CONFIGURACI�"N: Reemplaza esto con la URL que obtendrás de Google Apps Script
const GOOGLE_SHEETS_URL = "https://script.google.com/macros/s/AKfycbz9GbqHfoAQarF5pv4da2jJDcSSTz7suco2O5SyaZ8X_4sJOTVbYZhiTrj0X501uECW/exec";
const ADMIN_PASSWORD = "Defensoria2026";

// Variable global para contactos
let waContacts = [];

// Variables de Estado
let activeSession = null;
let history = [];
let timerInterval = null;
let locationWatchId = null;

// Variables de Audio
let mediaRecorder;
let audioChunks = [];
let audioBlob = null;
let audioTimerInterval = null;
let audioSeconds = 0;



// Elementos del DOM
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

const displayLocation = document.getElementById('display-location');
const displayStart = document.getElementById('display-start');
const displayStartGeo = document.getElementById('display-start-geo');

const exportBtn = document.getElementById('export-btn');
const adminLink = document.getElementById('admin-link');

// Inicialización
function init() {
    activeSession = JSON.parse(localStorage.getItem('dp_active_session'));
    history = JSON.parse(localStorage.getItem('dp_history')) || [];

    // Cargar listas dinámicas desde el backend
    fetchDynamicLists();

    // Poner la fecha de hoy por defecto
    // Poner la fecha de hoy por defecto (Corregido para Zona Horaria Local)
    const dateInputs = document.querySelectorAll('input[type="date"]');
    // Obtener fecha del dispositivo (Año-Mes-Día)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const localDate = `${year}-${month}-${day}`;

    dateInputs.forEach(input => {
        input.value = localDate;
    });

    if (activeSession) {
        showActiveSession();
    } else {
        showSelectionScreen();
    }
    renderHistory();
}

// Listas Dinámicas
async function fetchDynamicLists() {
    try {
        const response = await fetch(GOOGLE_SHEETS_URL);
        const json = await response.json();

        if (json.config) {
            // Actualizar Contactos
            if (json.config.contactos && json.config.contactos.length > 0) {
                waContacts = json.config.contactos;
            }

            // Función para combinar y actualizar listas
            const addToLocationOptions = (category, nuevasOpciones) => {
                if (nuevasOpciones && nuevasOpciones.length > 0) {
                    const current = locationOptions[category] || [];
                    const merged = [...new Set([...current, ...nuevasOpciones])];
                    locationOptions[category] = merged;
                    if (categorySelect.value === category) {
                        locationDatalist.innerHTML = "";
                        merged.forEach(opt => {
                            const optionNode = document.createElement('option');
                            optionNode.value = opt;
                            locationDatalist.appendChild(optionNode);
                        });
                    }
                }
            };

            // Actualizar Lugares según categoría
            addToLocationOptions('Espacio de movilización', json.config.lugares);
            addToLocationOptions('Dependencia policial / Seguridad del Estado', json.config.comisarias);
            addToLocationOptions('Establecimiento de salud', json.config.centros_salud);
            addToLocationOptions('Videovigilancia', json.config.videovigilancia);
            
            // Nota: En la app original no había categorías explícitas para MP y PJ, pero las agregamos
            // en caso de que existan o las necesiten en el futuro:
            addToLocationOptions('Sede Ministerio Público', json.config.sedes_mp);
            addToLocationOptions('Sede Poder Judicial', json.config.sedes_pj);

            // Actualizar Protestas (Ambos formularios)
            if (json.config.protestas && json.config.protestas.length > 0) {
                populateProtestDatalist(json.config.protestas);
            }
        }
    } catch (error) {
        console.error("Error cargando listas dinámicas:", error);
    }
}

function populateProtestDatalist(items) {
    const datalists = document.querySelectorAll('.protest-list-dynamic');
    datalists.forEach(list => {
        list.innerHTML = '';
        items.forEach(item => {
            const option = document.createElement('option');
            option.value = item;
            list.appendChild(option);
        });
    });
}

// Navegación
function showSelectionScreen() {
    hideAllSections();
    selectionSection.classList.remove('hidden');
    historySection.classList.remove('hidden');
}

function showAcpForm() {
    hideAllSections();
    acpSection.classList.remove('hidden');
    historySection.classList.add('hidden');
}

function showPlanForm() {
    hideAllSections();
    startSection.classList.remove('hidden');
    historySection.classList.add('hidden');
}

function hideAllSections() {
    selectionSection.classList.add('hidden');
    acpSection.classList.add('hidden');
    startSection.classList.add('hidden');
    activeSection.classList.add('hidden');
}

// Cambio de Interfaz
let miniMap = null;

function showActiveSession() {
    hideAllSections();
    activeSection.classList.remove('hidden');

    // Mostrar info
    displayLocation.textContent = `${activeSession.location} (${activeSession.category})`;
    displayStart.textContent = new Date(activeSession.startTime).toLocaleTimeString();

    if (activeSession.startGeo) {
        displayStartGeo.textContent = `${activeSession.startGeo.lat.toFixed(5)}, ${activeSession.startGeo.lng.toFixed(5)}`;
    } else {
        displayStartGeo.textContent = 'No registrada';
    }

    // Inicializar mini-mapa
    const miniMapEl = document.getElementById('mini-map');
    if (miniMapEl && typeof L !== 'undefined') {
        if (miniMap) {
            miniMap.remove();
            miniMap = null;
        }
        const center = activeSession.startGeo
            ? [activeSession.startGeo.lat, activeSession.startGeo.lng]
            : [-12.0464, -77.0428];
        miniMap = L.map('mini-map', { zoomControl: true }).setView(center, 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '\u00a9 OpenStreetMap contributors'
        }).addTo(miniMap);
        if (activeSession.startGeo) {
            L.marker(center).addTo(miniMap).bindPopup('Inicio de turno').openPopup();
        }
    }

    startTimer();
    startLocationTracking();
    listenToFirebaseIncidents();
}

function startLocationTracking() {
    if (!navigator.geolocation) return;
    
    locationWatchId = navigator.geolocation.watchPosition(
        (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            if (activeSession && activeSession.sessionId) {
                const _locRef = fbRef('sessions/' + activeSession.sessionId + '/currentLocation'); if (_locRef) _locRef.set({
                    lat: lat,
                    lng: lng,
                    timestamp: Date.now()
                });
            }
        },
        (err) => console.log('Error Watch Geo:', err),
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
}

function stopLocationTracking() {
    if (locationWatchId !== null) {
        navigator.geolocation.clearWatch(locationWatchId);
        locationWatchId = null;
    }
}

function listenToFirebaseIncidents() {
    if (!activeSession || !activeSession.sessionId) return;
    const incidentsRef = fbRef('sessions/' + activeSession.sessionId + '/incidents');
if (incidentsRef) incidentsRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const incidentsArray = Object.keys(data).map(key => ({
                id: key,
                ...data[key]
            })).sort((a, b) => a.timestamp - b.timestamp);
            activeSession.incidents = incidentsArray;
            localStorage.setItem('dp_active_session', JSON.stringify(activeSession));
            renderTimeline();
        }
    });
}

// Lógica del Cronómetro
function startTimer() {
    updateTimer();
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(updateTimer, 1000);
}

function updateTimer() {
    if (!activeSession) return;
    const now = new Date();
    const start = new Date(activeSession.startTime);
    const diff = now - start;

    const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
    const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
    const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');

    timerDisplay.textContent = `${h}:${m}:${s}`;
}

// Geolocation Helper
function getGeoLocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve(null);
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                resolve({
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude
                });
            },
            (err) => {
                console.log("Error Geo:", err);
                resolve(null);
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
    });
}

// Manejadores de Eventos
choiceAcpBtn.addEventListener('click', showAcpForm);
choicePlanBtn.addEventListener('click', showPlanForm);
backBtns.forEach(btn => btn.addEventListener('click', showSelectionScreen));

// Lógica de Desplegables Dinámicos (Sede Central)
const categorySelect = document.getElementById('category');
const locationInput = document.getElementById('location');
const locationDatalist = document.getElementById('location-list');

const locationOptions = {
    'Espacio de movilización': [
        "Congreso", "Fiscalía", "Parque Universitario", "Plaza San Martín", "Plaza Dos de Mayo",
        "Plaza Manco Cápac", "Alameda Paseo de los Héroes Navales", "�"valo Grau", "�"valo Bolognesi"
    ],
    'Dependencia policial / Seguridad del Estado': [
        "Comisaría Alfonso Ugarte", "Comisaría Cotabambas", "Comisaría de Mujeres",
        "Comisaría PNP San Andrés", "División de Asuntos Sociales", "Comisaría de Piedra Liza"
    ],
    'Establecimiento de salud': [
        "Hospital Nacional Arzobispo Loayza", "Emergencias Grau", "Hospital Nacional Guillermo Almenara",
        "Hospital Edgardo Rebagliati Martins", "Hospital Nacional Dos de Mayo",
        "Hospital PNP Augusto B. Leguía", "Hospital Nacional PNP Luis N Saenz"
    ],
    'Videovigilancia': [
        "Centro de Monitoreo", "Cámaras - Municipalidad", "Cámaras - PNP"
    ]
};

categorySelect.addEventListener('change', () => {
    const selectedCategory = categorySelect.value;
    const options = locationOptions[selectedCategory] || [];

    locationInput.value = ""; // Opcional: limpiar si cambia categoría
    locationDatalist.innerHTML = "";
    options.forEach(opt => {
        const optionNode = document.createElement('option');
        optionNode.value = opt;
        locationDatalist.appendChild(optionNode);
    });
});

// Helper para leer archivo y convertir a Base64 (con compresión simple para imágenes)
function readFileAndCompress(file) {
    return new Promise((resolve, reject) => {
        if (!file) {
            resolve({ base64: "", name: "", type: "" });
            return;
        }

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1000;
                const MAX_HEIGHT = 1000;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Compresión JPEG al 0.7
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                // dataUrl viene como "data:image/jpeg;base64,....."
                // Para Google Script solemos necesitar solo la parte base64 pura a veces, 
                // pero enviaremos todo y lo procesaremos allá, o mejor split aquí.
                resolve({
                    base64: dataUrl.split(',')[1],
                    name: file.name,
                    type: file.type
                });
            };
            img.onerror = (e) => reject(e);
        };
        reader.onerror = error => reject(error);
    });
}

// SUBMIT: Oficina Desconcentrada (OD)
acpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = acpForm.querySelector('button[type="submit"]');
    btn.textContent = "Procesando...";
    btn.disabled = true;

    try {
        const geo = await getGeoLocation();
        const now = new Date();
        const selectedDate = document.getElementById('acp-date').value;
        const startDateTime = new Date(`${selectedDate}T${now.toTimeString().split(' ')[0]}`);

        const mediaInput = document.getElementById('acp-media');
        let fileData = { base64: "", name: "", type: "" };

        if (mediaInput.files.length > 0) {
            // Si es imagen, intentamos comprimir. Si es video, cuidado con el tamaño.
            if (mediaInput.files[0].type.startsWith('image/')) {
                btn.textContent = "Comprimiendo imagen...";
                fileData = await readFileAndCompress(mediaInput.files[0]);
            } else {
                // Video: no comprimimos aquí (muy complejo), advertimos solo nombre o límite?
                // Por ahora solo nombre para videos para evitar crasheos de LocalStorage
                alert("Nota: Los videos no se subirán a Drive en esta versión (solo fotos). Solo se registrará el nombre.");
                fileData = { base64: "", name: mediaInput.files[0].name, type: mediaInput.files[0].type };
            }
        }

        activeSession = {
            type: 'OD',
            category: document.getElementById('acp-category').value,
            name: document.getElementById('acp-supervisor').value,
            office: document.getElementById('acp-office').value,
            date: selectedDate,
            location: document.getElementById('acp-location').value,
            mediaFile: fileData.name,     // Nombre para mostrar
            mediaData: fileData.base64,   // Contenido real
            mediaType: fileData.type,     // Mime type
            observations: document.getElementById('acp-observations').value,
            startTime: startDateTime.getTime(),
            startGeo: geo,
            shift: "",
            protestName: "",
            sessionId: generateSessionId(),
            incidents: []
        };

        saveAndShowActive(true);
    } catch (err) {
        console.error(err);
        alert("Error al iniciar: " + err.message);
    } finally {
        btn.textContent = "Registrar Inicio";
        btn.disabled = false;
    }
});

// SUBMIT: Sede Central
startForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = startForm.querySelector('button[type="submit"]');
    btn.textContent = "Procesando...";
    btn.disabled = true;

    try {
        const geo = await getGeoLocation();
        const now = new Date();
        const selectedDate = document.getElementById('date').value;
        const startDateTime = new Date(`${selectedDate}T${now.toTimeString().split(' ')[0]}`);

        const mediaInput = document.getElementById('media');
        let fileData = { base64: "", name: "", type: "" };

        if (mediaInput.files.length > 0) {
            if (mediaInput.files[0].type.startsWith('image/')) {
                btn.textContent = "Comprimiendo imagen...";
                fileData = await readFileAndCompress(mediaInput.files[0]);
            } else {
                alert("Nota: Los videos no se subirán a Drive en esta versión (solo fotos). Solo se registrará el nombre.");
                fileData = { base64: "", name: mediaInput.files[0].name, type: mediaInput.files[0].type };
            }
        }

        activeSession = {
            type: 'SEDE',
            shift: document.getElementById('shift').value,
            office: document.getElementById('office').value,
            name: document.getElementById('name').value,
            protestName: document.getElementById('protest-name').value,
            category: document.getElementById('category').value,
            location: document.getElementById('location').value,
            date: selectedDate,
            mediaFile: fileData.name,
            mediaData: fileData.base64,
            mediaType: fileData.type,
            observations: document.getElementById('observations').value,
            startTime: startDateTime.getTime(),
            startGeo: geo,
            sessionId: generateSessionId(),
            incidents: []
        };

        saveAndShowActive(true);
    } catch (err) {
        console.error(err);
        alert("Error al iniciar: " + err.message);
    } finally {
        btn.textContent = "Iniciar Supervisión";
        btn.disabled = false;
    }
});

// --- SINCRONIZACI�"N EN TIEMPO REAL (v3.0) ---

async function syncWithCloud(action, data, extraPayload = {}) {
    if (!GOOGLE_SHEETS_URL) return;

    try {
        console.log(`Sincronizando: ${action}...`);

        // Preparar payload base con campos comunes
        const payload = {
            action: action, // 'start', 'incident', 'finish'
            sessionId: data.sessionId,
            fecha: data.date,
            tipo_registro: data.type === 'OD' ? 'Oficina Desconcentrada' : 'Sede Central',
            turno: data.shift || "",
            oficina: data.office,
            supervisor: data.name,
            nombre_protesta: data.protestName || "",
            categoria: data.category,
            punto: data.location,
            inicio: new Date(data.startTime).toLocaleTimeString(),
            fin_de_semana: isWeekend(new Date(data.startTime)) ? 'Sí' : 'No',
            // En 'start', estos pueden ir medio vacíos, pero los mandamos igual
            observaciones: data.observations || "",
            // Incidencias se mandan completas siempre para mantener sync
            incidencias: data.incidents || [],

            // Campos específicos de actualización
            ...extraPayload
        };

        // En 'start', mandamos todo lo inicial
        if (action === 'start') {
            payload.archivo = data.mediaFile || "";
            payload.mediaData = data.mediaData || "";
            payload.mediaType = data.mediaType || "";
            payload.lat_inicio = data.startGeo ? data.startGeo.lat : "";
            payload.lng_inicio = data.startGeo ? data.startGeo.lng : "";
        }

        // En 'finish', mandamos cierre
        if (action === 'finish') {
            const durationH = (data.duration / 3600000).toFixed(2);
            payload.fin = new Date(data.endTime).toLocaleTimeString();
            payload.duracion = durationH;
            payload.lat_fin = data.endGeo ? data.endGeo.lat : "";
            payload.lng_fin = data.endGeo ? data.endGeo.lng : "";
        }

        await fetch(GOOGLE_SHEETS_URL, {
            method: 'POST',
            mode: 'no-cors',
            cache: 'no-cache',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        console.log(`Sincronización ${action} enviada.`);

    } catch (error) {
        console.error('Error enviando a Google Sheets:', error);
        // Podríamos guardar en cola para reintentar si no hay internet (Pendiente v3.1)
    }
}

// -------------------------------------------------------------------------
// MODIFICACIONES EN EL FLUJO DE LA APP PARA LLAMAR A SYNC
// -------------------------------------------------------------------------

// EN SUBMIT DE FORMULARIOS: Llamar a 'start'
// Modificar saveAndShowActive para aceptar flag de 'isNew'
async function saveAndShowActive(isNew = false) {
    localStorage.setItem('dp_active_session', JSON.stringify(activeSession));
    if (isNew) {
        // Guardar sesi\u00f3n en Firebase Realtime Database
        try {
            const _sessionRef = fbRef('sessions/' + activeSession.sessionId);
            if (_sessionRef) await _sessionRef.set({
                supervisor: activeSession.name,
                office: activeSession.office,
                type: activeSession.type,
                shift: activeSession.shift || '',
                protestName: activeSession.protestName || '',
                category: activeSession.category,
                location: activeSession.location,
                startTime: activeSession.startTime,
                startGeo: activeSession.startGeo || null,
                status: 'active'
            });
            console.log('Sesi\u00f3n guardada en Firebase.');
        } catch (e) {
            console.error('Error guardando sesi\u00f3n en Firebase:', e);
        }
        syncWithCloud('start', activeSession);
    }
    showActiveSession();
}

// FINALIZAR
finishBtn.addEventListener('click', async () => {
    if (!confirm("¿Estás seguro de que deseas finalizar la supervisión actual? Esta acción no se puede deshacer.")) {
        return;
    }

    finishBtn.textContent = "Finalizando...";
    finishBtn.disabled = true;

    const endTime = new Date().getTime();
    const geo = await getGeoLocation();

    const entry = {
        ...activeSession,
        endTime: endTime,
        endGeo: geo,
        duration: endTime - activeSession.startTime,
        isWeekend: isWeekend(new Date(activeSession.startTime))
    };

    history.unshift(entry);
    localStorage.setItem('dp_history', JSON.stringify(history));
    localStorage.removeItem('dp_active_session');

    // Actualizar Firebase: marcar como finalizada
    try {
        const _finRef = fbRef('sessions/' + entry.sessionId);
        if (_finRef) await _finRef.update({
            status: 'finished',
            endTime: endTime,
            endGeo: geo || null
        });
    } catch (e) { console.error('Error finalizando en Firebase:', e); }

    stopLocationTracking();

    // SYNC FINISH con Google Sheets
    await syncWithCloud('finish', entry);

    if (miniMap) { miniMap.remove(); miniMap = null; }
    activeSession = null;
    finishBtn.textContent = 'Finalizar Supervisi\u00f3n';
    finishBtn.disabled = false;

    showSelectionScreen();
    renderHistory();

    acpForm.reset();
    startForm.reset();
    document.querySelectorAll('input[type="date"]').forEach(input => input.valueAsDate = new Date());
});

function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
}

// Defensor Dashboard Link
// Admin y Dashboard
const defensorLink = document.getElementById('defensor-link');
if (defensorLink) {
    defensorLink.addEventListener('click', () => {
        const pass = prompt('Ingrese clave de administrador:');
        if (pass === ADMIN_PASSWORD) {
            window.location.href = 'defensor.html';
        } else {
            alert('Clave incorrecta');
        }
    });
}

function renderHistory() {
    if (history.length === 0) {
        historyList.innerHTML = '<p class="empty-msg">No hay registros previos.</p>';
        return;
    }

    historyList.innerHTML = history.map(item => {
        const dateStr = item.date;
        const startStr = new Date(item.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endStr = new Date(item.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const durationH = (item.duration / 3600000).toFixed(2);
        const typeLabel = item.type === 'OD' ? 'OD' : 'Sede';

        return `
            <div class="history-item">
                <div class="header">
                    <span class="badge-type">${typeLabel}</span>
                    <span>${item.location}</span>
                    <span>${dateStr}</span>
                </div>
                <div class="details">
                    <p><strong>${item.name}</strong> (${item.office})</p>
                    <p>${startStr} - ${endStr} 
                        <span class="duration-tag">${durationH}h</span>
                    </p>
                    ${item.protestName ? `<p>Protesta: ${item.protestName}</p>` : ''}
                    ${item.mediaFile ? `<p>�Y"Z ${item.mediaFile}</p>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

exportBtn.addEventListener('click', () => {
    if (history.length === 0) return alert('No hay datos para exportar');

    let csv = 'Fecha,Tipo,Turno,Oficina,Supervisor,Protesta,Categoría,Ubicación,Inicio,Fin,Lat_Ini,Lng_Ini,Lat_Fin,Lng_Fin,Duración,Archivo,Obs\n';
    history.forEach(item => {
        const start = new Date(item.startTime).toLocaleTimeString();
        const end = new Date(item.endTime).toLocaleTimeString();
        const duration = (item.duration / 3600000).toFixed(2);
        const lat1 = item.startGeo ? item.startGeo.lat : "";
        const lng1 = item.startGeo ? item.startGeo.lng : "";
        const lat2 = item.endGeo ? item.endGeo.lat : "";
        const lng2 = item.endGeo ? item.endGeo.lng : "";

        csv += `${item.date},${item.type},${item.shift || ""},"${item.office}","${item.name}","${item.protestName || ""}","${item.category}","${item.location}",${start},${end},${lat1},${lng1},${lat2},${lng2},${duration},"${item.mediaFile || ""}","${(item.observations || "").replace(/"/g, '""')}"\n`;
    });

    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `supervisiones_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

// --- L�"GICA DE INCIDENCIAS ---

function generateSessionId() {
    return 'SUP-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
}

// Elementos Modal Incidencia
const addIncidentBtn = document.getElementById('add-incident-btn');
const addUpdateBtn = document.getElementById('add-update-btn');
const incidentModal = document.getElementById('incident-modal');
const modalTitle = document.getElementById('modal-title');
const incidentClassGroup = document.getElementById('incident-class-group');
const incidentClass = document.getElementById('incident-class');
const incidentQtyGroup = document.getElementById('incident-qty-group');
const incidentQty = document.getElementById('incident-qty');

const cancelIncidentBtn = document.getElementById('cancel-incident-btn');
const saveIncidentBtn = document.getElementById('save-incident-btn');
const incidentTimeInput = document.getElementById('incident-time');
const incidentDescInput = document.getElementById('incident-desc');
const incidentPhotoInput = document.getElementById('incident-photo');
const incidentPhotoName = document.getElementById('incident-photo-name');
const timelineContainer = document.getElementById('incidents-timeline');

let currentModalMode = 'incidencia';

function openModal(mode) {
    currentModalMode = mode;
    incidentModal.classList.remove('hidden-modal');
    
    const now = new Date();
    const h = now.getHours().toString().padStart(2, '0');
    const m = now.getMinutes().toString().padStart(2, '0');
    incidentTimeInput.value = `${h}:${m}`;
    
    incidentDescInput.value = "";
    incidentPhotoInput.value = "";
    incidentPhotoName.textContent = "Sin archivo";
    incidentClass.value = "";
    incidentQty.value = "";
    
    if (mode === 'actualizacion') {
        modalTitle.textContent = "Enviar Actualización";
        incidentClassGroup.classList.add('hidden');
        incidentQtyGroup.classList.remove('hidden');
    } else {
        modalTitle.textContent = 'Nueva Incidencia';
        incidentClassGroup.classList.remove('hidden');
        incidentQtyGroup.classList.add('hidden');
    }
    if (typeof resetAudioUI === 'function') resetAudioUI();
}

addIncidentBtn.addEventListener('click', () => openModal('incidencia'));
if (addUpdateBtn) addUpdateBtn.addEventListener('click', () => openModal('actualizacion'));

if (incidentClass) {
    incidentClass.addEventListener('change', () => {
        const val = incidentClass.value;
        if (val === 'Heridos' || val === 'Fallecidos' || val === 'Privados de la libertad') {
            incidentQtyGroup.classList.remove('hidden');
        } else {
            incidentQtyGroup.classList.add('hidden');
            incidentQty.value = "";
        }
    });
}

// Cerrar Modal
cancelIncidentBtn.addEventListener('click', () => {
    incidentModal.classList.add('hidden-modal');
});

// Lógica manejada por setupDropzone

// Guardar Incidencia
saveIncidentBtn.addEventListener('click', async () => {
    const desc = incidentDescInput.value.trim();
    if (!desc) {
        alert("Por favor describe lo que está pasando.");
        return;
    }

    let classification = "Reporte de Situación";
    let qty = incidentQty.value;
    
    if (currentModalMode === 'incidencia') {
        classification = incidentClass.value;
        if (!classification) {
            alert("Selecciona la clasificación de la incidencia.");
            return;
        }
        if ((classification === 'Heridos' || classification === 'Fallecidos' || classification === 'Privados de la libertad') && !qty) {
            alert("Ingresa la cantidad de personas.");
            return;
        }
    }

    saveIncidentBtn.textContent = "Obteniendo GPS...";
    saveIncidentBtn.disabled = true;

    try {
        const geo = await getGeoLocation(); // Capturar ubicación actual
        const time = incidentTimeInput.value;
        const file = incidentPhotoInput.files[0];
        let fileData = { base64: "", name: "", type: "" };

        if (file) {
            saveIncidentBtn.textContent = "Procesando imagen...";
            fileData = await readFileAndCompress(file);
        }

        const newIncident = {
            timestamp: Date.now(),
            time: time,
            tipoRegistro: currentModalMode === 'actualizacion' ? 'Actualizaci\u00f3n' : 'Incidencia',
            clasificacion: classification,
            cantidad: qty || '',
            description: desc,
            author: activeSession.name,
            fileName: fileData.name || '',
            mediaType: fileData.type || '',
            lat: geo ? geo.lat : '',
            lng: geo ? geo.lng : ''
        };

        // Subir imagen a Firebase Storage (si hay)
        if (file) {
            saveIncidentBtn.textContent = 'Subiendo imagen...';
            const imgRef = _fbStorage ? _fbStorage.ref( `incidents/${activeSession.sessionId}/${newIncident.timestamp}_${file.name}`);
            await imgRef.put(file);
            newIncident.imageUrl = await imgRef.getDownloadURL();
        }

        // Subir audio a Firebase Storage (si hay)
        if (typeof audioBlob !== 'undefined' && audioBlob) {
            saveIncidentBtn.textContent = 'Subiendo audio...';
            const ext = audioBlob.type.includes('mp4') ? 'mp4' : 'webm';
            const audRef = _fbStorage ? _fbStorage.ref( `incidents/${activeSession.sessionId}/${newIncident.timestamp}_audio.${ext}`);
            await audRef.put(audioBlob);
            newIncident.audioUrl = await audRef.getDownloadURL();
        }

        // Guardar en Firebase Realtime Database
        saveIncidentBtn.textContent = 'Guardando...';
        const _incListRef = fbRef('sessions/' + activeSession.sessionId + '/incidents');
        if (_incListRef) await _incListRef.push(newIncident);
        console.log('Incidencia guardada en Firebase.');

        // Sincronizar con Google Sheets (en paralelo, no bloqueante)
        syncWithCloud('incident', activeSession, {
            new_incident: { ...newIncident, mediaData: fileData.base64 },
            all_incidents: activeSession.incidents
        });

        if (typeof resetAudioUI === 'function') resetAudioUI();
        incidentModal.classList.add('hidden-modal');

        // Alerta WhatsApp para incidencias cr\u00edticas
        if (currentModalMode === 'incidencia' && (
            classification === 'Heridos' ||
            classification === 'Fallecidos' ||
            classification === 'Privados de la libertad' ||
            classification === 'Enfrentamientos (PNP y ciudadan\u00eda / grupos ciudadanos contrarios)' ||
            classification === 'Uso desmedido de la fuerza'
        )) {
            openWaModal(activeSession, classification, qty, desc, time);
        }

    } catch (err) {
        console.error(err);
        alert('Error al guardar registro: ' + err.message);
    } finally {
        saveIncidentBtn.textContent = 'Guardar';
        saveIncidentBtn.disabled = false;
    }
});

function renderTimeline() {
    if (!activeSession || !activeSession.incidents || activeSession.incidents.length === 0) {
        timelineContainer.innerHTML = '<p style="text-align:center;color:#888;margin-top:20px;">Sin registros aun. Envia tu primera actualizacion.</p>';
        return;
    }

    timelineContainer.innerHTML = activeSession.incidents.map(inc => {
        const isUpdate = inc.tipoRegistro === 'Actualizacion';
        const clLabel = inc.clasificacion && inc.clasificacion !== 'Reporte de Situacion'
            ? `<strong>${inc.clasificacion}</strong>${inc.cantidad ? ` (Cant: ${inc.cantidad})` : ''} &mdash; `
            : '';
        return `
            <div class="chat-bubble chat-mine">
                <div class="chat-author">${inc.author || activeSession.name}</div>
                <div class="timeline-desc">${clLabel}${inc.description}</div>
                ${inc.imageUrl ? `<img src="${inc.imageUrl}" class="chat-img" onclick="openFullscreenImage('${inc.imageUrl}')" alt="Foto">` : ''}
                ${inc.audioUrl ? `<audio controls class="chat-audio" src="${inc.audioUrl}"></audio>` : ''}
                <div class="chat-time">${inc.time} ${isUpdate ? 'Upd' : 'Inc'}</div>
            </div>`;
    }).join('');

    timelineContainer.scrollTop = timelineContainer.scrollHeight;
}

// --- Audio Recording ---
const recordAudioBtn  = document.getElementById('record-audio-btn');
const stopAudioBtn    = document.getElementById('stop-audio-btn');
const audioTimerEl    = document.getElementById('audio-timer');
const audioPreviewEl  = document.getElementById('audio-preview');
const discardAudioBtn = document.getElementById('discard-audio-btn');

function resetAudioUI() {
    audioBlob    = null;
    audioChunks  = [];
    audioSeconds = 0;
    if (audioTimerInterval) clearInterval(audioTimerInterval);
    if (audioTimerEl)   { audioTimerEl.textContent = '00:00'; audioTimerEl.classList.add('hidden'); }
    if (audioPreviewEl) { audioPreviewEl.classList.add('hidden'); audioPreviewEl.src = ''; }
    if (discardAudioBtn) discardAudioBtn.classList.add('hidden');
    if (recordAudioBtn)  recordAudioBtn.classList.remove('hidden');
    if (stopAudioBtn)    stopAudioBtn.classList.add('hidden');
}

if (recordAudioBtn) {
    recordAudioBtn.addEventListener('click', async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
            mediaRecorder.onstop = () => {
                audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                audioPreviewEl.src = URL.createObjectURL(audioBlob);
                audioPreviewEl.classList.remove('hidden');
                discardAudioBtn.classList.remove('hidden');
            };
            audioChunks = [];
            mediaRecorder.start();
            recordAudioBtn.classList.add('hidden');
            stopAudioBtn.classList.remove('hidden');
            audioTimerEl.classList.remove('hidden');
            audioSeconds = 0;
            audioTimerInterval = setInterval(() => {
                audioSeconds++;
                const m = Math.floor(audioSeconds / 60).toString().padStart(2, '0');
                const s = (audioSeconds % 60).toString().padStart(2, '0');
                audioTimerEl.textContent = `${m}:${s}`;
            }, 1000);
        } catch (err) {
            console.error(err);
            alert('No se pudo acceder al microfono. Verifica los permisos del navegador.');
        }
    });
}

if (stopAudioBtn) {
    stopAudioBtn.addEventListener('click', () => {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            mediaRecorder.stream.getTracks().forEach(t => t.stop());
        }
        clearInterval(audioTimerInterval);
        stopAudioBtn.classList.add('hidden');
        audioTimerEl.classList.add('hidden');
    });
}

if (discardAudioBtn) discardAudioBtn.addEventListener('click', resetAudioUI);

// --- Image Fullscreen Modal ---
const imageModalEl = document.getElementById('image-modal');
const fullImageEl  = document.getElementById('full-image');
const closeImgBtn  = document.getElementById('close-image-modal');

window.openFullscreenImage = function(url) {
    if (!imageModalEl) return;
    fullImageEl.src = url;
    imageModalEl.classList.remove('hidden-modal');
    imageModalEl.style.display = 'flex';
};

if (closeImgBtn) {
    closeImgBtn.addEventListener('click', () => {
        imageModalEl.classList.add('hidden-modal');
        imageModalEl.style.display = 'none';
    });
}


// --- VALIDACI�"N ESTRICTA DE LISTAS ---
function enforceStrictDatalist(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    input.addEventListener('change', function () {
        const val = this.value;
        const listId = this.getAttribute('list');
        const list = document.getElementById(listId);

        if (list && val) {
            let match = false;
            // Verificar si el valor existe en las opciones
            for (let opt of list.options) {
                if (opt.value === val) {
                    match = true;
                    break;
                }
            }

            if (!match) {
                alert("�s�️ Por favor selecciona una opción válida de la lista.\nSi no aparece, solicítalo al administrador.");
                this.value = ""; // Limpiar campo
            }
        }
    });

    // UX: Limpiar si el usuario borra todo
    input.addEventListener('input', function () {
        if (this.value === "") {
            this.setCustomValidity("");
        }
    });
}


// Aplicar reglas estrictas al iniciar
enforceStrictDatalist('location');
enforceStrictDatalist('protest-name');
enforceStrictDatalist('acp-office');


// --- L�"GICA DE DRAG & DROP ---
function setupDropzone(dropzoneId, inputId, contentId, previewId, nameId = null) {
    const dropzone = document.getElementById(dropzoneId);
    const input = document.getElementById(inputId);
    const content = document.getElementById(contentId);
    const preview = document.getElementById(previewId);
    const nameDisplay = nameId ? document.getElementById(nameId) : null;
    
    if (!dropzone || !input) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.remove('dragover'), false);
    });

    dropzone.addEventListener('drop', (e) => {
        let dt = e.dataTransfer;
        let files = dt.files;
        if (files.length > 0) {
            input.files = files;
            handleFiles(files[0]);
        }
    });

    input.addEventListener('change', function() {
        if (this.files.length > 0) {
            handleFiles(this.files[0]);
        } else {
            resetPreview();
        }
    });

    function handleFiles(file) {
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (e) => {
                preview.src = e.target.result;
                preview.style.display = 'block';
                content.style.display = 'none';
                if(nameDisplay) nameDisplay.textContent = "�Y"" " + file.name;
            };
        } else {
            preview.style.display = 'none';
            content.style.display = 'flex';
            content.querySelector('.dropzone-icon').textContent = '�Y""';
            content.querySelector('.dropzone-text').textContent = file.name;
            if(nameDisplay) nameDisplay.textContent = "�Y"" " + file.name;
        }
    }
    
    function resetPreview() {
        preview.src = '';
        preview.style.display = 'none';
        content.style.display = 'flex';
        content.querySelector('.dropzone-icon').textContent = '�Y"�';
        content.querySelector('.dropzone-text').textContent = dropzoneId === 'dropzone-incident' ? 'Adjuntar foto' : 'Arrastra tu archivo aquí o haz clic para seleccionar';
        if(nameDisplay) nameDisplay.textContent = "Sin archivo";
    }

    dropzone.resetPreview = resetPreview;
}

// Inicializar dropzones
setupDropzone('dropzone-acp', 'acp-media', 'dropzone-content-acp', 'preview-acp');
setupDropzone('dropzone-start', 'media', 'dropzone-content-start', 'preview-start');
setupDropzone('dropzone-incident', 'incident-photo', 'dropzone-content-incident', 'preview-incident', 'incident-photo-name');

init();

// --- Lógica WhatsApp Modal ---
const waModal = document.getElementById('wa-modal');
const waContactSelect = document.getElementById('wa-contact-select');
const waCancelBtn = document.getElementById('wa-cancel-btn');
const waSendBtn = document.getElementById('wa-send-btn');
let currentWaMsg = null;

function openWaModal(session, classification, qty, desc, time) {
    if (!waContacts || waContacts.length === 0) {
        // Fallback genérico si no hay contactos
        const waMsg = `*�Ys� ALERTA: ${classification.toUpperCase()}*\n�Ys� *Protesta:* ${session.protestName || 'No especificada'}\n�Y"� *Punto:* ${session.location}\n⏰ *Hora:* ${time}\n�Y'� *Cantidad:* ${qty}\n�Y"� *Detalle:* ${desc}`;
        if (confirm(`Incidencia crítica registrada.\n¿Deseas enviar este reporte urgente por WhatsApp?`)) {
            window.open(`https://wa.me/?text=${encodeURIComponent(waMsg)}`, '_blank');
        }
        return;
    }

    waContactSelect.innerHTML = '<option value="" disabled selected>Selecciona un contacto...</option>';
    waContacts.forEach((c, index) => {
        const opt = document.createElement('option');
        opt.value = index;
        opt.textContent = `${c.nombre} (${c.cargo})`;
        waContactSelect.appendChild(opt);
    });

    currentWaMsg = { session, classification, qty, desc, time };
    if (waModal) waModal.classList.remove('hidden-modal');
}

if (waCancelBtn) {
    waCancelBtn.addEventListener('click', () => {
        waModal.classList.add('hidden-modal');
    });
}

if (waSendBtn) {
    waSendBtn.addEventListener('click', () => {
        const selectedIdx = waContactSelect.value;
        if (selectedIdx === "") {
            alert("Selecciona un contacto.");
            return;
        }
        
        const contact = waContacts[selectedIdx];
        const { session, classification, qty, desc, time } = currentWaMsg;
        
        const qtyText = qty ? `\n�Y'� *Cantidad:* ${qty}` : '';
        
        const waMsg = `Estimado(a) *${contact.nombre}*, ${contact.cargo} de la ${contact.oficina}.\nSe envía el siguiente reporte urgente sobre la protesta *${session.protestName || 'No especificada'}*:\n\n*�Ys� ALERTA: ${classification.toUpperCase()}*\n�Y"� *Punto:* ${session.location}\n⏰ *Hora:* ${time}${qtyText}\n�Y"� *Detalle:* ${desc}`;
        
        // Limpiar numero
        let phone = contact.numero.toString().replace(/\D/g,'');
        
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(waMsg)}`, '_blank');
        waModal.classList.add('hidden-modal');
    });
}



