// ============================================
// CONTROL DE ASISTENCIA PRO - v2.0
// Con: Firebase, Reconocimiento Facial, QR, WhatsApp API
// ============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, push, onValue, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ============================================
// VARIABLES GLOBALES
// ============================================
let selectedType = null;
let currentStream = null;
let faceStream = null;
let capturedPhoto = null;
let currentGPS = null;
let currentPDF = null;
let qrScanner = null;
let qrValidated = false;
let qrPuestoData = null;
let faceDescriptors = [];
let faceSamples = [];
let isFaceModelLoaded = false;
let firebaseApp = null;
let firebaseDB = null;
let records = [];
let currentRecord = null;
let faceDetectionInterval = null;
let faceRegStream = null;

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';

// ============================================
// INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    showSplash();
    updateSplash('Cargando modelos de IA...', 20);

    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
        isFaceModelLoaded = true;
        updateSplash('Modelos IA cargados ✓', 40);
    } catch (e) {
        console.warn('Face-api no cargó:', e);
        updateSplash('Modelos offline (modo básico)', 40);
    }

    updateSplash('Cargando datos locales...', 60);
    loadRecords();
    loadConfig();
    loadFaceProfile();

    updateSplash('Conectando servicios...', 80);
    initFirebase();
    checkOnlineStatus();
    getGPSLocation();

    updateSplash('Listo', 100);
    setTimeout(() => {
        document.getElementById('splashScreen').classList.add('hidden');
        document.getElementById('mainApp').style.display = 'block';
    }, 600);

    setInterval(syncPendingRecords, 30000);
    setInterval(checkOnlineStatus, 10000);
});

function showSplash() {
    document.getElementById('splashScreen').style.display = 'flex';
}

function updateSplash(text, percent) {
    document.getElementById('splashStatus').textContent = text;
    document.getElementById('splashLoaderBar').style.width = percent + '%';
}

// ============================================
// FIREBASE
// ============================================
function initFirebase() {
    const projectId = localStorage.getItem('firebaseProject');
    const apiKey = localStorage.getItem('firebaseApiKey');

    if (!projectId || !apiKey) return;

    try {
        const config = {
            apiKey: apiKey,
            authDomain: `${projectId}.firebaseapp.com`,
            databaseURL: `https://${projectId}-default-rtdb.firebaseio.com`,
            projectId: projectId,
            storageBucket: `${projectId}.appspot.com`,
            messagingSenderId: "000000000000",
            appId: "1:000000000000:web:0000000000000000000000"
        };
        firebaseApp = initializeApp(config);
        firebaseDB = getDatabase(firebaseApp);
        showToast('Firebase conectado ✓', 'success');
        syncPendingRecords();
    } catch (e) {
        console.error('Firebase error:', e);
    }
}

function testFirebaseConnection() {
    const projectId = document.getElementById('firebaseProject').value;
    const apiKey = document.getElementById('firebaseApiKey').value;

    if (!projectId || !apiKey) {
        showToast('Complete los campos de Firebase', 'error');
        return;
    }

    localStorage.setItem('firebaseProject', projectId);
    localStorage.setItem('firebaseApiKey', apiKey);
    location.reload();
}

async function saveToFirebase(record) {
    if (!firebaseDB) return false;
    try {
        const recordsRef = ref(firebaseDB, 'registros/' + record.id);
        await set(recordsRef, {
            ...record,
            syncedAt: new Date().toISOString(),
            serverTimestamp: Date.now()
        });
        return true;
    } catch (e) {
        console.error('Firebase save error:', e);
        return false;
    }
}

async function syncPendingRecords() {
    if (!firebaseDB || !navigator.onLine) return;
    const pending = records.filter(r => !r.synced);
    for (const record of pending) {
        const success = await saveToFirebase(record);
        if (success) record.synced = true;
    }
    localStorage.setItem('attendanceRecords', JSON.stringify(records));
    loadRecords();
    updateDashboard();
}

// ============================================
// TABS
// ============================================
function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');

    document.getElementById('panelRegistro').classList.add('hidden');
    document.getElementById('panelFacial').classList.add('hidden');
    document.getElementById('panelConfig').classList.add('hidden');
    document.getElementById('panelDashboard').classList.add('hidden');

    document.getElementById('panel' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.remove('hidden');

    if (tab === 'dashboard') updateDashboard();
}

// ============================================
// TIPO DE REGISTRO
// ============================================
function selectType(type) {
    selectedType = type;
    document.querySelectorAll('.type-btn').forEach(btn => btn.classList.remove('selected'));
    document.getElementById(type === 'ENTRADA' ? 'btnEntrada' : 'btnSalida').classList.add('selected');
}

