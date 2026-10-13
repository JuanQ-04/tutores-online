// js/estudiante.js — Panel del estudiante unificado (demostración, sin Firebase)
//
// Reúne en un solo archivo:
//   1. Navegación por #, menú móvil y breadcrumb (antes: parte de estudiante.js)
//   2. Campana de notificaciones y vista completa (antes: estudiante-notificaciones.js)
//   3. Validaciones del perfil (antes: estudiante-perfil.js)
//   4. NUEVO: pestañas funcionales de Mis tutorías
//   5. NUEVO: filtros y ordenación de Buscar tutores
//   6. NUEVO: diálogo del perfil del tutor al pulsar «Ver perfil»
//
// Los datos son de demostración; la integración con Firebase llegará después.

"use strict";

/* =========================================================
   0. Utilidades
   ========================================================= */
function $(selector, scope = document) {
  return scope.querySelector(selector);
}

function $$(selector, scope = document) {
  return Array.from(scope.querySelectorAll(selector));
}

let toastTimer = null;
function showDemoToast(message) {
  let toast = $(".demo-toast");

  if (!toast) {
    toast = document.createElement("p");
    toast.className = "demo-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  requestAnimationFrame(() => toast.classList.add("is-visible"));

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 3200);
}

/* =========================================================
   0.5 Datos de demostración compartidos: tutores
   ========================================================= */
const DEMO_TUTORES = [
  {
    id: 1,
    name: "María Rodríguez",
    initials: "MR",
    subject: "Matemáticas",
    nivel: "Secundaria · Bachillerato",
    lugar: "Bogotá · Chapinero",
    bio: "Te ayudo a entender lo que parecía difícil con ejemplos claros y un ritmo que se adapta a ti.",
    rating: 4.9,
    reviews: 38,
    availability: "Disponible hoy",
    availabilityRank: 0,
    modality: "Virtual",
    photo: "../images/tutor-maria.webp",
    tone: "tone-green"
  },
  {
    id: 2,
    name: "Diego Salazar",
    initials: "DS",
    subject: "Física",
    nivel: "Bachillerato · Universidad",
    lugar: "Disponible en línea",
    bio: "Convertimos fórmulas en intuición. Sesiones prácticas para resolver problemas con confianza.",
    rating: 4.8,
    reviews: 24,
    availability: "3 espacios esta semana",
    availabilityRank: 2,
    modality: "Virtual",
    photo: "../images/tutor-diego.webp",
    tone: "tone-blue"
  },
  {
    id: 3,
    name: "Inés Morales",
    initials: "IN",
    subject: "Inglés",
    nivel: "Todos los niveles",
    lugar: "Bogotá · Teusaquillo",
    bio: "Conversaciones reales, objetivos concretos y un espacio amable para que te animes a hablar.",
    rating: 5.0,
    reviews: 51,
    availability: "Disponible mañana",
    availabilityRank: 1,
    modality: "Presencial",
    photo: "../images/tutor-ines.webp",
    tone: "tone-sand"
  }
];

/* =========================================================
   1. Navegación general (hash, menú móvil, breadcrumb)
   ========================================================= */
(() => {
  const sections = [...document.querySelectorAll(".dashboard-main > section[id]")];
  const titles = {
    inicio: "Inicio",
    buscar: "Buscar tutores",
    tutorias: "Mis tutorías",
    notificaciones: "Notificaciones",
    perfil: "Mi perfil",
    "detalle-tutoria": "Detalle de tutoría",
    seguridad: "Seguridad",
    ayuda: "Centro de ayuda",
    reservar: "Reservar tutoría"
  };
  const DEFAULT_SECTION = "inicio";

  const navLinks = [...document.querySelectorAll(".main-navigation a")];
  const breadcrumbCurrent = $(".breadcrumb [aria-current='page']");
  const mainArea = $("#contenido-principal");

  const sidebar = $("#student-sidebar");
  const overlay = $(".sidebar-overlay");
  const menuToggle = $(".menu-toggle");
  const closeButton = $(".sidebar-close");

  // Menú móvil (bloquea el desplazamiento del body igual que en otros paneles)
  function setMenu(open) {
    sidebar.classList.toggle("is-open", open);
    overlay.hidden = !open;
    overlay.classList.toggle("is-open", open);
    menuToggle.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("sidebar-open", open);
  }

  menuToggle.addEventListener("click", () => {
    setMenu(!sidebar.classList.contains("is-open"));
  });
  closeButton.addEventListener("click", () => setMenu(false));
  overlay.addEventListener("click", () => setMenu(false));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setMenu(false);
  });

  // Muestra una sección y oculta las demás
  function showSection() {
    let id = window.location.hash.slice(1);

    if (!titles[id]) id = DEFAULT_SECTION;

    sections.forEach((section) => {
      section.hidden = section.id !== id;
    });

    navLinks.forEach((link) => {
      const active = link.getAttribute("href") === `#${id}`;
      if (active) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });

    breadcrumbCurrent.textContent = titles[id];
    document.title = `${titles[id]} | TutoresOn-Line`;

    mainArea.scrollIntoView({ block: "start" });
    setMenu(false);
  }

  window.addEventListener("hashchange", showSection);
  window.addEventListener("DOMContentLoaded", () => showSection());
})();

