// js/estudiante.js — Panel del estudiante
// Requiere: <script type="module" src="../js/estudiante.js"></script>
// Perfil, Inicio, Mis tutorías, Notificaciones, Buscar tutores y Reservar:
// conectados a Firestore. Seguridad y Centro de ayuda: siguen como demostración.

import { auth, db } from "./firebase-config.js";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

/* ================================================================
   0. Utilidades globales
   ================================================================ */
function $(selector, scope = document) { return scope.querySelector(selector); }
function $$(selector, scope = document) { return [...scope.querySelectorAll(selector)]; }

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
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3200);
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

function dateISO(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function tsToISO(fecha) {
  if (!fecha) return dateISO(new Date());
  if (typeof fecha.toDate === "function") return dateISO(fecha.toDate());
  if (fecha instanceof Date) return dateISO(fecha);
  if (typeof fecha === "string") return fecha.slice(0, 10);
  return dateISO(new Date());
}

function formatDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString("es-CO", {
    weekday: "short", day: "numeric", month: "short"
  });
}

function timeLabel(value) {
  const base = new Date(2000, 0, 1, 0, 0, 0);
  const [h, min] = value.split(":").map(Number);
  base.setHours(h, min);
  return base.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", hour12: true });
}

function svgIcon(id) {
  return `<svg class="icon" aria-hidden="true"><use href="#icon-${id}"></use></svg>`;
}

