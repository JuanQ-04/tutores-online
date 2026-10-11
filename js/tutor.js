// js/tutor.js — Interfaz del tutor, sin Firebase
(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  // Datos de demostración. No representan un esquema de Firestore.
  const sessions = [
    {
      id: "demo-sofia",
      student: "Sofía Pérez",
      subject: "Matemáticas",
      date: "2026-08-26",
      start: "16:00",
      end: "17:00",
      mode: "Virtual",
      status: "confirmed",
      isRequest: false,
      message: "Me gustaría repasar ecuaciones y practicar ejercicios."
    },
    {
      id: "demo-sofia-request",
      student: "Sofía Pérez",
      subject: "Física",
      date: "2026-08-28",
      start: "18:30",
      end: "19:30",
      mode: "Virtual",
      status: "pending",
      isRequest: true,
      message: "Me gustaría repasar los temas que vimos en clase y preparar el próximo examen."
    },
    {
      id: "demo-andres",
      student: "Andrés López",
      subject: "Matemáticas",
      date: "2026-08-29",
      start: "10:00",
      end: "11:00",
      mode: "Virtual",
      status: "pending",
      isRequest: true,
      message: "Quiero practicar problemas y resolver algunas dudas."
    },
    {
      id: "demo-laura",
      student: "Laura Gómez",
      subject: "Cálculo",
      date: "2026-09-02",
      start: "17:00",
      end: "18:00",
      mode: "Virtual",
      status: "pending",
      isRequest: true,
      message: "Necesito apoyo para repasar derivadas antes de mi evaluación."
    },
    {
      id: "demo-ines",
      student: "Inés Morales",
      subject: "Inglés conversacional",
      date: "2026-08-19",
      start: "15:00",
      end: "16:00",
      mode: "Presencial",
      status: "completed",
      isRequest: false,
      message: "Práctica de conversación y vocabulario."
    }
  ];

  let blocks = [
    {
      id: "block-monday",
      date: "2026-08-24",
      start: "09:00",
      end: "11:00",
      mode: "Virtual"
    },
    {
      id: "block-tuesday",
      date: "2026-08-25",
      start: "10:00",
      end: "14:00",
      mode: "Virtual y presencial"
    },
    {
      id: "block-wednesday",
      date: "2026-08-26",
      start: "14:00",
      end: "16:00",
      mode: "Virtual"
    },
    {
      id: "block-friday",
      date: "2026-08-28",
      start: "15:00",
      end: "17:00",
      mode: "Presencial"
    }
  ];

  const notifications = [
    {
      title: "Solicitudes por responder",
      message: "Revisa las solicitudes de demostración en la sección Solicitudes."
    },
    {
      title: "Sesión confirmada",
      message: "Tienes una sesión de ejemplo con Sofía Pérez."
    }
  ];

  const profile = {
    name: "María",
    lastname: "Rodríguez"
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
  let weekStart = parseDate("2026-08-24");
  let toastTimer;

  // Utilidades
  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<​": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function icon(name) {
    return `<svg class="icon" aria-hidden="true">
      <use href="#t-${name}"></use>
    </svg>`;
  }

  function initials(name) {
    return name.trim().split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  }

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

  function formatTime(value) {
    return parseDate("2026-08-24")
      .toLocaleTimeString("es-CO", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true
      });
  }

  // La hora se convierte por separado para no depender del texto de la fecha.
  function timeLabel(value) {
    const date = new Date(2026, 7, 24, 0, 0, 0);
    const [hours, minutes] = value.split(":").map(Number);
    date.setHours(hours, minutes);

    return date.toLocaleTimeString("es-CO", {
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

  function showToast(message) {
    const toast = $("#tutor-toast");
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 5000);
  }

  function empty(message) {
    return `<p class="tutor-empty">${escapeHTML(message)}</p>`;
  }

  // Menú móvil
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
    menuToggle.setAttribute(
      "aria-label",
      shouldOpen ? "Cerrar menú" : "Abrir menú"
    );

    if (shouldOpen) {
      $(".sidebar-close").focus();
    } else if (restoreFocus && mobileQuery.matches) {
      menuToggle.focus();
    }
  }

  menuToggle.addEventListener("click", () => {
    setMenu(!sidebar.classList.contains("is-open"));
  });

  $(".sidebar-close").addEventListener("click", () => setMenu(false, true));
  overlay.addEventListener("click", () => setMenu(false, true));
  mobileQuery.addEventListener("change", () => setMenu(false));

  // Navegación por hash
  function navigate() {
    const requested = window.location.hash.slice(1);
    const id = Object.hasOwn(titles, requested) ? requested : "inicio";
    const changed = currentSection !== id;

    if (changed && currentSection) {
      previousSection = currentSection;
    }

    currentSection = id;

    $$(".dashboard-main > section[id]").forEach((section) => {
      section.hidden = section.id !== id;
    });

    sidebarLinks.forEach((link) => {
      if (link.getAttribute("href") === `#${id}`) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
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

  // Avisos de las secciones pendientes
  $$("[data-pending]").forEach((button) => {
    button.addEventListener("click", () => {
      showToast(`${button.dataset.pending} se implementará más adelante.`);
    });
  });

  // Notificaciones
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
    if (!event.target.closest(".tutor-notification-widget")) {
      setNotificationMenu(false);
    }
  });

  $("#tutor-notifications-back").addEventListener("click", () => {
    window.location.hash =
      previousSection === "notificaciones" ? "inicio" : previousSection;
  });

  function renderNotifications() {
    function notificationHTML(item) {
      return `<li>
        <h3>${escapeHTML(item.title)}</h3>
        <p>${escapeHTML(item.message)}</p>
      </li>`;
    }

    $("#tutor-notification-preview").innerHTML =
      notifications.slice(0, 3).map(notificationHTML).join("");

    $("#tutor-notification-full").innerHTML =
      notifications.map(notificationHTML).join("");

    const count = $("#tutor-notification-count");
    count.textContent = notifications.length;
    count.hidden = notifications.length === 0;

    notificationToggle.setAttribute(
      "aria-label",
      `Notificaciones, ${notifications.length} novedades de demostración`
    );
  }

  function addNotification(title, message) {
    notifications.unshift({ title, message });
    renderNotifications();
  }

  // Tarjetas y listas de sesiones
  function sessionHTML(session) {
    const modalityIcon = session.mode === "Presencial" ? "pin" : "video";

    return `<button
      class="tutor-session-item"
      type="button"
      data-detail="${escapeHTML(session.id)}"
    >
      <span class="tutor-session-main">
        <span class="tutor-initials" aria-hidden="true">
          ${escapeHTML(initials(session.student))}
        </span>
        <span class="tutor-session-info">
          <span class="tutor-session-subject">${escapeHTML(session.subject)}</span>
          <span class="tutor-session-title">
            Sesión con ${escapeHTML(session.student)}
          </span>
          <span class="tutor-session-meta">
            <span>${icon("calendar")}${escapeHTML(formatDate(session.date))}</span>
            <span>${icon("clock")}${escapeHTML(timeLabel(session.start))}</span>
            <span>${icon(modalityIcon)}${escapeHTML(session.mode)}</span>
          </span>
        </span>
      </span>
      <span class="tutor-session-side">
        <span class="tutor-status ${session.status}">
          ${statusLabels[session.status]}
        </span>
        ${icon("chevron")}
      </span>
    </button>`;
  }

  function sortedSessions(items) {
    return [...items].sort((first, second) =>
      `${first.date}T${first.start}`.localeCompare(`${second.date}T${second.start}`)
    );
  }

  function renderSessions() {
    const filtered = sortedSessions(
      sessions.filter((session) => session.status === sessionFilter)
    );

    $("#tutor-session-list").innerHTML = filtered.length
      ? filtered.map(sessionHTML).join("")
      : empty("No hay tutorías de ejemplo con este estado.");

    $$("[data-session-status]").forEach((button) => {
      const active = button.dataset.sessionStatus === sessionFilter;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    $$("[data-session-count]").forEach((count) => {
      count.textContent = sessions.filter(
        (session) => session.status === count.dataset.sessionCount
      ).length;
    });
  }

  $$("[data-session-status]").forEach((button) => {
    button.addEventListener("click", () => {
      sessionFilter = button.dataset.sessionStatus;
      renderSessions();
    });
  });

  // Solicitudes
  function requestHTML(session) {
    let actions = "";

    if (session.status === "pending") {
      actions = `
        <button class="tutor-button is-outline" type="button"
          data-request-action="reject" data-id="${session.id}">
          Rechazar
        </button>
        <button class="tutor-button" type="button"
          data-request-action="accept" data-id="${session.id}">
          ${icon("check")}Aceptar
        </button>`;
    }

    return `<article class="tutor-request-card">
      <div class="tutor-request-header">
        <span class="tutor-initials" aria-hidden="true">
          ${escapeHTML(initials(session.student))}
        </span>
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

      <p class="tutor-request-message">“${escapeHTML(session.message)}”</p>

      <div class="tutor-request-actions">
        ${actions}
        <button class="tutor-icon-button" type="button"
          data-detail="${session.id}"
          aria-label="Ver detalle de la solicitud de ${escapeHTML(session.student)}">
          ${icon("chevron")}
        </button>
      </div>
    </article>`;
  }

  function renderRequests() {
    const search = normalize($("#tutor-request-search").value);
    const status = $("#tutor-request-status").value;

    const filtered = sessions.filter((session) => {
      return session.isRequest
        && (status === "all" || session.status === status)
        && normalize(`${session.student} ${session.subject}`).includes(search);
    });

    $("#tutor-request-grid").innerHTML = filtered.length
      ? sortedSessions(filtered).map(requestHTML).join("")
      : empty("No hay solicitudes que coincidan con estos filtros.");
  }

  $("#tutor-request-search").addEventListener("input", renderRequests);
  $("#tutor-request-status").addEventListener("change", renderRequests);

  function updateRequest(id, action) {
    const session = sessions.find((item) => item.id === id);
    if (!session || session.status !== "pending") return;

    if (action === "accept") {
      const conflict = sessions.some((other) =>
        other.id !== id
        && other.status === "confirmed"
        && overlaps(session, other)
      );

      if (conflict) {
        showToast("No puedes aceptar: ya tienes una sesión confirmada en ese horario.");
        return;
      }

      session.status = "confirmed";
      addNotification(
        "Solicitud aceptada",
        `Aceptaste la solicitud de ${session.student} en esta demostración.`
      );
      showToast("Solicitud aceptada en la demostración.");
    } else {
      if (!window.confirm(`¿Rechazar la solicitud de ${session.student}?`)) return;

      session.status = "cancelled";
      addNotification(
        "Solicitud rechazada",
        `Rechazaste la solicitud de ${session.student} en esta demostración.`
      );
      showToast("Solicitud rechazada en la demostración.");
    }

    $("#tutor-detail-dialog").close();
    renderAll();
  }

  // Inicio
  function renderHome() {
    const pending = sessions.filter((session) => session.status === "pending");
    const confirmed = sortedSessions(
      sessions.filter((session) => session.status === "confirmed")
    );

    $("#tutor-home-title").textContent = `Hola, ${profile.name}`;
    $("#tutor-home-description").textContent =
      `Tienes ${pending.length} solicitudes por responder en esta demostración.`;

    $("#tutor-stat-requests").textContent = pending.length;

    const next = confirmed[0];
    $("#tutor-stat-next").textContent = next
      ? `${formatDate(next.date)} · ${timeLabel(next.start)}`
      : "—";
    $("#tutor-stat-subject").textContent = next
      ? next.subject
      : "Sin sesiones confirmadas";

    $("#tutor-recent-requests").innerHTML = pending.length
      ? pending.slice(0, 2).map((session) => `
        <button class="tutor-recent-row" type="button" data-detail="${session.id}">
          <span class="tutor-initials" aria-hidden="true">
            ${escapeHTML(initials(session.student))}
          </span>
          <span class="tutor-recent-info">
            <strong>${escapeHTML(session.student)}</strong>
            <small>
              ${escapeHTML(session.subject)} ·
              ${escapeHTML(formatDate(session.date))} ·
              ${escapeHTML(timeLabel(session.start))}
            </small>
          </span>
          <span class="tutor-status pending">Nueva</span>
          ${icon("chevron")}
        </button>`).join("")
      : empty("No tienes solicitudes por responder.");

    $("#tutor-home-sessions").innerHTML = confirmed.length
      ? confirmed.slice(0, 3).map(sessionHTML).join("")
      : empty("No tienes sesiones confirmadas.");

    // Resumen de la semana inicial de demostración.
    const summaryStart = parseDate("2026-08-24");
    const hours = dayNames.map((_, index) => {
      const day = dateISO(addDays(summaryStart, index));
      return blocks
        .filter((block) => block.date === day)
        .reduce((total, block) =>
          total + (minutes(block.end) - minutes(block.start)) / 60, 0);
    });

    const maximum = Math.max(...hours, 1);

    $("#tutor-week-summary").innerHTML = hours.map((value, index) => `
      <div class="tutor-week-day">
        <span>${dayNames[index]}</span>
        <span class="tutor-mini-track" aria-hidden="true">
          <span style="height:${value / maximum * 100}%"></span>
        </span>
        <strong>${value} h</strong>
      </div>`).join("");

    const total = hours.reduce((sum, value) => sum + value, 0);
    $("#tutor-hours-summary").textContent =
      `Tienes ${total} horas en bloques disponibles durante la semana de ejemplo del 24 de agosto.`;
  }

  // Detalle de sesión
  function openDetail(id) {
    const session = sessions.find((item) => item.id === id);
    if (!session) return;

    let actions = "";

    if (session.status === "pending") {
      actions = `
        <button class="tutor-button is-outline" type="button"
          data-request-action="reject" data-id="${session.id}">
          Rechazar
        </button>
        <button class="tutor-button" type="button"
          data-request-action="accept" data-id="${session.id}">
          Aceptar solicitud
        </button>`;
    } else if (session.status === "confirmed") {
      actions = `
        <button class="tutor-button" type="button"
          data-session-action="complete" data-id="${session.id}">
          Marcar completada
        </button>
        <button class="tutor-button is-danger" type="button"
          data-session-action="cancel" data-id="${session.id}">
          Cancelar sesión
        </button>`;
    }

    $("#tutor-detail-content").innerHTML = `
      <dl class="tutor-detail-list">
        <dt>Estudiante</dt><dd>${escapeHTML(session.student)}</dd>
        <dt>Materia</dt><dd>${escapeHTML(session.subject)}</dd>
        <dt>Fecha</dt><dd>${escapeHTML(formatDate(session.date))}</dd>
        <dt>Horario</dt>
        <dd>${escapeHTML(timeLabel(session.start))} – ${escapeHTML(timeLabel(session.end))}</dd>
        <dt>Modalidad</dt><dd>${escapeHTML(session.mode)}</dd>
        <dt>Estado</dt><dd>${statusLabels[session.status]}</dd>
      </dl>
      <p class="tutor-muted">${escapeHTML(session.message)}</p>
      <p class="tutor-muted">Acciones de demostración: no se envían avisos reales al estudiante.</p>
      <div class="tutor-detail-actions">${actions}</div>`;

    $("#tutor-detail-dialog").showModal();
  }

  // Calendario semanal
  function renderCalendar() {
    const dates = dayNames.map((_, index) => dateISO(addDays(weekStart, index)));
    const lastDay = addDays(weekStart, 6);

    $("#tutor-week-title").textContent =
      `${weekStart.getDate()}–${lastDay.getDate()} · `
      + lastDay.toLocaleDateString("es-CO", {
        month: "long",
        year: "numeric"
      });

    let html = `<div class="tutor-calendar-heading">Hora</div>`;

    dates.forEach((date, index) => {
      html += `<div class="tutor-calendar-heading">
        ${dayNames[index]} ${parseDate(date).getDate()}
      </div>`;
    });

    html += `<div class="tutor-calendar-times">`;
    for (let hour = 8; hour < 20; hour += 2) {
      html += `<span style="top:${(hour - 8) * 48 + 3}px">
        ${escapeHTML(timeLabel(`${String(hour).padStart(2, "0")}:00`))}
      </span>`;
    }
    html += `</div>`;

    dates.forEach((date) => {
      html += `<div class="tutor-calendar-day">`;

      for (let hour = 0; hour <= 12; hour++) {
        html += `<span class="tutor-calendar-line" style="top:${hour * 48}px"></span>`;
      }

      const available = blocks.filter((block) => block.date === date);
      const reserved = sessions.filter((session) =>
        session.date === date && session.status === "confirmed"
      );

      available.forEach((block) => {
        const top = (minutes(block.start) - 480) * 0.8;
        const height = (minutes(block.end) - minutes(block.start)) * 0.8;

        html += `<button class="tutor-calendar-block" type="button"
          data-calendar-block="${block.id}"
          style="top:${top}px;height:${height}px"
          aria-label="${escapeHTML(`Bloque disponible ${timeLabel(block.start)} a ${timeLabel(block.end)}, ${block.mode}`)}">
          <strong>${escapeHTML(block.start)}–${escapeHTML(block.end)}</strong>
          <span>${escapeHTML(block.mode)}</span>
        </button>`;
      });

      reserved.forEach((session) => {
        const top = (minutes(session.start) - 480) * 0.8;
        const height = (minutes(session.end) - minutes(session.start)) * 0.8;

        html += `<button class="tutor-calendar-block reserved" type="button"
          data-detail="${session.id}"
          style="top:${top}px;height:${height}px"
          aria-label="${escapeHTML(`Sesión reservada con ${session.student}, ${timeLabel(session.start)}`)}">
          <strong>${escapeHTML(session.start)}–${escapeHTML(session.end)}</strong>
          <span>Reservada</span>
        </button>`;
      });

      html += `</div>`;
    });

    $("#tutor-calendar").innerHTML = html;

    const weekBlocks = [...blocks]
      .filter((block) => dates.includes(block.date))
      .sort((first, second) =>
        `${first.date}T${first.start}`.localeCompare(`${second.date}T${second.start}`)
      );

    $("#tutor-block-list").innerHTML = weekBlocks.length
      ? weekBlocks.map((block) => `
        <li>
          <span>
            <strong>${escapeHTML(formatDate(block.date))}</strong><br>
            ${escapeHTML(block.start)}–${escapeHTML(block.end)}<br>
            ${escapeHTML(block.mode)}
          </span>
          <button class="tutor-icon-button" type="button"
            data-delete-block="${block.id}"
            aria-label="${escapeHTML(`Eliminar bloque del ${formatDate(block.date)} a las ${block.start}`)}">
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

  $("#tutor-block-form").addEventListener("submit", (event) => {
    event.preventDefault();

    const newBlock = {
      id: `block-${Date.now()}`,
      date: $("#tutor-block-date").value,
      start: $("#tutor-block-start").value,
      end: $("#tutor-block-end").value,
      mode: $("#tutor-block-mode").value
    };

    const error = $("#tutor-block-error");
    const start = minutes(newBlock.start);
    const end = minutes(newBlock.end);

    if (start >= end) {
      error.textContent = "La hora de fin debe ser posterior a la de inicio.";
      return;
    }

    if (start < 480 || end > 1200 || start % 30 !== 0 || end % 30 !== 0) {
      error.textContent = "Usa horarios entre 08:00 y 20:00, en intervalos de 30 minutos.";
      return;
    }

    const conflictsWithBlocks = blocks.some((block) => overlaps(newBlock, block));
    const conflictsWithSessions = sessions.some((session) =>
      session.status === "confirmed" && overlaps(newBlock, session)
    );

    if (conflictsWithBlocks || conflictsWithSessions) {
      error.textContent = "Ese horario se cruza con un bloque o una sesión confirmada.";
      return;
    }

    blocks.push(newBlock);
    weekStart = mondayOf(parseDate(newBlock.date));
    $("#tutor-block-dialog").close();
    renderAll();
    showToast("Bloque agregado a la demostración.");
  });

  function deleteBlock(id) {
    if (!window.confirm("¿Eliminar este bloque de disponibilidad?")) return;
    blocks = blocks.filter((block) => block.id !== id);
    renderAll();
    showToast("Bloque eliminado de la demostración.");
  }

  // Perfil
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

  profileForm.addEventListener("submit", (event) => {
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

    profile.name = $("#tutor-name").value;
    profile.lastname = $("#tutor-lastname").value;

    const fullName = `${profile.name} ${profile.lastname}`;
    const avatarText =
      profile.name.charAt(0).toUpperCase()
      + profile.lastname.charAt(0).toUpperCase();

    $("#tutor-profile-name").textContent = fullName;
    $("#tutor-profile-avatar").textContent = avatarText;
    $("#tutor-top-avatar").textContent = avatarText;
    $("#tutor-top-avatar").setAttribute("aria-label", `Mi perfil, ${fullName}`);

    $("#tutor-profile-note").textContent =
      "Cambios reflejados en la demostración. No se guardaron en una base de datos ni se cambió el correo de acceso.";

    renderHome();
    showToast("Perfil actualizado solo en esta página.");
  });

  // Acciones delegadas para contenido generado
  document.addEventListener("click", (event) => {
    const detailButton = event.target.closest("[data-detail]");
    if (detailButton) {
      openDetail(detailButton.dataset.detail);
      return;
    }

    const requestButton = event.target.closest("[data-request-action]");
    if (requestButton) {
      updateRequest(requestButton.dataset.id, requestButton.dataset.requestAction);
      return;
    }

    const sessionButton = event.target.closest("[data-session-action]");
    if (sessionButton) {
      const session = sessions.find((item) => item.id === sessionButton.dataset.id);
      if (!session || session.status !== "confirmed") return;

      const complete = sessionButton.dataset.sessionAction === "complete";
      const question = complete
        ? "¿Marcar esta sesión como completada en la demostración?"
        : "¿Cancelar esta sesión en la demostración?";

      if (!window.confirm(question)) return;

      session.status = complete ? "completed" : "cancelled";
      $("#tutor-detail-dialog").close();
      addNotification(
        complete ? "Sesión completada" : "Sesión cancelada",
        `Actualizaste la sesión con ${session.student} en esta demostración.`
      );
      renderAll();
      showToast("Estado actualizado en la demostración.");
      return;
    }

    const deleteButton = event.target.closest("[data-delete-block]");
    if (deleteButton) {
      deleteBlock(deleteButton.dataset.deleteBlock);
      return;
    }

    const calendarButton = event.target.closest("[data-calendar-block]");
    if (calendarButton) {
      const block = blocks.find((item) => item.id === calendarButton.dataset.calendarBlock);
      if (block) {
        showToast(
          `${formatDate(block.date)} · ${timeLabel(block.start)}–${timeLabel(block.end)} · ${block.mode}. Puedes eliminarlo en la lista de bloques.`
        );
      }
      return;
    }

    const closeButton = event.target.closest("[data-close-dialog]");
    if (closeButton) {
      closeButton.closest("dialog").close();
    }
  });

  // Escape y contención del foco en el menú móvil
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setNotificationMenu(false);
      if (sidebar.classList.contains("is-open")) {
        setMenu(false, true);
      }
    }

    if (event.key !== "Tab" || !sidebar.classList.contains("is-open")) return;

    const focusable = [...sidebar.querySelectorAll("a[href], button:not([disabled])")]
      .filter((element) => element.getClientRects().length > 0);

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

  function renderAll() {
    renderHome();
    renderRequests();
    renderSessions();
    renderCalendar();
    renderNotifications();
  }

  renderAll();
  navigate();
})();