/* =========================================================
   2. Notificaciones (campana y vista completa)
   ========================================================= */
(() => {
  const widget = $("#notifications-widget");
  const toggle = $("#notifications-toggle");
  const dropdown = $("#notifications-dropdown");
  const viewAll = $("#notifications-view-all");
  const back = $("#notifications-back");
  const notificationSection = $("#notificaciones");
  const main = $("#contenido-principal");
  const breadcrumb = $('.breadcrumb > [aria-current="page"]');

  if (!widget || !toggle || !dropdown || !viewAll || !back || !notificationSection || !main) {
    return;
  }

  const sections = [...main.children].filter(
    (element) => element.tagName === "SECTION"
  );

  const navigationLinks = [...document.querySelectorAll(".main-navigation > a")];

  let previousSection = sections.find(
    (section) => section !== notificationSection && !section.hidden
  ) || $("#inicio");

  let savedNavigation = [];
  let savedBreadcrumb = breadcrumb?.textContent || "";
  let savedTitle = document.title;
  let historyIsOpen = false;

  function closeDropdown(returnFocus = false) {
    dropdown.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    if (returnFocus) toggle.focus();
  }

  function openHistory() {
    if (!historyIsOpen) {
      previousSection = sections.find(
        (section) => section !== notificationSection && !section.hidden
      ) || previousSection;

      savedNavigation = navigationLinks.map(
        (link) => link.getAttribute("aria-current")
      );
      savedBreadcrumb = breadcrumb?.textContent || "";
      savedTitle = document.title;
    }

    closeDropdown();

    sections.forEach((section) => {
      section.hidden = section !== notificationSection;
    });

    navigationLinks.forEach((link) => link.removeAttribute("aria-current"));

    if (breadcrumb) breadcrumb.textContent = "Notificaciones";
    document.title = "Notificaciones | TutoresOn-Line";
    historyIsOpen = true;

    $("#notifications-title").focus();
  }

  function leaveHistory(target) {
    sections.forEach((section) => {
      section.hidden = section !== target;
    });

    navigationLinks.forEach((link, index) => {
      link.removeAttribute("aria-current");
      if (target === previousSection) {
        if (savedNavigation[index]) {
          link.setAttribute("aria-current", savedNavigation[index]);
        }
      } else if (link.getAttribute("href") === `#${target.id}`) {
        link.setAttribute("aria-current", "page");
      }
    });

    const targetLink = navigationLinks.find(
      (link) => link.getAttribute("href") === `#${target.id}`
    );

    if (breadcrumb) {
      breadcrumb.textContent = target === previousSection
        ? savedBreadcrumb
        : targetLink?.textContent.trim() || "Inicio";
    }

    document.title = savedTitle;
    historyIsOpen = false;
  }

  toggle.addEventListener("click", () => {
    const willOpen = dropdown.hidden;
    dropdown.hidden = !willOpen;
    toggle.setAttribute("aria-expanded", String(willOpen));
  });

  document.addEventListener("click", (event) => {
    if (!widget.contains(event.target)) closeDropdown();
  });

  document.addEventListener("focusin", (event) => {
    if (!widget.contains(event.target)) closeDropdown();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dropdown.hidden) closeDropdown(true);
  });

  viewAll.addEventListener("click", (event) => {
    event.preventDefault();

    if (window.location.hash === "#notificaciones") {
      openHistory();
    } else {
      window.location.hash = "notificaciones";
    }
  });

  back.addEventListener("click", () => {
    if (!previousSection) return;
    leaveHistory(previousSection);
    window.location.hash = previousSection.id;
    toggle.focus();
  });

  window.addEventListener("hashchange", () => {
    if (window.location.hash === "#notificaciones") {
      openHistory();
      return;
    }

    if (historyIsOpen) {
      const target = sections.find(
        (section) => `#${section.id}` === window.location.hash
      );
      leaveHistory(target || previousSection);
    }
  });

  if (window.location.hash === "#notificaciones") {
    openHistory();
  }
})();