function normalize(str) {
  return String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function horaISO(date) {
  return [
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0")
  ].join(":");
}

/* Las materias se guardan en Firestore como "slug" (registro-tutor.html usa
   value="matematicas", "fisica"…). Aquí se traducen a su nombre para mostrarlas
   y para que el filtro de Buscar coincida con lo que eligió el tutor. */
const MATERIAS = {
  matematicas: "Matemáticas",
  fisica: "Física",
  quimica: "Química",
  programacion: "Programación",
  idiomas: "Idiomas",
  estadistica: "Estadística"
};

function materiaLabel(valor) {
  const texto = String(valor || "").trim();
  return MATERIAS[normalize(texto)] || (texto.charAt(0).toUpperCase() + texto.slice(1));
}

function materiasDe(tutor) {
  return (Array.isArray(tutor?.materias) ? tutor.materias : []).map(materiaLabel);
}

function nombreDe(persona) {
  return `${persona?.nombre || ""} ${persona?.apellido || ""}`.trim();
}

function iniciales(nombre, porDefecto = "?") {
  return String(nombre).split(/\s+/).filter(Boolean).slice(0, 2)
    .map((p) => p[0].toUpperCase()).join("") || porDefecto;
}

/* Una consulta a Firestore que no responde nunca dejaría la pantalla en
   "Cargando…" para siempre: tras 15 s se trata como error. */
function conTimeout(promesa, ms = 15000) {
  let temporizador;
  const limite = new Promise((_, rechazar) => {
    temporizador = setTimeout(() => {
      rechazar(Object.assign(new Error("Tiempo de espera agotado"), { code: "timeout" }));
    }, ms);
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(temporizador));
}

function detalleError(err) {
  const code = err?.code || "";
  if (code === "permission-denied") {
    return "Firestore no permite esta lectura (permission-denied): hay que revisar las reglas de seguridad.";
  }
  if (code === "unavailable" || code === "timeout") return "Revisa tu conexión a internet.";
  return code ? `(${code})` : "";
}

function botonReintentar(que) {
  return `<br><button class="outline-button" type="button" data-reintentar="${que}" style="margin-top:12px">Reintentar</button>`;
}

/* ================================================================
   Estado global del módulo
   ================================================================ */
let estudianteUid   = null;
let profile         = { name: "", lastname: "", email: "" };
let enviandoSolicitud = false; // evita enviar la misma solicitud dos veces
let solicitudesData = [];   // docs de "solicitudes" del estudiante
let tutoriasData    = [];   // docs de "tutorias" del estudiante
let tutoresData     = [];   // docs de "usuarios" (tutores aprobados)
let selectedSession = null; // { id, tipo: "solicitud"|"tutoria" }
let reservaTutor    = null; // tutor elegido para reservar
let reservaBloque   = null; // bloque de disponibilidad seleccionado
let reservaModalidad = "";

// Estado de cada carga de datos: "cargando" | "listo" | "error".
// Así la pantalla distingue "todavía cargando" de "no hay nada" y de "falló".
let tutoresEstado   = "cargando";
let tutoresError    = null;
let tutoriasEstado  = "cargando";
let tutoriasError   = null;
let filtroMateria   = "";   // materia elegida en Buscar (se usa al reservar)

// Callbacks que los bloques internos registran y los demás pueden llamar
let doRenderReserva    = null;
let doRefreshSessions  = null;
let doRefreshTutores   = null;

/* ================================================================
   1. Navegación (hash, menú móvil, breadcrumb)
   ================================================================ */
{
  const sections = $$(".dashboard-main > section[id]");
  const titles = {
    inicio: "Inicio", buscar: "Buscar tutores", tutorias: "Mis tutorías",
    notificaciones: "Notificaciones", perfil: "Mi perfil",
    "detalle-tutoria": "Detalle de tutoría", seguridad: "Seguridad",
    ayuda: "Centro de ayuda", reservar: "Reservar tutoría"
  };

  const navLinks        = $$(".main-navigation a");
  const breadcrumb      = $(".breadcrumb [aria-current='page']");
  const sidebar         = $("#student-sidebar");
  const overlay         = $(".sidebar-overlay");
  const menuToggle      = $(".menu-toggle");
  const closeButton     = $(".sidebar-close");

  function setMenu(open) {
    sidebar.classList.toggle("is-open", open);
    overlay.hidden = !open;
    overlay.classList.toggle("is-open", open);
    menuToggle.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("sidebar-open", open);
  }

  menuToggle.addEventListener("click", () => setMenu(!sidebar.classList.contains("is-open")));
  closeButton.addEventListener("click",  () => setMenu(false));
  overlay.addEventListener("click",      () => setMenu(false));
  document.addEventListener("keydown",   (e) => { if (e.key === "Escape") setMenu(false); });

  function showSection() {
    let id = window.location.hash.slice(1);
    if (!titles[id]) id = "inicio";
    sections.forEach((s) => { s.hidden = s.id !== id; });
    navLinks.forEach((link) => {
      if (link.getAttribute("href") === `#${id}`) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    if (breadcrumb) breadcrumb.textContent = titles[id];
    document.title = `${titles[id]} | TutoresOn-Line`;
    $(".dashboard-content")?.scrollTo?.({ top: 0 });
    setMenu(false);
  }

  window.addEventListener("hashchange", showSection);
  window.addEventListener("DOMContentLoaded", showSection);
}

/* ================================================================
   2. Notificaciones (campana + vista completa — demostración)
   ================================================================ */
{
  const widget              = $("#notifications-widget");
  const toggle              = $("#notifications-toggle");
  const dropdown            = $("#notifications-dropdown");
  const viewAll             = $("#notifications-view-all");
  const back                = $("#notifications-back");
  const notifSection        = $("#notificaciones");
  const main                = $("#contenido-principal");
  const breadcrumb          = $('.breadcrumb > [aria-current="page"]');

  if (widget && toggle && dropdown && viewAll && back && notifSection && main) {
    const allSections   = [...main.children].filter((el) => el.tagName === "SECTION");
    const navLinks      = $$(".main-navigation > a");
    let previous        = allSections.find((s) => s !== notifSection && !s.hidden) || $("#inicio");
    let savedNav        = [];
    let savedCrumb      = breadcrumb?.textContent || "";
    let savedTitle      = document.title;
    let historyOpen     = false;

    function closeDropdown(focus = false) {
      dropdown.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      if (focus) toggle.focus();
    }

    function openHistory() {
      if (!historyOpen) {
        previous    = allSections.find((s) => s !== notifSection && !s.hidden) || previous;
        savedNav    = navLinks.map((l) => l.getAttribute("aria-current"));
        savedCrumb  = breadcrumb?.textContent || "";
        savedTitle  = document.title;
      }
      closeDropdown();
      allSections.forEach((s) => { s.hidden = s !== notifSection; });
      navLinks.forEach((l) => l.removeAttribute("aria-current"));
      if (breadcrumb) breadcrumb.textContent = "Notificaciones";
      document.title = "Notificaciones | TutoresOn-Line";
      historyOpen = true;
      $("#notifications-title")?.focus();
    }

    function leaveHistory(target) {
      allSections.forEach((s) => { s.hidden = s !== target; });
      navLinks.forEach((link, i) => {
        link.removeAttribute("aria-current");
        if (target === previous && savedNav[i]) link.setAttribute("aria-current", savedNav[i]);
        else if (link.getAttribute("href") === `#${target.id}`) link.setAttribute("aria-current", "page");
      });
      if (breadcrumb) breadcrumb.textContent = target === previous ? savedCrumb : target.id;
      document.title = savedTitle;
      historyOpen = false;
    }

    toggle.addEventListener("click", () => {
      const willOpen = dropdown.hidden;
      dropdown.hidden = !willOpen;
      toggle.setAttribute("aria-expanded", String(willOpen));
    });
    document.addEventListener("click",   (e) => { if (!widget.contains(e.target)) closeDropdown(); });
    document.addEventListener("focusin", (e) => { if (!widget.contains(e.target)) closeDropdown(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !dropdown.hidden) closeDropdown(true); });

    viewAll.addEventListener("click", (e) => {
      e.preventDefault();
      if (window.location.hash === "#notificaciones") openHistory();
      else window.location.hash = "notificaciones";
    });

    back.addEventListener("click", () => {
      if (!previous) return;
      leaveHistory(previous);
      window.location.hash = previous.id;
      toggle.focus();
    });

    window.addEventListener("hashchange", () => {
      if (window.location.hash === "#notificaciones") { openHistory(); return; }
      if (historyOpen) {
        const target = allSections.find((s) => `#${s.id}` === window.location.hash);
        leaveHistory(target || previous);
      }
    });

    if (window.location.hash === "#notificaciones") openHistory();
  }
}

/* ================================================================
   3. Perfil del estudiante (Firestore)
   ================================================================ */
function aplicarPerfil() {
  const fullName   = `${profile.name} ${profile.lastname}`.trim();
  const avatarText = ((profile.name[0] || "") + (profile.lastname[0] || "")).toUpperCase() || "E";

  const nameInput    = $("#perfil-nombre");
  const lastInput    = $("#perfil-apellido");
  const emailInput   = $("#perfil-correo");

  if (nameInput)  nameInput.value  = profile.name;
  if (lastInput)  lastInput.value  = profile.lastname;
  if (emailInput) { emailInput.value = profile.email; emailInput.readOnly = true; }

  const formAvatar = $(".profile-avatar", $("#profile-form"));
  const formName   = $(".profile-name",   $("#profile-form"));
  if (formAvatar) formAvatar.textContent = avatarText;
  if (formName)   formName.textContent   = fullName || "Estudiante";

  const topAvatar = $(".user-avatar");
  if (topAvatar) {
    topAvatar.textContent = avatarText;
    topAvatar.setAttribute("aria-label", fullName ? `Mi perfil, ${fullName}` : "Mi perfil");
  }

  const pageTitle = $("#page-title");
  if (pageTitle && profile.name) {
    const h = new Date().getHours();
    const saludo = h < 12 ? "Buenos días" : h < 18 ? "Buenas tardes" : "Buenas noches";
    pageTitle.textContent = `${saludo}, ${profile.name}`;
  }
}

async function cargarPerfil(uid) {
  const nota = $("#profile-note");
  if (nota) nota.textContent = "Cargando tu perfil…";
  try {
    const snap = await getDoc(doc(db, "usuarios", uid));
    const d = snap.exists() ? snap.data() : {};
    profile = {
      name:     d.nombre   || "",
      lastname: d.apellido || "",
      email:    d.email    || auth.currentUser?.email || ""
    };
    aplicarPerfil();
    if (nota) nota.textContent = "Tu perfil se carga desde tu cuenta.";
  } catch (err) {
    console.warn("No se pudo cargar el perfil:", err);
    if (nota) nota.textContent = "No se pudo cargar tu perfil. Revisa tu conexión.";
  }
}

{
  const profileForm = $("#profile-form");
  const profileNote = $("#profile-note");

  if (profileForm) {
    profileForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const nameInput = $("#perfil-nombre");
      const lastInput = $("#perfil-apellido");
      if (nameInput) nameInput.value = nameInput.value.trim();
      if (lastInput) lastInput.value = lastInput.value.trim();

      const nameOk = nameInput && /\p{L}/u.test(nameInput.value);
      const lastOk = lastInput && /\p{L}/u.test(lastInput.value);

      if (nameInput) nameInput.toggleAttribute("aria-invalid", !nameOk);
      if (lastInput) lastInput.toggleAttribute("aria-invalid", !lastOk);

      if (!nameOk || !lastOk) {
        if (profileNote) profileNote.textContent = "Revisa los campos marcados.";
        return;
      }

      const usuario = auth.currentUser;
      if (!usuario) {
        if (profileNote) profileNote.textContent = "Tu sesión expiró. Vuelve a iniciar sesión.";
        return;
      }

      try {
        await updateDoc(doc(db, "usuarios", usuario.uid), {
          nombre:   nameInput.value,
          apellido: lastInput.value
        });
        profile.name     = nameInput.value;
        profile.lastname = lastInput.value;
        aplicarPerfil();
        if (profileNote) profileNote.textContent = "Cambios guardados en tu perfil.";
        showDemoToast("Perfil actualizado.");
      } catch (err) {
        console.error("Error al guardar perfil:", err);
        if (profileNote) profileNote.textContent = "No se pudo guardar el perfil. Revisa tu conexión.";
      }
    });
  }
}

/* ================================================================
   4. Mis tutorías — normalización y carga (Firestore)
   ================================================================ */
const STATUS_KEYS  = ["upcoming", "pending", "completed", "cancelled"];
const ESTADO_LABEL = {
  upcoming:  { clase: "confirmed", texto: "Confirmada" },
  pending:   { clase: "pending",   texto: "Pendiente"  },
  completed: { clase: "completed", texto: "Completada" },
  cancelled: { clase: "cancelled", texto: "Cancelada"  }
};

function normalizarSolicitud(raw) {
  const status = raw.estado === "pendiente"  ? "pending"
               : raw.estado === "aceptada"   ? "upcoming"
               : "cancelled";
  return {
    id: raw.id, tipo: "solicitud",
    tutor:   raw.tutorNombre  || "Tutor",
    tutorId: raw.tutorId      || "",
    subject: raw.materia      || "Materia",
    date:    tsToISO(raw.fecha),
    start:   raw.horaInicio   || "08:00",
    end:     raw.horaFin      || "09:00",
    mode:    raw.modalidad    || "Virtual",
    status,
    message: raw.mensaje      || "",
    tarifa:  raw.tarifa       || 0
  };
}

function normalizarTutoria(raw) {
  const status = raw.estado === "programada"  ? "upcoming"
               : raw.estado === "completada"  ? "completed"
               : "cancelled";
  return {
    id: raw.id, tipo: "tutoria",
    tutor:   raw.tutorNombre  || "Tutor",
    tutorId: raw.tutorId      || "",
    subject: raw.materia      || "Materia",
    date:    tsToISO(raw.fecha),
    start:   raw.horaInicio   || "08:00",
    end:     raw.horaFin      || "09:00",
    mode:    raw.modalidad    || "Virtual",
    status,
    message: raw.comentario   || "",
    tarifa:  raw.tarifa       || 0
  };
}

async function cargarTutorias(uid) {
  try {
    const [solSnap, tutSnap] = await conTimeout(Promise.all([
      getDocs(query(collection(db, "solicitudes"), where("estudianteId", "==", uid))),
      getDocs(query(collection(db, "tutorias"),    where("estudianteId", "==", uid)))
    ]));
    solicitudesData = solSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    tutoriasData    = tutSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    tutoriasEstado  = "listo";
    tutoriasError   = null;
  } catch (err) {
    console.error("Error cargando tutorías:", err);
    tutoriasEstado = "error";
    tutoriasError  = err;
  }
}

function getItemsByTab(tab) {
  if (tab === "upcoming") {
    return tutoriasData.filter((t) => t.estado === "programada").map(normalizarTutoria);
  }
  if (tab === "pending") {
    return solicitudesData.filter((s) => s.estado === "pendiente").map(normalizarSolicitud);
  }
  if (tab === "completed") {
    return tutoriasData.filter((t) => t.estado === "completada").map(normalizarTutoria);
  }
  // cancelled: rechazadas + canceladas
  return [
    ...solicitudesData.filter((s) => s.estado === "rechazada").map(normalizarSolicitud),
    ...tutoriasData.filter((t) => t.estado === "cancelada").map(normalizarTutoria)
  ];
}

function sessionHtml(item) {
  const estado     = ESTADO_LABEL[item.status];
  const modeIcon   = item.mode === "Presencial" ? "pin" : "video";
  const avatarText = ((item.tutor[0] || "T")).toUpperCase();
  return `
    <button class="session-item" type="button"
      data-session-id="${escapeHTML(item.id)}"
      data-session-type="${escapeHTML(item.tipo)}">
      <div class="session-main-info">
        <div class="session-tutor-avatar" style="
          width:50px;height:50px;border-radius:50%;
          background:var(--color-primary,#6366f1);color:#fff;
          display:flex;align-items:center;justify-content:center;
          font-weight:700;font-size:1rem;flex-shrink:0"
          aria-hidden="true">${escapeHTML(avatarText)}</div>
        <div class="session-details">
          <p class="session-subject">${escapeHTML(item.subject)}</p>
          <h3 class="session-title">Sesión con ${escapeHTML(item.tutor)}</h3>
          <ul class="session-meta-row">
            <li>${svgIcon("calendar")}<span>${escapeHTML(formatDate(item.date))}</span></li>
            <li>${svgIcon("clock")}<span>${escapeHTML(timeLabel(item.start))} – ${escapeHTML(timeLabel(item.end))}</span></li>
            <li>${svgIcon(modeIcon)}<span>${escapeHTML(item.mode)}</span></li>
          </ul>
        </div>
      </div>
      <div class="session-status-side">
        <span class="status-tag ${estado.clase}">${estado.texto}</span>
        ${svgIcon("arrow-right")}
      </div>
    </button>`;
}

/* ================================================================
   5. Pestañas de Mis tutorías
   ================================================================ */
{
  const tabsContainer = $(".sessions-tabs");
  const sessionsList  = $(".sessions-list");

  if (tabsContainer && sessionsList) {
    const tabs       = $$(".tab-btn", tabsContainer);
    let currentTab   = STATUS_KEYS[0];

    function renderCounts() {
      tabs.forEach((tab, i) => {
        const key = STATUS_KEYS[i];
        let badge = $(".tab-count", tab);
        if (tutoriasEstado !== "listo") { badge?.remove(); return; }
        const n   = getItemsByTab(key).length;
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "tab-count";
          tab.appendChild(badge);
        }
        badge.textContent = n;
      });
    }

    function renderSessions(key) {
      currentTab = key;
      if (tutoriasEstado === "cargando") {
        sessionsList.innerHTML = '<p class="sessions-empty" role="status">Cargando tus tutorías…</p>';
        return;
      }
      if (tutoriasEstado === "error") {
        sessionsList.innerHTML = `<p class="sessions-empty" role="alert">No pudimos cargar tus tutorías. ${escapeHTML(detalleError(tutoriasError))}${botonReintentar("tutorias")}</p>`;
        return;
      }
      const items = getItemsByTab(key).sort((a, b) =>
        `${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`)
      );
      sessionsList.innerHTML = items.length
        ? items.map(sessionHtml).join("")
        : '<p class="sessions-empty">No tienes tutorías en este estado.</p>';
    }

    function selectTab(tab, key) {
      tabs.forEach((t) => {
        const active = t === tab;
        t.classList.toggle("is-active", active);
        t.setAttribute("aria-selected", String(active));
      });
      renderSessions(key);
    }

    tabs.forEach((tab, i) => {
      tab.addEventListener("click", () => selectTab(tab, STATUS_KEYS[i]));
    });

    sessionsList.addEventListener("click", (event) => {
      const item = event.target.closest("[data-session-id]");
      if (!item) return;
      selectedSession = { id: item.dataset.sessionId, tipo: item.dataset.sessionType };
      renderDetail();
      window.location.hash = "detalle-tutoria";
    });

    // Exponer para que onAuthStateChanged pueda inicializar y cancelar pueda refrescar
    doRefreshSessions = () => { renderCounts(); renderSessions(currentTab); };

    // Render inicial vacío (antes de cargar Firebase)
    renderCounts();
    selectTab(tabs[0], STATUS_KEYS[0]);
  }
}