// ============================================
// GPS
// ============================================
function getGPSLocation() {
    const gpsCard = document.getElementById('gpsCard');
    const gpsDetail = document.getElementById('gpsDetail');

    if (!navigator.geolocation) {
        gpsCard.style.display = 'block';
        gpsCard.classList.add('error');
        gpsDetail.innerHTML = 'GPS no disponible';
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            currentGPS = {
                lat: pos.coords.latitude.toFixed(6),
                lng: pos.coords.longitude.toFixed(6),
                accuracy: pos.coords.accuracy,
                altitude: pos.coords.altitude,
                timestamp: pos.timestamp
            };
            gpsCard.style.display = 'block';
            gpsCard.classList.remove('error');
            gpsDetail.innerHTML = `
                <strong>Lat:</strong> ${currentGPS.lat}<br>
                <strong>Lng:</strong> ${currentGPS.lng}<br>
                <strong>Precisión:</strong> ${Math.round(currentGPS.accuracy)}m
            `;
        },
        (err) => {
            gpsCard.style.display = 'block';
            gpsCard.classList.add('error');
            gpsDetail.textContent = 'GPS: ' + err.message;
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}

// ============================================
// QR SCANNER
// ============================================
function startQRScanner() {
    const container = document.getElementById('qrScannerContainer');
    const btnScan = document.getElementById('btnScanQR');
    const btnStop = document.getElementById('btnStopQR');

    container.style.display = 'block';
    btnScan.classList.add('hidden');
    btnStop.classList.remove('hidden');

    qrScanner = new Html5Qrcode('qrVideo');

    qrScanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 200, height: 200 } },
        (decodedText) => {
            handleQRResult(decodedText);
            stopQRScanner();
        },
        (error) => {}
    ).catch(err => {
        showToast('Error QR: ' + err.message, 'error');
        stopQRScanner();
    });
}

function stopQRScanner() {
    if (qrScanner) {
        qrScanner.stop().catch(() => {});
        qrScanner = null;
    }
    document.getElementById('qrScannerContainer').style.display = 'none';
    document.getElementById('btnScanQR').classList.remove('hidden');
    document.getElementById('btnStopQR').classList.add('hidden');
}

function handleQRResult(text) {
    try {
        const data = JSON.parse(text);
        if (data.type === 'puesto' && data.nombre) {
            qrValidated = true;
            qrPuestoData = data;
            document.getElementById('qrValidated').classList.add('show');
            document.getElementById('qrPuestoName').textContent = data.nombre;
            document.getElementById('puestoName').value = data.nombre;
            showToast('✓ Puesto validado: ' + data.nombre, 'success');
        } else {
            showToast('QR no válido para puesto', 'error');
        }
    } catch (e) {
        // Si no es JSON, tratar como string
        qrValidated = true;
        qrPuestoData = { nombre: text };
        document.getElementById('qrValidated').classList.add('show');
        document.getElementById('qrPuestoName').textContent = text;
        document.getElementById('puestoName').value = text;
        showToast('✓ Puesto validado: ' + text, 'success');
    }
}

// ============================================
// CÁMARA CON RECONOCIMIENTO FACIAL EN TIEMPO REAL
// ============================================
async function startCamera() {
    const video = document.getElementById('video');
    const container = document.getElementById('cameraContainer');
    const btnCamera = document.getElementById('btnCamera');
    const btnCapture = document.getElementById('btnCapture');

    try {
        currentStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        video.srcObject = currentStream;
        container.style.display = 'block';
        btnCamera.classList.add('hidden');
        btnCapture.classList.remove('hidden');

        // Iniciar detección facial en tiempo real
        if (isFaceModelLoaded) {
            startFaceDetection(video);
        }
    } catch (err) {
        showToast('Error cámara: ' + err.message, 'error');
    }
}

async function startFaceDetection(video) {
    const faceStatus = document.getElementById('faceStatus');
    const faceGuide = document.getElementById('faceGuide');

    const detect = async () => {
        if (!currentStream || video.paused || video.ended) return;

        try {
            const detections = await faceapi.detectAllFaces(
                video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
            ).withFaceLandmarks().withFaceDescriptors();

            if (detections.length > 0) {
                faceStatus.textContent = '✓ Rostro detectado';
                faceStatus.classList.remove('not-detected');
                faceStatus.classList.add('detected');
                faceGuide.style.borderColor = 'var(--success)';

                // Verificar coincidencia con perfil
                if (faceDescriptors.length > 0) {
                    const bestMatch = findBestMatch(detections[0].descriptor);
                    if (bestMatch && bestMatch.distance < 0.6) {
                        faceStatus.textContent = `✓ ${bestMatch.label} (${((1-bestMatch.distance)*100).toFixed(0)}%)`;
                    }
                }
            } else {
                faceStatus.textContent = 'Buscando rostro...';
                faceStatus.classList.add('not-detected');
                faceStatus.classList.remove('detected');
                faceGuide.style.borderColor = 'rgba(255,255,255,0.3)';
            }
        } catch (e) {}

        requestAnimationFrame(detect);
    };
    detect();
}