/* =========================================================
   3. Perfil (validaciones de interfaz, sin Firebase)
   ========================================================= */
(() => {
  const profileForm = $("#profile-form");
  const profileNote = $("#profile-note");

  if (!profileForm || !profileNote) return;

  const nameInput = $("#perfil-nombre");
  const lastNameInput = $("#perfil-apellido");
  const emailInput = $("#perfil-correo");
  const profileName = $(".profile-name", profileForm);
  const profileAvatar = $(".profile-avatar", profileForm);

  const DEMO_MESSAGE = "Vista de demostración: los cambios no se guardan.";

  function isValidText(input) {
    input.value = input.value.trim();
    return /\p{L}/u.test(input.value);
  }

  function markInvalid(input, invalid) {
    if (invalid) {
      input.setAttribute("aria-invalid", "true");
    } else {
      input.removeAttribute("aria-invalid");
    }
  }

  profileForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const nameOk = isValidText(nameInput);
    const lastNameOk = isValidText(lastNameInput);
    const emailOk = emailInput.checkValidity() && emailInput.value.trim() !== "";

    markInvalid(nameInput, !nameOk);
    markInvalid(lastNameInput, !lastNameOk);
    markInvalid(emailInput, !emailOk);

    if (!nameOk || !lastNameOk || !emailOk) {
      profileNote.textContent =
        "Revisa los campos marcados: nombre, apellido y un correo válido.";
      return;
    }

    profileName.textContent = `${nameInput.value} ${lastNameInput.value}`;
    profileAvatar.textContent =
      (nameInput.value[0] + lastNameInput.value[0]).toUpperCase();

    profileNote.textContent = `Cambios aplicados en pantalla. ${DEMO_MESSAGE}`;
  });
})();

/* =========================================================
   4. Mis tutorías: pestañas funcionales
   ========================================================= */