/* ================================================================
   6. Detalle de tutoría
   ================================================================ */
function renderDetail() {
  const detail = $("#detalle-tutoria");
  if (!detail || !selectedSession) return;

  let item = null;
  if (selectedSession.tipo === "solicitud") {
    const raw = solicitudesData.find((s) => s.id === selectedSession.id);
    if (raw) item = normalizarSolicitud(raw);
  } else {
    const raw = tutoriasData.find((t) => t.id === selectedSession.id);
    if (raw) item = normalizarTutoria(raw);
  }

  if (!item) { window.location.hash = "tutorias"; return; }

  const estado    = ESTADO_LABEL[item.status];
  const cancelable = item.status === "upcoming" || item.status === "pending";
  const modeIcon  = item.mode === "Presencial" ? "pin" : "video";

  const qs = (id) => $(`#${id}`, detail);
  if (qs("detail-subject")) qs("detail-subject").textContent = item.subject;
  if (qs("detail-title"))   qs("detail-title").textContent   = `Sesión con ${item.tutor}`;
  if (qs("detail-tutor"))   qs("detail-tutor").textContent   = `Con ${item.tutor}`;

  const statusEl = qs("detail-status");
  if (statusEl) { statusEl.className = `status-tag ${estado.clase}`; statusEl.textContent = estado.texto; }

  const metaEl = qs("detail-meta");
  if (metaEl) {
    metaEl.innerHTML = [
      `<li>${svgIcon("calendar")}<span>${escapeHTML(formatDate(item.date))}</span></li>`,
      `<li>${svgIcon("clock")}<span>${escapeHTML(timeLabel(item.start))} – ${escapeHTML(timeLabel(item.end))}</span></li>`,
      `<li>${svgIcon(modeIcon)}<span>${escapeHTML(item.mode)}</span></li>`,
      item.tarifa
        ? `<li>${svgIcon("book")}<span>$${Number(item.tarifa).toLocaleString("es-CO")}/hora</span></li>`
        : ""
    ].join("");
  }

  const noteEl = qs("detail-note");
  if (noteEl) {
    noteEl.textContent = item.status === "upcoming"
      ? "El enlace de la videoconferencia se habilita 15 minutos antes del inicio."
      : item.status === "pending"
      ? "Esperando la respuesta del tutor."
      : "Esta tutoría ya no se puede modificar.";
  }

  const cancelBtn = qs("detail-cancel");
  if (cancelBtn) cancelBtn.hidden = !cancelable;
}

{
  const detail       = $("#detalle-tutoria");
  const cancelDialog = $("#cancel-dialog");

  if (detail && cancelDialog) {
    const cancelBtn    = $("#detail-cancel", detail);
    const cancelText   = $("#cancel-text");
    const cancelKeep   = $("#cancel-keep");
    const cancelConfirm = $("#cancel-confirm");

    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        if (!selectedSession) return;
        let item = null;
        if (selectedSession.tipo === "solicitud") {
          const raw = solicitudesData.find((s) => s.id === selectedSession.id);
          if (raw) item = normalizarSolicitud(raw);
        } else {
          const raw = tutoriasData.find((t) => t.id === selectedSession.id);
          if (raw) item = normalizarTutoria(raw);
        }
        if (!item) return;
        if (cancelText) {
          cancelText.textContent =
            `Sesión con ${item.tutor}, ${formatDate(item.date)} a las ${timeLabel(item.start)}.`;
        }
        cancelDialog.showModal();
      });
    }

    if (cancelKeep) cancelKeep.addEventListener("click", () => cancelDialog.close());

    if (cancelConfirm) {
      cancelConfirm.addEventListener("click", async () => {
        if (!selectedSession || !estudianteUid) return;
        cancelDialog.close();
        try {
          if (selectedSession.tipo === "solicitud") {
            await updateDoc(doc(db, "solicitudes", selectedSession.id), { estado: "rechazada" });
            const idx = solicitudesData.findIndex((s) => s.id === selectedSession.id);
            if (idx >= 0) solicitudesData[idx].estado = "rechazada";
          } else {
            await updateDoc(doc(db, "tutorias", selectedSession.id), { estado: "cancelada" });
            const idx = tutoriasData.findIndex((t) => t.id === selectedSession.id);
            if (idx >= 0) tutoriasData[idx].estado = "cancelada";
          }
          refrescarVistas();
          window.location.hash = "tutorias";
          showDemoToast("Tutoría cancelada.");
        } catch (err) {
          console.error("Error al cancelar:", err);
          showDemoToast("No se pudo cancelar. Revisa tu conexión.");
        }
      });
    }

    window.addEventListener("hashchange", () => {
      if (window.location.hash === "#detalle-tutoria") renderDetail();
    });
    // Si alguien entra directo a #detalle-tutoria sin haber seleccionado nada
    if (window.location.hash === "#detalle-tutoria") window.location.hash = "tutorias";
  }
}

