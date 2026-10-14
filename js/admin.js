/* js/admin.js — Panel del administrador
   Navegación por #. Conectado a Firestore: Mi perfil, Calificaciones y
   Tutorías (casos de soporte = colección «mensajesSoporte»).
   Siguen con datos de ejemplo: Resumen, Usuarios, Tutores y Materias.
   Seguridad (contraseña) la maneja js/configuracion.js.
   Se carga como módulo: <script type="module" src="../js/admin.js"></script> */

import { auth, db } from "./firebase-config.js";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  pintarAvatar,
  activarSelectorFoto,
  guardarFotoPerfil
} from "./foto-perfil.js";

/* ---------- Utilidades ---------- */
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

function estrellas(n) {
  const v = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
  return "★".repeat(v) + "☆".repeat(5 - v);
}

function fechaCorta(valor) {
  const fecha = typeof valor?.toDate === "function" ? valor.toDate()
    : typeof valor === "string" ? new Date(`${valor.slice(0, 10)}T12:00:00`)
    : null;
  if (!fecha || Number.isNaN(fecha.getTime())) return "";
  return fecha.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

function iniciales(nombre, porDefecto = "AD") {
  return String(nombre).trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map((p) => p[0].toUpperCase()).join("") || porDefecto;
}

function detalleError(err) {
  return err?.code === "permission-denied"
    ? "Firestore no lo permite (permission-denied): revisa que publicaste las reglas nuevas y que tu usuario tiene rol «admin»."
    : "Revisa tu conexión e inténtalo de nuevo.";
}

const ADMIN_SECTIONS = [
  { id: "resumen", label: "Resumen" },
  { id: "usuarios", label: "Usuarios" },
  { id: "tutores", label: "Tutores" },
  { id: "materias", label: "Materias y niveles" },
  { id: "tutorias", label: "Tutorías" },
  { id: "calificaciones", label: "Calificaciones" },
  { id: "notificaciones", label: "Notificaciones" },
  { id: "perfil", label: "Mi perfil" },
  { id: "seguridad", label: "Configuración" },
  { id: "ayuda", label: "Centro de ayuda" }
];

/* ---------- Datos de demostración ---------- */
const demoUsers = [
  { id: 1, name: "María Rodríguez", email: "maria@correo.com", role: "tutor", status: "active", initial: "MR" },
  { id: 2, name: "Sofía Pérez", email: "sofia@correo.com", role: "student", status: "active", initial: "SP" },
  { id: 3, name: "Andrés López", email: "andres@correo.com", role: "student", status: "active", initial: "AL" },
  { id: 4, name: "Carlos Gómez", email: "carlos@correo.com", role: "tutor", status: "suspended", initial: "CG" },
  { id: 5, name: "Valentina Ríos", email: "valentina@correo.com", role: "student", status: "active", initial: "VR" },
  { id: 6, name: "Diego Ávila", email: "diego@correo.com", role: "student", status: "active", initial: "DA" },
  { id: 7, name: "Laura Cárdenas", email: "laura@correo.com", role: "admin", status: "active", initial: "LC" },
  { id: 8, name: "Julián Méndez", email: "julian@correo.com", role: "tutor", status: "active", initial: "JM" },
  { id: 9, name: "Camila Torres", email: "camila@correo.com", role: "student", status: "suspended", initial: "CT" }
];

const demoTutors = [
  {
    id: 1,
    name: "María Rodríguez",
    email: "maria@correo.com",
    subject: "Cálculo integral",
    status: "verified",
    rating: "4.9",
    reviews: 38,
    initial: "MR",
    bio: "Matemática con 5 años de experiencia en nivel universitario."
  },
  {
    id: 4,
    name: "Carlos Gómez",
    email: "carlos@correo.com",
    subject: "Física mecánica",
    status: "suspended",
    rating: "4.2",
    reviews: 11,
    initial: "CG",
    bio: "Físico, enfocado en ejercicios y problemas de aplicación."
  },
  {
    id: 8,
    name: "Julián Méndez",
    email: "julian@correo.com",
    subject: "Álgebra lineal",
    status: "verified",
    rating: "4.8",
    reviews: 24,
    initial: "JM",
    bio: "Ingeniero con experiencia docente en primeros semestres."
  },
  {
    id: 10,
    name: "Paola Duarte",
    email: "paola@correo.com",
    subject: "Inglés B1",
    status: "pending",
    rating: "—",
    reviews: 0,
    initial: "PD",
    bio: "Licenciada en lenguas modernas, certificación B2."
  },
  {
    id: 11,
    name: "Óscar Herrera",
    email: "oscar@correo.com",
    subject: "Química general",
    status: "pending",
    rating: "—",
    reviews: 0,
    initial: "OH",
    bio: "Químico con experiencia en laboratorios universitarios."
  },
  {
    id: 12,
    name: "Natalia Suárez",
    email: "natalia@correo.com",
    subject: "Lectoescritura",
    status: "pending",
    rating: "—",
    reviews: 0,
    initial: "NS",
    bio: "Docente de primaria con 8 años de trayectoria."
  }
];

const demoSubjects = [
  {
    id: 1,
    name: "Cálculo integral",
    level: "Universidad",
    status: "active",
    units: [
      { name: "Integrales indefinidas", detail: "Métodos de integración y sus aplicaciones." },
      { name: "Integrales definidas", detail: "Teorema fundamental del cálculo." },
      { name: "Aplicaciones", detail: "Áreas, volúmenes y problemas de contexto." }
    ]
  },
  {
    id: 2,
    name: "Álgebra lineal",
    level: "Universidad",
    status: "active",
    units: [
      { name: "Sistemas de ecuaciones", detail: "Métodos de eliminación y matrices." },
      { name: "Espacios vectoriales", detail: "Bases, dimensión y transformaciones." }
    ]
  },
  {
    id: 3,
    name: "Física mecánica",
    level: "Universidad",
    status: "active",
    units: [
      { name: "Cinemática", detail: "Movimiento en una y dos dimensiones." },
      { name: "Dinámica", detail: "Leyes de Newton y fuerzas." }
    ]
  },
  {
    id: 4,
    name: "Inglés B1",
    level: "Secundaria",
    status: "active",
    units: [
      { name: "Presente y pasado", detail: "Tiempos verbales básicos." },
      { name: "Conversación", detail: "Situaciones cotidianas y vocabulario." }
    ]
  },
  {
    id: 5,
    name: "Química general",
    level: "Universidad",
    status: "active",
    units: [
      { name: "Estructura atómica", detail: "Modelos atómicos y periodicidad." },
      { name: "Enlaces químicos", detail: "Tipos de enlace y propiedades." }
    ]
  },
  {
    id: 6,
    name: "Lectoescritura",
    level: "Primaria",
    status: "active",
    units: [
      { name: "Comprensión lectora", detail: "Ideas principales e inferencias." },
      { name: "Producción de texto", detail: "Escritura de párrafos sencillos." }
    ]
  },
  {
    id: 7,
    name: "Estadística descriptiva",
    level: "Universidad",
    status: "inactive",
    units: [
      { name: "Medidas de tendencia", detail: "Media, mediana y moda." },
      { name: "Gráficos", detail: "Histogramas y diagramas de caja." }
    ]
  }
];

/* Datos reales (Firestore) */
let adminUid = null;
let adminProfile = { nombre: "", apellido: "", email: "", fotoURL: "" };
let ratings = [];            // colección «calificaciones»
let ratingsEstado = "cargando";
let ratingsError = null;
let cases = [];              // colección «mensajesSoporte»
let casesEstado = "cargando";
let casesError = null;
let editingRatingId = null;

const demoNotifications = [
  { id: 1, title: "Nueva solicitud de tutor", detail: "Paola Duarte envió su solicitud de verificación.", time: "Hace 2 horas" },
  { id: 2, title: "Reporte de sesión", detail: "Diego Ávila reportó un problema con el enlace.", time: "Hace 5 horas" },
  { id: 3, title: "Comentario por revisar", detail: "Hay una calificación pendiente de moderación.", time: "Hace 1 día" },
  { id: 4, title: "Tutor suspendido", detail: "Carlos Gómez fue suspendido temporalmente.", time: "Hace 3 días" }
];

const demoActivity = [
  { icon: "users", title: "Se registró la cuenta de Camila Torres", detail: "Hace 40 minutos" },
  { icon: "award", title: "Paola Duarte solicitó verificación", detail: "Hace 2 horas" },
  { icon: "star", title: "Nueva calificación para Cálculo integral", detail: "Hace 5 horas" },
  { icon: "flag", title: "Caso de soporte abierto: pago duplicado", detail: "Hace 8 horas" }
];

/* ---------- Estado de la interfaz ---------- */
let currentSection = "resumen";
let tutorTab = "pending";
let caseTab = "open";
let activeSubjectId = null;

/* ---------- Navegación ---------- */
function getSectionLabel(hash) {
  const clean = hash.replace("#", "");
  const found = ADMIN_SECTIONS.find((s) => s.id === clean);
  return found ? found.label : "Resumen";
}

function showSection(id) {
  if (!ADMIN_SECTIONS.some((s) => s.id === id)) id = "resumen";

  currentSection = id;

  $$(".dashboard-main > section").forEach((section) => {
    section.hidden = section.id !== id;
  });

  $$(".main-navigation a").forEach((link) => {
    const isActive = link.getAttribute("href") === `#${id}`;
    link.toggleAttribute("aria-current", isActive);
    if (isActive) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  $("#admin-breadcrumb").textContent = getSectionLabel(id);

  window.scrollTo({ top: 0, behavior: "smooth" });
  closeMobileSidebar();
}

/* ---------- Menú móvil ---------- */
function openMobileSidebar() {
  const sidebar = $("#admin-sidebar");
  const overlay = $(".sidebar-overlay");
  const toggle = $(".menu-toggle");
  sidebar.classList.add("is-open");
  overlay.hidden = false;
  toggle.setAttribute("aria-expanded", "true");
  document.body.classList.add("sidebar-open");
}

function closeMobileSidebar() {
  const sidebar = $("#admin-sidebar");
  const overlay = $(".sidebar-overlay");
  const toggle = $(".menu-toggle");
  sidebar.classList.remove("is-open");
  overlay.hidden = true;
  toggle.setAttribute("aria-expanded", "false");
  document.body.classList.remove("sidebar-open");
}

/* ---------- Toast ---------- */
let toastTimer = null;
function showToast(message) {
  const toast = $("#admin-toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}

/* ---------- Renderizado: Resumen ---------- */
function renderStats() {
  const tutorsVerified = demoUsers.filter((u) => u.role === "tutor" && u.status === "active").length;
  const pendingTutors = demoTutors.filter((t) => t.status === "pending").length;

  $("#admin-stat-users").textContent = demoUsers.length;
  $("#admin-stat-tutors").textContent = tutorsVerified;
  $("#admin-stat-materias").textContent = demoSubjects.length;
  const openCases = cases.filter((c) => caseStatus(c) === "open").length;
  $("#admin-stat-pending").textContent = pendingTutors + openCases;
}

function renderPendingList() {
  const container = $("#admin-pending-list");
  const total = demoTutors.filter((t) => t.status === "pending").length;

  if (total === 0) {
    container.innerHTML = '<p class="admin-empty">No hay pendientes por revisar.</p>';
    return;
  }

  container.innerHTML = demoTutors
    .filter((t) => t.status === "pending")
    .map(
      (t) => `
      <div class="admin-pending-item">
        <svg class="icon" aria-hidden="true"><use href="#icon-award"></use></svg>
        <div>
          <strong>Solicitud de ${t.name}</strong>
          <p>Verificación como tutor de ${t.subject}</p>
        </div>
        <span class="admin-status pending">Pendiente</span>
      </div>
    `
    )
    .join("");
}

function renderActivity() {
  $("#admin-activity-list").innerHTML = demoActivity
    .map(
      (a) => `
      <div class="admin-activity-item">
        <svg class="icon" aria-hidden="true"><use href="#icon-${a.icon}"></use></svg>
        <div>
          <strong>${a.title}</strong>
          <p>${a.detail}</p>
        </div>
      </div>
    `
    )
    .join("");
}

/* ---------- Renderizado: Usuarios ---------- */
function renderUsers() {
  const search = $("#admin-user-search").value.trim().toLowerCase();
  const role = $("#admin-user-role").value;
  const status = $("#admin-user-status").value;
  const grid = $("#admin-user-grid");

  const roles = { student: "Estudiante", tutor: "Tutor", admin: "Administrador" };
  const filtered = demoUsers.filter((u) => {
    const matchSearch = !search || u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search);
    const matchRole = role === "all" || u.role === role;
    const matchStatus = status === "all" || u.status === status;
    return matchSearch && matchRole && matchStatus;
  });

  if (filtered.length === 0) {
    grid.innerHTML = '<p class="admin-empty">No se encontraron usuarios con esos filtros.</p>';
    return;
  }

  grid.innerHTML = filtered
    .map(
      (u) => `
      <button class="admin-user-card" type="button" data-user-id="${u.id}">
        <div class="admin-user-card-top">
          <span class="admin-initials">${u.initial}</span>
          <div>
            <strong>${u.name}</strong>
            <small>${u.email}</small>
          </div>
        </div>
        <p>${roles[u.role]} · <span class="admin-status ${u.status}">${u.status === "active" ? "Activo" : "Suspendido"}</span></p>
      </button>
    `
    )
    .join("");

  $$(".admin-user-card", grid).forEach((card) => {
    card.addEventListener("click", () => openUserDetail(card.dataset.userId));
  });
}

function openUserDetail(userId) {
  const user = demoUsers.find((u) => String(u.id) === String(userId));
  if (!user) return;

  const roles = { student: "Estudiante", tutor: "Tutor", admin: "Administrador" };
  const dialog = $("#admin-user-dialog");
  const statusLabel = user.status === "active" ? "Activo" : "Suspendido";

  $("#admin-user-detail").innerHTML = `
    <dl class="admin-detail-list">
      <dt>Nombre</dt><dd>${user.name}</dd>
      <dt>Correo</dt><dd>${user.email}</dd>
      <dt>Rol</dt><dd>${roles[user.role]}</dd>
      <dt>Estado</dt><dd><span class="admin-status ${user.status}">${statusLabel}</span></dd>
    </dl>
    <div class="admin-detail-actions">
      <button class="btn btn-secondary" type="button" data-user-toggle>${user.status === "active" ? "Suspender cuenta" : "Activar cuenta"}</button>
    </div>
  `;

  const toggleBtn = $("#admin-user-detail [data-user-toggle]");
  toggleBtn.addEventListener("click", () => {
    const newStatus = user.status === "active" ? "suspended" : "active";
    user.status = newStatus;
    dialog.close();
    renderUsers();
    renderStats();
    showToast(`La cuenta de ${user.name} quedó ${newStatus === "active" ? "activada" : "suspendida"} (demostración).`);
  });

  dialog.showModal();
}

/* ---------- Renderizado: Tutores ---------- */
function renderTutorTabs() {
  const counts = { pending: 0, verified: 0, suspended: 0 };
  demoTutors.forEach((t) => {
    counts[t.status] = (counts[t.status] || 0) + 1;
  });

  $$("[data-tutor-count]").forEach((el) => {
    el.textContent = counts[el.dataset.tutorCount] || 0;
  });
}

function renderTutors() {
  renderTutorTabs();

  const search = $("#admin-tutor-search").value.trim().toLowerCase();
  const subject = $("#admin-tutor-subject").value;
  const grid = $("#admin-tutor-grid");

  const filtered = demoTutors.filter((t) => {
    const matchTab = t.status === tutorTab;
    const matchSearch =
      !search ||
      t.name.toLowerCase().includes(search) ||
      t.email.toLowerCase().includes(search) ||
      t.subject.toLowerCase().includes(search);
    const matchSubject = subject === "all" || t.subject === subject;
    return matchTab && matchSearch && matchSubject;
  });

  if (filtered.length === 0) {
    grid.innerHTML = '<p class="admin-empty">No hay tutores con esos criterios.</p>';
    return;
  }

  const statusLabels = { pending: "Pendiente", verified: "Verificado", suspended: "Suspendido" };

  grid.innerHTML = filtered
    .map(
      (t) => `
      <article class="admin-tutor-card">
        <div class="admin-tutor-card-top">
          <span class="admin-initials">${t.initial}</span>
          <div>
            <strong>${t.name}</strong>
            <small>${t.email} · ${t.subject}</small>
          </div>
        </div>
        <p>Calificación: ${t.rating} (${t.reviews} opiniones)</p>
        <span class="admin-status ${t.status}">${statusLabels[t.status]}</span>
        <div class="admin-tutor-card-actions">
          <button class="btn btn-secondary" type="button" data-tutor-detail="${t.id}">Ver perfil</button>
          ${t.status === "pending" ? `
            <button class="btn btn-primary" type="button" data-tutor-approve="${t.id}">Aprobar</button>
            <button class="btn btn-secondary" type="button" data-tutor-reject="${t.id}">Rechazar</button>
          ` : ""}
          ${t.status === "verified" ? `
            <button class="btn btn-secondary" type="button" data-tutor-suspend="${t.id}">Suspender</button>
          ` : ""}
          ${t.status === "suspended" ? `
            <button class="btn btn-primary" type="button" data-tutor-activate="${t.id}">Activar</button>
          ` : ""}
        </div>
      </article>
    `
    )
    .join("");

  $$("[data-tutor-detail]", grid).forEach((btn) =>
    btn.addEventListener("click", () => openTutorDetail(btn.dataset.tutorDetail))
  );
  $$("[data-tutor-approve]", grid).forEach((btn) =>
    btn.addEventListener("click", () => setTutorStatus(btn.dataset.tutorApprove, "verified", "aprobado"))
  );
  $$("[data-tutor-reject]", grid).forEach((btn) =>
    btn.addEventListener("click", () => setTutorStatus(btn.dataset.tutorReject, "pending", "rechazado"))
  );
  $$("[data-tutor-suspend]", grid).forEach((btn) =>
    btn.addEventListener("click", () => setTutorStatus(btn.dataset.tutorSuspend, "suspended", "suspendido"))
  );
  $$("[data-tutor-activate]", grid).forEach((btn) =>
    btn.addEventListener("click", () => setTutorStatus(btn.dataset.tutorActivate, "verified", "activado"))
  );
}

function setTutorStatus(tutorId, newStatus, pastTense) {
  const tutor = demoTutors.find((t) => String(t.id) === String(tutorId));
  if (!tutor) return;
  tutor.status = newStatus;
  renderTutors();
  renderStats();
  renderPendingList();
  showToast(`Solicitud de ${tutor.name} ${pastTense} (demostración). Con Firebase esta acción quedará registrada con tus permisos.`);
}

function openTutorDetail(tutorId) {
  const tutor = demoTutors.find((t) => String(t.id) === String(tutorId));
  if (!tutor) return;

  const statusLabels = { pending: "Pendiente", verified: "Verificado", suspended: "Suspendido" };
  const dialog = $("#admin-tutor-dialog");

  $("#admin-tutor-detail").innerHTML = `
    <dl class="admin-detail-list">
      <dt>Nombre</dt><dd>${tutor.name}</dd>
      <dt>Correo</dt><dd>${tutor.email}</dd>
      <dt>Materia</dt><dd>${tutor.subject}</dd>
      <dt>Calificación</dt><dd>${tutor.rating} (${tutor.reviews} opiniones)</dd>
      <dt>Estado</dt><dd><span class="admin-status ${tutor.status}">${statusLabels[tutor.status]}</span></dd>
      <dt>Presentación</dt><dd>${tutor.bio}</dd>
    </dl>
  `;

  dialog.showModal();
}

/* ---------- Renderizado: Materias ---------- */
function renderSubjectList() {
  const search = $("#admin-subject-search").value.trim().toLowerCase();
  const list = $("#admin-subject-list");

  const filtered = demoSubjects.filter(
    (s) => !search || s.name.toLowerCase().includes(search) || s.level.toLowerCase().includes(search)
  );

  if (filtered.length === 0) {
    list.innerHTML = '<p class="admin-empty">No se encontraron materias.</p>';
    return;
  }

  list.innerHTML = filtered
    .map(
      (s) => `
      <button class="admin-subject-item ${activeSubjectId === s.id ? "is-active" : ""}" type="button" data-subject-id="${s.id}">
        <svg class="icon" aria-hidden="true"><use href="#icon-book"></use></svg>
        <span>${s.name}</span>
        <small>${s.status === "active" ? "Activa" : "Inactiva"}</small>
      </button>
    `
    )
    .join("");

  $$(".admin-subject-item", list).forEach((btn) =>
    btn.addEventListener("click", () => showSubjectDetail(btn.dataset.subjectId))
  );
}

function showSubjectDetail(subjectId) {
  const subject = demoSubjects.find((s) => String(s.id) === String(subjectId));
  if (!subject) return;

  activeSubjectId = subject.id;
  $("#admin-subject-detail-title").textContent = subject.name;
  $("#admin-subject-detail-intro").hidden = true;

  const units = $("#admin-subject-units");
  units.hidden = false;
  units.innerHTML = subject.units
    .map(
      (u) => `
      <div class="admin-unit">
        <strong>${u.name} · ${subject.level}</strong>
        <p>${u.detail}</p>
      </div>
    `
    )
    .join("");

  const actions = $("#admin-subject-actions");
  actions.hidden = false;
  const toggleBtn = $("#admin-subject-toggle");
  toggleBtn.textContent = subject.status === "active" ? "Desactivar materia" : "Activar materia";
  toggleBtn.onclick = () => {
    subject.status = subject.status === "active" ? "inactive" : "active";
    showSubjectDetail(subject.id);
    renderSubjectList();
    renderStats();
    showToast(`La materia "${subject.name}" quedó ${subject.status === "active" ? "activa" : "inactiva"} (demostración).`);
  };

  renderSubjectList();
}

function openSubjectDialog() {
  $("#admin-subject-name").value = "";
  $("#admin-subject-error").textContent = "";
  $("#admin-subject-dialog").showModal();
  $("#admin-subject-name").focus();
}

function addSubject(name, level, status) {
  const newId = Math.max(...demoSubjects.map((s) => s.id)) + 1;
  demoSubjects.push({
    id: newId,
    name,
    level,
    status,
    units: [{ name: "Unidad inicial", detail: "Contenido inicial de ejemplo." }]
  });
  renderSubjectList();
  renderStats();
  showToast(`Materia "${name}" agregada a la demostración.`);
  $("#admin-subject-dialog").close();
}

/* ---------- Tutorías: casos de soporte (Firestore: mensajesSoporte) ---------- */
const CASE_STATUS = { abierto: "open", revision: "review", resuelto: "resolved" };
const CASE_LABELS = { open: "Abierto", review: "En revisión", resolved: "Resuelto" };
const ROLE_LABELS = { estudiante: "Estudiante", tutor: "Tutor", admin: "Administrador" };

function caseStatus(c) {
  return CASE_STATUS[c.estado] || "open";
}

async function loadCases() {
  casesEstado = "cargando";
  renderCases();
  try {
    const snap = await getDocs(collection(db, "mensajesSoporte"));
    cases = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.creadoEn?.toMillis?.() ?? 0) - (a.creadoEn?.toMillis?.() ?? 0));
    casesEstado = "listo";
  } catch (err) {
    console.error("No se pudieron cargar los casos:", err);
    casesEstado = "error";
    casesError = err;
  }
  renderCases();
  renderStats();
}

function renderCaseTabs() {
  const counts = { open: 0, review: 0, resolved: 0 };
  cases.forEach((c) => { counts[caseStatus(c)] += 1; });
  $$("[data-case-count]").forEach((el) => {
    el.textContent = casesEstado === "listo" ? counts[el.dataset.caseCount] || 0 : "";
  });
}

function renderCases() {
  renderCaseTabs();
  const list = $("#admin-case-list");

  if (casesEstado === "cargando") {
    list.innerHTML = '<p class="admin-empty">Cargando mensajes de soporte…</p>';
    return;
  }
  if (casesEstado === "error") {
    list.innerHTML = `<p class="admin-empty">No se pudieron cargar los casos. ${escapeHTML(detalleError(casesError))}</p>`;
    return;
  }

  const search = $("#admin-case-search").value.trim().toLowerCase();
  const filtered = cases.filter((c) => {
    const texto = `${c.usuarioNombre || ""} ${c.usuarioEmail || ""} ${c.asunto || ""} ${c.mensaje || ""}`.toLowerCase();
    return caseStatus(c) === caseTab && (!search || texto.includes(search));
  });

  if (filtered.length === 0) {
    list.innerHTML = '<p class="admin-empty">No hay casos con esos criterios.</p>';
    return;
  }

  list.innerHTML = filtered.map((c) => {
    const st = caseStatus(c);
    return `
      <article class="admin-case-card">
        <div class="admin-case-card-top">
          <strong>${escapeHTML(c.asunto || "Sin asunto")}</strong>
          <span class="admin-status ${st}">${CASE_LABELS[st]}</span>
        </div>
        <p>${escapeHTML(c.usuarioNombre || "Usuario")} · ${escapeHTML(ROLE_LABELS[c.rol] || "Usuario")}${c.creadoEn ? ` · ${escapeHTML(fechaCorta(c.creadoEn))}` : ""}</p>
        <div class="admin-case-card-actions">
          <button class="btn btn-secondary" type="button" data-case-detail="${escapeHTML(c.id)}">Ver detalle</button>
          ${st === "open" ? `<button class="btn btn-primary" type="button" data-case-move="${escapeHTML(c.id)}" data-to="revision">Pasar a revisión</button>` : ""}
          ${st === "review" ? `<button class="btn btn-primary" type="button" data-case-move="${escapeHTML(c.id)}" data-to="resuelto">Marcar resuelto</button>` : ""}
        </div>
      </article>`;
  }).join("");
}

async function setCaseStatus(caseId, nuevoEstado) {
  const item = cases.find((c) => c.id === caseId);
  if (!item) return;
  try {
    await updateDoc(doc(db, "mensajesSoporte", caseId), { estado: nuevoEstado, actualizadoEn: serverTimestamp() });
    item.estado = nuevoEstado;
    renderCases();
    renderStats();
    showToast(nuevoEstado === "resuelto" ? "Caso marcado como resuelto." : "Caso pasado a revisión.");
  } catch (err) {
    console.error("No se pudo actualizar el caso:", err);
    showToast(`No se pudo actualizar el caso. ${detalleError(err)}`);
  }
}

function openCaseDetail(caseId) {
  const c = cases.find((x) => x.id === caseId);
  if (!c) return;
  const st = caseStatus(c);
  $("#admin-case-detail").innerHTML = `
    <dl class="admin-detail-list">
      <dt>Usuario</dt><dd>${escapeHTML(c.usuarioNombre || "Usuario")} (${escapeHTML(ROLE_LABELS[c.rol] || "—")})</dd>
      <dt>Correo</dt><dd>${c.usuarioEmail ? `<a href="mailto:${escapeHTML(c.usuarioEmail)}?subject=${encodeURIComponent("Re: " + (c.asunto || "Soporte TutoresOn-Line"))}">${escapeHTML(c.usuarioEmail)}</a>` : "—"}</dd>
      <dt>Asunto</dt><dd>${escapeHTML(c.asunto || "")}</dd>
      <dt>Fecha</dt><dd>${escapeHTML(fechaCorta(c.creadoEn) || "—")}</dd>
      <dt>Estado</dt><dd><span class="admin-status ${st}">${CASE_LABELS[st]}</span></dd>
      <dt>Mensaje</dt><dd class="admin-pre">${escapeHTML(c.mensaje || "")}</dd>
    </dl>`;
  $("#admin-case-dialog").showModal();
}

/* ---------- Calificaciones (Firestore: calificaciones) ---------- */
async function loadRatings() {
  ratingsEstado = "cargando";
  renderRatings();
  try {
    const snap = await getDocs(collection(db, "calificaciones"));
    ratings = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.creadaEn?.toMillis?.() ?? 0) - (a.creadaEn?.toMillis?.() ?? 0));
    ratingsEstado = "listo";
  } catch (err) {
    console.error("No se pudieron cargar las calificaciones:", err);
    ratingsEstado = "error";
    ratingsError = err;
  }
  populateRatingFilters();
  renderRatings();
}