(() => {
  const STATUS_KEYS = ["upcoming", "pending", "completed", "cancelled"];

  const ESTADO_LABEL = {
    upcoming: { clase: "confirmed", texto: "Confirmada" },
    pending: { clase: "pending", texto: "Pendiente" },
    completed: { clase: "completed", texto: "Completada" },
    cancelled: { clase: "cancelled", texto: "Cancelada" }
  };

  // Sesiones de demostración
  const DEMO_SESIONES = [
    {
      id: 1,
      tutor: "María Rodríguez",
      subject: "Matemáticas",
      title: "Repaso de ecuaciones",
      avatar: "../images/tutor-maria.webp",
      date: "Mié, 28 ago",
      time: "4:00 PM",
      mode: "Virtual",
      modeIcon: "video",
      status: "upcoming"
    },
    {
      id: 2,
      tutor: "Diego Salazar",
      subject: "Física",
      title: "Ejercicios de cinemática",
      avatar: "../images/tutor-diego.webp",
      date: "Sáb, 06 sep",
      time: "10:00 AM",
      mode: "Virtual",
      modeIcon: "video",
      status: "upcoming"
    },
    {
      id: 3,
      tutor: "Diego Salazar",
      subject: "Física",
      title: "Sesión con Diego Salazar",
      avatar: "../images/tutor-diego.webp",
      date: "Vie, 30 ago",
      time: "6:30 PM",
      mode: "Virtual",
      modeIcon: "video",
      status: "pending"
    },
    {
      id: 4,
      tutor: "Inés Morales",
      subject: "Inglés Conversacional",
      title: "Sesión con Inés Morales",
      avatar: "../images/tutor-ines.webp",
      date: "Lun, 19 ago",
      time: "3:00 PM",
      mode: "Presencial",
      modeIcon: "pin",
      status: "completed"
    },
    {
      id: 5,
      tutor: "María Rodríguez",
      subject: "Matemáticas",
      title: "Refuerzo de integrales",
      avatar: "../images/tutor-maria.webp",
      date: "Jue, 14 ago",
      time: "5:00 PM",
      mode: "Virtual",
      modeIcon: "video",
      status: "completed"
    },
    {
      id: 6,
      tutor: "Inés Morales",
      subject: "Inglés Conversacional",
      title: "Práctica de conversación",
      avatar: "../images/tutor-ines.webp",
      date: "Sáb, 09 ago",
      time: "11:00 AM",
      mode: "Virtual",
      modeIcon: "video",
      status: "completed"
    },
    {
      id: 7,
      tutor: "Diego Salazar",
      subject: "Física",
      title: "Sesión con Diego Salazar",
      avatar: "../images/tutor-diego.webp",
      date: "Mar, 14 jul",
      time: "6:00 PM",
      mode: "Virtual",
      modeIcon: "video",
      status: "cancelled"
    }
  ];

  const tabsContainer = $(".sessions-tabs");
  const sessionsList = $(".sessions-list");
  if (!tabsContainer || !sessionsList) return;

  const tabs = $$(".tab-btn", tabsContainer);

  function renderCounts() {
    tabs.forEach((tab, index) => {
      const key = STATUS_KEYS[index];
      const count = DEMO_SESIONES.filter((s) => s.status === key).length;
      let badge = $(".tab-count", tab);

      if (!badge) {
        badge = document.createElement("span");
        badge.className = "tab-count";
        tab.appendChild(badge);
      }

      badge.textContent = count;
    });
  }

  function sessionHtml(session) {
    const estado = ESTADO_LABEL[session.status];
    return `
      <a class="session-item" href="#detalle-tutoria" data-session-id="${session.id}">
        <div class="session-main-info">
          <img
            src="${session.avatar}"
            alt="${session.tutor}"
            class="session-tutor-avatar"
            width="50"
            height="50"
          >
          <div class="session-details">
            <p class="session-subject">${session.subject}</p>
            <h3 class="session-title">${session.title}</h3>
            <ul class="session-meta-row">
              <li>
                <svg class="icon" aria-hidden="true"><use href="#icon-calendar"></use></svg>
                <span>${session.date}</span>
              </li>
              <li>
                <svg class="icon" aria-hidden="true"><use href="#icon-clock"></use></svg>
                <span>${session.time}</span>
              </li>
              <li>
                <svg class="icon" aria-hidden="true"><use href="#icon-${session.modeIcon}"></use></svg>
                <span>${session.mode}</span>
              </li>
            </ul>
          </div>
        </div>
        <div class="session-status-side">
          <span class="status-tag ${estado.clase}">${estado.texto}</span>
          <svg class="icon session-arrow" aria-hidden="true"><use href="#icon-arrow-right"></use></svg>
        </div>
      </a>
    `;
  }

  function renderSessions(key) {
    const filtered = DEMO_SESIONES.filter((s) => s.status === key);

    if (filtered.length === 0) {
      sessionsList.innerHTML =
        '<p class="sessions-empty">No tienes tutorías en este estado.</p>';
      return;
    }

    sessionsList.innerHTML = filtered.map(sessionHtml).join("");
  }

  function selectTab(tab, key) {
    tabs.forEach((t, index) => {
      const active = t === tab;
      t.classList.toggle("is-active", active);
      t.setAttribute("aria-selected", String(active));
      t.setAttribute("data-status", STATUS_KEYS[index]);
    });
    renderSessions(key);
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(tab, STATUS_KEYS[index]));
  });


  // ---- Detalle y cancelación de una tutoría ----
  let selectedId = null;
  const detail = $("#detalle-tutoria");
  const cancelDialog = $("#cancel-dialog");
  const sessionById = () => DEMO_SESIONES.find((s) => String(s.id) === String(selectedId));

  sessionsList.addEventListener("click", (event) => {
    const item = event.target.closest("[data-session-id]");
    if (item) selectedId = item.dataset.sessionId;
  });

  function renderDetail() {
    const s = sessionById();
    if (!s) { window.location.hash = "tutorias"; return; }
    const estado = ESTADO_LABEL[s.status];
    const cancelable = s.status === "upcoming" || s.status === "pending";
    $("#detail-subject", detail).textContent = s.subject;
    $("#detail-title", detail).textContent = s.title;
    $("#detail-tutor", detail).textContent = "Con " + s.tutor;
    const tag = $("#detail-status", detail);
    tag.className = "status-tag " + estado.clase;
    tag.textContent = estado.texto;
    $("#detail-meta", detail).innerHTML = [s.date, s.time, s.mode].map((t) => `<li><span>${t}</span></li>`).join("");
    $("#detail-note", detail).textContent = s.status === "upcoming"
      ? "El enlace de la videoconferencia se habilita 15 minutos antes del inicio."
      : cancelable ? "Esperando la respuesta del tutor." : "Esta tutoría ya no se puede cancelar.";
    $("#detail-cancel", detail).hidden = !cancelable;
  }
  window.addEventListener("hashchange", () => {
    if (window.location.hash === "#detalle-tutoria") renderDetail();
  });
  if (window.location.hash === "#detalle-tutoria") window.location.hash = "tutorias";

  $("#detail-cancel").addEventListener("click", () => {
    const s = sessionById();
    if (!s) return;
    $("#cancel-text").textContent = `${s.title} con ${s.tutor}, ${s.date} a las ${s.time}.`;
    cancelDialog.showModal();
  });
  $("#cancel-keep").addEventListener("click", () => cancelDialog.close());
  $("#cancel-confirm").addEventListener("click", () => {
    const s = sessionById();
    if (s) s.status = "cancelled";
    cancelDialog.close();
    renderCounts();
    selectTab(tabs[3], STATUS_KEYS[3]);
    window.location.hash = "tutorias";
    showDemoToast("Tutoría cancelada (demostración).");
  });

  window.agregarTutoriaPendiente = (sesion) => {
    DEMO_SESIONES.unshift(sesion);
    renderCounts();
    selectTab(tabs[1], STATUS_KEYS[1]);
  };

  // Estado inicial: primera pestaña (Próximas)
  renderCounts();
  if (tabs[0]) selectTab(tabs[0], STATUS_KEYS[0]);
})();

