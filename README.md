# 🛡️ Control de Asistencia PRO v2.0

Sistema integral de registro de asistencia para seguridad patrimonial con:
- ✅ Geolocalización GPS
- ✅ Reconocimiento facial con IA
- ✅ Validación por QR de puesto
- ✅ Generación de PDF con marca de agua y hash
- ✅ Sincronización Firebase
- ✅ Envío WhatsApp/Telegram/API
- ✅ Dashboard de supervisor
- ✅ Modo offline

## 📁 Archivos

| Archivo | Descripción |
|---------|-------------|
| `index.html` | Aplicación principal PWA |
| `app.js` | Lógica completa (Firebase, FaceAPI, QR, PDF) |
| `manifest.json` | Configuración PWA |

## 🚀 Despliegue

### Opción 1: Hosting Web (Recomendado)
1. Subir los 3 archivos a cualquier hosting estático
2. Acceder desde el navegador del móvil
3. Agregar a pantalla de inicio

### Opción 2: Firebase Hosting
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
firebase deploy
```

### Opción 3: Netlify / Vercel
- Arrastrar archivos al dashboard
- URL pública instantánea

## ⚙️ Configuración

### Firebase (Sincronización en tiempo real)
1. Crear proyecto en [console.firebase.google.com](https://console.firebase.google.com)
2. Activar Realtime Database
3. Copiar API Key y Project ID
4. Pegar en pestaña "Config"

### WhatsApp Business API
1. Crear app en [developers.facebook.com](https://developers.facebook.com)
2. Activar WhatsApp Business API
3. Obtener Access Token y Phone Number ID
4. Configurar en pestaña "Config"

### Telegram Bot
1. Crear bot con [@BotFather](https://t.me/BotFather)
2. Obtener token
3. Obtener Chat ID (usar [@userinfobot](https://t.me/userinfobot))
4. Configurar en pestaña "Config"

### Reconocimiento Facial
1. Ir a pestaña "Facial"
2. Ingresar nombre del agente
3. Capturar 3 muestras de diferentes ángulos
4. Guardar perfil

### QR de Puesto
Generar QR con formato:
```json
{"type":"puesto","nombre":"Torre A - Lobby"}
```

## 🔐 Seguridad

- Hash SHA-256 por cada registro
- Marca de agua "CONFIDENCIAL" en PDF
- Validación biométrica facial
- QR de puesto obligatorio
- GPS con precisión en metros
- Datos cifrados en localStorage

## 📱 Flujo del Agente

1. Llega al puesto → Abre app
2. Escanear QR del puesto (validación)
3. Seleccionar ENTRADA/SALIDA
4. Tomar selfie (reconocimiento facial automático)
5. Generar PDF firmado
6. Enviar por WhatsApp/Telegram

## 📊 Dashboard Supervisor

- Registros en tiempo real
- Agentes activos por puesto
- Exportación a Excel
- Descarga masiva de PDFs
- Estado de sincronización

## 🛠️ Tecnologías

- HTML5 + CSS3 + Vanilla JS
- Firebase Realtime Database
- Face-API.js (reconocimiento facial)
- jsPDF (generación de PDF)
- HTML5-QRCode (escáner QR)
- CryptoJS (hash de integridad)
- WhatsApp Business API
- Telegram Bot API