/* ================================================================
   7. Buscar tutores (Firestore)
   ================================================================ */
async function cargarTutores() {
  tutoresEstado = "cargando";
  tutoresError  = null;
  try {
    const ahora = new Date();
    const hoy   = dateISO(ahora);
    const hora  = horaISO(ahora);
    const q = query(
      collection(db, "usuarios"),
      where("rol",    "==", "tutor"),
      where("estado", "in", ["aprobado", "aceptado"])
    );
    const snap = await conTimeout(getDocs(q));
    tutoresData = snap.docs.map((d) => {
      const data = d.data();
      // Solo bloques que todavía no pasaron, del más próximo al más lejano
      const disponibilidad = (Array.isArray(data.disponibilidad) ? data.disponibilidad : [])
        .filter((b) => b && b.fecha &&
          (b.fecha > hoy || (b.fecha === hoy && (b.horaFin || "23:59") > hora)))
        .sort((a, b) => `${a.fecha}T${a.horaInicio}`.localeCompare(`${b.fecha}T${b.horaInicio}`));
      return { id: d.id, ...data, disponibilidad };
    });
    tutoresEstado = "listo";
    if (!tutoresData.length) {
      console.info(
        "[Buscar tutores] La consulta funcionó pero no devolvió tutores. En Firestore → usuarios, " +
        "un tutor solo aparece si tiene rol = \"tutor\" y estado = \"aprobado\" o \"aceptado\" (exactamente así, en minúsculas)."
      );
    }
  } catch (err) {
    console.error("Error cargando tutores:", err);
    tutoresData   = [];
    tutoresEstado = "error";
    tutoresError  = err;
  }
}

const TONES = ["tone-green", "tone-blue", "tone-sand"];

function tutorCardHtml(tutor, index) {
  const nombre     = nombreDe(tutor) || "Tutor";
  const inits      = iniciales(nombre, "T");
  const materiaLbl = materiasDe(tutor).join(", ") || "General";
  const dispCount  = tutor.disponibilidad?.length || 0;
  const proximo    = dispCount ? tutor.disponibilidad[0] : null;
  const availText  = dispCount === 0
    ? "Sin horarios disponibles"
    : dispCount === 1 ? "1 horario disponible"
    : `${dispCount} horarios disponibles`;
  const tone       = TONES[index % TONES.length];

  return `
    <article class="tutor-card ${tone}">
      <div class="tutor-cover" style="display:flex;align-items:center;justify-content:center;background:var(--color-surface-alt,#f1f5f9);min-height:104px">
        <div style="width:80px;height:80px;border-radius:50%;background:var(--color-primary,#6366f1);
          color:#fff;display:flex;align-items:center;justify-content:center;
          font-size:1.75rem;font-weight:700" aria-hidden="true">
          ${escapeHTML(inits)}
        </div>
        <button class="favorite-button" type="button" aria-label="Guardar a ${escapeHTML(nombre)}">
          ${svgIcon("heart")}
        </button>
      </div>
      <div class="tutor-body">
        <div class="tutor-title">
          <div>
            <p class="tutor-subject">${escapeHTML(materiaLbl)}</p>
            <h3>${escapeHTML(nombre)}</h3>
          </div>
          ${dispCount > 0 ? '<span class="online-dot" title="Con horarios disponibles"></span>' : ""}
        </div>
        <p class="tutor-bio">${escapeHTML(tutor.presentacion || "Tutor registrado en la plataforma.")}</p>
        <ul class="tutor-meta">
          <li>${svgIcon("cap")}${escapeHTML(tutor.titulo || "Profesional")}</li>
          <li>${svgIcon("pin")}${escapeHTML(tutor.ciudad || "Colombia")}</li>
          ${proximo ? `<li>${svgIcon("clock")}Próximo: ${escapeHTML(formatDate(proximo.fecha))} · ${escapeHTML(timeLabel(proximo.horaInicio))}</li>` : ""}
        </ul>
        <div class="tutor-rating">
          <span class="availability">${escapeHTML(availText)}</span>
          ${tutor.tarifa
            ? `<span style="font-size:.8rem;color:var(--color-text-muted,#64748b)">
               $${Number(tutor.tarifa).toLocaleString("es-CO")}/hora</span>`
            : ""}
        </div>
        <div class="tutor-actions">
          <button class="outline-button" type="button" data-tutor-profile="${escapeHTML(tutor.id)}">Ver perfil</button>
          <button class="solid-button ${dispCount === 0 ? "disabled" : ""}" type="button"
            data-tutor-reserve="${escapeHTML(tutor.id)}"
            ${dispCount === 0 ? "disabled title='Sin horarios disponibles'" : ""}>
            ${svgIcon("calendar")}Reservar
          </button>
        </div>
      </div>
    </article>`;
}

{
  const searchSection = $(".student-search");
  if (searchSection) {
    const searchInput    = $('input[type="search"]', searchSection);
    const filterSelects  = $$(".search-filters .filter-field select", searchSection);
    const subjectSelect  = filterSelects[0];
    const modalitySelect = filterSelects[1];
    const sortSelect     = $(".sort-field select", searchSection);
    const tutorGrid      = $(".tutor-grid", searchSection);
    const resultsCount   = $(".results-count strong", searchSection);

    const setCount = (texto) => { if (resultsCount) resultsCount.textContent = texto; };
    const mensaje  = (html, rol = "status") =>
      `<p class="sessions-empty" role="${rol}" style="grid-column:1/-1">${html}</p>`;

    function renderTutores() {
      if (!tutorGrid) return;

      if (tutoresEstado === "cargando") {
        tutorGrid.innerHTML = mensaje("Cargando tutores disponibles…");
        setCount("Buscando tutores…");
        return;
      }

      if (tutoresEstado === "error") {
        tutorGrid.innerHTML = mensaje(
          `No pudimos cargar los tutores. ${escapeHTML(detalleError(tutoresError))}${botonReintentar("tutores")}`,
          "alert"
        );
        setCount("No se pudo cargar la lista");
        return;
      }

      if (tutoresData.length === 0) {
        tutorGrid.innerHTML = mensaje("Todavía no hay tutores disponibles. Vuelve pronto: estamos aprobando nuevos perfiles.");
        setCount("0 tutores encontrados");
        return;
      }

      const text    = normalize(searchInput?.value || "");
      const subject = subjectSelect?.value  || "Todas las materias";
      const mod     = modalitySelect?.value || "Cualquier modalidad";
      const order   = sortSelect?.value     || "Nombre";
      filtroMateria = subject === "Todas las materias" ? "" : subject;

      const filtered = tutoresData.filter((tutor) => {
        const materias = materiasDe(tutor);
        const nombre   = normalize(nombreDe(tutor));
        const bio      = normalize(tutor.presentacion || "");
        const extra    = normalize(`${tutor.titulo || ""} ${tutor.ciudad || ""}`);

        const matchText = !text ||
          nombre.includes(text) || bio.includes(text) || extra.includes(text) ||
          materias.some((m) => normalize(m).includes(text));

        const matchSubject = subject === "Todas las materias" || materias.includes(subject);

        const matchMod = mod === "Cualquier modalidad" ||
          (tutor.disponibilidad || []).some(
            (b) => b.modalidad === mod || b.modalidad === "Virtual y presencial"
          );

        return matchText && matchSubject && matchMod;
      });

      if (order === "Disponibilidad") {
        filtered.sort((a, b) => (b.disponibilidad?.length || 0) - (a.disponibilidad?.length || 0));
      } else {
        filtered.sort((a, b) => nombreDe(a).localeCompare(nombreDe(b), "es"));
      }

      setCount(filtered.length === 1 ? "1 tutor encontrado" : `${filtered.length} tutores encontrados`);

      tutorGrid.innerHTML = filtered.length
        ? filtered.map((t, i) => tutorCardHtml(t, i)).join("")
        : mensaje("No encontramos tutores con esos filtros. Prueba con otra materia o modalidad.");
    }

    if (searchInput)    searchInput.addEventListener("input",   renderTutores);
    if (subjectSelect)  subjectSelect.addEventListener("change", renderTutores);
    if (modalitySelect) modalitySelect.addEventListener("change", renderTutores);
    if (sortSelect)     sortSelect.addEventListener("change",    renderTutores);

    // Exponer para llamar después de cargar Firebase
    doRefreshTutores = renderTutores;
  }
}