/* =========================================================
   5. Buscar tutores: filtros y ordenación
   ========================================================= */
(() => {
  const searchSection = $(".student-search");
  if (!searchSection) return;

  const searchInput = $('.search-filters input[type="search"]', searchSection);
  const filterSelects = $$(".search-filters .filter-field select", searchSection);
  const subjectSelect = filterSelects[0];
  const modalitySelect = filterSelects[1];
  const sortSelect = $(".sort-field select", searchSection);
  const filterSubmit = $(".filter-submit", searchSection);
  const tutorGrid = $(".tutor-grid", searchSection);
  const resultsCount = $(".results-count strong", searchSection);

  if (!searchInput || !tutorGrid || !resultsCount) return;

  function starsHtml() {
    return '<svg class="icon" aria-hidden="true"><use href="#icon-star"></use></svg>'.repeat(5);
  }

  function tutorCardHtml(tutor) {
    return `
      <article class="tutor-card ${tutor.tone}">
        <div class="tutor-cover">
          <img class="tutor-photo" src="${tutor.photo}" alt="${tutor.name}" width="104" height="104">
          <button class="favorite-button" type="button" aria-label="Guardar a ${tutor.name}">
            <svg class="icon" aria-hidden="true"><use href="#icon-heart"></use></svg>
          </button>
        </div>
        <div class="tutor-body">
          <div class="tutor-title">
            <div>
              <p class="tutor-subject">${tutor.subject}</p>
              <h3>${tutor.name}</h3>
            </div>
            <span class="online-dot" title="En línea"></span>
          </div>
          <p class="tutor-bio">${tutor.bio}</p>
          <ul class="tutor-meta">
            <li><svg class="icon" aria-hidden="true"><use href="#icon-cap"></use></svg>${tutor.nivel}</li>
            <li><svg class="icon" aria-hidden="true"><use href="#icon-pin"></use></svg>${tutor.lugar}</li>
          </ul>
          <div class="tutor-rating">
            <span class="stars">${starsHtml()}</span>
            <strong>${tutor.rating}</strong><small>(${tutor.reviews})</small>
            <span class="availability">${tutor.availability}</span>
          </div>
          <div class="tutor-actions">
            <a class="outline-button" href="#perfil" data-tutor-profile="${tutor.id}">Ver perfil</a>
            <a class="solid-button" href="#tutorias" data-tutor-reserve="${tutor.id}">
              <svg class="icon" aria-hidden="true"><use href="#icon-calendar"></use></svg>Reservar
            </a>
          </div>
        </div>
      </article>
    `;
  }

  function getFilteredTutors() {
    const text = searchInput.value.trim().toLowerCase();
    const subject = subjectSelect ? subjectSelect.value : "Todas las materias";
    const modality = modalitySelect ? modalitySelect.value : "Cualquier modalidad";
    const order = sortSelect ? sortSelect.value : "Mejor calificación";

    const list = DEMO_TUTORES.filter((tutor) => {
      const matchText =
        !text ||
        tutor.name.toLowerCase().includes(text) ||
        tutor.subject.toLowerCase().includes(text) ||
        tutor.bio.toLowerCase().includes(text);
      const matchSubject =
        subject === "Todas las materias" || tutor.subject === subject;
      const matchModality =
        modality === "Cualquier modalidad" || tutor.modality === modality;
      return matchText && matchSubject && matchModality;
    });

    if (order === "Disponibilidad") {
      return [...list].sort((a, b) => a.availabilityRank - b.availabilityRank);
    }
    if (order === "Más reseñas") {
      return [...list].sort((a, b) => b.reviews - a.reviews);
    }
    return [...list].sort((a, b) => b.rating - a.rating);
  }

  function renderTutors() {
    const filtered = getFilteredTutors();

    resultsCount.textContent =
      filtered.length === 1
        ? "1 tutor encontrado"
        : `${filtered.length} tutores encontrados`;

    if (filtered.length === 0) {
      tutorGrid.innerHTML =
        '<p class="sessions-empty">No encontramos tutores con esos filtros.</p>';
      return;
    }

    tutorGrid.innerHTML = filtered.map(tutorCardHtml).join("");
  }

  searchInput.addEventListener("input", renderTutors);
  if (subjectSelect) subjectSelect.addEventListener("change", renderTutors);
  if (modalitySelect) modalitySelect.addEventListener("change", renderTutors);
  if (sortSelect) sortSelect.addEventListener("change", renderTutors);
  if (filterSubmit) filterSubmit.addEventListener("click", (event) => {
    event.preventDefault();
    renderTutors();
  });

  renderTutors();
})();

