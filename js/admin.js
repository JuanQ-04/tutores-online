/* js/admin.js — Panel del administrador (demostración)
   Navegación por #, datos de ejemplo y acciones simuladas.
   Los permisos reales se aplicarán al integrar Firebase. */

"use strict";

/* ---------- Utilidades ---------- */
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

const ADMIN_SECTIONS = [
  { id: "resumen", label: "Resumen" },
  { id: "usuarios", label: "Usuarios" },
  { id: "tutores", label: "Tutores" },
  { id: "materias", label: "Materias y niveles" },
  { id: "tutorias", label: "Tutorías" },
  { id: "calificaciones", label: "Calificaciones" },
  { id: "notificaciones", label: "Notificaciones" },
  { id: "perfil", label: "Mi perfil" }
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

const demoCases = [
  {
    id: 1,
    student: "Diego Ávila",
    tutor: "María Rodríguez",
    reason: "No recibió el enlace de la sesión",
    status: "open",
    detail: "El estudiante reporta que 10 minutos antes de la tutoría aún no recibe el enlace de videollamada."
  },
  {
    id: 2,
    student: "Sofía Pérez",
    tutor: "Julián Méndez",
    reason: "Cambio de fecha",
    status: "review",
    detail: "La estudiante solicita mover su clase del jueves al viernes por un imprevisto académico."
  },
  {
    id: 3,
    student: "Andrés López",
    tutor: "Carlos Gómez",
    reason: "Problema con el pago",
    status: "open",
    detail: "El estudiante indica que se le cobró dos veces la misma tutoría."
  },
  {
    id: 4,
    student: "Valentina Ríos",
    tutor: "Paola Duarte",
    reason: "Solicitud de reembolso",
    status: "resolved",
    detail: "Resuelto: se reembolsó la sesión cancelada por el tutor."
  }
];

const demoRatings = [
  {
    id: 1,
    tutor: "María Rodríguez",
    subject: "Cálculo integral",
    stars: 5,
    status: "visible",
    text: "Explica con mucha claridad y usa ejemplos de la vida real. Me ayudó a pasar el parcial."
  },
  {
    id: 2,
    tutor: "Julián Méndez",
    subject: "Álgebra lineal",
    stars: 4,
    status: "visible",
    text: "Muy paciente, aunque a veces va rápido en los ejercicios largos."
  },
  {
    id: 3,
    tutor: "Carlos Gómez",
    subject: "Física mecánica",
    stars: 1,
    status: "pending",
    text: "El tutor llegó tarde y casi no resolvió mis dudas. No lo recomiendo." /* pendiente de moderación */
  },
  {
    id: 4,
    tutor: "María Rodríguez",
    subject: "Cálculo integral",
    stars: 5,
    status: "pending",
    text: "Excelente preparación para el parcial, muy organizada."
  },
  {
    id: 5,
    tutor: "Julián Méndez",
    subject: "Álgebra lineal",
    stars: 2,
    status: "hidden",
    text: "Comentario oculto por decisión del administrador."
  }
];

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
  $("#admin-stat-pending").textContent = pendingTutors;
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

/* ---------- Renderizado: Tutorías (casos) ---------- */
function renderCaseTabs() {
  const counts = { open: 0, review: 0, resolved: 0 };
  demoCases.forEach((c) => {
    counts[c.status] = (counts[c.status] || 0) + 1;
  });

  $$("[data-case-count]").forEach((el) => {
    el.textContent = counts[el.dataset.caseCount] || 0;
  });
}

function renderCases() {
  renderCaseTabs();

  const search = $("#admin-case-search").value.trim().toLowerCase();
  const list = $("#admin-case-list");

  const filtered = demoCases.filter((c) => {
    const matchTab = c.status === caseTab;
    const matchSearch =
      !search ||
      c.student.toLowerCase().includes(search) ||
      c.tutor.toLowerCase().includes(search) ||
      c.reason.toLowerCase().includes(search);
    return matchTab && matchSearch;
  });

  if (filtered.length === 0) {
    list.innerHTML = '<p class="admin-empty">No hay casos con esos criterios.</p>';
    return;
  }

  const statusLabels = { open: "Abierto", review: "En revisión", resolved: "Resuelto" };

  list.innerHTML = filtered
    .map(
      (c) => `
      <article class="admin-case-card">
        <div class="admin-case-card-top">
          <strong>${c.reason}</strong>
          <span class="admin-status ${c.status}">${statusLabels[c.status]}</span>
        </div>
        <p>${c.student} · Tutor: ${c.tutor}</p>
        <div class="admin-case-card-actions">
          <button class="btn btn-secondary" type="button" data-case-detail="${c.id}">Ver detalle</button>
          ${c.status === "open" ? `
            <button class="btn btn-primary" type="button" data-case-review="${c.id}">Pasar a revisión</button>
          ` : ""}
          ${c.status === "review" ? `
            <button class="btn btn-primary" type="button" data-case-resolve="${c.id}">Marcar resuelto</button>
          ` : ""}
        </div>
      </article>
    `
    )
    .join("");

  $$("[data-case-detail]", list).forEach((btn) =>
    btn.addEventListener("click", () => openCaseDetail(btn.dataset.caseDetail))
  );
  $$("[data-case-review]", list).forEach((btn) =>
    btn.addEventListener("click", () => setCaseStatus(btn.dataset.caseReview, "review", "pasado a revisión"))
  );
  $$("[data-case-resolve]", list).forEach((btn) =>
    btn.addEventListener("click", () => setCaseStatus(btn.dataset.caseResolve, "resolved", "marcado como resuelto"))
  );
}

function setCaseStatus(caseId, newStatus, pastTense) {
  const caseItem = demoCases.find((c) => String(c.id) === String(caseId));
  if (!caseItem) return;
  caseItem.status = newStatus;
  renderCases();
  renderStats();
  showToast(`Caso de ${caseItem.student} ${pastTense} (demostración).`);
}

function openCaseDetail(caseId) {
  const caseItem = demoCases.find((c) => String(c.id) === String(caseId));
  if (!caseItem) return;

  const statusLabels = { open: "Abierto", review: "En revisión", resolved: "Resuelto" };
  const dialog = $("#admin-case-dialog");

  $("#admin-case-detail").innerHTML = `
    <dl class="admin-detail-list">
      <dt>Estudiante</dt><dd>${caseItem.student}</dd>
      <dt>Tutor</dt><dd>${caseItem.tutor}</dd>
      <dt>Motivo</dt><dd>${caseItem.reason}</dd>
      <dt>Estado</dt><dd><span class="admin-status ${caseItem.status}">${statusLabels[caseItem.status]}</span></dd>
      <dt>Descripción</dt><dd>${caseItem.detail}</dd>
    </dl>
  `;

  dialog.showModal();
}

/* ---------- Renderizado: Calificaciones ---------- */
function populateRatingSubjects() {
  const select = $("#admin-rating-subject");
  const subjects = [...new Set(demoRatings.map((r) => r.subject))];
  select.innerHTML = '<option value="all">Todas</option>' +
    subjects.map((s) => `<option value="${s}">${s}</option>`).join("");
}

function renderRatings() {
  const search = $("#admin-rating-search").value.trim().toLowerCase();
  const subject = $("#admin-rating-subject").value;
  const status = $("#admin-rating-status").value;
  const list = $("#admin-rating-list");

  const filtered = demoRatings.filter((r) => {
    const matchSearch =
      !search ||
      r.tutor.toLowerCase().includes(search) ||
      r.subject.toLowerCase().includes(search) ||
      r.text.toLowerCase().includes(search);
    const matchSubject = subject === "all" || r.subject === subject;
    const matchStatus = status === "all" || r.status === status;
    return matchSearch && matchSubject && matchStatus;
  });

  if (filtered.length === 0) {
    list.innerHTML = '<p class="admin-empty">No hay calificaciones con esos criterios.</p>';
    return;
  }

  const statusLabels = { pending: "Pendiente", visible: "Visible", hidden: "Oculta" };

  list.innerHTML = filtered
    .map(
      (r) => `
      <article class="admin-rating-card">
        <div class="admin-rating-card-top">
          <strong>${r.tutor}</strong>
          <span class="admin-rating-stars">${"★".repeat(r.stars)}${"☆".repeat(5 - r.stars)}</span>
          <span class="admin-status ${r.status}">${statusLabels[r.status]}</span>
        </div>
        <p><strong>${r.subject}</strong> — ${r.text}</p>
        <div class="admin-rating-card-actions">
          ${r.status === "visible" ? `
            <button class="btn btn-secondary" type="button" data-rating-hidden="${r.id}">Ocultar</button>
          ` : ""}
          ${r.status === "hidden" || r.status === "pending" ? `
            <button class="btn btn-primary" type="button" data-rating-visible="${r.id}">Hacer visible</button>
          ` : ""}
        </div>
      </article>
    `
    )
    .join("");

  $$("[data-rating-hidden]", list).forEach((btn) =>
    btn.addEventListener("click", () => setRatingStatus(btn.dataset.ratingHidden, "hidden", "ocultado"))
  );
  $$("[data-rating-visible]", list).forEach((btn) =>
    btn.addEventListener("click", () => setRatingStatus(btn.dataset.ratingVisible, "visible", "publicado"))
  );
}

function setRatingStatus(ratingId, newStatus, pastTense) {
  const rating = demoRatings.find((r) => String(r.id) === String(ratingId));
  if (!rating) return;
  rating.status = newStatus;
  renderRatings();
  showToast(`Comentario ${pastTense} (demostración).`);
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

/* ---------- Perfil ---------- */
function renderProfile() {
  $("#admin-profile-name").textContent = "Administrador del sistema";
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
  populateRatingSubjects();
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

  $$(".admin-pending-link").forEach((button) => {
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
}

function bindRatingFilters() {
  ["admin-rating-search", "admin-rating-subject", "admin-rating-status"].forEach((id) => {
    $(`#${id}`).addEventListener("input", renderRatings);
  });
}

function bindProfile() {
  const form = $("#admin-profile-form");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = $("#admin-name").value.trim();
    const lastname = $("#admin-lastname").value.trim();
    if (!name || !lastname) {
      showToast("Completa el nombre y el apellido.");
      return;
    }
    $("#admin-profile-name").textContent = `${name} ${lastname}`.trim();
    $("#admin-profile-note").textContent = "Cambios guardados en la demostración. Con Firebase se guardarán en tu cuenta.";
    showToast("Cambios guardados (demostración).");
  });

  $("#admin-logout").addEventListener("click", () => {
    showToast("Cerrar sesión estará disponible al conectar Firebase.");
  });
}

function bindDialogs() {
  $$(".admin-dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target.matches("[data-close-dialog]")) dialog.close();
    });
  });
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
  bindDialogs();

  renderAll();

  const hash = window.location.hash.replace("#", "");
  showSection(hash || "resumen");
}

document.addEventListener("DOMContentLoaded", init);