function findBestMatch(descriptor) {
    if (!faceDescriptors || faceDescriptors.length === 0) return null;

    let bestMatch = null;
    let bestDistance = Infinity;

    faceDescriptors.forEach(fd => {
        const distance = faceapi.euclideanDistance(descriptor, new Float32Array(fd.descriptor));
        if (distance < bestDistance) {
            bestDistance = distance;
            bestMatch = { label: fd.name, distance };
        }
    });

    return bestMatch;
}

function capturePhoto() {
    const video = document.getElementById('video');
    const canvas = document.createElement('canvas');
    const preview = document.getElementById('photoPreview');
    const btnCapture = document.getElementById('btnCapture');
    const btnRetake = document.getElementById('btnRetake');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);

    capturedPhoto = canvas.toDataURL('image/jpeg', 0.92);
    preview.src = capturedPhoto;
    preview.style.display = 'block';
    document.getElementById('cameraContainer').style.display = 'none';

    if (currentStream) {
        currentStream.getTracks().forEach(t => t.stop());
        currentStream = null;
    }

    btnCapture.classList.add('hidden');
    btnRetake.classList.remove('hidden');
    document.getElementById('actionCard').classList.remove('hidden');

    // Verificar rostro en foto capturada
    verifyCapturedFace(canvas);
}

async function verifyCapturedFace(canvas) {
    if (!isFaceModelLoaded || faceDescriptors.length === 0) return;

    try {
        const detection = await faceapi.detectSingleFace(
            canvas, new faceapi.TinyFaceDetectorOptions()
        ).withFaceLandmarks().withFaceDescriptor();

        const resultDiv = document.getElementById('faceMatchResult');

        if (!detection) {
            resultDiv.innerHTML = '<span style="color:var(--warning)">⚠️ No se detectó rostro en la foto</span>';
            resultDiv.style.display = 'block';
            return;
        }

        const match = findBestMatch(detection.descriptor);
        if (match && match.distance < 0.6) {
            resultDiv.innerHTML = `<span style="color:var(--success)">✓ Identidad verificada: ${match.label} (${((1-match.distance)*100).toFixed(1)}%)</span>`;
            document.getElementById('agentName').value = match.label;
        } else {
            resultDiv.innerHTML = '<span style="color:var(--warning)">⚠️ Rostro no coincide con perfil registrado</span>';
        }
        resultDiv.style.display = 'block';
    } catch (e) {}
}

function retakePhoto() {
    document.getElementById('photoPreview').style.display = 'none';
    document.getElementById('btnRetake').classList.add('hidden');
    document.getElementById('actionCard').classList.add('hidden');
    document.getElementById('faceMatchResult').style.display = 'none';
    capturedPhoto = null;
    startCamera();
}

// ============================================
// REGISTRO FACIAL
// ============================================
async function startFaceRegistration() {
    const video = document.getElementById('faceVideo');
    const container = document.getElementById('faceCameraContainer');
    const btnStart = document.getElementById('btnStartFaceReg');
    const btnCapture = document.getElementById('btnCaptureFace');

    faceSamples = [];
    updateFaceGallery();

    try {
        faceRegStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
        });
        video.srcObject = faceRegStream;
        container.style.display = 'block';
        btnStart.classList.add('hidden');
        btnCapture.classList.remove('hidden');

        // Detección en tiempo real para registro
        const detectReg = async () => {
            if (!faceRegStream || video.paused) return;
            try {
                const detections = await faceapi.detectAllFaces(
                    video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224 })
                ).withFaceLandmarks().withFaceDescriptors();

                const status = document.getElementById('faceRegStatus');
                if (detections.length === 1) {
                    status.textContent = '✓ Rostro centrado - Listo para capturar';
                    status.classList.remove('not-detected');
                    status.classList.add('detected');
                } else if (detections.length > 1) {
                    status.textContent = '⚠️ Múltiples rostros detectados';
                    status.classList.add('not-detected');
                } else {
                    status.textContent = 'Centra tu rostro en el óvalo';
                    status.classList.add('not-detected');
                }
            } catch (e) {}
            requestAnimationFrame(detectReg);
        };
        detectReg();
    } catch (err) {
        showToast('Error cámara: ' + err.message, 'error');
    }
}