/* =========================================================
   6. Perfil del tutor: diálogo y delegación de clics
   ========================================================= */
(() => {
  const tutorById = (id) =>
    DEMO_TUTORES.find((tutor) => String(tutor.id) === String(id));

  function buildDialog() {
    const dialog = document.createElement("dialog");
    dialog.className = "tutor-profile-dialog";
    dialog.id = "tutor-profile-dialog";
    dialog.setAttribute("aria-labelledby", "tp-title");
    dialog.innerHTML = `
      <div class="tp-cover">
        <button class="tp-close" type="button" aria-label="Cerrar perfil">
          <svg class="icon" aria-hidden="true"><use href="#icon-close"></use></svg>
        </button>
        <img class="tp-photo" alt="" width="116" height="116">
      </div>
      <div class="tp-body">
        <p class="tp-subject"></p>
        <h2 class="tp-name" id="tp-title"></h2>
        <div class="tp-rating">
          <span class="stars">
            <svg class="icon" aria-hidden="true"><use href="#icon-star"></use></svg>
            <svg class="icon" aria-hidden="true"><use href="#icon-star"></use></svg>
            <svg class="icon" aria-hidden="true"><use href="#icon-star"></use></svg>
            <svg class="icon" aria-hidden="true"><use href="#icon-star"></use></svg>
            <svg class="icon" aria-hidden="true"><use href="#icon-star"></use></svg>
          </span>
          <strong></strong><small></small>
        </div>
        <p class="tp-bio"></p>
        <ul class="tp-meta">
          <li>
            <svg class="icon" aria-hidden="true"><use href="#icon-cap"></use></svg>
            <span></span>
          </li>
          <li>
            <svg class="icon" aria-hidden="true"><use href="#icon-pin"></use></svg>
            <span></span>
          </li>
        </ul>
        <p class="tp-availability"></p>
        <div class="tp-actions">
          <a class="tp-reserve" href="#tutorias">
            <svg class="icon" aria-hidden="true"><use href="#icon-calendar"></use></svg>
            Reservar sesión
          </a>
          <button class="tp-close-button" type="button">Cerrar</button>
        </div>
      </div>
    `;

    dialog.addEventListener("click", (event) => {
      if (
        event.target.closest(".tp-close") ||
        event.target.closest(".tp-close-button")
      ) {
        dialog.close();
      }
    });

    const reserveLink = $(".tp-reserve", dialog);
    reserveLink.addEventListener("click", (event) => {
      event.preventDefault();
      const name = $(".tp-name", dialog).textContent;
      dialog.close();
      const tutor = DEMO_TUTORES.find((t) => t.name === name);
      if (tutor) window.iniciarReserva(tutor);
    });

    document.body.appendChild(dialog);
    return dialog;
  }

  const dialog = buildDialog();

  function openTutorProfile(tutor) {
    $(".tp-photo", dialog).src = tutor.photo;
    $(".tp-photo", dialog).alt = `Foto de ${tutor.name}`;
    $(".tp-subject", dialog).textContent = tutor.subject;
    $(".tp-name", dialog).textContent = tutor.name;
    $(".tp-rating strong", dialog).textContent = tutor.rating;
    $(".tp-rating small", dialog).textContent = `(${tutor.reviews})`;
    $(".tp-bio", dialog).textContent = tutor.bio;
    $(".tp-meta li:nth-child(1) span", dialog).textContent = tutor.nivel;
    $(".tp-meta li:nth-child(2) span", dialog).textContent = tutor.lugar;
    $(".tp-availability", dialog).textContent = tutor.availability;
    dialog.showModal();
  }

  // Delegación de clics: «Ver perfil», «Reservar» y favoritos
  document.addEventListener("click", (event) => {
    const profileLink = event.target.closest("[data-tutor-profile]");
    if (profileLink) {
      event.preventDefault();
      const tutor = tutorById(profileLink.dataset.tutorProfile);
      if (tutor) openTutorProfile(tutor);
      return;
    }

    const reserveLink = event.target.closest("[data-tutor-reserve]");
    if (reserveLink) {
      event.preventDefault();
      const tutor = tutorById(reserveLink.dataset.tutorReserve);
      if (tutor) window.iniciarReserva(tutor);
      return;
    }

    const favorite = event.target.closest(".favorite-button");
    if (favorite) {
      const pressed = favorite.getAttribute("aria-pressed") === "true";
      favorite.setAttribute("aria-pressed", String(!pressed));
    }
  });
})();