/* ================================================================
   8. Perfil del tutor: diálogo (datos reales de Firestore)
   ================================================================ */
function buildTutorDialog() {
  const existing = $("#tutor-profile-dialog");
  if (existing) return existing;

  const dialog = document.createElement("dialog");
  dialog.className = "tutor-profile-dialog";
  dialog.id = "tutor-profile-dialog";
  dialog.setAttribute("aria-labelledby", "tp-title");
  dialog.innerHTML = `
    <div class="tp-cover">
      <button class="tp-close" type="button" aria-label="Cerrar perfil">${svgIcon("close")}</button>
      <div id="tp-initials" style="
        width:100px;height:100px;border-radius:50%;
        background:var(--color-primary,#6366f1);color:#fff;
        display:flex;align-items:center;justify-content:center;
        font-size:2.5rem;font-weight:700;margin:1.5rem auto 0"
        aria-hidden="true"></div>
    </div>
    <div class="tp-body">
      <p class="tp-subject" id="tp-subject"></p>
      <h2 class="tp-name"  id="tp-title"></h2>
      <p class="tp-location" id="tp-location" style="color:var(--color-text-muted,#64748b);font-size:.875rem"></p>
      <p class="tp-bio"    id="tp-bio"   style="margin:.75rem 0"></p>
      <p class="tp-rate"   id="tp-rate"  style="font-weight:600"></p>
      <div class="tp-schedule" id="tp-schedule" style="margin:.75rem 0"></div>
      <div class="tp-actions" style="display:flex;gap:.75rem;margin-top:1rem;flex-wrap:wrap">
        <button id="tp-reserve-btn" class="solid-button" type="button">
          ${svgIcon("calendar")} Reservar sesión
        </button>
        <button class="tp-close-button outline-button" type="button">Cerrar</button>
      </div>
    </div>`;

  dialog.addEventListener("click", (e) => {
    if (e.target.closest(".tp-close") || e.target.closest(".tp-close-button")) dialog.close();
  });

  document.body.appendChild(dialog);
  return dialog;
}

function openTutorProfile(tutorId) {
  const tutor = tutoresData.find((t) => t.id === tutorId);
  if (!tutor) return;

  const dialog  = buildTutorDialog();
  const nombre  = nombreDe(tutor);
  const inits   = iniciales(nombre, "T");
  const materias = materiasDe(tutor).join(", ") || "General";
  const disps   = Array.isArray(tutor.disponibilidad) ? tutor.disponibilidad : [];

  $("#tp-initials", dialog).textContent   = inits;
  $("#tp-subject",  dialog).textContent   = materias;
  $("#tp-title",    dialog).textContent   = nombre;
  $("#tp-location", dialog).textContent   =
    [tutor.titulo, tutor.institucion, tutor.ciudad].filter(Boolean).join(" · ");
  $("#tp-bio",      dialog).textContent   = tutor.presentacion || "";
  $("#tp-rate",     dialog).textContent   = tutor.tarifa
    ? `Tarifa: $${Number(tutor.tarifa).toLocaleString("es-CO")}/hora` : "";

  const schedEl = $("#tp-schedule", dialog);
  if (disps.length > 0) {
    schedEl.innerHTML = `
      <p style="font-weight:600;font-size:.875rem;margin-bottom:.4rem">Horarios disponibles</p>
      <ul style="list-style:none;padding:0;display:flex;flex-direction:column;gap:.3rem;font-size:.8rem;color:var(--color-text-muted,#64748b)">
        ${disps.slice(0, 6).map((b) => `
          <li>📅 ${escapeHTML(formatDate(b.fecha))} · ${escapeHTML(timeLabel(b.horaInicio))}–${escapeHTML(timeLabel(b.horaFin))} · ${escapeHTML(b.modalidad)}</li>
        `).join("")}
        ${disps.length > 6 ? `<li>…y ${disps.length - 6} horarios más</li>` : ""}
      </ul>`;
  } else {
    schedEl.innerHTML = `<p style="font-size:.875rem;color:var(--color-text-muted,#64748b)">Este tutor aún no tiene horarios disponibles.</p>`;
  }

  const reserveBtn = $("#tp-reserve-btn", dialog);
  if (reserveBtn) {
    reserveBtn.disabled = disps.length === 0;
    reserveBtn.onclick  = () => { dialog.close(); iniciarReserva(tutor); };
  }

  dialog.showModal();
}

/* ================================================================
   9. Delegación de clics (tutores — buscar y perfil-dialog)
   ================================================================ */
document.addEventListener("click", (event) => {
  const retryBtn = event.target.closest("[data-reintentar]");
  if (retryBtn) { reintentar(retryBtn.dataset.reintentar); return; }

  // Enlaces de Inicio que llevan al detalle de una tutoría concreta
  const sessionLink = event.target.closest("[data-abrir-sesion]");
  if (sessionLink) {
    selectedSession = { id: sessionLink.dataset.abrirSesion, tipo: sessionLink.dataset.sesionTipo };
    renderDetail();
    return; // el enlace (#detalle-tutoria) hace la navegación
  }

  // Enlaces de Inicio que abren una pestaña concreta de Mis tutorías
  const tabLink = event.target.closest("[data-abrir-tab]");
  if (tabLink) {
    const tab = $$(".sessions-tabs .tab-btn")[Number(tabLink.dataset.abrirTab)];
    tab?.click();
    return;
  }

  const profileBtn = event.target.closest("[data-tutor-profile]");
  if (profileBtn) { openTutorProfile(profileBtn.dataset.tutorProfile); return; }

  const reserveBtn = event.target.closest("[data-tutor-reserve]");
  if (reserveBtn) {
    const tutor = tutoresData.find((t) => t.id === reserveBtn.dataset.tutorReserve);
    if (tutor) iniciarReserva(tutor);
    return;
  }

  const fav = event.target.closest(".favorite-button");
  if (fav) fav.setAttribute("aria-pressed", String(fav.getAttribute("aria-pressed") !== "true"));
});

/* ================================================================
   10. Reservar tutoría (Firestore — crea solicitud)
   ================================================================ */
// Si el estudiante filtró por una materia que el tutor enseña, se reserva esa;
// si no, la primera materia del tutor.
function materiaParaReserva(tutor) {
  const materias = materiasDe(tutor);
  return (filtroMateria && materias.includes(filtroMateria))
    ? filtroMateria
    : (materias[0] || "General");
}

function iniciarReserva(tutor) {
  reservaTutor    = tutor;
  reservaBloque   = null;
  reservaModalidad = "";

  const sec = $("#reservar");
  if (!sec) return;

  const nombre  = nombreDe(tutor);
  const materias = materiasDe(tutor).join(", ") || "General";
  $("#reserva-tutor").textContent = `Con ${nombre} · ${materias}`;
  $("#reserva-card").hidden = false;
  $("#reserva-ok").hidden   = true;
  const msg = $("#reserva-mensaje");
  if (msg) msg.value = "";
  $$(".reserva-opcion[data-modo]", sec).forEach((b) => b.setAttribute("aria-pressed", "false"));

  if (doRenderReserva) doRenderReserva(1);
  window.location.hash = "reservar";
}