async function captureFaceSample() {
    const video = document.getElementById('faceVideo');

    try {
        const detection = await faceapi.detectSingleFace(
            video, new faceapi.TinyFaceDetectorOptions()
        ).withFaceLandmarks().withFaceDescriptor();

        if (!detection) {
            showToast('No se detectó rostro. Centre su cara.', 'error');
            return;
        }

        // Capturar frame
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0);

        faceSamples.push({
            image: canvas.toDataURL('image/jpeg', 0.8),
            descriptor: Array.from(detection.descriptor)
        });

        updateFaceGallery();
        document.getElementById('faceCount').textContent = `(${faceSamples.length}/3)`;
        showToast(`Muestra ${faceSamples.length}/3 capturada ✓`, 'success');

        if (faceSamples.length >= 3) {
            document.getElementById('btnCaptureFace').classList.add('hidden');
            document.getElementById('btnSaveFace').classList.remove('hidden');
        }
    } catch (e) {
        showToast('Error: ' + e.message, 'error');
    }
}

function updateFaceGallery() {
    const gallery = document.getElementById('faceGallery');
    gallery.innerHTML = faceSamples.map((s, i) => `
        <div class="face-sample ${i === faceSamples.length - 1 ? 'active' : ''}">
            <img src="${s.image}" alt="Muestra ${i+1}">
            <div class="remove-btn" onclick="removeFaceSample(${i})">✕</div>
        </div>
    `).join('');
}

function removeFaceSample(index) {
    faceSamples.splice(index, 1);
    updateFaceGallery();
    document.getElementById('faceCount').textContent = `(${faceSamples.length}/3)`;
    document.getElementById('btnCaptureFace').classList.remove('hidden');
    document.getElementById('btnSaveFace').classList.add('hidden');
}

function saveFaceProfile() {
    const name = document.getElementById('agentName').value;
    if (!name) {
        showToast('Ingrese nombre del agente primero', 'error');
        return;
    }
    if (faceSamples.length < 3) {
        showToast('Se requieren 3 muestras mínimo', 'error');
        return;
    }

    // Promediar descriptores
    const avgDescriptor = new Float32Array(128);
    faceSamples.forEach(s => {
        s.descriptor.forEach((v, i) => avgDescriptor[i] += v);
    });
    for (let i = 0; i < 128; i++) avgDescriptor[i] /= faceSamples.length;

    const profile = {
        name: name,
        descriptor: Array.from(avgDescriptor),
        samples: faceSamples.map(s => s.image),
        createdAt: new Date().toISOString()
    };

    // Guardar
    const allProfiles = JSON.parse(localStorage.getItem('faceProfiles') || '[]');
    const existingIdx = allProfiles.findIndex(p => p.name === name);
    if (existingIdx >= 0) allProfiles[existingIdx] = profile;
    else allProfiles.push(profile);

    localStorage.setItem('faceProfiles', JSON.stringify(allProfiles));
    loadFaceProfile();

    // Limpiar
    if (faceRegStream) {
        faceRegStream.getTracks().forEach(t => t.stop());
        faceRegStream = null;
    }
    document.getElementById('faceCameraContainer').style.display = 'none';
    document.getElementById('btnStartFaceReg').classList.remove('hidden');
    document.getElementById('btnSaveFace').classList.add('hidden');
    faceSamples = [];
    updateFaceGallery();

    showToast('Perfil facial guardado ✓', 'success');
}

function loadFaceProfile() {
    const profiles = JSON.parse(localStorage.getItem('faceProfiles') || '[]');
    faceDescriptors = profiles.map(p => ({
        name: p.name,
        descriptor: p.descriptor
    }));

    const statusEl = document.getElementById('faceProfileStatus');
    if (profiles.length > 0) {
        statusEl.innerHTML = profiles.map(p => 
            `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                <span>👤 ${p.name}</span>
                <span style="color:var(--success);font-size:0.75rem;">✓ Registrado</span>
            </div>`
        ).join('');
    } else {
        statusEl.innerHTML = '<span style="color:var(--warning)">⚠️ No hay perfil facial registrado</span>';
    }
}