/* =========================================================
   7. Seguridad y contacto (demostración)
   ========================================================= */
(() => {
  const security = $("#security-form");
  const note = $("#security-note");
  if (security) {
    security.addEventListener("submit", (event) => {
      event.preventDefault();
      const { actual, nueva, confirmar } = security.elements;
      let msg = "";
      if (!actual.value) msg = "Escribe tu contraseña actual.";
      else if (nueva.value.length < 8) msg = "La nueva contraseña debe tener al menos 8 caracteres.";
      else if (nueva.value !== confirmar.value) msg = "Las contraseñas nuevas no coinciden.";
      if (msg) { note.textContent = msg; return; }
      security.reset();
      note.textContent = "Vista de demostración: la contraseña no se cambia.";
      showDemoToast("Contraseña actualizada (demostración).");
    });
  }

  const contact = $("#contact-form");
  if (contact) {
    contact.addEventListener("submit", (event) => {
      event.preventDefault();
      const { asunto, mensaje } = contact.elements;
      if (!asunto.value.trim() || !mensaje.value.trim()) {
        showDemoToast("Completa el asunto y el mensaje.");
        return;
      }
      contact.reset();
      showDemoToast("Mensaje enviado al equipo (demostración).");
    });
  }
})();

/* =========================================================
   8. Reservar tutoría: modalidad → fecha y hora → revisión
   ========================================================= */