{
  const sec = $("#reservar");
  if (sec) {
    const note        = $("#reserva-note");
    const pasos       = $$("#reserva-pasos li");
    const prevBtn     = $("#reserva-atras");
    const nextBtn     = $("#reserva-sig");
    const diasDiv     = $("#reserva-dias");
    const horasDiv    = $("#reserva-horas");
    let   paso        = 1;

    function renderBloques() {
      if (!diasDiv) return;
      const tutor = reservaTutor;
      if (!tutor) return;

      const disps = (tutor.disponibilidad || []).filter((b) => {
        if (!reservaModalidad) return true;
        return b.modalidad === reservaModalidad || b.modalidad === "Virtual y presencial";
      });

      if (disps.length === 0) {
        diasDiv.innerHTML =
          '<p class="sessions-empty" style="margin:0">No hay horarios para esta modalidad.</p>';
        if (horasDiv) horasDiv.innerHTML = "";
        return;
      }

      diasDiv.innerHTML = disps.map((b) => {
        const sel = reservaBloque?.id === b.id;
        return `<button type="button" class="reserva-opcion${sel ? " is-selected" : ""}"
          data-block-id="${escapeHTML(b.id)}"
          aria-pressed="${sel}"
          style="flex-direction:column;align-items:flex-start;gap:2px;padding:.6rem .9rem">
          <strong>${escapeHTML(formatDate(b.fecha))}</strong>
          <small>${escapeHTML(timeLabel(b.horaInicio))} – ${escapeHTML(timeLabel(b.horaFin))}</small>
          <small style="color:var(--color-text-muted,#64748b)">${escapeHTML(b.modalidad)}</small>
        </button>`;
      }).join("");
      if (horasDiv) horasDiv.innerHTML = "";
    }

    function renderResumen() {
      const resumenEl = $("#reserva-resumen", sec);
      if (!resumenEl || !reservaTutor || !reservaBloque) return;
      const nombre  = nombreDe(reservaTutor);
      const materia = materiaParaReserva(reservaTutor);
      resumenEl.innerHTML = [
        `${nombre} · ${materia}`,
        `${formatDate(reservaBloque.fecha)} · ${timeLabel(reservaBloque.horaInicio)} – ${timeLabel(reservaBloque.horaFin)}`,
        reservaBloque.modalidad
      ].map((t) => `<li><span>${escapeHTML(t)}</span></li>`).join("");

      // Agregar campo de mensaje si no existe aún
      if (!$("#reserva-mensaje-field", sec)) {
        const msgField = document.createElement("div");
        msgField.id = "reserva-mensaje-field";
        msgField.style.marginTop = "1rem";
        msgField.innerHTML = `
          <label style="display:block">
            <span style="display:block;margin-bottom:.4rem;font-size:.875rem;font-weight:500">
              Mensaje para el tutor (opcional)
            </span>
            <textarea id="reserva-mensaje" rows="3" maxlength="300"
              placeholder="Cuéntale sobre el tema que necesitas repasar…"
              style="width:100%;padding:.6rem;border:1px solid var(--color-border,#e2e8f0);
                     border-radius:.5rem;font-family:inherit;font-size:.875rem;box-sizing:border-box">
            </textarea>
          </label>`;
        resumenEl.parentElement?.appendChild(msgField);
      }
    }

    function renderReserva(n) {
      paso = n;
      [1, 2, 3].forEach((i) => {
        const p = $(`#reserva-p${i}`, sec);
        if (p) p.hidden = i !== n;
      });
      pasos.forEach((li, i) => li.classList.toggle("is-active", i + 1 <= n));
      const nextSpan = $("span", nextBtn);
      if (nextSpan) nextSpan.textContent = n === 3 ? "Enviar solicitud" : "Continuar";
      if (prevBtn) prevBtn.hidden = n === 1;
      if (note)    note.textContent = "";
      if (n === 2) renderBloques();
      if (n === 3) renderResumen();
    }

    doRenderReserva = renderReserva;

    // Clics dentro de #reservar
    sec.addEventListener("click", (event) => {
      const modBtn = event.target.closest("[data-modo]");
      if (modBtn) {
        reservaModalidad = modBtn.dataset.modo;
        $$(".reserva-opcion[data-modo]", sec).forEach((b) =>
          b.setAttribute("aria-pressed", String(b.dataset.modo === reservaModalidad))
        );
        if (note) note.textContent = "";
        return;
      }

      const blockBtn = event.target.closest("[data-block-id]");
      if (blockBtn) {
        const bid = blockBtn.dataset.blockId;
        reservaBloque = (reservaTutor?.disponibilidad || []).find((b) => b.id === bid) || null;
        $$("[data-block-id]", sec).forEach((b) => {
          const sel = b.dataset.blockId === bid;
          b.classList.toggle("is-selected", sel);
          b.setAttribute("aria-pressed", String(sel));
        });
        if (note) note.textContent = "";
      }
    });

    if (prevBtn) prevBtn.addEventListener("click", () => renderReserva(paso - 1));

    if (nextBtn) {
      nextBtn.addEventListener("click", async () => {
        if (paso === 1) {
          if (!reservaModalidad) {
            if (note) note.textContent = "Elige una modalidad para continuar.";
            return;
          }
          renderReserva(2);
          return;
        }
        if (paso === 2) {
          if (!reservaBloque) {
            if (note) note.textContent = "Elige un horario disponible para continuar.";
            return;
          }
          renderReserva(3);
          return;
        }

        // ── Paso 3: enviar solicitud a Firestore ──
        if (!estudianteUid || !reservaTutor || !reservaBloque) {
          if (note) note.textContent = "Falta información. Vuelve al paso anterior.";
          return;
        }

        const mensaje = ($("#reserva-mensaje", sec)?.value || "").trim();
        const nombre  = nombreDe(reservaTutor);
        const materia = materiaParaReserva(reservaTutor);
        const estudNombre = `${profile.name} ${profile.lastname}`.trim() || "Estudiante";

        // Protección contra doble envío (doble clic / reintentos)
        if (enviandoSolicitud) return;
        enviandoSolicitud = true;

        try {
          nextBtn.disabled = true;
          if (note) note.textContent = "Enviando solicitud…";

          // ¿Ya existe una solicitud pendiente para este mismo tutor y horario?
          const previas = await getDocs(query(
            collection(db, "solicitudes"),
            where("estudianteId", "==", estudianteUid)
          ));
          const yaExiste = previas.docs.some((d) => {
            const x = d.data();
            return x.estado === "pendiente" &&
              x.tutorId === reservaTutor.id &&
              x.fecha === reservaBloque.fecha &&
              x.horaInicio === reservaBloque.horaInicio;
          });
          if (yaExiste) {
            await cargarTutorias(estudianteUid);
            refrescarVistas();
            if (note) note.textContent = "Ya enviaste una solicitud pendiente para ese horario.";
            nextBtn.disabled = false;
            enviandoSolicitud = false;
            return;
          }

          await addDoc(collection(db, "solicitudes"), {
            tutorId:          reservaTutor.id,
            tutorNombre:      nombre,
            estudianteId:     estudianteUid,
            estudianteNombre: estudNombre,
            materia,
            fecha:      reservaBloque.fecha,
            horaInicio: reservaBloque.horaInicio,
            horaFin:    reservaBloque.horaFin,
            modalidad:  reservaBloque.modalidad,
            mensaje,
            tarifa:     Number(reservaTutor.tarifa) || 0,
            estado:     "pendiente",
            creadaEn:   serverTimestamp()
          });

          // Recargar las solicitudes del estudiante y refrescar las pestañas
          await cargarTutorias(estudianteUid);
          refrescarVistas();

          $("#reserva-card").hidden = true;
          $("#reserva-ok").hidden   = false;
          nextBtn.disabled = false;
          if (note) note.textContent = "";
        } catch (err) {
          console.error("Error al enviar solicitud:", err);
          nextBtn.disabled = false;
          if (note) note.textContent = "No se pudo enviar la solicitud. Revisa tu conexión.";
        } finally {
          enviandoSolicitud = false;
        }
      });
    }

    // Guard: si alguien entra a #reservar sin tutor, redirigir a buscar
    const guard = () => {
      if (window.location.hash === "#reservar" && !reservaTutor) window.location.hash = "buscar";
    };
    window.addEventListener("hashchange", guard);
    window.addEventListener("DOMContentLoaded", guard);
  }
}