// ============================================
// GENERACION DE PDF CON MARCA DE AGUA
// ============================================
async function generatePDF(record) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("p", "mm", "a4");

    const agentName = record.agent;
    const puestoName = record.puesto;
    const tipo = record.type;
    const fecha = record.fecha;
    const hora = record.hora;

    const mainColor = tipo === "ENTRADA" ? [0, 200, 83] : [255, 23, 68];

    doc.setFillColor(13, 27, 42);
    doc.rect(0, 0, 210, 297, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    for (let i = 0; i < 5; i++) {
        doc.setFontSize(40 + i * 5);
        doc.setTextColor(255, 255, 255, 0.03);
        doc.text("CONFIDENCIAL", 105, 60 + i * 50, { align: "center", angle: 45 });
    }
    doc.text("REGISTRO OFICIAL", 105, 100, { align: "center", angle: 45 });
    doc.text("NO MODIFICAR", 105, 140, { align: "center", angle: 45 });

    doc.setFillColor(mainColor[0], mainColor[1], mainColor[2]);
    doc.roundedRect(10, 8, 190, 32, 4, 4, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("CONTROL DE ASISTENCIA", 105, 22, { align: "center" });
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Sistema de Seguridad Patrimonial - Documento Oficial", 105, 32, { align: "center" });

    doc.setFillColor(mainColor[0], mainColor[1], mainColor[2]);
    doc.roundedRect(75, 44, 60, 14, 3, 3, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(tipo, 105, 53, { align: "center" });

    if (record.photo) {
        doc.addImage(record.photo, "JPEG", 55, 62, 100, 100);
        doc.setDrawColor(mainColor[0], mainColor[1], mainColor[2]);
        doc.setLineWidth(2);
        doc.roundedRect(55, 62, 100, 100, 5, 5, "S");
    }

    let y = 170;
    const lineHeight = 9;
    doc.setFontSize(10);

    const fields = [
        ["AGENTE:", agentName.toUpperCase()],
        ["DNI/ID:", record.dni || "N/A"],
        ["PUESTO:", puestoName.toUpperCase()],
        ["FECHA:", fecha],
        ["HORA:", hora],
        ["COORDENADAS GPS:", record.gps ? record.gps.lat + ", " + record.gps.lng : "No disponible"],
        ["PRECISION GPS:", record.gps ? Math.round(record.gps.accuracy) + " metros" : "N/A"],
        ["VALIDACION QR:", record.qrValidated ? "Puesto validado" : "No validado"],
        ["RECONOCIMIENTO FACIAL:", record.faceVerified ? "Identidad verificada" : "No verificado"],
        ["DISPOSITIVO:", navigator.userAgent.substring(0, 60) + "..."],
        ["ID REGISTRO:", record.id],
        ["HASH DE INTEGRIDAD:", record.hash]
    ];

    fields.forEach(([label, value]) => {
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.text(label, 20, y);
        doc.setFont("helvetica", "normal");
        let displayValue = String(value);
        if (displayValue.length > 55) displayValue = displayValue.substring(0, 55) + "...";
        doc.text(displayValue, 75, y);
        y += lineHeight;
    });

    doc.setFillColor(255, 255, 255);
    doc.roundedRect(155, 235, 40, 40, 2, 2, "F");
    doc.setFillColor(0, 0, 0);
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            if (Math.random() > 0.5) doc.rect(158 + i * 4.5, 238 + j * 4.5, 4, 4, "F");
        }
    }
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(6);
    doc.text("ESCANEAR", 175, 278, { align: "center" });

    doc.setFillColor(0, 0, 0);
    doc.rect(10, 282, 190, 12, "F");
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text("Documento generado electronicamente | Hash: " + record.hash.substring(0, 30) + "...", 105, 288, { align: "center" });
    doc.text("Este documento tiene caracter de prueba legal. Alteracion constituye delito.", 105, 292, { align: "center" });

    return doc;
}

async function generateAndSend() {
    const agentName = document.getElementById("agentName").value.trim();
    const agentDNI = document.getElementById("agentDNI").value.trim();
    const puestoName = document.getElementById("puestoName").value.trim();

    if (!agentName) { showToast("Ingrese nombre del agente", "error"); return; }
    if (!puestoName) { showToast("Ingrese puesto de servicio", "error"); return; }
    if (!selectedType) { showToast("Seleccione ENTRADA o SALIDA", "error"); return; }
    if (!capturedPhoto) { showToast("Debe tomar una foto", "error"); return; }

    showLoading("Generando registro seguro...", "Creando PDF con marca de agua y hash");

    const now = new Date();
    const recordId = "REG-" + now.getTime() + "-" + Math.random().toString(36).substring(2, 8).toUpperCase();

    const hashInput = agentName + puestoName + selectedType + now.toISOString() + (currentGPS ? currentGPS.lat : "");
    const hash = CryptoJS.SHA256(hashInput).toString().toUpperCase();

    currentRecord = {
        id: recordId, agent: agentName, dni: agentDNI, puesto: puestoName,
        type: selectedType, fecha: now.toLocaleDateString("es-PE"),
        hora: now.toLocaleTimeString("es-PE"), timestamp: now.toISOString(),
        gps: currentGPS, photo: capturedPhoto, qrValidated: qrValidated,
        qrData: qrPuestoData, faceVerified: false, hash: hash,
        synced: false, device: navigator.userAgent
    };

    try {
        currentPDF = await generatePDF(currentRecord);
        records.unshift(currentRecord);
        localStorage.setItem("attendanceRecords", JSON.stringify(records));

        if (firebaseDB && navigator.onLine) {
            const synced = await saveToFirebase(currentRecord);
            currentRecord.synced = synced;
        }

        hideLoading();
        document.getElementById("successMessage").innerHTML = `
            <strong>${agentName}</strong><br>
            <span style="color:${selectedType === "ENTRADA" ? "var(--success)" : "var(--danger)"}">${selectedType}</span> registrada<br>
            ${currentRecord.fecha} - ${currentRecord.hora}<br>
            ${currentGPS ? "Lat: " + currentGPS.lat + ", Lng: " + currentGPS.lng : ""}<br>
            <small style="opacity:0.6">Hash: ${hash.substring(0, 16)}...</small>
        `;
        document.getElementById("successModal").classList.add("active");
        loadRecords();
        updateDashboard();
    } catch (error) {
        hideLoading();
        showToast("Error: " + error.message, "error");
    }
}

