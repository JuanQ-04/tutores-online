// js/notificaciones.js — Notificaciones de la campana, compartidas por los tres paneles.
// Se guardan en la base de datos (GET /api/notificaciones): siguen ahí al cerrar sesión o recargar,
// y cada una recuerda si ya se leyó. Cada panel decide cómo pintarlas y a dónde lleva cada una.

import { api, aMillis, sonIguales } from "./api.js";

export function crearBandeja({ alCambiar }) {
  const estado = { avisos: [], sinLeer: 0, cargado: false, fallo: false };

  // Devuelve true si algo cambió (para repintar solo cuando hace falta).
  async function cargar() {
    try {
      const { avisos, sinLeer } = await api.notificaciones();
      const cambio = !estado.cargado || estado.fallo || !sonIguales(avisos, estado.avisos);
      Object.assign(estado, { avisos, sinLeer, cargado: true, fallo: false });
      if (cambio) alCambiar();
      return cambio;
    } catch (err) {
      console.warn("No se pudieron cargar las notificaciones:", err);
      if (!estado.cargado && !estado.fallo) {
        estado.fallo = true;
        alCambiar();
      }
      return false;
    }
  }

  // Marca una como leída al instante en pantalla y lo guarda en segundo plano.
  async function leer(id) {
    const aviso = estado.avisos.find((a) => a.id === id);
    if (!aviso || aviso.leida) return;
    aviso.leida = true;
    estado.sinLeer = Math.max(0, estado.sinLeer - 1);
    alCambiar();
    try {
      await api.leerNotificacion(id);
    } catch (err) {
      console.warn("No se pudo marcar la notificación como leída:", err);
      aviso.leida = false;
      estado.sinLeer += 1;
      alCambiar();
    }
  }

  async function leerTodas() {
    if (!estado.sinLeer) return;
    estado.avisos.forEach((a) => { a.leida = true; });
    estado.sinLeer = 0;
    alCambiar();
    try {
      await api.leerTodasNotificaciones();
    } catch (err) {
      console.warn("No se pudieron marcar las notificaciones como leídas:", err);
      cargar(); // vuelve a lo que dice el servidor
    }
  }

  return { estado, cargar, leer, leerTodas, buscar: (id) => estado.avisos.find((a) => a.id === id) };
}

const esc = (valor) => String(valor ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
);

// «Hace 5 min», «Ayer», «12 nov»…
export function hace(iso) {
  const ms = aMillis(iso);
  if (!ms) return "";
  const min = Math.floor((Date.now() - ms) / 60000);
  if (min < 1) return "Ahora";
  if (min < 60) return `Hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Hace ${h} ${h === 1 ? "hora" : "horas"}`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Ayer";
  if (d < 7) return `Hace ${d} días`;
  return new Date(ms).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: d > 300 ? "numeric" : undefined });
}

// HTML de una notificación. Es un botón: se puede usar con teclado y lleva a su destino al hacer clic.
// `etiquetaTitulo` es h2/h3 según el lugar; `compacto` recorta el detalle (campana).
export function htmlAviso(aviso, { etiquetaTitulo = "h3", compacto = false } = {}) {
  const t = etiquetaTitulo;
  return `<button type="button" class="aviso-item${aviso.leida ? "" : " is-unread"}${compacto ? " is-compact" : ""}" data-aviso="${esc(aviso.id)}">
      <${t}>${esc(aviso.titulo)}</${t}>
      ${aviso.detalle ? `<p>${esc(aviso.detalle)}</p>` : ""}
      <span class="aviso-meta">${aviso.leida ? "Leída" : "Sin leer"} · ${esc(hace(aviso.creadaEn))}</span>
    </button>`;
}

// Un clic en cualquier notificación de `contenedor` llama a alElegir(aviso).
export function activarClics(contenedor, bandeja, alElegir) {
  contenedor?.addEventListener("click", (event) => {
    const boton = event.target.closest("[data-aviso]");
    if (!boton) return;
    const aviso = bandeja.buscar(boton.dataset.aviso);
    if (aviso) alElegir(aviso);
  });
}