/* ================================================================
   11. Seguridad (demostración)
   ================================================================ */
{
  const form = $("#security-form");
  const note = $("#security-note");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const { actual, nueva, confirmar } = form.elements;
      let msg = "";
      if (!actual?.value) msg = "Escribe tu contraseña actual.";
      else if ((nueva?.value || "").length < 8) msg = "La nueva contraseña debe tener al menos 8 caracteres.";
      else if (nueva?.value !== confirmar?.value) msg = "Las contraseñas nuevas no coinciden.";
      if (msg) { if (note) note.textContent = msg; return; }
      form.reset();
      if (note) note.textContent = "Vista de demostración: la contraseña no se cambia.";
      showDemoToast("Contraseña actualizada (demostración).");
    });
  }
}

/* ================================================================
   12. Centro de ayuda / Contacto (demostración)
   ================================================================ */
{
  const form = $("#contact-form");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const { asunto, mensaje } = form.elements;
      if (!asunto?.value.trim() || !mensaje?.value.trim()) {
        showDemoToast("Completa el asunto y el mensaje.");
        return;
      }
      form.reset();
      showDemoToast("Mensaje enviado al equipo (demostración).");
    });
  }
}

/* ================================================================
   13. Inicio y notificaciones (datos reales de Firestore)
   ================================================================ */
function finDeSesion(item) {
  const [y, m, d] = item.date.split("-").map(Number);
  const [h, min]  = (item.end || "23:59").split(":").map(Number);
  return new Date(y, m - 1, d, h, min);
}

function lunesDeEstaSemana() {
  const hoy   = new Date();
  const lunes = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7));
  return lunes;
}

function mensajeVacio(html, rol = "status") {
  return `<p class="sessions-empty" role="${rol}" style="grid-column:1/-1">${html}</p>`;
}

function renderInicio() {
  // El aviso "Vista de demostración" ya no aplica en Inicio
  $("#inicio > .demo-notice")?.remove();

  const ahora = new Date();

  const programadas = tutoriasData
    .filter((t) => t.estado === "programada")
    .map(normalizarTutoria)
    .filter((t) => finDeSesion(t) >= ahora)
    .sort((a, b) => `${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`));

  const pendientes = solicitudesData
    .filter((s) => s.estado === "pendiente")
    .map(normalizarSolicitud)
    .sort((a, b) => `${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`));

  /* ── Próxima tutoría ── */
  const upcomingCard = $(".upcoming-card");
  if (upcomingCard) {
    const cabecera = (insignia = "") => `
      <div class="card-heading">
        <div>
          <p class="card-eyebrow">Tu agenda</p>
          <h2 id="upcoming-title">Próxima tutoría</h2>
        </div>${insignia}
      </div>`;

    if (tutoriasEstado === "cargando") {
      upcomingCard.innerHTML = cabecera() + mensajeVacio("Cargando tu agenda…");
    } else if (tutoriasEstado === "error") {
      upcomingCard.innerHTML = cabecera() +
        mensajeVacio(`No pudimos cargar tu agenda.${botonReintentar("tutorias")}`, "alert");
    } else if (!programadas.length) {
      upcomingCard.innerHTML = cabecera() +
        mensajeVacio("Aún no tienes tutorías programadas.") +
        `<a class="card-action" href="#buscar"><span>Buscar un tutor</span>${svgIcon("arrow-right")}</a>`;
    } else {
      const next    = programadas[0];
      const fecha   = new Date(`${next.date}T12:00:00`);
      const mes     = fecha.toLocaleDateString("es-CO", { month: "short" }).replace(".", "").toUpperCase();
      const dow     = fecha.toLocaleDateString("es-CO", { weekday: "short" }).replace(".", "").toUpperCase().slice(0, 3);
      const largo   = fecha.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
      const virtual = next.mode !== "Presencial";

      upcomingCard.innerHTML = cabecera('<span class="status-badge status-confirmed">Confirmada</span>') + `
        <div class="lesson-content">
          <div class="lesson-date" aria-label="${escapeHTML(largo)}">
            <span>${escapeHTML(mes)}</span><strong>${fecha.getDate()}</strong><span>${escapeHTML(dow)}</span>
          </div>
          <div class="lesson-information">
            <p class="lesson-subject">${escapeHTML(next.subject)}</p>
            <h3>Sesión con ${escapeHTML(next.tutor)}</h3>
            <ul class="lesson-details">
              <li>${svgIcon("clock")}<span>${escapeHTML(timeLabel(next.start))} – ${escapeHTML(timeLabel(next.end))}</span></li>
              <li>${svgIcon(virtual ? "video" : "pin")}<span>${virtual ? "Sesión virtual" : "Sesión presencial"}</span></li>
            </ul>
          </div>
          <div class="tutor-avatar" aria-label="Iniciales de ${escapeHTML(next.tutor)}">${escapeHTML(iniciales(next.tutor, "T"))}</div>
        </div>
        <p class="lesson-reminder">El enlace de la sesión estará disponible 15 minutos antes.</p>
        <a class="card-action" href="#detalle-tutoria" data-abrir-sesion="${escapeHTML(next.id)}" data-sesion-tipo="tutoria">
          <span>Ver detalle</span>${svgIcon("arrow-right")}
        </a>`;
    }
  }

  /* ── Tu semana ── */
  {
    const lunes   = lunesDeEstaSemana();
    const domingo = new Date(lunes);
    domingo.setDate(domingo.getDate() + 6);
    const desde = dateISO(lunes);
    const hasta = dateISO(domingo);

    const deLaSemana = tutoriasData
      .filter((t) => t.estado === "programada" || t.estado === "completada")
      .map(normalizarTutoria)
      .filter((t) => t.date >= desde && t.date <= hasta);
    const hechas = deLaSemana.filter((t) => t.status === "completed").length;
    const pct    = deLaSemana.length ? Math.round((hechas / deLaSemana.length) * 100) : 0;

    const count = $(".week-count");
    if (count) {
      count.textContent = tutoriasEstado === "listo" ? String(deLaSemana.length) : "–";
      if (count.nextElementSibling) {
        count.nextElementSibling.textContent = deLaSemana.length === 1 ? "tutoría" : "tutorías";
      }
    }
    const ring = $(".progress-ring");
    if (ring) {
      ring.style.background = `conic-gradient(var(--color-accent) 0% ${pct}%, #e7eff0 ${pct}% 100%)`;
      ring.setAttribute("aria-label", `${pct} por ciento de las tutorías de la semana completadas`);
      const etiqueta = $("span", ring);
      if (etiqueta) etiqueta.textContent = `${pct}%`;
    }
    const barra = $(".progress-value");
    if (barra) barra.style.width = `${pct}%`;
    const pie = $(".week-caption");
    if (pie) {
      pie.textContent = tutoriasEstado !== "listo" ? "Cargando tu semana…"
        : deLaSemana.length ? "de tus tutorías de esta semana completadas"
        : "Aún no tienes tutorías esta semana";
    }
  }

  /* ── Solicitud pendiente ── */
  const pendingCard = $(".pending-card");
  if (pendingCard) {
    const cabecera = (insignia = "") => `
      <div class="card-heading">
        <div>
          <p class="card-eyebrow">Seguimiento</p>
          <h2 id="pending-title">Solicitud pendiente</h2>
        </div>${insignia}
      </div>`;

    if (tutoriasEstado === "cargando") {
      pendingCard.innerHTML = cabecera() + mensajeVacio("Cargando tus solicitudes…");
    } else if (tutoriasEstado === "error") {
      pendingCard.innerHTML = cabecera() +
        mensajeVacio(`No pudimos cargar tus solicitudes.${botonReintentar("tutorias")}`, "alert");
    } else if (!pendientes.length) {
      pendingCard.innerHTML = cabecera() + mensajeVacio("No tienes solicitudes pendientes.");
    } else {
      const pend  = pendientes[0];
      const extra = pendientes.length > 1 ? ` Tienes ${pendientes.length - 1} más.` : "";
      pendingCard.innerHTML = cabecera('<span class="status-badge status-pending">En revisión</span>') + `
        <div class="pending-content">
          <span class="pending-subject">${escapeHTML(pend.subject)}</span>
          <p>${escapeHTML(formatDate(pend.date))} · ${escapeHTML(timeLabel(pend.start))} – ${escapeHTML(timeLabel(pend.end))}</p>
          <span class="pending-update">Con ${escapeHTML(pend.tutor)}. Esperando respuesta del tutor.${escapeHTML(extra)}</span>
        </div>
        <a class="text-link" href="#tutorias" data-abrir-tab="1">
          Ver mis solicitudes
          ${svgIcon("arrow-right")}
        </a>`;
    }
  }

  /* ── Recomendaciones: tutores reales con más horarios disponibles ── */
  const recList = $(".recommendation-list");
  if (recList) {
    if (tutoresEstado === "cargando") {
      recList.innerHTML = mensajeVacio("Cargando tutores…");
    } else if (tutoresEstado === "error") {
      recList.innerHTML = mensajeVacio(`No pudimos cargar los tutores.${botonReintentar("tutores")}`, "alert");
    } else {
      const top = tutoresData
        .filter((t) => t.disponibilidad.length > 0)
        .sort((a, b) => b.disponibilidad.length - a.disponibilidad.length)
        .slice(0, 3);

      recList.innerHTML = top.length
        ? top.map((t) => {
            const nombre = nombreDe(t) || "Tutor";
            const n      = t.disponibilidad.length;
            return `
              <article class="recommendation-card">
                <div class="recommendation-avatar" aria-hidden="true">${escapeHTML(iniciales(nombre, "T"))}</div>
                <div class="recommendation-information">
                  <p class="recommendation-subject">${escapeHTML(materiasDe(t)[0] || "General")}</p>
                  <h3>${escapeHTML(nombre)}</h3>
                  <p>${n === 1 ? "1 horario disponible" : `${n} horarios disponibles`}</p>
                </div>
                <button class="favorite-button" type="button"
                  data-tutor-profile="${escapeHTML(t.id)}"
                  aria-label="Ver perfil de ${escapeHTML(nombre)}">
                  ${svgIcon("arrow-right")}
                </button>
              </article>`;
          }).join("")
        : mensajeVacio("Cuando un tutor publique horarios, lo verás aquí.");
    }
  }
}