function shareWhatsApp() {
    const phone = document.getElementById("whatsappNumber").value.replace(/\D/g, "");
    if (!phone) { showToast("Configure numero de WhatsApp", "error"); return; }

    const msg = "*REGISTRO DE ASISTENCIA* %0A%0A" +
        "*Agente:* " + currentRecord.agent + "%0A" +
        "*Tipo:* " + currentRecord.type + "%0A" +
        "*Fecha:* " + currentRecord.fecha + "%0A" +
        "*Hora:* " + currentRecord.hora + "%0A" +
        "*Puesto:* " + currentRecord.puesto + "%0A" +
        (currentRecord.gps ? "*GPS:* " + currentRecord.gps.lat + ", " + currentRecord.gps.lng + "%0A" : "") +
        "*ID:* " + currentRecord.id + "%0A" +
        "%0A_Documento PDF adjunto_";

    window.open("https://wa.me/" + phone + "?text=" + msg, "_blank");
    if (currentPDF) currentPDF.save("Registro_" + currentRecord.type + "_" + currentRecord.agent.replace(/\s/g, "_") + "_" + Date.now() + ".pdf");
}

function shareTelegram() {
    const chat = document.getElementById("telegramChat").value;
    const token = document.getElementById("telegramToken").value;

    if (token && chat) {
        sendTelegramBot(token, chat);
    } else {
        const msg = "REGISTRO DE ASISTENCIA%0A%0A" +
            "Agente: " + currentRecord.agent + "%0A" +
            "Tipo: " + currentRecord.type + "%0A" +
            "Fecha: " + currentRecord.fecha + "%0A" +
            "Hora: " + currentRecord.hora;
        const url = chat.startsWith("@") ? "https://t.me/" + chat.substring(1) : "https://t.me/share/url?url=" + encodeURIComponent(location.href) + "&text=" + msg;
        window.open(url, "_blank");
    }
    if (currentPDF) currentPDF.save("Registro_" + currentRecord.type + "_" + Date.now() + ".pdf");
}

async function sendTelegramBot(token, chatId) {
    try {
        const msg = "REGISTRO DE ASISTENCIA\\n\\n" +
            "Agente: " + currentRecord.agent + "\\n" +
            "Tipo: " + currentRecord.type + "\\n" +
            "Fecha: " + currentRecord.fecha + "\\n" +
            "Hora: " + currentRecord.hora + "\\n" +
            "Puesto: " + currentRecord.puesto + "\\n" +
            (currentRecord.gps ? "GPS: " + currentRecord.gps.lat + ", " + currentRecord.gps.lng + "\\n" : "") +
            "ID: " + currentRecord.id;

        const response = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: msg })
        });
        const data = await response.json();
        if (data.ok) showToast("Mensaje enviado a Telegram", "success");
        else showToast("Error Telegram: " + data.description, "error");
    } catch (e) { showToast("Error enviando a Telegram", "error"); }
}

async function shareViaAPI() {
    const token = document.getElementById("waApiToken").value;
    const phoneId = document.getElementById("waPhoneId").value;
    const phone = document.getElementById("whatsappNumber").value.replace(/\D/g, "");

    if (!token || !phoneId || !phone) { showToast("Configure WhatsApp Business API", "error"); return; }

    showLoading("Enviando via WhatsApp Business API...");
    try {
        const response = await fetch("https://graph.facebook.com/v18.0/" + phoneId + "/messages", {
            method: "POST",
            headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
            body: JSON.stringify({
                messaging_product: "whatsapp", recipient_type: "individual", to: phone,
                type: "template", template: { name: "hello_world", language: { code: "es" } }
            })
        });
        const data = await response.json();
        hideLoading();
        if (data.messages) showToast("Mensaje enviado via WhatsApp API", "success");
        else showToast("Error API: " + (data.error ? data.error.message : "Desconocido"), "error");
    } catch (e) { hideLoading(); showToast("Error de conexion con API", "error"); }
}

