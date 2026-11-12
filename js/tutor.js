// js/tutor.js — Panel del tutor
// Perfil, Solicitudes, Tutorías, Disponibilidad y Calificaciones: todo viaja por la API
// (js/api.js); este panel nunca habla directo con la base de datos.
// Seguridad y Centro de ayuda: js/configuracion.js.
// Las notificaciones se arman con las solicitudes y tutorías del tutor.

import { auth } from "./firebase-config.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  pintarAvatar,
  activarSelectorFoto,
  guardarFotoPerfil
} from "./foto-perfil.js";
import { api, aMillis, sondear, sonIguales } from "./api.js";
import { cargarMaterias, materiasActuales, nombreMateria } from "./materias.js";
import { crearBandeja, htmlAviso, activarClics } from "./notificaciones.js";

(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  // ----------------------------------------------------------------
  // Estado global de la aplicación
  // ----------------------------------------------------------------

  let solicitudesData = []; // solicitudes que recibió el tutor (GET /solicitudes/mias)
  let tutoriasData = [];    // sus tutorías (GET /tutorias/mias)
  let blocks = [];          // disponibilidad, tal como la guarda el servidor
  let calificacionesData = []; // calificaciones que recibió este tutor
  let detenerSondeo = null; // cancela la actualización periódica del panel

  // Perfil real (API). Comienza vacío; se llena al cargar la página.
  // Nombre, apellido y foto se guardan directo; los datos profesionales (materias, modalidad,
  // tarifa, ciudad…) viven en `datos` y solo cambian cuando un administrador aprueba una solicitud.
  let profile = {
    name: "",
    lastname: "",
    email: "",
    photo: "",
    datos: {}
  };
  let solicitudCambio = null; // última solicitud de actualización (GET /usuarios/yo/solicitud-cambio)

  const titles = {
    inicio: "Inicio",
    solicitudes: "Solicitudes",
    disponibilidad: "Disponibilidad",
    tutorias: "Mis tutorías",
    notificaciones: "Notificaciones",
    perfil: "Mi perfil",
    seguridad: "Configuración",
    ayuda: "Centro de ayuda"
  };

  const statusLabels = {
    pending: "Pendiente",
    confirmed: "Confirmada",
    completed: "Completada",
    cancelled: "Cancelada"
  };

  const dayNames = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  let currentSection = "";
  let previousSection = "inicio";
  let sessionFilter = "confirmed";
  let weekStart = mondayOf(new Date());
  let toastTimer;

  // ----------------------------------------------------------------
  // Utilidades de fecha y hora
  // ----------------------------------------------------------------

  function parseDate(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day, 12);
  }

  function dateISO(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  function mondayOf(date) {
    const offset = (date.getDay() + 6) % 7;
    return addDays(date, -offset);
  }

  function formatDate(value) {
    return parseDate(value).toLocaleDateString("es-CO", {
      weekday: "short",
      day: "numeric",
      month: "short"
    });
  }

  function timeLabel(value) {
    const base = new Date(2026, 7, 24, 0, 0, 0);
    const [hours, minutes] = value.split(":").map(Number);
    base.setHours(hours, minutes);
    return base.toLocaleTimeString("es-CO", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });
  }

  function minutes(value) {
    const [hours, mins] = value.split(":").map(Number);
    return hours * 60 + mins;
  }

  function normalize(value) {
    return value.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function overlaps(first, second) {
    return first.date === second.date
      && minutes(first.start) < minutes(second.end)
      && minutes(first.end) > minutes(second.start);
  }

  // ----------------------------------------------------------------
  // Normalización: datos de la API → formato interno de render
  // ----------------------------------------------------------------

  // La API entrega "fecha" como "YYYY-MM-DD"; si faltara, se usa hoy.
  function tsToISO(fecha) {
    return typeof fecha === "string" && fecha ? fecha.slice(0, 10) : dateISO(new Date());
  }

  // Mapea estados de la API → clases CSS que ya existen en el panel.
  const estadoSolicitud = {
    pendiente: "pending",
    aceptada: "confirmed",
    rechazada: "cancelled"
  };

  const estadoTutoria = {
    programada: "confirmed",
    completada: "completed",
    cancelada: "cancelled"
  };

  function normalizarSolicitud(raw) {
    return {
      id: raw.id,
      tipo: "solicitud",
      student: raw.estudianteNombre || "Estudiante",
      subject: raw.materia || "Materia",
      date: tsToISO(raw.fecha),
      start: raw.horaInicio || "08:00",
      end: raw.horaFin || "09:00",
      mode: raw.modalidad || "Virtual",
      status: estadoSolicitud[raw.estado] || "pending",
      isRequest: true,
      message: raw.mensaje || "",
      tarifa: raw.tarifa || 0
    };
  }

  function normalizarTutoria(raw) {
    return {
      id: raw.id,
      tipo: "tutoria",
      student: raw.estudianteNombre || "Estudiante",
      subject: raw.materia || "Materia",
      date: tsToISO(raw.fecha),
      start: raw.horaInicio || "08:00",
      end: raw.horaFin || "09:00",
      mode: raw.modalidad || "Virtual",
      status: estadoTutoria[raw.estado] || "confirmed",
      isRequest: false,
      message: raw.comentario || "",
      tarifa: raw.tarifa || 0,
      link: raw.enlaceReunion || ""
    };
  }

  // ----------------------------------------------------------------
  // Utilidades de UI
  // ----------------------------------------------------------------

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  function icon(name) {
    return `<svg class="icon" aria-hidden="true"><use href="#t-${name}"></use></svg>`;
  }

  function initials(name) {
    return String(name).trim().split(/\s+/)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join("");
  }

  function showToast(message) {
    const toast = $("#tutor-toast");
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
  }

  function empty(message) {
    return `<p class="tutor-empty">${escapeHTML(message)}</p>`;
  }

  // ----------------------------------------------------------------
  // Menú móvil
  // ----------------------------------------------------------------

  const sidebar = $("#tutor-sidebar");
  const overlay = $(".sidebar-overlay");
  const menuToggle = $(".menu-toggle");
  const mobileQuery = window.matchMedia("(max-width: 900px)");
  const sidebarLinks = $$(".main-navigation a");

  function setMenu(open, restoreFocus = false) {
    const shouldOpen = open && mobileQuery.matches;
    sidebar.classList.toggle("is-open", shouldOpen);
    overlay.hidden = !shouldOpen;
    document.body.classList.toggle("menu-is-open", shouldOpen);
    menuToggle.setAttribute("aria-expanded", String(shouldOpen));
    menuToggle.setAttribute("aria-label", shouldOpen ? "Cerrar menú" : "Abrir menú");
    if (shouldOpen) $(".sidebar-close").focus();
    else if (restoreFocus && mobileQuery.matches) menuToggle.focus();
  }

  menuToggle.addEventListener("click", () => setMenu(!sidebar.classList.contains("is-open")));
  $(".sidebar-close").addEventListener("click", () => setMenu(false, true));
  overlay.addEventListener("click", () => setMenu(false, true));
  mobileQuery.addEventListener("change", () => setMenu(false));

  // ----------------------------------------------------------------
  // Navegación por hash
  // ----------------------------------------------------------------

  function navigate() {
    const requested = window.location.hash.slice(1);
    const id = Object.hasOwn(titles, requested) ? requested : "inicio";
    const changed = currentSection !== id;

    if (changed && currentSection) previousSection = currentSection;
    currentSection = id;

    $$(".dashboard-main > section[id]").forEach((section) => {
      section.hidden = section.id !== id;
    });

    sidebarLinks.forEach((link) => {
      if (link.getAttribute("href") === `#${id}`) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });

    $("#tutor-breadcrumb").textContent = titles[id];
    document.title = `${titles[id]} | TutoresOn-Line`;
    setMenu(false);
    setNotificationMenu(false);

    if (changed) {
      window.scrollTo({ top: 0, behavior: "auto" });
      const heading = $(`#${id} h1`);
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
  }

  window.addEventListener("hashchange", navigate);

  $$("[data-pending]").forEach((button) => {
    button.addEventListener("click", () => {
      showToast(`${button.dataset.pending} se implementará más adelante.`);
    });
  });

  // ----------------------------------------------------------------
  // Notificaciones
  // ----------------------------------------------------------------

  const notificationToggle = $("#tutor-notification-toggle");
  const notificationDropdown = $("#tutor-notification-dropdown");

  function setNotificationMenu(open) {
    notificationDropdown.hidden = !open;
    notificationToggle.setAttribute("aria-expanded", String(open));
  }

  notificationToggle.addEventListener("click", () => {
    setNotificationMenu(notificationDropdown.hidden);
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".tutor-notification-widget")) setNotificationMenu(false);
  });

  $("#tutor-notifications-back").addEventListener("click", () => {
    window.location.hash = previousSection === "notificaciones" ? "inicio" : previousSection;
  });

  // Las notificaciones se guardan en la base de datos (siguen ahí al recargar o iniciar sesión otra vez).
  // Al hacer clic en una se marca como leída y se abre lo que anuncia.
  const bandeja = crearBandeja({ alCambiar: () => renderNotifications() });

  function renderNotifications() {
    const { avisos, sinLeer, cargado, fallo } = bandeja.estado;
    const mensaje = (texto) => `<li><p class="aviso-vacio">${texto}</p></li>`;
    const vacio = !cargado
      ? mensaje(fallo ? "No se pudieron cargar tus notificaciones." : "Cargando tus notificaciones…")
      : mensaje("Todavía no tienes notificaciones.");

    $("#tutor-notification-preview").innerHTML = avisos.length
      ? avisos.slice(0, 4).map((a) => `<li>${htmlAviso(a, { compacto: true })}</li>`).join("")
      : vacio;
    $("#tutor-notification-full").innerHTML = avisos.length
      ? avisos.map((a) => `<li>${htmlAviso(a, { etiquetaTitulo: "h2" })}</li>`).join("")
      : vacio;

    const count = $("#tutor-notification-count");
    count.textContent = sinLeer > 9 ? "9+" : String(sinLeer);
    count.hidden = sinLeer === 0;
    notificationToggle.setAttribute(
      "aria-label",
      sinLeer ? `Notificaciones, ${sinLeer} sin leer` : "Notificaciones"
    );
    $("#tutor-notifications-read-all").disabled = sinLeer === 0;
  }

  // A dónde lleva cada notificación (el servidor indica la sección y, si aplica, el elemento).
  function abrirAviso(aviso) {
    bandeja.leer(aviso.id);
    setNotificationMenu(false);
    const { seccion, id } = aviso.destino || {};

    if (seccion === "solicitudes") {
      $("#tutor-request-status").value = "all";
      $("#tutor-request-search").value = "";
      renderRequests();
    }
    window.location.hash = Object.hasOwn(titles, seccion) ? seccion : "inicio";
    if ((seccion === "solicitudes" || seccion === "tutorias") && id) {
      if (solicitudesData.some((s) => s.id === id) || tutoriasData.some((t) => t.id === id)) openDetail(id);
      else showToast("Esa solicitud o tutoría ya no está disponible.");
    }
  }

  activarClics($("#tutor-notification-preview"), bandeja, abrirAviso);
  activarClics($("#tutor-notification-full"), bandeja, abrirAviso);
  $("#tutor-notifications-read-all").addEventListener("click", () => bandeja.leerTodas());

  // ----------------------------------------------------------------
  // HTML de tarjetas de sesión/tutoría
  // ----------------------------------------------------------------

  function sessionHTML(session) {
    const modalityIcon = session.mode === "Presencial" ? "pin" : "video";
    return `<button class="tutor-session-item" type="button" data-detail="${escapeHTML(session.id)}">
      <span class="tutor-session-main">
        <span class="tutor-initials" aria-hidden="true">${escapeHTML(initials(session.student))}</span>
        <span class="tutor-session-info">
          <span class="tutor-session-subject">${escapeHTML(session.subject)}</span>
          <span class="tutor-session-title">Sesión con ${escapeHTML(session.student)}</span>
          <span class="tutor-session-meta">
            <span>${icon("calendar")}${escapeHTML(formatDate(session.date))}</span>
            <span>${icon("clock")}${escapeHTML(timeLabel(session.start))}</span>
            <span>${icon(modalityIcon)}${escapeHTML(session.mode)}</span>
          </span>
        </span>
      </span>
      <span class="tutor-session-side">
        <span class="tutor-status ${session.status}">${statusLabels[session.status]}</span>
        ${icon("chevron")}
      </span>
    </button>`;
  }

  function sortedItems(items) {
    return [...items].sort((a, b) =>
      `${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`)
    );
  }

  // ----------------------------------------------------------------
  // Sección: Mis tutorías
  // ----------------------------------------------------------------

  function renderSessions() {
    const items = tutoriasData.map(normalizarTutoria);
    const filtered = sortedItems(items.filter((s) => s.status === sessionFilter));

    $("#tutor-session-list").innerHTML = filtered.length
      ? filtered.map(sessionHTML).join("")
      : empty("No hay tutorías con este estado.");

    $$("[data-session-status]").forEach((button) => {
      const active = button.dataset.sessionStatus === sessionFilter;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    $$("[data-session-count]").forEach((count) => {
      const st = count.dataset.sessionCount;
      count.textContent = items.filter((s) => s.status === st).length;
    });
  }

  $$("[data-session-status]").forEach((button) => {
    button.addEventListener("click", () => {
      sessionFilter = button.dataset.sessionStatus;
      renderSessions();
    });
  });

  // ----------------------------------------------------------------
  // Sección: Solicitudes
  // ----------------------------------------------------------------

  function requestHTML(session) {
    let actions = "";
    if (session.status === "pending") {
      actions = `
        <button class="tutor-button is-outline" type="button"
          data-request-action="reject" data-id="${session.id}">Rechazar</button>
        <button class="tutor-button" type="button"
          data-request-action="accept" data-id="${session.id}">
          ${icon("check")}Aceptar
        </button>`;
    }
    return `<article class="tutor-request-card">
      <div class="tutor-request-header">
        <span class="tutor-initials" aria-hidden="true">${escapeHTML(initials(session.student))}</span>
        <div class="tutor-request-person">
          <p class="tutor-label">Solicitud de tutoría</p>
          <h2>${escapeHTML(session.student)}</h2>
        </div>
        <span class="tutor-status ${session.status}">
          ${session.status === "pending" ? "Nueva" : statusLabels[session.status]}
        </span>
      </div>
      <ul class="tutor-request-meta">
        <li>${icon("book")}${escapeHTML(session.subject)}</li>
        <li>${icon("calendar")}${escapeHTML(formatDate(session.date))}</li>
        <li>${icon("clock")}${escapeHTML(timeLabel(session.start))} – ${escapeHTML(timeLabel(session.end))}</li>
        <li>${icon(session.mode === "Presencial" ? "pin" : "video")}${escapeHTML(session.mode)}</li>
      </ul>
      <p class="tutor-request-message">"${escapeHTML(session.message)}"</p>
      <div class="tutor-request-actions">
        ${actions}
        <button class="tutor-icon-button" type="button"
          data-detail="${session.id}"
          aria-label="Ver detalle de ${escapeHTML(session.student)}">
          ${icon("chevron")}
        </button>
      </div>
    </article>`;
  }

  function renderRequests() {
    const search = normalize($("#tutor-request-search").value);
    const statusFilter = $("#tutor-request-status").value;

    // Mapeo de opciones del <select> al estado interno normalizado
    const filterMap = {
      pending: "pending",
      confirmed: "confirmed",
      cancelled: "cancelled",
      all: null
    };
    const targetStatus = filterMap[statusFilter];

    const items = solicitudesData.map(normalizarSolicitud).filter((s) => {
      const matchStatus = targetStatus === null || s.status === targetStatus;
      const matchSearch = normalize(`${s.student} ${s.subject}`).includes(search);
      return matchStatus && matchSearch;
    });

    $("#tutor-request-grid").innerHTML = items.length
      ? sortedItems(items).map(requestHTML).join("")
      : empty("No hay solicitudes que coincidan con estos filtros.");
  }

  $("#tutor-request-search").addEventListener("input", renderRequests);
  $("#tutor-request-status").addEventListener("change", renderRequests);

  // ----------------------------------------------------------------
  // Sección: Inicio
  // ----------------------------------------------------------------

  function renderHome() {
    // Solicitudes pendientes
    const pendientes = solicitudesData
      .filter((s) => s.estado === "pendiente")
      .map(normalizarSolicitud);

    // Tutorías programadas, ordenadas por fecha/hora
    const programadas = sortedItems(
      tutoriasData.filter((t) => t.estado === "programada").map(normalizarTutoria)
    );

    // Encabezado
    $("#tutor-home-title").textContent = `Hola, ${profile.name || "Tutor"}`;
    $("#tutor-home-description").textContent =
      pendientes.length === 1
        ? "Tienes 1 solicitud pendiente por responder."
        : `Tienes ${pendientes.length} solicitudes pendientes por responder.`;

    // Estadísticas
    $("#tutor-stat-requests").textContent = pendientes.length;

    const next = programadas[0];
    $("#tutor-stat-next").textContent = next
      ? `${formatDate(next.date)} · ${timeLabel(next.start)}`
      : "—";
    $("#tutor-stat-subject").textContent = next ? next.subject : "Sin sesiones programadas";

    // Solicitudes recientes (máx. 2)
    $("#tutor-recent-requests").innerHTML = pendientes.length
      ? pendientes.slice(0, 2).map((s) => `
          <button class="tutor-recent-row" type="button" data-detail="${s.id}">
            <span class="tutor-initials" aria-hidden="true">${escapeHTML(initials(s.student))}</span>
            <span class="tutor-recent-info">
              <strong>${escapeHTML(s.student)}</strong>
              <small>${escapeHTML(s.subject)} · ${escapeHTML(formatDate(s.date))} · ${escapeHTML(timeLabel(s.start))}</small>
            </span>
            <span class="tutor-status pending">Nueva</span>
            ${icon("chevron")}
          </button>`).join("")
      : empty("No tienes solicitudes por responder.");

    // Próximas sesiones confirmadas (máx. 3)
    $("#tutor-home-sessions").innerHTML = programadas.length
      ? programadas.slice(0, 3).map(sessionHTML).join("")
      : empty("No tienes sesiones programadas.");

    // Resumen de disponibilidad de la semana visible
    const weekDates = dayNames.map((_, i) => dateISO(addDays(weekStart, i)));
    const hours = weekDates.map((day) =>
      blocks
        .filter((b) => b.fecha === day)
        .reduce((total, b) => total + (minutes(b.horaFin) - minutes(b.horaInicio)) / 60, 0)
    );

    const maximum = Math.max(...hours, 1);
    $("#tutor-week-summary").innerHTML = hours.map((value, i) => `
      <div class="tutor-week-day">
        <span>${dayNames[i]}</span>
        <span class="tutor-mini-track" aria-hidden="true">
          <span style="height:${(value / maximum) * 100}%"></span>
        </span>
        <strong>${value} h</strong>
      </div>`).join("");

    const total = hours.reduce((sum, v) => sum + v, 0);
    const semanaLabel = weekStart.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
    $("#tutor-hours-summary").textContent =
      `${total} horas disponibles en la semana del ${semanaLabel}.`;
  }

  // ----------------------------------------------------------------
  // Detalle de una solicitud o tutoría
  // ----------------------------------------------------------------

  function openDetail(id) {
    // Buscar primero en solicitudes
    const rawSol = solicitudesData.find((s) => s.id === id);
    if (rawSol) {
      const s = normalizarSolicitud(rawSol);
      let actions = "";
      if (s.status === "pending") {
        actions = `
          <button class="tutor-button is-outline" type="button"
            data-request-action="reject" data-id="${s.id}">Rechazar</button>
          <button class="tutor-button" type="button"
            data-request-action="accept" data-id="${s.id}">Aceptar solicitud</button>`;
      }
      $("#tutor-detail-content").innerHTML = `
        <dl class="tutor-detail-list">
          <dt>Estudiante</dt><dd>${escapeHTML(s.student)}</dd>
          <dt>Materia</dt><dd>${escapeHTML(s.subject)}</dd>
          <dt>Fecha solicitada</dt><dd>${escapeHTML(formatDate(s.date))}</dd>
          <dt>Horario</dt><dd>${escapeHTML(timeLabel(s.start))} – ${escapeHTML(timeLabel(s.end))}</dd>
          <dt>Modalidad</dt><dd>${escapeHTML(s.mode)}</dd>
          <dt>Tarifa acordada</dt><dd>$${s.tarifa.toLocaleString("es-CO")} / hora</dd>
          <dt>Estado</dt><dd>${s.status === "pending" ? "Nueva" : statusLabels[s.status]}</dd>
        </dl>
        <p class="tutor-muted">"${escapeHTML(s.message)}"</p>
        <div class="tutor-detail-actions">${actions}</div>`;
      $("#tutor-detail-dialog").showModal();
      return;
    }

    // Buscar en tutorías
    const rawTut = tutoriasData.find((t) => t.id === id);
    if (rawTut) {
      const t = normalizarTutoria(rawTut);
      let actions = "";
      if (t.status === "confirmed") {
        actions = `
          <button class="tutor-button" type="button"
            data-session-action="complete" data-id="${t.id}">Marcar completada</button>
          <button class="tutor-button is-danger" type="button"
            data-session-action="cancel" data-id="${t.id}">Cancelar sesión</button>`;
      }
      $("#tutor-detail-content").innerHTML = `
        <dl class="tutor-detail-list">
          <dt>Estudiante</dt><dd>${escapeHTML(t.student)}</dd>
          <dt>Materia</dt><dd>${escapeHTML(t.subject)}</dd>
          <dt>Fecha</dt><dd>${escapeHTML(formatDate(t.date))}</dd>
          <dt>Horario</dt><dd>${escapeHTML(timeLabel(t.start))} – ${escapeHTML(timeLabel(t.end))}</dd>
          <dt>Modalidad</dt><dd>${escapeHTML(t.mode)}</dd>
          ${t.status === "confirmed" && t.link.startsWith("https://")
            ? `<dt>Videollamada</dt><dd><a href="${escapeHTML(t.link)}" target="_blank" rel="noopener noreferrer">Abrir sala de Jitsi</a></dd>`
            : ""}
          <dt>Tarifa</dt><dd>$${t.tarifa.toLocaleString("es-CO")} / hora</dd>
          <dt>Estado</dt><dd>${statusLabels[t.status]}</dd>
        </dl>
        ${t.message ? `<p class="tutor-muted">"${escapeHTML(t.message)}"</p>` : ""}
        ${t.status === "completed" ? calificacionDeTutoriaHTML(t.id) : ""}
        <div class="tutor-detail-actions">${actions}</div>`;
      $("#tutor-detail-dialog").showModal();
    }
  }

  // ----------------------------------------------------------------
  // Calificaciones recibidas
  // ----------------------------------------------------------------

  function estrellas(n) {
    const v = Math.round(Number(n) || 0);
    return "★".repeat(v) + "☆".repeat(5 - v);
  }

  function calificacionDeTutoriaHTML(tutoriaId) {
    const c = calificacionesData.find((x) => x.id === tutoriaId);
    if (!c) return `<p class="tutor-muted">El estudiante todavía no ha calificado esta tutoría.</p>`;
    return `<div class="review-inline">
      <span class="rating-readonly">${estrellas(c.estrellas)}</span>
      ${c.comentario ? `<p>"${escapeHTML(c.comentario)}"</p>` : ""}
    </div>`;
  }

  function renderCalificaciones() {
    const visibles = calificacionesData.filter((c) => c.estado === "visible");
    const total = visibles.length;
    const promedio = total
      ? visibles.reduce((sum, c) => sum + (Number(c.estrellas) || 0), 0) / total
      : 0;

    $("#tutor-stat-rating").textContent = total ? `${promedio.toFixed(1)} / 5` : "—";
    $("#tutor-stat-reviews").textContent = total
      ? `${total} ${total === 1 ? "opinión" : "opiniones"} de estudiantes`
      : "Aún no tienes opiniones";

    $("#tutor-reviews-summary").textContent = total
      ? `★ ${promedio.toFixed(1)} · ${total} ${total === 1 ? "opinión" : "opiniones"}`
      : "Sin calificaciones";

    const ordenadas = [...calificacionesData].sort((a, b) => aMillis(b.creadaEn) - aMillis(a.creadaEn));

    $("#tutor-reviews-list").innerHTML = ordenadas.length
      ? ordenadas.map((c) => `
          <li class="review-item${c.estado === "oculta" ? " is-hidden" : ""}">
            <div class="review-top">
              <span class="rating-readonly">${estrellas(c.estrellas)}</span>
              <strong>${escapeHTML(String(c.estudianteNombre || "Estudiante").split(" ")[0])}</strong>
              <small>${escapeHTML(c.materia || "")}${c.fechaTutoria ? ` · ${escapeHTML(formatDate(c.fechaTutoria))}` : ""}</small>
              ${c.estado === "oculta" ? '<span class="tutor-status cancelled">Oculta por el administrador</span>' : ""}
            </div>
            ${c.comentario ? `<p>"${escapeHTML(c.comentario)}"</p>` : ""}
            ${c.retroalimentacion ? `<p class="review-feedback"><strong>Nota del administrador:</strong> ${escapeHTML(c.retroalimentacion)}</p>` : ""}
          </li>`).join("")
      : `<li class="tutor-muted">Cuando marques una tutoría como completada, el estudiante podrá calificarte y su opinión aparecerá aquí.</li>`;
  }

  // ----------------------------------------------------------------
  // Sección: Disponibilidad (calendario semanal)
  // ----------------------------------------------------------------

  // Los blocks usan { id, fecha, horaInicio, horaFin, modalidad }
  // (mismo esquema que guarda el servidor)

  function renderCalendar() {
    const dates = dayNames.map((_, i) => dateISO(addDays(weekStart, i)));
    const lastDay = addDays(weekStart, 6);
    const ahora = new Date();
    const hoy = dateISO(ahora);
    const horaActual = `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
    const bloqueVigente = (b) => b.fecha > hoy || (b.fecha === hoy && b.horaFin > horaActual);
    const sesionesQueOcupan = tutoriasData
      .filter((t) => t.estado === "programada" || t.estado === "completada")
      .map(normalizarTutoria);
    const bloquesVisibles = blocks.filter((b) => bloqueVigente(b) && !sesionesQueOcupan.some((s) =>
      overlaps({ date: b.fecha, start: b.horaInicio, end: b.horaFin }, s)
    ));

    $("#tutor-week-title").textContent =
      `${weekStart.getDate()}–${lastDay.getDate()} · ` +
      lastDay.toLocaleDateString("es-CO", { month: "long", year: "numeric" });

    let html = `<div class="tutor-calendar-heading">Hora</div>`;
    dates.forEach((date, i) => {
      html += `<div class="tutor-calendar-heading">${dayNames[i]} ${parseDate(date).getDate()}</div>`;
    });

    html += `<div class="tutor-calendar-times">`;
    for (let h = 8; h < 20; h += 2) {
      html += `<span style="top:${(h - 8) * 48 + 3}px">${escapeHTML(timeLabel(`${String(h).padStart(2, "0")}:00`))}</span>`;
    }
    html += `</div>`;

    // Tutorías programadas (bloques reservados en el calendario)
    const reservadas = tutoriasData
      .filter((t) => t.estado === "programada")
      .map(normalizarTutoria);

    dates.forEach((date) => {
      html += `<div class="tutor-calendar-day">`;
      for (let h = 0; h <= 12; h++) {
        html += `<span class="tutor-calendar-line" style="top:${h * 48}px"></span>`;
      }

      // Bloques disponibles
      bloquesVisibles.filter((b) => b.fecha === date).forEach((block) => {
        const top = (minutes(block.horaInicio) - 480) * 0.8;
        const height = (minutes(block.horaFin) - minutes(block.horaInicio)) * 0.8;
        html += `<button class="tutor-calendar-block" type="button"
          data-calendar-block="${block.id}"
          style="top:${top}px;height:${height}px"
          aria-label="${escapeHTML(`Bloque disponible ${timeLabel(block.horaInicio)} a ${timeLabel(block.horaFin)}, ${block.modalidad}`)}">
          <strong>${escapeHTML(block.horaInicio)}–${escapeHTML(block.horaFin)}</strong>
          <span>${escapeHTML(block.modalidad)}</span>
        </button>`;
      });

      // Sesiones reservadas
      reservadas.filter((s) => s.date === date).forEach((s) => {
        const top = (minutes(s.start) - 480) * 0.8;
        const height = (minutes(s.end) - minutes(s.start)) * 0.8;
        html += `<button class="tutor-calendar-block reserved" type="button"
          data-detail="${s.id}"
          style="top:${top}px;height:${height}px"
          aria-label="${escapeHTML(`Sesión con ${s.student}, ${timeLabel(s.start)}`)}">
          <strong>${escapeHTML(s.start)}–${escapeHTML(s.end)}</strong>
          <span>Reservada</span>
        </button>`;
      });

      html += `</div>`;
    });

    $("#tutor-calendar").innerHTML = html;

    // Lista de bloques de la semana visible
    const weekBlocks = [...bloquesVisibles]
      .filter((b) => dates.includes(b.fecha))
      .sort((a, b) => `${a.fecha}T${a.horaInicio}`.localeCompare(`${b.fecha}T${b.horaInicio}`));

    $("#tutor-block-list").innerHTML = weekBlocks.length
      ? weekBlocks.map((b) => `
          <li>
            <span>
              <strong>${escapeHTML(formatDate(b.fecha))}</strong><br>
              ${escapeHTML(b.horaInicio)}–${escapeHTML(b.horaFin)}<br>
              ${escapeHTML(b.modalidad)}
            </span>
            <button class="tutor-icon-button" type="button"
              data-delete-block="${b.id}"
              aria-label="${escapeHTML(`Eliminar bloque del ${formatDate(b.fecha)} a las ${b.horaInicio}`)}">
              ${icon("close")}
            </button>
          </li>`).join("")
      : `<li>No hay bloques disponibles en esta semana.</li>`;
  }

  $("#tutor-previous-week").addEventListener("click", () => {
    weekStart = addDays(weekStart, -7);
    renderCalendar();
  });

  $("#tutor-next-week").addEventListener("click", () => {
    weekStart = addDays(weekStart, 7);
    renderCalendar();
  });

  // Horas permitidas: de 08:00 a 20:00, solo en punto y y media.
  function fillHourSelects() {
    const opciones = [];
    for (let m = 480; m <= 1200; m += 30) {
      const valor = `${String(Math.floor(m / 60)).padStart(2, "0")}:${m % 60 === 0 ? "00" : "30"}`;
      opciones.push({ valor, minutos: m, texto: timeLabel(valor) });
    }
    const pintar = (select, lista) => {
      select.innerHTML =
        '<option value="">Selecciona</option>' +
        lista.map((o) => `<option value="${o.valor}">${escapeHTML(o.texto)}</option>`).join("");
    };
    pintar($("#tutor-block-start"), opciones.filter((o) => o.minutos <= 1170)); // hasta 19:30
    pintar($("#tutor-block-end"), opciones.filter((o) => o.minutos >= 510));    // desde 08:30
  }

  // La hora de fin solo permite horas posteriores a la de inicio.
  function updateEndOptions() {
    const inicio = $("#tutor-block-start").value;
    const fin = $("#tutor-block-end");
    Array.from(fin.options).forEach((opt) => {
      opt.disabled = Boolean(inicio && opt.value && minutes(opt.value) <= minutes(inicio));
    });
    if (fin.value && fin.selectedOptions[0]?.disabled) fin.value = "";
  }

  fillHourSelects();
  $("#tutor-block-start").addEventListener("change", updateEndOptions);

  // Solo se ofrece la modalidad que el tutor eligió en su perfil: «Virtual» → Virtual,
  // «Presencial» → Presencial, «Virtual y presencial» → las tres. (La API también lo exige.)
  function modalidadesPermitidas() {
    const m = profile.datos.modalidad;
    return m === "Virtual" || m === "Presencial" ? [m] : ["Virtual", "Presencial", "Virtual y presencial"];
  }

  function pintarModalidadesBloque() {
    const select = $("#tutor-block-mode");
    const permitidas = modalidadesPermitidas();
    select.innerHTML = permitidas.map((m) => `<option>${escapeHTML(m)}</option>`).join("");
    select.disabled = permitidas.length === 1;

    const aviso = $("#tutor-block-mode-hint");
    aviso.hidden = permitidas.length !== 1;
    aviso.textContent = permitidas.length === 1
      ? `Tu perfil es «${permitidas[0]}», así que solo puedes ofrecer bloques ${permitidas[0] === "Virtual" ? "virtuales" : "presenciales"}. `
        + "Para cambiarlo, envía una actualización de tus datos en «Mi perfil»."
      : "";
  }

  $("#tutor-add-block").addEventListener("click", () => {
    $("#tutor-block-form").reset();
    pintarModalidadesBloque();
    updateEndOptions();
    $("#tutor-block-date").value = dateISO(weekStart);
    $("#tutor-block-error").textContent = "";
    $("#tutor-block-dialog").showModal();
  });

  $("#tutor-block-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const newBlock = {
      fecha: $("#tutor-block-date").value,
      horaInicio: $("#tutor-block-start").value,
      horaFin: $("#tutor-block-end").value,
      modalidad: $("#tutor-block-mode").value
    };

    const error = $("#tutor-block-error");
    const start = minutes(newBlock.horaInicio);
    const end = minutes(newBlock.horaFin);

    if (start >= end) {
      error.textContent = "La hora de fin debe ser posterior a la de inicio.";
      return;
    }
    if (start < 480 || end > 1200 || start % 30 !== 0 || end % 30 !== 0) {
      error.textContent = "Usa horarios entre 08:00 y 20:00, en intervalos de 30 minutos.";
      return;
    }

    // Adaptar formato para overlaps (usa .date, .start, .end)
    const newForOverlap = { date: newBlock.fecha, start: newBlock.horaInicio, end: newBlock.horaFin };

    const conflictsBlocks = blocks.some((b) =>
      overlaps(newForOverlap, { date: b.fecha, start: b.horaInicio, end: b.horaFin })
    );
    const conflictsTutorias = tutoriasData
      .filter((t) => t.estado === "programada")
      .map(normalizarTutoria)
      .some((s) => overlaps(newForOverlap, s));

    if (conflictsBlocks || conflictsTutorias) {
      error.textContent = "Ese horario se cruza con un bloque existente o una sesión programada.";
      return;
    }

    // El servidor vuelve a validar el horario (choques, pasado, rango permitido) y
    // devuelve la disponibilidad completa ya actualizada.
    try {
      const respuesta = await api.agregarBloque(newBlock);
      blocks = respuesta.disponibilidad;
      weekStart = mondayOf(parseDate(newBlock.fecha));
      $("#tutor-block-dialog").close();
      renderAll();
      showToast("Bloque guardado.");
    } catch (err) {
      console.error("Error al guardar disponibilidad:", err);
      error.textContent = err?.message || "No se pudo guardar el bloque. Revisa tu conexión.";
    }
  });

  async function deleteBlock(id) {
    if (!window.confirm("¿Eliminar este bloque de disponibilidad?")) return;
    try {
      const respuesta = await api.quitarBloque(id);
      blocks = respuesta.disponibilidad;
      renderAll();
      showToast("Bloque eliminado.");
    } catch (err) {
      console.error("Error al eliminar el bloque:", err);
      showToast(err?.message || "No se pudo eliminar el bloque. Revisa tu conexión.");
    }
  }

  // ----------------------------------------------------------------
  // Perfil real (API)
  // ----------------------------------------------------------------

  function aplicarPerfilTutor() {
    const fullName = `${profile.name} ${profile.lastname}`.trim();
    const avatarText = initials(fullName) || "T";

    $("#tutor-name").value = profile.name;
    $("#tutor-lastname").value = profile.lastname;
    $("#tutor-email").value = profile.email;

    $("#tutor-profile-name").textContent = fullName || "Tutor";
    pintarAvatar($("#tutor-profile-avatar"), profile.photo, avatarText);
    pintarAvatar($("#tutor-top-avatar"), profile.photo, avatarText);
    $("#tutor-top-avatar").setAttribute(
      "aria-label",
      fullName ? `Mi perfil, ${fullName}` : "Mi perfil"
    );
  }

  const profileForm = $("#tutor-profile-form");
  const profileTextFields = [
    $("#tutor-name"),
    $("#tutor-lastname")
  ];

  profileTextFields.forEach((field) => {
    field.addEventListener("input", () => field.setCustomValidity(""));
  });

  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    profileTextFields.forEach((field) => {
      field.value = field.value.trim();
      field.setCustomValidity(
        !field.value || !/\p{L}/u.test(field.value)
          ? "Escribe un texto válido que contenga letras."
          : ""
      );
    });

    if (!profileForm.reportValidity()) return;

    const nota = $("#tutor-profile-note");

    if (!auth.currentUser) {
      if (nota) nota.textContent = "Tu sesión expiró. Vuelve a iniciar sesión.";
      return;
    }

    try {
      // Solo nombre y apellido: los datos profesionales pasan por la solicitud de actualización.
      await api.actualizarPerfil({
        nombre: $("#tutor-name").value,
        apellido: $("#tutor-lastname").value
      });

      profile = {
        ...profile,
        name: $("#tutor-name").value,
        lastname: $("#tutor-lastname").value
      };

      aplicarPerfilTutor();
      renderHome();

      if (nota) nota.textContent = "Cambios guardados en tu perfil.";
      showToast("Perfil actualizado.");
    } catch (error) {
      console.error("Error al guardar perfil:", error);
      const motivo = error?.message || "No se pudo guardar el perfil. Revisa tu conexión.";
      if (nota) nota.textContent = motivo;
      showToast(motivo);
    }
  });

  // ----------------------------------------------------------------
  // Datos profesionales: se piden como solicitud y los aprueba un administrador
  // ----------------------------------------------------------------

  const ETIQUETAS_CAMBIO = {
    titulo: "Carrera o formación", nivelEstudios: "Nivel de estudios", institucion: "Institución",
    materias: "Materias", nivelEnsenanza: "Nivel al que enseñas", experiencia: "Experiencia",
    modalidad: "Modalidad", ciudad: "Ciudad", tarifa: "Tarifa por hora", franjas: "Franjas",
    presentacion: "Presentación", hojaVidaPDF: "Hoja de vida"
  };
  const NIVELES_ESTUDIO = {
    tecnico: "Técnico o tecnólogo", "pregrado-curso": "Pregrado en curso", pregrado: "Pregrado finalizado", posgrado: "Posgrado"
  };
  const NIVELES_ENSENANZA = { secundaria: "Secundaria", universitario: "Universitario", ambos: "Secundaria y universitario" };
  const NOMBRES_FRANJA = { manana: "Mañana", tarde: "Tarde", noche: "Noche" };
  const MAX_PDF_BYTES = 700 * 1024; // el PDF se guarda en la base de datos (máx. 1 MiB por documento)

  const proForm = $("#tutor-professional-form");
  const proError = $("#tutor-professional-error");

  const textoValor = (campo, valor) => {
    if (valor === undefined || valor === null || valor === "" || (Array.isArray(valor) && !valor.length)) return "—";
    switch (campo) {
      case "materias": return valor.map(nombreMateria).join(", ");
      case "franjas": return valor.map((f) => NOMBRES_FRANJA[f] || f).join(", ");
      case "nivelEstudios": return NIVELES_ESTUDIO[valor] || valor;
      case "nivelEnsenanza": return NIVELES_ENSENANZA[valor] || valor;
      case "experiencia": return `${valor} ${Number(valor) === 1 ? "año" : "años"}`;
      case "tarifa": return `$${Number(valor).toLocaleString("es-CO")} COP`;
      case "presentacion": return String(valor).length > 80 ? `${String(valor).slice(0, 80)}…` : String(valor);
      default: return String(valor);
    }
  };

  const fechaCorta = (iso) => {
    const f = new Date(iso);
    return Number.isNaN(f.getTime())
      ? ""
      : f.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
  };

  // Una casilla por materia del catálogo (las de base y las que agregó el administrador).
  // Se conserva lo que la persona ya marcó; si todavía no hay casillas, se marcan las del perfil.
  function pintarMateriasPerfil() {
    const grid = $("#tutor-subjects-grid");
    const existentes = [...grid.querySelectorAll("input")];
    const marcadas = new Set(
      existentes.length ? existentes.filter((i) => i.checked).map((i) => i.value) : (profile.datos.materias || [])
    );
    const catalogo = materiasActuales();
    const extras = (profile.datos.materias || [])
      .filter((id) => !catalogo.some((m) => m.id === id))
      .map((id) => ({ id, nombre: nombreMateria(id) }));

    grid.replaceChildren(...[...catalogo, ...extras].map((materia) => {
      const etiqueta = document.createElement("label");
      etiqueta.className = "tutor-check-option";
      const casilla = document.createElement("input");
      casilla.type = "checkbox";
      casilla.value = materia.id;
      casilla.checked = marcadas.has(materia.id);
      const texto = document.createElement("span");
      texto.textContent = materia.nombre;
      etiqueta.append(casilla, texto);
      return etiqueta;
    }));
  }

  // Carga en el formulario los datos vigentes (los aprobados).
  function llenarFormularioProfesional() {
    const d = profile.datos;
    $("#tutor-degree").value = d.titulo || "";
    $("#tutor-study-level").value = d.nivelEstudios || "";
    $("#tutor-institution").value = d.institucion || "";
    $("#tutor-teach-level").value = d.nivelEnsenanza || "";
    $("#tutor-experience").value = Number.isInteger(d.experiencia) ? String(d.experiencia) : "";
    $("#tutor-modality").value = d.modalidad || "";
    $("#tutor-city").value = d.ciudad || "";
    $("#tutor-rate").value = d.tarifa != null ? String(d.tarifa) : "";
    $("#tutor-presentation").value = d.presentacion || "";
    $("#tutor-cv").value = "";
    $$('input[name="tutor-franja"]').forEach((i) => { i.checked = (d.franjas || []).includes(i.value); });
    $("#tutor-subjects-grid").replaceChildren(); // se vuelven a marcar según el perfil
    pintarMateriasPerfil();
    proError.textContent = "";
    renderEstadoSolicitud();
  }

  function leerFormularioProfesional() {
    return {
      titulo: $("#tutor-degree").value.trim(),
      nivelEstudios: $("#tutor-study-level").value,
      institucion: $("#tutor-institution").value.trim(),
      materias: $$("#tutor-subjects-grid input:checked").map((i) => i.value),
      nivelEnsenanza: $("#tutor-teach-level").value,
      experiencia: Number($("#tutor-experience").value),
      modalidad: $("#tutor-modality").value,
      ciudad: $("#tutor-city").value.trim(),
      tarifa: Number($("#tutor-rate").value),
      franjas: $$('input[name="tutor-franja"]:checked').map((i) => i.value),
      presentacion: $("#tutor-presentation").value.trim()
    };
  }

  // Igual que en el servidor: las listas son conjuntos (el orden no cuenta).
  const clave = (v) => JSON.stringify(Array.isArray(v) ? [...v].sort() : (v ?? null));
  const hayCambios = (nuevos) => Object.keys(nuevos).some((c) => clave(profile.datos[c]) !== clave(nuevos[c]));

  function leerPdf(archivo) {
    return new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onload = () => resolve(lector.result);
      lector.onerror = () => reject(lector.error);
      lector.readAsDataURL(archivo);
    });
  }

  async function cargarSolicitudCambio() {
    try {
      const { solicitud } = await api.solicitudCambio();
      const cambio = !sonIguales(solicitud, solicitudCambio);
      solicitudCambio = solicitud;
      if (cambio) renderEstadoSolicitud();
      return cambio;
    } catch (err) {
      console.warn("No se pudo cargar tu solicitud de actualización:", err);
      return false;
    }
  }

  function renderEstadoSolicitud() {
    const caja = $("#tutor-change-status");
    const cancelar = $("#tutor-change-cancel");
    const s = solicitudCambio;
    cancelar.hidden = !(s && s.estado === "pendiente");

    const faltan = ["modalidad", "nivelEstudios", "nivelEnsenanza", "experiencia"]
      .filter((c) => profile.datos[c] === undefined || profile.datos[c] === "");
    const aviso = faltan.length && profile.email
      ? "<p>Tu perfil se creó antes de que pidiéramos modalidad, niveles y experiencia. "
        + "Complétalos y envía la solicitud para que se guarden (y para que los estudiantes puedan filtrarte por modalidad).</p>"
      : "";

    if (!s) {
      caja.hidden = !aviso;
      caja.className = "tutor-change-status";
      caja.innerHTML = aviso;
      return;
    }

    const cambios = Object.entries(s.cambios || {}).map(([campo, nuevo]) =>
      `<li><strong>${escapeHTML(ETIQUETAS_CAMBIO[campo] || campo)}:</strong> `
      + (campo === "hojaVidaPDF"
          ? escapeHTML(`archivo nuevo «${nuevo}»`)
          : `${escapeHTML(textoValor(campo, profile.datos[campo]))} → ${escapeHTML(textoValor(campo, nuevo))}`)
      + "</li>"
    ).join("");

    const cuando = fechaCorta(s.creadaEn);
    const nota = s.nota ? `<p><strong>Mensaje del administrador:</strong> ${escapeHTML(s.nota)}</p>` : "";
    caja.hidden = false;
    if (s.estado === "pendiente") {
      caja.className = "tutor-change-status is-pending";
      caja.innerHTML = `<p><strong>Solicitud pendiente</strong>${cuando ? ` (enviada el ${escapeHTML(cuando)})` : ""}. `
        + "Un administrador la revisará; hasta entonces se mantienen tus datos actuales. "
        + `Si envías otra, reemplaza a esta.</p><ul>${cambios}</ul>${aviso}`;
    } else if (s.estado === "aprobada") {
      caja.className = "tutor-change-status is-approved";
      caja.innerHTML = `<p><strong>Tu última actualización fue aprobada</strong> y ya está en tu perfil.</p>${nota}${aviso}`;
    } else {
      caja.className = "tutor-change-status is-rejected";
      caja.innerHTML = `<p><strong>Tu última solicitud fue rechazada.</strong> Tu perfil sigue con los datos anteriores.</p>`
        + `<ul>${cambios}</ul>${nota}${aviso}`;
    }
  }

  proForm.addEventListener("input", () => { proError.textContent = ""; });

  proForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    proError.textContent = "";

    // Los textos deben tener letras (no solo números o símbolos).
    ["#tutor-degree", "#tutor-institution", "#tutor-city", "#tutor-presentation"].forEach((sel) => {
      const campo = $(sel);
      campo.value = campo.value.trim();
      campo.setCustomValidity(campo.value && !/\p{L}/u.test(campo.value) ? "Escribe un texto que contenga letras." : "");
    });
    if (!proForm.reportValidity()) return;

    const datos = leerFormularioProfesional();
    if (!datos.materias.length) { proError.textContent = "Selecciona al menos una materia."; return; }
    if (!datos.franjas.length) { proError.textContent = "Selecciona al menos una franja de disponibilidad."; return; }

    const archivo = $("#tutor-cv").files[0];
    if (archivo) {
      if (!/\.pdf$/i.test(archivo.name) || (archivo.type && archivo.type !== "application/pdf")) {
        proError.textContent = "La hoja de vida debe ser un archivo PDF."; return;
      }
      if (archivo.size > MAX_PDF_BYTES) {
        proError.textContent = "El PDF pesa más de 700 KB. Comprímelo e inténtalo de nuevo."; return;
      }
    }
    if (!archivo && !hayCambios(datos)) { proError.textContent = "No cambiaste ningún dato."; return; }

    const boton = $("#tutor-professional-submit");
    boton.disabled = true;
    try {
      if (archivo) {
        datos.hojaVida = { nombreArchivo: archivo.name, tamano: archivo.size, dataURL: await leerPdf(archivo) };
      }
      await api.solicitarCambio(datos);
      $("#tutor-cv").value = "";
      await cargarSolicitudCambio();
      renderEstadoSolicitud();
      showToast("Solicitud enviada. Un administrador la revisará.");
    } catch (err) {
      console.error("No se pudo enviar la solicitud de actualización:", err);
      proError.textContent = err?.message || "No se pudo enviar la solicitud. Revisa tu conexión.";
    } finally {
      boton.disabled = false;
    }
  });

  $("#tutor-change-cancel").addEventListener("click", async () => {
    if (!window.confirm("¿Cancelar tu solicitud de actualización pendiente?")) return;
    try {
      await api.cancelarCambio();
      solicitudCambio = null;
      llenarFormularioProfesional();
      showToast("Solicitud cancelada.");
    } catch (err) {
      console.error("No se pudo cancelar la solicitud:", err);
      showToast(err?.message || "No se pudo cancelar la solicitud. Revisa tu conexión.");
    }
  });

  // Cambiar foto de perfil
  activarSelectorFoto(
    $("#tutor-photo-edit"),
    async (url) => {
      await guardarFotoPerfil(url);
      profile.photo = url;
      aplicarPerfilTutor();
      const nota = $("#tutor-profile-note");
      if (nota) nota.textContent = "Foto de perfil actualizada.";
      showToast("Foto de perfil actualizada.");
    },
    (mensaje) => {
      const nota = $("#tutor-profile-note");
      if (nota) nota.textContent = mensaje;
      showToast(mensaje);
    }
  );

  // ----------------------------------------------------------------
  // API: carga de datos
  // ----------------------------------------------------------------

  async function cargarPerfilTutor() {
    const nota = $("#tutor-profile-note");
    if (nota) nota.textContent = "Cargando tu perfil…";
    try {
      const datos = await api.miPerfil();

      profile = {
        name: datos.nombre || "",
        lastname: datos.apellido || "",
        email: datos.email || auth.currentUser?.email || "",
        photo: datos.fotoURL || "",
        datos // datos profesionales vigentes (los aprobados)
      };

      // Disponibilidad guardada en el perfil del tutor
      if (Array.isArray(datos.disponibilidad)) {
        blocks = datos.disponibilidad;
      }

      aplicarPerfilTutor();
      llenarFormularioProfesional();
      if (nota) {
        nota.textContent = "Nombre, apellido y foto se guardan al instante. Los datos profesionales los aprueba un administrador.";
      }
    } catch (err) {
      console.warn("No se pudo cargar el perfil:", err);
      if (nota) nota.textContent = "No se pudo cargar tu perfil. Revisa tu conexión.";
    }
  }

  // Solo la disponibilidad: el servidor la modifica al completar una tutoría, así que se
  // vuelve a leer sin tocar el formulario del perfil (que la persona puede estar editando).
  async function cargarDisponibilidad() {
    try {
      const datos = await api.miPerfil();
      if (Array.isArray(datos.disponibilidad)) blocks = datos.disponibilidad;
    } catch (err) {
      console.warn("No se pudo actualizar la disponibilidad:", err);
    }
  }

  // Las tres listas llegan ya ordenadas (más reciente primero). Cada función devuelve
  // true si llegaron datos distintos a los que ya había, para repintar solo cuando haga falta.
  async function cargarSolicitudes() {
    try {
      const nuevas = await api.misSolicitudes();
      const cambio = !sonIguales(nuevas, solicitudesData);
      solicitudesData = nuevas;
      return cambio;
    } catch (err) {
      console.warn("No se pudieron cargar las solicitudes:", err);
      return false;
    }
  }

  async function cargarTutorias() {
    try {
      const nuevas = await api.misTutorias();
      const cambio = !sonIguales(nuevas, tutoriasData);
      tutoriasData = nuevas;
      return cambio;
    } catch (err) {
      console.warn("No se pudieron cargar las tutorías:", err);
      return false;
    }
  }

  async function cargarCalificaciones() {
    try {
      const nuevas = await api.misCalificaciones();
      const cambio = !sonIguales(nuevas, calificacionesData);
      calificacionesData = nuevas;
      return cambio;
    } catch (err) {
      console.warn("No se pudieron cargar las calificaciones:", err);
      return false;
    }
  }

  async function cargarTodo() {
    await Promise.all([
      cargarPerfilTutor(),
      cargarSolicitudes(),
      cargarTutorias(),
      cargarCalificaciones(),
      cargarSolicitudCambio(),
      bandeja.cargar(),
      cargarMaterias().then(pintarMateriasPerfil)
    ]);
    renderAll();
    navigate();
  }

  // Sin escuchas en tiempo real: cada 30 s (con la pestaña visible) se vuelven a pedir las
  // tres listas y solo se repinta si algo cambió.
  function sincronizarDatos() {
    if (detenerSondeo) detenerSondeo();
    detenerSondeo = sondear(async () => {
      const estadoAnterior = solicitudCambio?.estado;
      const cambios = await Promise.all([
        cargarSolicitudes(), cargarTutorias(), cargarCalificaciones(), cargarSolicitudCambio(),
        bandeja.cargar() // repinta sola la campana si hay algo nuevo
      ]);

      // Un administrador respondió la solicitud de actualización mientras el panel estaba abierto.
      if (estadoAnterior === "pendiente" && solicitudCambio?.estado !== "pendiente") {
        if (solicitudCambio?.estado === "aprobada") {
          await cargarPerfilTutor(); // trae los datos nuevos y la disponibilidad ya ajustada
          showToast("Un administrador aprobó la actualización de tus datos.");
        } else {
          showToast("Un administrador respondió tu solicitud de actualización. Revisa «Mi perfil».");
        }
        renderAll();
      } else if (cambios.some(Boolean)) {
        renderAll();
      }
    });
  }

  // ----------------------------------------------------------------
  // API: solicitudes y tutorías
  // ----------------------------------------------------------------

  async function aceptarSolicitud(solicitudId) {
    const rawSol = solicitudesData.find((s) => s.id === solicitudId);
    if (!rawSol || rawSol.estado !== "pendiente") return;

    try {
      // La API valida choques de horario y, en una sola transacción, acepta la
      // solicitud, crea la tutoría (con enlace de Jitsi si es virtual) y envía los correos.
      await api.aceptarSolicitud(solicitudId);

      // Recargar desde la API para tener el estado real y el id de la tutoría nueva
      await Promise.all([cargarSolicitudes(), cargarTutorias()]);

      $("#tutor-detail-dialog").close();
      renderAll();
      showToast("Solicitud aceptada. La tutoría quedó programada.");
    } catch (err) {
      console.error("Error al aceptar solicitud:", err);
      showToast(err?.message || "No se pudo aceptar la solicitud. Revisa tu conexión.");
    }
  }

  async function rechazarSolicitud(solicitudId) {
    const rawSol = solicitudesData.find((s) => s.id === solicitudId);
    if (!rawSol || rawSol.estado !== "pendiente") return;

    if (!window.confirm(`¿Rechazar la solicitud de ${rawSol.estudianteNombre}?`)) return;

    try {
      await api.rechazarSolicitud(solicitudId);
      const idx = solicitudesData.findIndex((s) => s.id === solicitudId);
      if (idx >= 0) solicitudesData[idx].estado = "rechazada";

      $("#tutor-detail-dialog").close();
      renderAll();
      showToast("Solicitud rechazada.");
    } catch (err) {
      console.error("Error al rechazar solicitud:", err);
      showToast(err?.message || "No se pudo rechazar la solicitud. Revisa tu conexión.");
    }
  }

  async function actualizarEstadoTutoria(tutoriaId, nuevoEstado) {
    const rawTut = tutoriasData.find((t) => t.id === tutoriaId);
    if (!rawTut || rawTut.estado !== "programada") return;

    const label = nuevoEstado === "completada" ? "completada" : "cancelada";
    if (!window.confirm(`¿Marcar esta tutoría como ${label}?`)) return;

    try {
      if (nuevoEstado === "completada") await api.completarTutoria(tutoriaId);
      else                              await api.cancelarTutoria(tutoriaId);
      const idx = tutoriasData.findIndex((t) => t.id === tutoriaId);
      if (idx >= 0) tutoriasData[idx].estado = nuevoEstado;
      // Al completar, el servidor descuenta ese horario de la disponibilidad del tutor.
      if (nuevoEstado === "completada") await cargarDisponibilidad();

      $("#tutor-detail-dialog").close();
      renderAll();
      showToast(nuevoEstado === "completada"
        ? "Tutoría completada. El estudiante ya puede calificarla."
        : `Tutoría marcada como ${label}.`);
    } catch (err) {
      console.error("Error al actualizar tutoría:", err);
      showToast(err?.message || "No se pudo actualizar la tutoría. Revisa tu conexión.");
    }
  }

  // ----------------------------------------------------------------
  // Acciones delegadas (clicks en contenido generado dinámicamente)
  // ----------------------------------------------------------------

  document.addEventListener("click", (event) => {
    const detailButton = event.target.closest("[data-detail]");
    if (detailButton) {
      openDetail(detailButton.dataset.detail);
      return;
    }

    const requestButton = event.target.closest("[data-request-action]");
    if (requestButton) {
      const { id, requestAction } = requestButton.dataset;
      if (requestAction === "accept") aceptarSolicitud(id);
      else rechazarSolicitud(id);
      return;
    }

    const sessionButton = event.target.closest("[data-session-action]");
    if (sessionButton) {
      const { id, sessionAction } = sessionButton.dataset;
      const estado = sessionAction === "complete" ? "completada" : "cancelada";
      actualizarEstadoTutoria(id, estado);
      return;
    }

    const deleteButton = event.target.closest("[data-delete-block]");
    if (deleteButton) {
      deleteBlock(deleteButton.dataset.deleteBlock);
      return;
    }

    const calendarButton = event.target.closest("[data-calendar-block]");
    if (calendarButton) {
      const block = blocks.find((b) => b.id === calendarButton.dataset.calendarBlock);
      if (block) {
        showToast(
          `${formatDate(block.fecha)} · ${timeLabel(block.horaInicio)}–${timeLabel(block.horaFin)} · ${block.modalidad}. Puedes eliminarlo en la lista de bloques.`
        );
      }
      return;
    }

    const closeButton = event.target.closest("[data-close-dialog]");
    if (closeButton) closeButton.closest("dialog").close();
  });

  // ----------------------------------------------------------------
  // Teclado: Escape y contención del foco en menú móvil
  // ----------------------------------------------------------------

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setNotificationMenu(false);
      if (sidebar.classList.contains("is-open")) setMenu(false, true);
    }

    if (event.key !== "Tab" || !sidebar.classList.contains("is-open")) return;

    const focusable = [...sidebar.querySelectorAll("a[href], button:not([disabled])")]
      .filter((el) => el.getClientRects().length > 0);

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  // ----------------------------------------------------------------
  // Render general
  // ----------------------------------------------------------------

  function renderAll() {
    renderHome();
    renderRequests();
    renderSessions();
    renderCalendar();
    renderNotifications();
    renderCalificaciones();
  }

  // Render inicial con datos vacíos mientras carga la API
  renderAll();
  navigate();

  // ----------------------------------------------------------------
  // Autenticación: punto de entrada principal
  // ----------------------------------------------------------------

  onAuthStateChanged(auth, async (usuario) => {
    if (usuario) {
      await cargarTodo();
      sincronizarDatos();
    } else if (detenerSondeo) {
      detenerSondeo();
      detenerSondeo = null;
    }
  });
})();