function populateRatingFilters() {
  const fill = (select, values) => {
    const current = select.value;
    select.innerHTML = '<option value="all">Todos</option>' +
      values.map((v) => `<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`).join("");
    if (values.includes(current)) select.value = current;
  };
  const uniq = (key) => [...new Set(ratings.map((r) => r[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  fill($("#admin-rating-subject"), uniq("materia"));
  fill($("#admin-rating-tutor"), uniq("tutorNombre"));
  $("#admin-rating-subject").options[0].textContent = "Todas";
}

function renderRatingSummary(lista) {
  const box = $("#admin-rating-summary");
  if (!box) return;
  const visibles = lista.filter((r) => r.estado === "visible");
  const promedio = visibles.length
    ? visibles.reduce((s, r) => s + (Number(r.estrellas) || 0), 0) / visibles.length
    : 0;
  box.innerHTML = `
    <span><strong>${lista.length}</strong> calificaciones</span>
    <span><strong>${visibles.length ? promedio.toFixed(1) : "—"}</strong> promedio (visibles)</span>
    <span><strong>${lista.filter((r) => r.estado === "oculta").length}</strong> ocultas</span>`;
}

function renderRatings() {
  const list = $("#admin-rating-list");

  if (ratingsEstado === "cargando") {
    list.innerHTML = '<p class="admin-empty">Cargando calificaciones…</p>';
    return;
  }
  if (ratingsEstado === "error") {
    list.innerHTML = `<p class="admin-empty">No se pudieron cargar las calificaciones. ${escapeHTML(detalleError(ratingsError))}</p>`;
    return;
  }

  const search = $("#admin-rating-search").value.trim().toLowerCase();
  const subject = $("#admin-rating-subject").value;
  const tutor = $("#admin-rating-tutor").value;
  const status = $("#admin-rating-status").value;

  const filtered = ratings.filter((r) => {
    const texto = `${r.tutorNombre || ""} ${r.estudianteNombre || ""} ${r.materia || ""} ${r.comentario || ""}`.toLowerCase();
    return (!search || texto.includes(search))
      && (subject === "all" || r.materia === subject)
      && (tutor === "all" || r.tutorNombre === tutor)
      && (status === "all" || r.estado === status);
  });

  renderRatingSummary(filtered);

  if (filtered.length === 0) {
    list.innerHTML = ratings.length
      ? '<p class="admin-empty">No hay calificaciones con esos criterios.</p>'
      : '<p class="admin-empty">Todavía no hay calificaciones. Aparecen cuando un estudiante califica una tutoría completada.</p>';
    return;
  }

  list.innerHTML = filtered.map((r) => {
    const visible = r.estado === "visible";
    return `
      <article class="admin-rating-card">
        <div class="admin-rating-card-top">
          <strong>${escapeHTML(r.tutorNombre || "Tutor")}</strong>
          <span class="admin-rating-stars" aria-label="${Number(r.estrellas) || 0} de 5">${estrellas(r.estrellas)}</span>
          <span class="admin-status ${visible ? "visible" : "hidden"}">${visible ? "Visible" : "Oculta"}</span>
        </div>
        <p><strong>${escapeHTML(r.materia || "Materia")}</strong> · ${escapeHTML(r.estudianteNombre || "Estudiante")}${r.fechaTutoria ? ` · ${escapeHTML(fechaCorta(r.fechaTutoria))}` : ""}</p>
        <p>${r.comentario ? `"${escapeHTML(r.comentario)}"` : "<em>Sin comentario</em>"}</p>
        ${r.retroalimentacion ? `<p class="admin-rating-feedback"><strong>Retroalimentación:</strong> ${escapeHTML(r.retroalimentacion)}</p>` : ""}
        <div class="admin-rating-card-actions">
          <button class="btn btn-primary" type="button" data-rating-edit="${escapeHTML(r.id)}">Editar calificación</button>
          <button class="btn btn-secondary" type="button" data-rating-toggle="${escapeHTML(r.id)}">${visible ? "Ocultar" : "Hacer visible"}</button>
        </div>
      </article>`;
  }).join("");
}

async function saveRating(ratingId, cambios, mensaje) {
  const r = ratings.find((x) => x.id === ratingId);
  if (!r) return false;
  try {
    await updateDoc(doc(db, "calificaciones", ratingId), {
      ...cambios,
      editadaPorAdmin: adminUid,
      editadaEn: serverTimestamp()
    });
    Object.assign(r, cambios);
    renderRatings();
    showToast(mensaje);
    return true;
  } catch (err) {
    console.error("No se pudo guardar la calificación:", err);
    showToast(`No se pudo guardar. ${detalleError(err)}`);
    return false;
  }
}

function openRatingDialog(ratingId) {
  const r = ratings.find((x) => x.id === ratingId);
  if (!r) return;
  editingRatingId = ratingId;
  $("#admin-rating-dialog-info").innerHTML = `
    <dl class="admin-detail-list">
      <dt>Tutor</dt><dd>${escapeHTML(r.tutorNombre || "Tutor")}</dd>
      <dt>Estudiante</dt><dd>${escapeHTML(r.estudianteNombre || "Estudiante")}</dd>
      <dt>Materia</dt><dd>${escapeHTML(r.materia || "")}${r.fechaTutoria ? ` · ${escapeHTML(fechaCorta(r.fechaTutoria))}` : ""}</dd>
      <dt>Comentario</dt><dd>${r.comentario ? `"${escapeHTML(r.comentario)}"` : "Sin comentario"}</dd>
    </dl>`;
  $("#admin-rating-stars").value = String(Math.round(Number(r.estrellas) || 5));
  $("#admin-rating-visibility").value = r.estado === "oculta" ? "oculta" : "visible";
  $("#admin-rating-feedback").value = r.retroalimentacion || "";
  $("#admin-rating-dialog").showModal();
}

/* ---------- Notificaciones ---------- */
function renderNotificationPreview() {
  const preview = $("#admin-notification-preview");
  preview.innerHTML = demoNotifications
    .slice(0, 3)
    .map(
      (n) => `
      <li>
        <h3>${n.title}</h3>
        <p>${n.detail} · ${n.time}</p>
      </li>
    `
    )
    .join("");

  const unread = demoNotifications.length;
  $("#admin-notification-count").textContent = unread > 9 ? "9+" : unread;
  $("#admin-notification-count").hidden = unread === 0;
}

function renderNotificationFull() {
  $("#admin-notification-full").innerHTML = demoNotifications
    .map(
      (n) => `
      <li>
        <h3>${n.title}</h3>
        <p>${n.detail} · ${n.time}</p>
      </li>
    `
    )
    .join("");
}

/* ---------- Perfil (Firestore: usuarios/{uid}) ---------- */
function renderProfile() {
  const fullName = `${adminProfile.nombre} ${adminProfile.apellido}`.trim();
  const avatar = iniciales(fullName);
  $("#admin-name").value = adminProfile.nombre;
  $("#admin-lastname").value = adminProfile.apellido;
  $("#admin-email").value = adminProfile.email;
  $("#admin-profile-name").textContent = fullName || "Administrador";
  pintarAvatar($("#admin-profile-avatar"), adminProfile.fotoURL, avatar);
  const top = $("#admin-top-avatar");
  pintarAvatar(top, adminProfile.fotoURL, avatar);
  top.setAttribute("aria-label", fullName ? `Mi perfil, ${fullName}` : "Mi perfil, administrador");
}

async function loadProfile(uid) {
  const snap = await getDoc(doc(db, "usuarios", uid));
  const d = snap.exists() ? snap.data() : {};
  adminProfile = {
    nombre: d.nombre || "",
    apellido: d.apellido || "",
    email: d.email || auth.currentUser?.email || "",
    fotoURL: d.fotoURL || ""
  };
  renderProfile();
  $("#admin-profile-note").textContent = "Tus datos se cargan desde tu cuenta. El correo y el rol no se editan aquí.";
  return d;
}

/* ---------- Renderizado general ---------- */
function renderAll() {
  renderStats();
  renderPendingList();
  renderActivity();
  renderUsers();
  renderTutors();
  renderSubjectList();
  renderCases();
  renderRatings();
  renderNotificationPreview();
  renderNotificationFull();
  renderProfile();
}

/* ---------- Eventos ---------- */
function bindNavigation() {
  $$(".main-navigation a").forEach((link) => {
    link.addEventListener("click", (event) => {
      const hash = link.getAttribute("href");
      showSection(hash.replace("#", ""));
    });
  });

  window.addEventListener("hashchange", () => {
    showSection(window.location.hash.replace("#", ""));
  });

  $("#admin-top-avatar").addEventListener("click", (event) => {
    event.preventDefault();
    showSection("perfil");
    history.replaceState(null, "", "#perfil");
  });

  $$("[data-pending]").forEach((button) => {
    button.addEventListener("click", () => {
      showToast(`"${button.dataset.pending}" estará disponible más adelante (demostración).`);
    });
  });
}

function bindSidebar() {
  $(".menu-toggle").addEventListener("click", openMobileSidebar);
  $(".sidebar-close").addEventListener("click", closeMobileSidebar);
  $(".sidebar-overlay").addEventListener("click", closeMobileSidebar);
}

function bindNotifications() {
  const toggle = $("#admin-notification-toggle");
  const dropdown = $("#admin-notification-dropdown");

  toggle.addEventListener("click", () => {
    const isOpen = !dropdown.hidden;
    dropdown.hidden = isOpen;
    toggle.setAttribute("aria-expanded", String(!isOpen));
  });

  document.addEventListener("click", (event) => {
    const widget = $("#admin-notification-widget");
    if (!widget.contains(event.target)) {
      dropdown.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
    }
  });

  $("#admin-notifications-back").addEventListener("click", () => {
    showSection("resumen");
    history.replaceState(null, "", "#resumen");
  });
}

function bindUserFilters() {
  ["admin-user-search", "admin-user-role", "admin-user-status"].forEach((id) => {
    $(`#${id}`).addEventListener("input", renderUsers);
  });
}

function bindTutorFilters() {
  $$(".admin-tutor-tabs button").forEach((button) => {
    button.addEventListener("click", () => {
      tutorTab = button.dataset.tutorStatus;
      $$(".admin-tutor-tabs button").forEach((b) => {
        const active = b === button;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-pressed", String(active));
      });
      renderTutors();
    });
  });

  $("#admin-tutor-search").addEventListener("input", renderTutors);

  const subjectSelect = $("#admin-tutor-subject");
  const subjects = [...new Set(demoTutors.map((t) => t.subject))];
  subjectSelect.innerHTML =
    '<option value="all">Todas</option>' +
    subjects.map((s) => `<option value="${s}">${s}</option>`).join("");
  subjectSelect.addEventListener("change", renderTutors);
}

function bindSubjectInteractions() {
  $("#admin-subject-search").addEventListener("input", renderSubjectList);
  $("#admin-add-subject").addEventListener("click", openSubjectDialog);

  const dialog = $("#admin-subject-dialog");
  const form = $("#admin-subject-form");

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = $("#admin-subject-name").value.trim();
    if (!name) {
      $("#admin-subject-error").textContent = "Escribe el nombre de la materia.";
      return;
    }
    addSubject(name, $("#admin-subject-level").value, $("#admin-subject-status").value);
  });

  dialog.addEventListener("click", (event) => {
    if (event.target.matches("[data-close-dialog]")) dialog.close();
  });
}

function bindCaseFilters() {
  $$(".admin-case-tabs button").forEach((button) => {
    button.addEventListener("click", () => {
      caseTab = button.dataset.caseStatus;
      $$(".admin-case-tabs button").forEach((b) => {
        const active = b === button;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-pressed", String(active));
      });
      renderCases();
    });
  });

  $("#admin-case-search").addEventListener("input", renderCases);

  $("#admin-case-list").addEventListener("click", (event) => {
    const detail = event.target.closest("[data-case-detail]");
    if (detail) { openCaseDetail(detail.dataset.caseDetail); return; }
    const move = event.target.closest("[data-case-move]");
    if (move) setCaseStatus(move.dataset.caseMove, move.dataset.to);
  });
}

function bindRatingFilters() {
  ["admin-rating-search", "admin-rating-subject", "admin-rating-tutor", "admin-rating-status"].forEach((id) => {
    $(`#${id}`).addEventListener("input", renderRatings);
  });

  $("#admin-rating-list").addEventListener("click", (event) => {
    const edit = event.target.closest("[data-rating-edit]");
    if (edit) { openRatingDialog(edit.dataset.ratingEdit); return; }
    const toggle = event.target.closest("[data-rating-toggle]");
    if (toggle) {
      const r = ratings.find((x) => x.id === toggle.dataset.ratingToggle);
      if (!r) return;
      const nuevo = r.estado === "visible" ? "oculta" : "visible";
      saveRating(r.id, { estado: nuevo },
        nuevo === "oculta" ? "Calificación ocultada del perfil público." : "Calificación visible de nuevo.");
    }
  });

  $("#admin-rating-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!editingRatingId) return;
    const estrellasNuevas = Number($("#admin-rating-stars").value);
    if (!(estrellasNuevas >= 1 && estrellasNuevas <= 5)) return;
    const ok = await saveRating(editingRatingId, {
      estrellas: estrellasNuevas,
      estado: $("#admin-rating-visibility").value,
      retroalimentacion: $("#admin-rating-feedback").value.trim()
    }, "Calificación actualizada.");
    if (ok) $("#admin-rating-dialog").close();
  });
}

function bindProfile() {
  const form = $("#admin-profile-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = $("#admin-name").value.trim();
    const lastname = $("#admin-lastname").value.trim();
    if (!/\p{L}/u.test(name) || !/\p{L}/u.test(lastname)) {
      showToast("Completa el nombre y el apellido.");
      return;
    }
    if (!adminUid) {
      showToast("Tu sesión expiró. Vuelve a iniciar sesión.");
      return;
    }
    try {
      await updateDoc(doc(db, "usuarios", adminUid), { nombre: name, apellido: lastname });
      adminProfile.nombre = name;
      adminProfile.apellido = lastname;
      renderProfile();
      $("#admin-profile-note").textContent = "Cambios guardados en tu perfil.";
      showToast("Perfil actualizado.");
    } catch (err) {
      console.error("No se pudo guardar el perfil:", err);
      $("#admin-profile-note").textContent = `No se pudo guardar el perfil. ${detalleError(err)}`;
    }
  });
}