function downloadPDF() {
    if (currentPDF && currentRecord) {
        currentPDF.save("Asistencia_" + currentRecord.type + "_" + currentRecord.agent.replace(/\s/g, "_") + "_" + Date.now() + ".pdf");
    }
}

function closeModal() {
    document.getElementById("successModal").classList.remove("active");
    resetForm();
}

function resetForm() {
    document.getElementById("photoPreview").style.display = "none";
    document.getElementById("btnRetake").classList.add("hidden");
    document.getElementById("actionCard").classList.add("hidden");
    document.getElementById("btnCamera").classList.remove("hidden");
    document.getElementById("faceMatchResult").style.display = "none";
    capturedPhoto = null; selectedType = null; qrValidated = false; qrPuestoData = null;
    document.getElementById("qrValidated").classList.remove("show");
    document.querySelectorAll(".type-btn").forEach(btn => btn.classList.remove("selected"));
}

function loadRecords() {
    records = JSON.parse(localStorage.getItem("attendanceRecords") || "[]");
    const container = document.getElementById("recordsContainer");
    const today = new Date().toLocaleDateString("es-PE");
    const todayRecords = records.filter(r => r.fecha === today);

    if (todayRecords.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;font-size:0.85rem;">No hay registros hoy</p>';
        return;
    }

    container.innerHTML = todayRecords.map(record => `
        <div class="record-item fade-in">
            <img src="${record.photo}" alt="Foto" loading="lazy">
            <div class="record-info">
                <div class="tipo ${record.type.toLowerCase()}">
                    ${record.type === "ENTRADA" ? "📥" : "📤"} ${record.type}
                </div>
                <div class="meta">
                    ${record.fecha} - ${record.hora}<br>
                    ${record.puesto}
                    ${record.qrValidated ? " ✓QR" : ""}
                </div>
            </div>
            <div class="record-status ${record.synced ? "synced" : "pending"}">
                ${record.synced ? "☁️ Sync" : "⏳ Local"}
            </div>
        </div>
    `).join("");
}

function updateDashboard() {
    const today = new Date().toLocaleDateString("es-PE");
    const todayRecords = records.filter(r => r.fecha === today);

    document.getElementById("dashTotal").textContent = todayRecords.length;
    document.getElementById("dashEntradas").textContent = todayRecords.filter(r => r.type === "ENTRADA").length;
    document.getElementById("dashSalidas").textContent = todayRecords.filter(r => r.type === "SALIDA").length;
    document.getElementById("dashPendientes").textContent = todayRecords.filter(r => !r.synced).length;

    const agents = [...new Set(todayRecords.map(r => r.agent))];
    const agentsContainer = document.getElementById("dashAgents");

    if (agents.length === 0) {
        agentsContainer.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:10px;font-size:0.85rem;">Sin agentes registrados hoy</p>';
    } else {
        agentsContainer.innerHTML = agents.map(agent => {
            const agentRecords = todayRecords.filter(r => r.agent === agent);
            const lastRecord = agentRecords[0];
            return `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:rgba(0,0,0,0.2);border-radius:8px;margin-bottom:8px;">
                    <div>
                        <div style="font-weight:700;font-size:0.9rem;">${agent}</div>
                        <div style="font-size:0.75rem;color:var(--text-muted);">${agentRecords.length} registros</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:0.75rem;color:${lastRecord.type === "ENTRADA" ? "var(--success)" : "var(--danger)"};">${lastRecord.type}</div>
                        <div style="font-size:0.7rem;color:var(--text-muted);">${lastRecord.hora}</div>
                    </div>
                </div>
            `;
        }).join("");
    }
}

function exportToExcel() {
    const today = new Date().toLocaleDateString("es-PE");
    const todayRecords = records.filter(r => r.fecha === today);
    if (todayRecords.length === 0) { showToast("No hay registros para exportar", "error"); return; }

    const headers = ["ID", "Agente", "DNI", "Puesto", "Tipo", "Fecha", "Hora", "Latitud", "Longitud", "Precision", "QR_Validado", "Hash"];
    const rows = todayRecords.map(r => [
        r.id, r.agent, r.dni || "", r.puesto, r.type, r.fecha, r.hora,
        r.gps ? r.gps.lat : "", r.gps ? r.gps.lng : "", r.gps ? r.gps.accuracy : "",
        r.qrValidated ? "SI" : "NO", r.hash
    ]);

    const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${v}"`).join(","))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "Registros_" + today.replace(/\//g, "-") + ".csv";
    link.click();
    showToast("CSV descargado", "success");
}