(() => {
  const sec = $("#reservar");
  if (!sec) return;
  const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const HORAS = ["9:00 AM", "11:00 AM", "2:00 PM", "4:00 PM"];
  const st = { tutor: null, modo: "", dia: "", hora: "", paso: 1 };
  const note = $("#reserva-note");
  const pasos = $$("#reserva-pasos li");

  const dias = Array.from({ length: 5 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 1);
    return `${DIAS[d.getDay()]}, ${d.getDate()} ${MESES[d.getMonth()]}`;
  });
  $("#reserva-dias").innerHTML = dias.map((d) => `<button type="button" class="reserva-opcion" data-dia="${d}" aria-pressed="false">${d}</button>`).join("");
  $("#reserva-horas").innerHTML = HORAS.map((h) => `<button type="button" class="reserva-opcion" data-hora="${h}" aria-pressed="false">${h}</button>`).join("");

  function marcar(selector, attr, valor) {
    $$(selector, sec).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset[attr] === valor)));
  }

  function render() {
    [1, 2, 3].forEach((n) => { $("#reserva-p" + n).hidden = n !== st.paso; });
    pasos.forEach((li, i) => li.classList.toggle("is-active", i + 1 <= st.paso));
    $("#reserva-sig span").textContent = st.paso === 3 ? "Enviar solicitud" : "Continuar";
    $("#reserva-atras").hidden = st.paso === 1;
    if (st.paso === 3) {
      $("#reserva-resumen").innerHTML = [
        st.tutor.name + " · " + st.tutor.subject, st.dia + " a las " + st.hora, st.modo
      ].map((t) => `<li><span>${t}</span></li>`).join("");
    }
    note.textContent = "";
  }

  window.iniciarReserva = (tutor) => {
    Object.assign(st, { tutor, modo: tutor.modality === "Presencial" ? "Presencial" : "", dia: "", hora: "", paso: 1 });
    $("#reserva-tutor").textContent = `Con ${tutor.name} · ${tutor.subject}`;
    marcar(".reserva-opcion[data-modo]", "modo", st.modo);
    marcar(".reserva-opcion[data-dia]", "dia", "");
    marcar(".reserva-opcion[data-hora]", "hora", "");
    $("#reserva-card").hidden = false;
    $("#reserva-ok").hidden = true;
    render();
    window.location.hash = "reservar";
  };

  sec.addEventListener("click", (event) => {
    const b = event.target.closest(".reserva-opcion");
    if (!b) return;
    if (b.dataset.modo) { st.modo = b.dataset.modo; marcar(".reserva-opcion[data-modo]", "modo", st.modo); }
    if (b.dataset.dia) { st.dia = b.dataset.dia; marcar(".reserva-opcion[data-dia]", "dia", st.dia); }
    if (b.dataset.hora) { st.hora = b.dataset.hora; marcar(".reserva-opcion[data-hora]", "hora", st.hora); }
    note.textContent = "";
  });

  $("#reserva-atras").addEventListener("click", () => { st.paso -= 1; render(); });
  $("#reserva-sig").addEventListener("click", () => {
    if (st.paso === 1 && !st.modo) { note.textContent = "Elige una modalidad para continuar."; return; }
    if (st.paso === 2 && (!st.dia || !st.hora)) { note.textContent = "Elige un día y una hora para continuar."; return; }
    if (st.paso < 3) { st.paso += 1; render(); return; }
    const t = st.tutor;
    window.agregarTutoriaPendiente({
      id: Date.now(), tutor: t.name, subject: t.subject, title: "Tutoría de " + t.subject,
      avatar: t.photo, date: st.dia, time: st.hora, mode: st.modo,
      modeIcon: st.modo === "Virtual" ? "video" : "pin", status: "pending"
    });
    $("#reserva-card").hidden = true;
    $("#reserva-ok").hidden = false;
  });

  // Si entran a #reservar sin haber elegido tutor, volver a la búsqueda
  const guard = () => { if (window.location.hash === "#reservar" && !st.tutor) window.location.hash = "buscar"; };
  window.addEventListener("hashchange", guard);
  window.addEventListener("DOMContentLoaded", guard);
})();
