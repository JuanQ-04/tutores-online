// js/tutor.js — Panel del tutor
// Perfil, Solicitudes, Tutorías y Disponibilidad conectados a Firestore.
// Notificaciones siguen con datos de demostración.

import { auth, db } from "./firebase-config.js";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  // ----------------------------------------------------------------
  // Estado global de la aplicación
  // ----------------------------------------------------------------

  let solicitudesData = []; // documentos crudos de la colección "solicitudes"
  let tutoriasData = [];    // documentos crudos de la colección "tutorias"
  let blocks = [];          // disponibilidad, sincronizada con Firestore
  let tutorUid = null;      // uid del tutor autenticado

  const notifications = [
    {
      title: "Bienvenido al panel",
      message: "Carga lista. Solicitudes y tutorías se leen desde tu cuenta."
    }
  ];

  // Perfil real (Firestore). Comienza vacío; se llena al cargar la página.
  let profile = {
    name: "",
    lastname: "",
    email: "",
    city: "",
    rate: "",
    presentation: ""
  };

  const titles = {
    inicio: "Inicio",
    solicitudes: "Solicitudes",
    disponibilidad: "Disponibilidad",
    tutorias: "Mis tutorías",
    notificaciones: "Notificaciones",
    perfil: "Mi perfil"
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
  // Normalización: Firestore → formato interno de render
  // ----------------------------------------------------------------

  // Convierte el campo "fecha" de Firestore (puede ser Timestamp, Date o string ISO)
  // a una cadena "YYYY-MM-DD" que usan las funciones de render.
  function tsToISO(fecha) {
    if (!fecha) return dateISO(new Date());
    if (typeof fecha.toDate === "function") return dateISO(fecha.toDate());
    if (fecha instanceof Date) return dateISO(fecha);
    if (typeof fecha === "string") return fecha.slice(0, 10);
    return dateISO(new Date());
  }

  // Mapea estados Firestore → clases CSS que ya existen en el panel.
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
      tarifa: raw.tarifa || 0
    };
  }

  // ----------------------------------------------------------------
  // Utilidades de UI
  // ----------------------------------------------------------------

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<​": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
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
  // Notificaciones (UI — datos de demostración)
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

  function renderNotifications() {
    function notificationHTML(item) {
      return `<li><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.message)}</p></li>`;
    }
    $("#tutor-notification-preview").innerHTML = notifications.slice(0, 3).map(notificationHTML).join("");
    $("#tutor-notification-full").innerHTML = notifications.map(notificationHTML).join("");
    const count = $("#tutor-notification-count");
    count.textContent = notifications.length;
    count.hidden = notifications.length === 0;
    notificationToggle.setAttribute(
      "aria-label",
      `Notificaciones, ${notifications.length} novedades`
    );
  }

  function addNotification(title, message) {
    notifications.unshift({ title, message });
    renderNotifications();
  }

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
          <dt>Tarifa</dt><dd>$${t.tarifa.toLocaleString("es-CO")} / hora</dd>
          <dt>Estado</dt><dd>${statusLabels[t.status]}</dd>
        </dl>
        ${t.message ? `<p class="tutor-muted">"${escapeHTML(t.message)}"</p>` : ""}
        <div class="tutor-detail-actions">${actions}</div>`;
      $("#tutor-detail-dialog").showModal();
    }
  }

  // ----------------------------------------------------------------
  // Sección: Disponibilidad (calendario semanal)
  // ----------------------------------------------------------------

  // Los blocks usan { id, fecha, horaInicio, horaFin, modalidad }
  // (mismo esquema que se guarda en Firestore)

  function renderCalendar() {
    const dates = dayNames.map((_, i) => dateISO(addDays(weekStart, i)));
    const lastDay = addDays(weekStart, 6);

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
      blocks.filter((b) => b.fecha === date).forEach((block) => {
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
    const weekBlocks = [...blocks]
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

  $("#tutor-add-block").addEventListener("click", () => {
    $("#tutor-block-form").reset();
    $("#tutor-block-date").value = dateISO(weekStart);
    $("#tutor-block-error").textContent = "";
    $("#tutor-block-dialog").showModal();
  });

  $("#tutor-block-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const newBlock = {
      id: `block-${Date.now()}`,
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

    blocks.push(newBlock);
    weekStart = mondayOf(parseDate(newBlock.fecha));
    $("#tutor-block-dialog").close();

    await guardarDisponibilidad();
    renderAll();
    showToast("Bloque guardado.");
  });

  async function deleteBlock(id) {
    if (!window.confirm("¿Eliminar este bloque de disponibilidad?")) return;
    blocks = blocks.filter((b) => b.id !== id);
    await guardarDisponibilidad();
    renderAll();
    showToast("Bloque eliminado.");
  }

  // ----------------------------------------------------------------
  // Perfil real (Firestore)
  // ----------------------------------------------------------------

  function aplicarPerfilTutor() {
    const fullName = `${profile.name} ${profile.lastname}`.trim();
    const avatarText = initials(fullName) || "T";

    $("#tutor-name").value = profile.name;
    $("#tutor-lastname").value = profile.lastname;
    $("#tutor-email").value = profile.email;
    $("#tutor-city").value = profile.city;
    $("#tutor-rate").value = profile.rate;
    $("#tutor-presentation").value = profile.presentation;

    $("#tutor-profile-name").textContent = fullName || "Tutor";
    $("#tutor-profile-avatar").textContent = avatarText;
    $("#tutor-top-avatar").textContent = avatarText;
    $("#tutor-top-avatar").setAttribute(
      "aria-label",
      fullName ? `Mi perfil, ${fullName}` : "Mi perfil"
    );
  }

  const profileForm = $("#tutor-profile-form");
  const profileTextFields = [
    $("#tutor-name"),
    $("#tutor-lastname"),
    $("#tutor-city"),
    $("#tutor-presentation")
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

    const tarifa = Number($("#tutor-rate").value) || 0;
    const nota = $("#tutor-profile-note");
    const usuario = auth.currentUser;

    if (!usuario) {
      if (nota) nota.textContent = "Tu sesión expiró. Vuelve a iniciar sesión.";
      return;
    }

    try {
      await updateDoc(doc(db, "usuarios", usuario.uid), {
        nombre: $("#tutor-name").value,
        apellido: $("#tutor-lastname").value,
        ciudad: $("#tutor-city").value,
        tarifa,
        presentacion: $("#tutor-presentation").value
      });

      profile = {
        name: $("#tutor-name").value,
        lastname: $("#tutor-lastname").value,
        email: profile.email,
        city: $("#tutor-city").value,
        rate: String(tarifa),
        presentation: $("#tutor-presentation").value
      };

      aplicarPerfilTutor();
      renderHome();

      if (nota) nota.textContent = "Cambios guardados en tu perfil.";
      showToast("Perfil actualizado.");
    } catch (error) {
      console.error("Error al guardar perfil:", error);
      if (nota) nota.textContent = "No se pudo guardar el perfil. Revisa tu conexión.";
      showToast("No se pudo guardar el perfil.");
    }
  });

  // ----------------------------------------------------------------
  // Firestore: carga de datos
  // ----------------------------------------------------------------

  async function cargarPerfilTutor(uid) {
    const nota = $("#tutor-profile-note");
    if (nota) nota.textContent = "Cargando tu perfil…";
    try {
      const snap = await getDoc(doc(db, "usuarios", uid));
      const datos = snap.exists() ? snap.data() : {};

      profile = {
        name: datos.nombre || "",
        lastname: datos.apellido || "",
        email: datos.email || auth.currentUser?.email || "",
        city: datos.ciudad || "",
        rate: datos.tarifa != null ? String(datos.tarifa) : "",
        presentation: datos.presentacion || ""
      };

      // Disponibilidad guardada en el documento del tutor
      if (Array.isArray(datos.disponibilidad)) {
        blocks = datos.disponibilidad;
      }

      aplicarPerfilTutor();
      if (nota) nota.textContent = "Tu perfil se carga desde tu cuenta. Los cambios se guardan en tu perfil.";
    } catch (err) {
      console.warn("No se pudo cargar el perfil:", err);
      if (nota) nota.textContent = "No se pudo cargar tu perfil. Revisa tu conexión.";
    }
  }

  async function cargarSolicitudes(uid) {
    try {
      const q = query(collection(db, "solicitudes"), where("tutorId", "==", uid));
      const snap = await getDocs(q);
      solicitudesData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Ordenar en el cliente: más reciente primero
      solicitudesData.sort((a, b) => {
        const ta = a.creadaEn?.toMillis?.() ?? 0;
        const tb = b.creadaEn?.toMillis?.() ?? 0;
        return tb - ta;
      });
    } catch (err) {
      console.warn("No se pudieron cargar las solicitudes:", err);
    }
  }

  async function cargarTutorias(uid) {
    try {
      const q = query(collection(db, "tutorias"), where("tutorId", "==", uid));
      const snap = await getDocs(q);
      tutoriasData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Ordenar en el cliente: más reciente primero
      tutoriasData.sort((a, b) => {
        const ta = a.creadaEn?.toMillis?.() ?? 0;
        const tb = b.creadaEn?.toMillis?.() ?? 0;
        return tb - ta;
      });
    } catch (err) {
      console.warn("No se pudieron cargar las tutorías:", err);
    }
  }

  async function cargarTodo(uid) {
    tutorUid = uid;
    await Promise.all([
      cargarPerfilTutor(uid),
      cargarSolicitudes(uid),
      cargarTutorias(uid)
    ]);
    renderAll();
    navigate();
  }

  // ----------------------------------------------------------------
  // Firestore: escritura de solicitudes y tutorías
  // ----------------------------------------------------------------

  async function aceptarSolicitud(solicitudId) {
    const rawSol = solicitudesData.find((s) => s.id === solicitudId);
    if (!rawSol || rawSol.estado !== "pendiente") return;

    // Verificar conflicto con tutorías programadas
    const sol = normalizarSolicitud(rawSol);
    const conflicto = tutoriasData
      .filter((t) => t.estado === "programada")
      .map(normalizarTutoria)
      .some((t) => overlaps(sol, t));

    if (conflicto) {
      showToast("No puedes aceptar: ya tienes una tutoría programada en ese horario.");
      return;
    }

    try {
      const batch = writeBatch(db);

      // 1. Actualizar solicitud → aceptada
      batch.update(doc(db, "solicitudes", solicitudId), { estado: "aceptada" });

      // 2. Crear tutoría
      const tutoriaRef = doc(collection(db, "tutorias"));
      batch.set(tutoriaRef, {
        solicitudId,
        tutorId: rawSol.tutorId,
        estudianteId: rawSol.estudianteId,
        estudianteNombre: rawSol.estudianteNombre,
        materia: rawSol.materia,
        fecha: rawSol.fecha,
        horaInicio: rawSol.horaInicio,
        horaFin: rawSol.horaFin,
        modalidad: rawSol.modalidad,
        tarifa: rawSol.tarifa || 0,
        estado: "programada",
        enlaceReunion: "",
        calificacion: null,
        comentario: "",
        creadaEn: serverTimestamp()
      });

      await batch.commit();

      // Actualizar estado local
      const idx = solicitudesData.findIndex((s) => s.id === solicitudId);
      if (idx >= 0) solicitudesData[idx].estado = "aceptada";

      // Recargar tutorías desde Firestore para tener el id real del nuevo doc
      await cargarTutorias(tutorUid);

      $("#tutor-detail-dialog").close();
      addNotification("Solicitud aceptada", `Aceptaste la solicitud de ${rawSol.estudianteNombre}.`);
      renderAll();
      showToast("Solicitud aceptada. La tutoría quedó programada.");
    } catch (err) {
      console.error("Error al aceptar solicitud:", err);
      showToast("No se pudo aceptar la solicitud. Revisa tu conexión.");
    }
  }

  async function rechazarSolicitud(solicitudId) {
    const rawSol = solicitudesData.find((s) => s.id === solicitudId);
    if (!rawSol || rawSol.estado !== "pendiente") return;

    if (!window.confirm(`¿Rechazar la solicitud de ${rawSol.estudianteNombre}?`)) return;

    try {
      await updateDoc(doc(db, "solicitudes", solicitudId), { estado: "rechazada" });
      const idx = solicitudesData.findIndex((s) => s.id === solicitudId);
      if (idx >= 0) solicitudesData[idx].estado = "rechazada";

      $("#tutor-detail-dialog").close();
      addNotification("Solicitud rechazada", `Rechazaste la solicitud de ${rawSol.estudianteNombre}.`);
      renderAll();
      showToast("Solicitud rechazada.");
    } catch (err) {
      console.error("Error al rechazar solicitud:", err);
      showToast("No se pudo rechazar la solicitud. Revisa tu conexión.");
    }
  }

  async function actualizarEstadoTutoria(tutoriaId, nuevoEstado) {
    const rawTut = tutoriasData.find((t) => t.id === tutoriaId);
    if (!rawTut || rawTut.estado !== "programada") return;

    const label = nuevoEstado === "completada" ? "completada" : "cancelada";
    if (!window.confirm(`¿Marcar esta tutoría como ${label}?`)) return;

    try {
      await updateDoc(doc(db, "tutorias", tutoriaId), { estado: nuevoEstado });
      const idx = tutoriasData.findIndex((t) => t.id === tutoriaId);
      if (idx >= 0) tutoriasData[idx].estado = nuevoEstado;

      $("#tutor-detail-dialog").close();
      addNotification(
        `Tutoría ${label}`,
        `Actualizaste la tutoría con ${rawTut.estudianteNombre}.`
      );
      renderAll();
      showToast(`Tutoría marcada como ${label}.`);
    } catch (err) {
      console.error("Error al actualizar tutoría:", err);
      showToast("No se pudo actualizar la tutoría. Revisa tu conexión.");
    }
  }

  async function guardarDisponibilidad() {
    if (!tutorUid) return;
    try {
      await updateDoc(doc(db, "usuarios", tutorUid), { disponibilidad: blocks });
    } catch (err) {
      console.error("Error al guardar disponibilidad:", err);
      showToast("No se pudo guardar la disponibilidad. Revisa tu conexión.");
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
  }

  // Render inicial con datos vacíos mientras carga Firestore
  renderAll();
  navigate();

  // ----------------------------------------------------------------
  // Autenticación: punto de entrada principal
  // ----------------------------------------------------------------

  onAuthStateChanged(auth, async (usuario) => {
    if (usuario) {
      await cargarTodo(usuario.uid);
    }
  });
})();