function exportAllPDFs() {
    const today = new Date().toLocaleDateString("es-PE");
    const todayRecords = records.filter(r => r.fecha === today);
    if (todayRecords.length === 0) { showToast("No hay registros para exportar", "error"); return; }

    showToast("Generando " + todayRecords.length + " PDFs...", "success");
    todayRecords.forEach(async (record, i) => {
        setTimeout(async () => {
            const doc = await generatePDF(record);
            doc.save("Registro_" + record.id + ".pdf");
        }, i * 500);
    });
}

function loadConfig() {
    document.getElementById("whatsappNumber").value = localStorage.getItem("whatsappNumber") || "+51";
    document.getElementById("whatsappGroup").value = localStorage.getItem("whatsappGroup") || "";
    document.getElementById("telegramChat").value = localStorage.getItem("telegramChat") || "";
    document.getElementById("telegramToken").value = localStorage.getItem("telegramToken") || "";
    document.getElementById("firebaseProject").value = localStorage.getItem("firebaseProject") || "";
    document.getElementById("firebaseApiKey").value = localStorage.getItem("firebaseApiKey") || "";
    document.getElementById("waApiToken").value = localStorage.getItem("waApiToken") || "";
    document.getElementById("waPhoneId").value = localStorage.getItem("waPhoneId") || "";
}

function testWhatsAppAPI() {
    const token = document.getElementById("waApiToken").value;
    const phoneId = document.getElementById("waPhoneId").value;
    if (!token || !phoneId) { showToast("Complete Access Token y Phone Number ID", "error"); return; }
    localStorage.setItem("waApiToken", token);
    localStorage.setItem("waPhoneId", phoneId);
    showToast("Configuracion WhatsApp API guardada", "success");
}

function clearAllData() {
    if (!confirm("⚠️ ¿Esta seguro de borrar TODOS los datos locales? Esta accion no se puede deshacer.")) return;
    localStorage.clear();
    records = []; faceDescriptors = [];
    loadRecords(); updateDashboard(); loadFaceProfile();
    showToast("Todos los datos eliminados", "success");
}

function checkOnlineStatus() {
    const status = document.getElementById("syncStatus");
    const text = document.getElementById("syncText");
    if (navigator.onLine) {
        status.classList.remove("offline"); status.classList.add("online");
        text.textContent = "Online";
    } else {
        status.classList.remove("online"); status.classList.add("offline");
        text.textContent = "Offline";
    }
}

function showToast(message, type) {
    const toast = document.getElementById("toast");
    toast.textContent = message; toast.className = "toast " + type;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3000);
}

function showLoading(text, sub) {
    document.getElementById("loadingText").textContent = text;
    document.getElementById("loadingSub").textContent = sub || "";
    document.getElementById("loadingOverlay").classList.add("active");
}

function hideLoading() {
    document.getElementById("loadingOverlay").classList.remove("active");
}

document.querySelectorAll("#panelConfig input").forEach(input => {
    input.addEventListener("change", (e) => { localStorage.setItem(e.target.id, e.target.value); });
});

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("data:text/javascript," + encodeURIComponent(`
        self.addEventListener("install", e => e.waitUntil(self.skipWaiting()));
        self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
        self.addEventListener("fetch", e => e.respondWith(
            fetch(e.request).catch(() => new Response("Offline - Modo local activo"))
        ));
    `)).catch(() => {});
}

window.switchTab = switchTab;
window.selectType = selectType;
window.startCamera = startCamera;
window.capturePhoto = capturePhoto;
window.retakePhoto = retakePhoto;
window.generateAndSend = generateAndSend;
window.startQRScanner = startQRScanner;
window.stopQRScanner = stopQRScanner;
window.startFaceRegistration = startFaceRegistration;
window.captureFaceSample = captureFaceSample;
window.saveFaceProfile = saveFaceProfile;
window.removeFaceSample = removeFaceSample;
window.shareWhatsApp = shareWhatsApp;
window.shareTelegram = shareTelegram;
window.shareViaAPI = shareViaAPI;
window.downloadPDF = downloadPDF;
window.closeModal = closeModal;
window.testFirebaseConnection = testFirebaseConnection;
window.testWhatsAppAPI = testWhatsAppAPI;
window.clearAllData = clearAllData;
window.exportToExcel = exportToExcel;
window.exportAllPDFs = exportAllPDFs;
