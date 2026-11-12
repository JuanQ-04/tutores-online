// js/api-url.js — Dirección de la API. Va aparte para que las páginas públicas (landing,
// buscar) puedan leer el catálogo de materias sin cargar Firebase Authentication.
const esLocal = ["localhost", "127.0.0.1"].includes(location.hostname);

// URL del backend en Render (el servicio «tutores-online-api» de render.yaml).
// Si Render te asignó otra URL, cámbiala aquí y en `connect-src` de render.yaml.
export const API_URL = esLocal ? "http://localhost:4000/api" : "https://tutores-online-api.onrender.com/api";