function bindDialogs() {
  $$(".admin-dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-dialog]")) dialog.close();
    });
  });
}

/* ---------- Foto de perfil (se guarda en usuarios/{uid}.fotoURL) ---------- */
function bindFotoPerfil() {
  activarSelectorFoto(
    $("#admin-photo-edit"),
    async (url) => {
      await guardarFotoPerfil(url);
      adminProfile.fotoURL = url;
      renderProfile();
      $("#admin-profile-note").textContent = "Foto de perfil actualizada.";
      showToast("Foto de perfil actualizada.");
    },
    (mensaje) => {
      $("#admin-profile-note").textContent = mensaje;
      showToast(mensaje);
    }
  );
}

/* ---------- Inicio ---------- */
function init() {
  bindNavigation();
  bindSidebar();
  bindNotifications();
  bindUserFilters();
  bindTutorFilters();
  bindSubjectInteractions();
  bindCaseFilters();
  bindRatingFilters();
  bindProfile();
  bindFotoPerfil();
  bindDialogs();

  renderAll();

  const hash = window.location.hash.replace("#", "");
  showSection(hash || "resumen");

  // Solo un usuario con rol «admin» puede quedarse en este panel.
  onAuthStateChanged(auth, async (usuario) => {
    if (!usuario) return; // auth.js redirige al login
    adminUid = usuario.uid;
    try {
      const datos = await loadProfile(usuario.uid);
      if (datos.rol !== "admin") {
        window.location.replace(datos.rol === "tutor" ? "tutor.html" : "estudiante.html");
        return;
      }
    } catch (err) {
      console.error("No se pudo verificar el rol:", err);
      $("#admin-profile-note").textContent = `No se pudo cargar tu perfil. ${detalleError(err)}`;
      return;
    }
    loadRatings();
    loadCases();
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();