/* ── Notificaciones: se generan a partir de tus solicitudes y tutorías ── */
const CLAVE_NOTIF_VISTAS = "estudianteNotificacionesVistas:";

function leerNotificacionesVistas() {
  try {
    return new Set(JSON.parse(localStorage.getItem(CLAVE_NOTIF_VISTAS + estudianteUid) || "[]"));
  } catch (_) {
    return new Set();
  }
}

function guardarNotificacionesVistas(vistas) {
  try {
    localStorage.setItem(CLAVE_NOTIF_VISTAS + estudianteUid, JSON.stringify([...vistas]));
  } catch (_) { /* almacenamiento no disponible: no es crítico */ }
}

function construirNotificaciones() {
  const lista = [];
  const marca = (raw) =>
    (raw.creadaEn?.toMillis?.() ?? Date.parse(`${tsToISO(raw.fecha)}T00:00:00`)) || 0;

  solicitudesData.forEach((raw) => {
    const s      = normalizarSolicitud(raw);
    const cuando = `${formatDate(s.date)}, ${timeLabel(s.start)}`;
    if (raw.estado === "pendiente") {
      lista.push({
        key: `sol:${raw.id}:pendiente`, ts: marca(raw), titulo: "Solicitud pendiente",
        texto: `Tu solicitud con ${s.tutor} (${cuando}) espera respuesta.`
      });
    } else if (raw.estado === "rechazada") {
      lista.push({
        key: `sol:${raw.id}:rechazada`, ts: marca(raw), titulo: "Solicitud cerrada",
        texto: `Tu solicitud con ${s.tutor} (${cuando}) fue rechazada o cancelada.`
      });
    }
  });

  tutoriasData.forEach((raw) => {
    const t      = normalizarTutoria(raw);
    const cuando = `${formatDate(t.date)}, ${timeLabel(t.start)}`;
    const textos = {
      programada: ["Tutoría confirmada", `Tu sesión con ${t.tutor} está confirmada para ${cuando}.`],
      completada: ["Tutoría completada", `Tu sesión con ${t.tutor} figura como completada.`],
      cancelada:  ["Tutoría cancelada",  `Tu sesión con ${t.tutor} (${cuando}) fue cancelada.`]
    }[raw.estado];
    if (textos) {
      lista.push({ key: `tut:${raw.id}:${raw.estado}`, ts: marca(raw), titulo: textos[0], texto: textos[1] });
    }
  });

  return lista.sort((a, b) => b.ts - a.ts);
}

function pintarContadorNotificaciones(sinLeer) {
  const punto = $(".notification-dot");
  if (punto) {
    punto.textContent   = String(sinLeer);
    punto.style.display = sinLeer ? "" : "none";
  }
  const texto = $(".notifications-unread");
  if (texto) texto.textContent = `${sinLeer} sin leer`;
  $("#notifications-toggle")?.setAttribute(
    "aria-label",
    sinLeer ? `Notificaciones, ${sinLeer} sin leer` : "Notificaciones"
  );
}

function marcarNotificacionesVistas() {
  if (!estudianteUid || tutoriasEstado !== "listo") return;
  const vistas = leerNotificacionesVistas();
  construirNotificaciones().forEach((n) => vistas.add(n.key));
  guardarNotificacionesVistas(vistas);
  pintarContadorNotificaciones(0);
}

function renderNotificaciones() {
  $(".notifications-demo")?.remove();
  $("#notificaciones > .demo-notice")?.remove();

  const vista   = $(".notifications-preview");
  const completa = $(".notifications-full-list");
  if (!vista && !completa) return;

  const entrada = (n, h) => `
    <li class="notification-entry${n.nueva ? " is-unread" : ""}">
      <span class="notification-marker" aria-hidden="true"></span>
      <div>
        <${h}>${escapeHTML(n.titulo)}</${h}>
        <p>${escapeHTML(n.texto)}</p>
        <span class="notification-read-label">${n.nueva ? "Sin leer" : "Leída"}</span>
      </div>
    </li>`;

  const sinDatos = (texto) => `
    <li class="notification-entry"><span class="notification-marker" aria-hidden="true"></span>
      <div><p>${texto}</p></div></li>`;

  if (tutoriasEstado !== "listo") {
    const texto = tutoriasEstado === "error"
      ? "No pudimos cargar tus notificaciones."
      : "Cargando tus notificaciones…";
    if (vista)    vista.innerHTML    = sinDatos(texto);
    if (completa) completa.innerHTML = sinDatos(texto);
    pintarContadorNotificaciones(0);
    return;
  }

  const vistas = leerNotificacionesVistas();
  const items  = construirNotificaciones().map((n) => ({ ...n, nueva: !vistas.has(n.key) }));
  const sinLeer = items.filter((n) => n.nueva).length;

  const vacio = sinDatos("Todavía no tienes notificaciones.");
  if (vista)    vista.innerHTML    = items.length ? items.slice(0, 3).map((n) => entrada(n, "h3")).join("") : vacio;
  if (completa) completa.innerHTML = items.length ? items.slice(0, 30).map((n) => entrada(n, "h2")).join("") : vacio;

  pintarContadorNotificaciones(sinLeer);
  if (window.location.hash === "#notificaciones") marcarNotificacionesVistas();
}

/* ================================================================
   14. Entrada principal — onAuthStateChanged
   ================================================================ */
function refrescarVistas() {
  doRefreshSessions?.();
  doRefreshTutores?.();
  renderInicio();
  renderNotificaciones();
}

async function reintentar(que) {
  if (!estudianteUid) return;
  if (que === "tutores") {
    tutoresEstado = "cargando";
    refrescarVistas();
    await cargarTutores();
  } else {
    tutoriasEstado = "cargando";
    refrescarVistas();
    await cargarTutorias(estudianteUid);
  }
  refrescarVistas();
}

// Al entrar a "Todas las notificaciones" se consideran vistas
window.addEventListener("hashchange", () => {
  if (window.location.hash === "#notificaciones") marcarNotificacionesVistas();
});

// Estado inicial mientras Firebase responde: "Cargando…", nunca datos de ejemplo
refrescarVistas();

onAuthStateChanged(auth, async (usuario) => {
  if (!usuario) return; // auth.js redirige al login

  estudianteUid = usuario.uid;

  // Los tres bloques cargan en paralelo y cada uno pinta su parte al llegar
  await Promise.all([
    cargarPerfil(usuario.uid),
    cargarTutorias(usuario.uid).then(refrescarVistas),
    cargarTutores().then(refrescarVistas)
  ]);
});
