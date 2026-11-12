/* js/admin.js — Panel del administrador
   Navegación por #. Todos los datos viajan por la API (js/api.js, rutas /api/admin/*);
   este panel nunca habla directo con la base de datos. Son reales: Mi perfil,
   Calificaciones (moderación), Soporte (casos y respuestas), Tutores (solicitudes,
   hoja de vida, aprobar/rechazar y actualizaciones de datos), Usuarios (suspender/activar),
   Materias (ver y agregar), estadísticas del Resumen, Actividad reciente y Notificaciones.
   Seguridad (contraseña) la maneja js/configuracion.js.
   Se carga como módulo: <script type="module" src="../js/admin.js"></script> */

import { auth } from "./firebase-config.js";
import { api, aMillis, sondear, sonIguales } from "./api.js";
import { cargarMaterias, materiasActuales, agregarMateria, idMateria, nombreMateria } from "./materias.js";
import { crearBandeja, htmlAviso, activarClics } from "./notificaciones.js";
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

// La API entrega las fechas como texto: "2026-05-20" (solo día) o ISO completo
// ("2026-05-20T15:30:00.000Z", marcas de tiempo del servidor).
function aFecha(valor) {
  if (typeof valor !== "string" || !valor) return null;
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(valor) ? new Date(`${valor}T12:00:00`) : new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function fechaCorta(valor) {
  const fecha = aFecha(valor);
  if (!fecha) return "";
  return fecha.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

function iniciales(nombre, porDefecto = "AD") {
  return String(nombre).trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map((p) => p[0].toUpperCase()).join("") || porDefecto;
}

function detalleError(err) {
  if (err?.status === 403) return "Tu usuario no tiene permiso de administrador.";
  return err?.message || "Revisa tu conexión e inténtalo de nuevo."; // los errores de la API ya vienen en español
}

/* ---------- Catálogo de materias ----------
   Viene de la API (js/materias.js): las de base más las que agrega el administrador.
   En los tutores se guardan como «slug» (matematicas) y en las tutorías como texto
   (Matemáticas), así que todo se compara por identificador. */
function normMateria(valor) {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

const materiaId = idMateria;

function materiaNombre(valor) {
  return String(valor || "").trim() ? nombreMateria(valor) : "Sin materia";
}

const fechaDe = aFecha;

function tiempoRelativo(fecha) {
  const min = Math.floor((Date.now() - fecha.getTime()) / 60000);
  if (min < 1) return "Hace un momento";
  if (min < 60) return `Hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Hace ${h} ${h === 1 ? "hora" : "horas"}`;
  const d = Math.floor(h / 24);
  if (d < 7) return `Hace ${d} ${d === 1 ? "día" : "días"}`;
  return fecha.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

const ADMIN_SECTIONS = [
  { id: "resumen", label: "Resumen" },
  { id: "usuarios", label: "Usuarios" },
  { id: "tutores", label: "Tutores" },
  { id: "materias", label: "Materias" },
  { id: "soporte", label: "Soporte" },
  { id: "calificaciones", label: "Calificaciones" },
  { id: "notificaciones", label: "Notificaciones" },
  { id: "perfil", label: "Mi perfil" },
  { id: "seguridad", label: "Configuración" },
  { id: "ayuda", label: "Centro de ayuda" }
];

/* Datos reales (API) */
let adminUid = null;
let detenerSondeo = null;   // cancela la actualización periódica del panel
let adminProfile = { nombre: "", apellido: "", email: "", fotoURL: "" };
let ratings = [];            // calificaciones (GET /admin/calificaciones)
let ratingsEstado = "cargando";
let ratingsError = null;
let cases = [];              // casos de soporte (GET /admin/soporte)
let casesEstado = "cargando";
let casesError = null;
let editingRatingId = null;
let tutors = [];             // usuarios con rol «tutor» que ya enviaron solicitud
let tutorsEstado = "cargando";
let tutorsError = null;
const tutorsGuardando = new Set(); // evita doble clic mientras se guarda
let cambios = [];            // solicitudes de actualización de datos (GET /admin/cambios-perfil)
let cambiosEstado = "cargando";
let cambiosError = null;
let cambioAbierto = null;    // id del tutor cuya solicitud se está revisando en el diálogo
let casoAbierto = null;      // id del caso de soporte abierto en el diálogo
let statsTutorias = [];      // todas las tutorías
let statsSolicitudes = [];   // todas las solicitudes
let statsUsuarios = [];      // todos los usuarios
let statsEstado = "cargando";
let statsError = null;

/* ---------- Estado de la interfaz ---------- */
let currentSection = "resumen";
let tutorTab = "pending"; // pending | verified | rejected
let caseTab = "open";
let activeSubjectId = null;

/* ---------- Navegación ---------- */
function getSectionLabel(hash) {
  const clean = hash.replace("#", "");
  const found = ADMIN_SECTIONS.find((s) => s.id === clean);
  return found ? found.label : "Resumen";
}

function showSection(id) {
  if (id === "tutorias") id = "soporte"; // enlaces viejos: los casos de soporte estaban en «Tutorías»
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
  const tutorsVerified = tutors.filter((t) => t.status === "verified").length;
  const pendingTutors = tutors.filter((t) => t.status === "pending").length;

  if (statsEstado === "listo") {
    const estudiantes = statsUsuarios.filter((u) => u.rol === "estudiante").length;
    $("#admin-stat-users").textContent = statsUsuarios.length;
    $("#admin-stat-users-note").textContent = `${estudiantes} estudiantes · ${statsUsuarios.length - estudiantes} tutores y admins`;
  } else {
    $("#admin-stat-users").textContent = "…";
  }
  $("#admin-stat-tutors").textContent = tutorsVerified;
  $("#admin-stat-materias").textContent = materiasActuales().length;
  const openCases = cases.filter((c) => caseStatus(c) === "open").length;
  $("#admin-stat-pending").textContent = pendingTutors + cambiosPendientes().length + openCases;
}

function renderPendingList() {
  const container = $("#admin-pending-list");
  const pendientes = tutors.filter((t) => t.status === "pending");
  const actualizaciones = cambiosPendientes();

  if (tutorsEstado === "cargando") {
    container.innerHTML = '<p class="admin-empty">Cargando solicitudes…</p>';
    return;
  }
  if (tutorsEstado === "error") {
    container.innerHTML = `<p class="admin-empty">No se pudieron cargar las solicitudes. ${escapeHTML(detalleError(tutorsError))}</p>`;
    return;
  }
  if (pendientes.length === 0 && actualizaciones.length === 0) {
    container.innerHTML = '<p class="admin-empty">No hay pendientes por revisar.</p>';
    return;
  }

  const item = (titulo, detalle) => `
      <div class="admin-pending-item">
        <svg class="icon" aria-hidden="true"><use href="#icon-award"></use></svg>
        <div>
          <strong>${escapeHTML(titulo)}</strong>
          <p>${escapeHTML(detalle)}</p>
        </div>
        <span class="admin-status pending">Pendiente</span>
      </div>`;

  container.innerHTML = [
    ...pendientes.map((t) => item(`Solicitud de ${t.name}`, `Verificación como tutor de ${t.subject || "sin materia"}`)),
    ...actualizaciones.map((s) => item(`Actualización de ${s.tutorNombre || "un tutor"}`, `Cambia: ${etiquetasCambio(s).join(", ")}`))
  ].join("");
}

function renderActivity() {
  const box = $("#admin-activity-list");
  const eventos = [];
  const add = (icon, title, ts) => {
    const fecha = fechaDe(ts);
    if (fecha) eventos.push({ icon, title, fecha });
  };

  statsUsuarios.forEach((u) => {
    const v = userView(u);
    add("users", `Se registró ${v.name} (${(ROLE_LABELS[v.rol] || "usuario").toLowerCase()})`, u.creadoEn);
  });
  tutors.forEach((t) => {
    add("award", `${t.name} solicitó verificación como tutor`, t.solicitudEnviadaEn);
    if (t.revisadoEn) {
      add("check", `Solicitud de ${t.name} ${t.status === "rejected" ? "rechazada" : "aprobada"}`, t.revisadoEn);
    }
  });
  cambios.forEach((s) => {
    add("award", `${s.tutorNombre || "Un tutor"} pidió actualizar sus datos`, s.creadaEn);
    if (s.revisadaEn) {
      add("check", `Actualización de ${s.tutorNombre || "un tutor"} ${s.estado === "rechazada" ? "rechazada" : "aprobada"}`, s.revisadaEn);
    }
  });
  statsTutorias.forEach((t) => {
    add("calendar", `Tutoría de ${materiaNombre(t.materia)} programada: ${t.tutorNombre || "tutor"} con ${t.estudianteNombre || "estudiante"}`, t.creadaEn || t.creadoEn);
  });
  ratings.forEach((r) => {
    add("star", `Nueva calificación de ${Number(r.estrellas) || 0}★ para ${r.tutorNombre || "un tutor"}`, r.creadaEn);
  });
  cases.forEach((c) => {
    add("flag", `Caso de soporte: ${c.asunto || "sin asunto"}`, c.creadoEn);
  });

  eventos.sort((a, b) => b.fecha - a.fecha);

  if (eventos.length === 0) {
    box.innerHTML = `<p class="admin-empty">${statsEstado === "cargando" ? "Cargando actividad…" : "Todavía no hay actividad."}</p>`;
    return;
  }

  box.innerHTML = eventos
    .slice(0, 8)
    .map(
      (e) => `
      <div class="admin-activity-item">
        <svg class="icon" aria-hidden="true"><use href="#icon-${e.icon}"></use></svg>
        <div>
          <strong>${escapeHTML(e.title)}</strong>
          <p>${escapeHTML(tiempoRelativo(e.fecha))}</p>
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

  if (statsEstado === "cargando") {
    grid.innerHTML = '<p class="admin-empty">Cargando usuarios…</p>';
    return;
  }
  if (statsEstado === "error") {
    grid.innerHTML = `<p class="admin-empty">No se pudieron cargar los usuarios. ${escapeHTML(detalleError(statsError))}</p>`;
    return;
  }

  const filtered = statsUsuarios
    .map(userView)
    .filter((u) => {
      const matchSearch = !search || u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search);
      const matchRole = role === "all" || u.rol === role;
      const matchStatus = status === "all" || u.status === status;
      return matchSearch && matchRole && matchStatus;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  if (filtered.length === 0) {
    grid.innerHTML = '<p class="admin-empty">No se encontraron usuarios con esos filtros.</p>';
    return;
  }

  grid.innerHTML = filtered
    .map(
      (u) => `
      <button class="admin-user-card" type="button" data-user-id="${escapeHTML(u.id)}">
        <div class="admin-user-card-top">
          <span class="admin-initials">${escapeHTML(u.initial)}</span>
          <div>
            <strong>${escapeHTML(u.name)}</strong>
            <small>${escapeHTML(u.email)}</small>
          </div>
        </div>
        <p>${escapeHTML(ROLE_LABELS[u.rol] || u.rol || "Sin rol")} · <span class="admin-status ${u.status}">${u.status === "active" ? "Activo" : "Suspendido"}</span></p>
      </button>
    `
    )
    .join("");

  $$(".admin-user-card", grid).forEach((card) => {
    card.addEventListener("click", () => openUserDetail(card.dataset.userId));
  });
}

// Una cuenta está activa salvo que «activo» sea false (el registro lo crea en true).
function userView(u) {
  const name = `${u.nombre || ""} ${u.apellido || ""}`.trim() || u.email || "Sin nombre";
  return {
    ...u,
    name,
    email: u.email || "",
    initial: iniciales(name, "US"),
    status: u.activo === false ? "suspended" : "active"
  };
}

async function setUserActive(uid, activo) {
  try {
    await api.admin.cambiarActivo(uid, activo);
    const u = statsUsuarios.find((x) => x.id === uid);
    if (u) u.activo = activo;
    $("#admin-user-dialog").close();
    renderUsers();
    renderStats();
    showToast(`La cuenta quedó ${activo ? "activada" : "suspendida"}.`);
  } catch (err) {
    console.error("No se pudo cambiar el estado de la cuenta:", err);
    showToast(`No se pudo guardar el cambio. ${detalleError(err)}`);
  }
}

function openUserDetail(userId) {
  const raw = statsUsuarios.find((u) => u.id === userId);
  if (!raw) return;
  const user = userView(raw);

  const dialog = $("#admin-user-dialog");
  const statusLabel = user.status === "active" ? "Activo" : "Suspendido";
  // No se permite suspender a un administrador (ni a uno mismo).
  const puedeSuspender = user.rol !== "admin" && user.id !== adminUid;
  const solicitud = user.rol === "tutor" && tutorStatusFromEstado(user.estado)
    ? `<dt>Solicitud de tutor</dt><dd>${escapeHTML(TUTOR_STATUS_LABELS[tutorStatusFromEstado(user.estado)])}</dd>`
    : user.rol === "tutor"
      ? "<dt>Solicitud de tutor</dt><dd>Sin enviar (perfil incompleto)</dd>"
      : "";

  $("#admin-user-detail").innerHTML = `
    <dl class="admin-detail-list">
      <dt>Nombre</dt><dd>${escapeHTML(user.name)}</dd>
      <dt>Correo</dt><dd>${escapeHTML(user.email)}</dd>
      <dt>Rol</dt><dd>${escapeHTML(ROLE_LABELS[user.rol] || user.rol || "Sin rol")}</dd>
      ${solicitud}
      <dt>Estado</dt><dd><span class="admin-status ${user.status}">${statusLabel}</span></dd>
      <dt>Registro</dt><dd>${escapeHTML(fechaCorta(user.creadoEn) || "—")}</dd>
      <dt>ID</dt><dd>${escapeHTML(user.id)}</dd>
    </dl>
    ${puedeSuspender ? `
    <div class="admin-detail-actions">
      <button class="btn btn-secondary" type="button" data-user-toggle>${user.status === "active" ? "Suspender cuenta" : "Activar cuenta"}</button>
    </div>` : ""}
  `;

  $("#admin-user-detail [data-user-toggle]")?.addEventListener("click", () =>
    setUserActive(user.id, user.status !== "active")
  );

  dialog.showModal();
}

/* ---------- Renderizado: Tutores ---------- */
/* ---------- Estadísticas (API: tutorías, solicitudes, usuarios) ---------- */
async function loadStats() {
  statsEstado = "cargando";
  renderAnalytics();
  try {
    const [tut, sol, usu] = await Promise.all([
      api.admin.tutorias(),
      api.admin.solicitudes(),
      api.admin.usuarios()
    ]);
    statsTutorias = tut;
    statsSolicitudes = sol;
    statsUsuarios = usu;
    statsEstado = "listo";
    statsError = null;
  } catch (err) {
    console.error("No se pudieron cargar las estadísticas:", err);
    statsEstado = "error";
    statsError = err;
  }
  renderAnalytics();
  renderUsers();
  renderStats();
  renderSubjectList();
  renderActivity();
}

function barRow(etiqueta, valor, maximo, texto, clase = "") {
  const ancho = maximo > 0 ? Math.round((valor / maximo) * 100) : 0;
  return `
    <div class="admin-bar-row">
      <span title="${escapeHTML(etiqueta)}">${escapeHTML(etiqueta)}</span>
      <span class="admin-bar-track"><span class="admin-bar-fill ${clase}" style="width:${ancho}%"></span></span>
      <span>${escapeHTML(texto)}</span>
    </div>`;
}

function renderAnalytics() {
  const body = $("#admin-analytics-body");
  if (!body) return;

  if (statsEstado === "cargando") {
    body.innerHTML = '<p class="admin-empty">Cargando estadísticas…</p>';
    return;
  }
  if (statsEstado === "error") {
    body.innerHTML = `<p class="admin-empty">No se pudieron cargar las estadísticas. ${escapeHTML(detalleError(statsError))}</p>`;
    return;
  }

  const total = statsTutorias.length;
  const porEstado = (e) => statsTutorias.filter((t) => t.estado === e).length;
  const completadas = porEstado("completada");
  const programadas = porEstado("programada");
  const canceladas = porEstado("cancelada");
  const pct = (n, d) => (d > 0 ? `${Math.round((n / d) * 100)} %` : "—");

  const solTotal = statsSolicitudes.length;
  const solPend = statsSolicitudes.filter((s) => s.estado === "pendiente").length;
  const solAcep = statsSolicitudes.filter((s) => s.estado === "aceptada").length;
  const solResueltas = solAcep + statsSolicitudes.filter((s) => s.estado === "rechazada").length;

  const visibles = ratings.filter((r) => r.estado === "visible");
  const ocultas = ratings.length - visibles.length;
  const promedio = visibles.length
    ? (visibles.reduce((a, r) => a + (Number(r.estrellas) || 0), 0) / visibles.length).toFixed(1)
    : null;

  // Tutorías por materia (top 6)
  const porMateria = {};
  statsTutorias.forEach((t) => {
    const m = materiaNombre(t.materia);
    porMateria[m] = porMateria[m] || { total: 0, completadas: 0 };
    porMateria[m].total += 1;
    if (t.estado === "completada") porMateria[m].completadas += 1;
  });
  const materias = Object.entries(porMateria).sort((a, b) => b[1].total - a[1].total).slice(0, 6);
  const maxMateria = materias[0]?.[1].total || 0;

  // Tutores con más tutorías completadas (top 5), con su promedio
  const porTutor = {};
  statsTutorias.forEach((t) => {
    if (!t.tutorId) return;
    porTutor[t.tutorId] = porTutor[t.tutorId] || { nombre: t.tutorNombre || "Tutor", total: 0, completadas: 0 };
    porTutor[t.tutorId].total += 1;
    if (t.estado === "completada") porTutor[t.tutorId].completadas += 1;
  });
  const topTutores = Object.entries(porTutor)
    .sort((a, b) => b[1].completadas - a[1].completadas || b[1].total - a[1].total)
    .slice(0, 5);
  const maxTutor = topTutores[0]?.[1].completadas || 0;

  // Distribución de estrellas
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, c: visibles.filter((r) => Number(r.estrellas) === n).length }));
  const maxDist = Math.max(0, ...dist.map((d) => d.c));

  const vacio = '<p class="admin-muted">Todavía no hay datos.</p>';

  body.innerHTML = `
    <div class="admin-kpis">
      <div class="admin-kpi"><span>Tutorías totales</span><strong>${total}</strong><small>${programadas} programadas</small></div>
      <div class="admin-kpi"><span>Completadas</span><strong>${completadas}</strong><small>${pct(completadas, total)} del total</small></div>
      <div class="admin-kpi"><span>Canceladas</span><strong>${canceladas}</strong><small>${pct(canceladas, total)} del total</small></div>
      <div class="admin-kpi"><span>Calificación promedio</span><strong>${promedio ? `${promedio} ★` : "—"}</strong><small>${visibles.length} visibles${ocultas ? ` · ${ocultas} ocultas` : ""}</small></div>
      <div class="admin-kpi"><span>Solicitudes</span><strong>${solTotal}</strong><small>${solPend} pendientes</small></div>
      <div class="admin-kpi"><span>Tasa de aceptación</span><strong>${pct(solAcep, solResueltas)}</strong><small>de las solicitudes resueltas</small></div>
      <div class="admin-kpi"><span>Estudiantes</span><strong>${statsUsuarios.filter((u) => u.rol === "estudiante").length}</strong><small>cuentas registradas</small></div>
      <div class="admin-kpi"><span>Tutores aprobados</span><strong>${tutors.filter((t) => t.status === "verified").length}</strong><small>${tutors.filter((t) => t.status === "pending").length} por revisar</small></div>
    </div>
    <div class="admin-charts">
      <div class="admin-chart">
        <h3>Tutorías por materia</h3>
        ${materias.length ? materias.map(([m, v]) => barRow(m, v.total, maxMateria, `${v.completadas}/${v.total}`)).join("") : vacio}
        ${materias.length ? '<p class="admin-muted">Completadas / total</p>' : ""}
      </div>
      <div class="admin-chart">
        <h3>Tutores con más tutorías completadas</h3>
        ${topTutores.length ? topTutores.map(([id, v]) => {
          const r = tutorRating(id);
          return barRow(v.nombre, v.completadas, maxTutor, `${v.completadas}${r.total ? ` · ${r.promedio}★` : ""}`, "is-green");
        }).join("") : vacio}
      </div>
      <div class="admin-chart">
        <h3>Distribución de calificaciones</h3>
        ${visibles.length ? dist.map((d) => barRow(`${d.n} ★`, d.c, maxDist, String(d.c))).join("") : vacio}
      </div>
    </div>`;
}

/* ---------- Tutores (API: usuarios con rol «tutor») ----------
   Ciclo de vida del campo «estado»: incompleto → pendiente → aprobado | rechazado.
   «incompleto» (aún no envió el formulario) no aparece en el panel. */
const TUTOR_STATUS_MAP = {
  pendiente: "pending",
  aprobado: "verified",
  aceptado: "verified",
  rechazado: "rejected",
  rechazada: "rejected"
};
const TUTOR_STATUS_LABELS = { pending: "Pendiente", verified: "Aprobado", rejected: "Rechazado" };

function tutorStatusFromEstado(estado) {
  return TUTOR_STATUS_MAP[String(estado || "").trim().toLowerCase()] || null;
}

function tutorRating(tutorId) {
  const visibles = ratings.filter((r) => r.tutorId === tutorId && r.estado === "visible");
  if (visibles.length === 0) return { promedio: null, total: 0 };
  const suma = visibles.reduce((acc, r) => acc + (Number(r.estrellas) || 0), 0);
  return { promedio: (suma / visibles.length).toFixed(1), total: visibles.length };
}

async function loadTutors() {
  tutorsEstado = "cargando";
  renderTutors();
  renderPendingList();
  try {
    const usuarios = await api.admin.usuarios("tutor");
    tutors = usuarios
      .map((x) => {
        const materias = Array.isArray(x.materias) ? x.materias : [];
        const name = `${x.nombre || ""} ${x.apellido || ""}`.trim() || x.email || "Tutor";
        return {
          ...x, // incluye el id
          materias,
          name,
          email: x.email || "",
          subject: materias.map(materiaNombre).join(", "),
          initial: iniciales(name, "TU"),
          status: tutorStatusFromEstado(x.estado)
        };
      })
      .filter((t) => t.status) // «incompleto» todavía no es una solicitud
      .sort((a, b) => aMillis(b.solicitudEnviadaEn) - aMillis(a.solicitudEnviadaEn));
    tutorsEstado = "listo";
    tutorsError = null;
  } catch (err) {
    console.error("No se pudieron cargar los tutores:", err);
    tutorsEstado = "error";
    tutorsError = err;
  }
  populateTutorSubjectFilter();
  renderTutors();
  renderAnalytics();
  renderStats();
  renderPendingList();
  renderNotificationPreview();
  renderNotificationFull();
  renderSubjectList();
  renderActivity();
}

function populateTutorSubjectFilter() {
  const select = $("#admin-tutor-subject");
  const actual = select.value || "all";
  select.innerHTML =
    '<option value="all">Todas</option>' +
    materiasActuales().map((m) => `<option value="${escapeHTML(m.id)}">${escapeHTML(m.nombre)}</option>`).join("");
  select.value = materiasActuales().some((m) => m.id === actual) ? actual : "all";
}

function renderTutorTabs() {
  const counts = { pending: 0, verified: 0, rejected: 0, updates: cambiosPendientes().length };
  tutors.forEach((t) => {
    counts[t.status] = (counts[t.status] || 0) + 1;
  });

  $$("[data-tutor-count]").forEach((el) => {
    el.textContent = counts[el.dataset.tutorCount] || 0;
  });
}

function tutorActionButtons(t, attr) {
  if (t.status === "pending") {
    return `
      <button class="btn btn-primary" type="button" ${attr}-approve="${escapeHTML(t.id)}">Aprobar</button>
      <button class="btn btn-secondary" type="button" ${attr}-reject="${escapeHTML(t.id)}">Rechazar</button>`;
  }
  if (t.status === "verified") {
    return `<button class="btn btn-secondary" type="button" ${attr}-reject="${escapeHTML(t.id)}">Revocar aprobación</button>`;
  }
  return `<button class="btn btn-primary" type="button" ${attr}-approve="${escapeHTML(t.id)}">Aprobar</button>`;
}

function bindTutorActions(scope, attr) {
  $$(`[${attr}-approve]`, scope).forEach((btn) =>
    btn.addEventListener("click", () => setTutorStatus(btn.getAttribute(`${attr}-approve`), "aprobado", "aprobada"))
  );
  $$(`[${attr}-reject]`, scope).forEach((btn) =>
    btn.addEventListener("click", () => setTutorStatus(btn.getAttribute(`${attr}-reject`), "rechazado", "rechazada"))
  );
}

function renderTutors() {
  renderTutorTabs();

  const search = $("#admin-tutor-search").value.trim().toLowerCase();
  const subject = $("#admin-tutor-subject").value;
  const grid = $("#admin-tutor-grid");

  if (tutorTab === "updates") {
    renderCambios(grid, search, subject);
    return;
  }

  if (tutorsEstado === "cargando") {
    grid.innerHTML = '<p class="admin-empty">Cargando tutores…</p>';
    return;
  }
  if (tutorsEstado === "error") {
    grid.innerHTML = `<p class="admin-empty">No se pudieron cargar los tutores. ${escapeHTML(detalleError(tutorsError))}</p>`;
    return;
  }

  const filtered = tutors.filter((t) => {
    const matchTab = t.status === tutorTab;
    const matchSearch =
      !search ||
      t.name.toLowerCase().includes(search) ||
      t.email.toLowerCase().includes(search) ||
      t.subject.toLowerCase().includes(search);
    const matchSubject = subject === "all" || t.materias.some((m) => materiaId(m) === subject);
    return matchTab && matchSearch && matchSubject;
  });

  if (filtered.length === 0) {
    grid.innerHTML = '<p class="admin-empty">No hay tutores con esos criterios.</p>';
    return;
  }

  grid.innerHTML = filtered
    .map((t) => {
      const r = tutorRating(t.id);
      const enviada = fechaCorta(t.solicitudEnviadaEn);
      return `
      <article class="admin-tutor-card">
        <div class="admin-tutor-card-top">
          <span class="admin-initials">${escapeHTML(t.initial)}</span>
          <div>
            <strong>${escapeHTML(t.name)}</strong>
            <small>${escapeHTML(t.email)} · ${escapeHTML(t.subject || "Sin materias")}</small>
          </div>
        </div>
        <p>${r.total ? `Calificación: ${r.promedio} (${r.total} opiniones)` : "Sin calificaciones todavía"}${enviada ? ` · Solicitud: ${escapeHTML(enviada)}` : ""}</p>
        <span class="admin-status ${t.status}">${TUTOR_STATUS_LABELS[t.status]}</span>
        <div class="admin-tutor-card-actions">
          <button class="btn btn-secondary" type="button" data-tutor-detail="${escapeHTML(t.id)}">Ver solicitud</button>
          ${tutorActionButtons(t, "data-tutor")}
        </div>
      </article>
    `;
    })
    .join("");

  $$("[data-tutor-detail]", grid).forEach((btn) =>
    btn.addEventListener("click", () => openTutorDetail(btn.dataset.tutorDetail))
  );
  bindTutorActions(grid, "data-tutor");
}

async function setTutorStatus(tutorId, nuevoEstado, pastTense) {
  const tutor = tutors.find((t) => t.id === tutorId);
  if (!tutor || tutorsGuardando.has(tutorId)) return;

  tutorsGuardando.add(tutorId);
  try {
    // Solo un administrador puede cambiar «estado»: lo exige la API (rol «admin»).
    await api.admin.revisarTutor(tutorId, nuevoEstado);
    tutor.estado = nuevoEstado;
    tutor.revisadoPor = adminUid;
    tutor.revisadoEn = new Date().toISOString();
    tutor.status = tutorStatusFromEstado(nuevoEstado);
    renderTutors();
    renderStats();
    renderPendingList();
    renderNotificationPreview();
    renderNotificationFull();
    renderSubjectList();
    renderActivity();
    $("#admin-tutor-dialog").close();
    showToast(`Solicitud de ${tutor.name} ${pastTense}.`);
  } catch (err) {
    console.error("No se pudo actualizar el tutor:", err);
    showToast(`No se pudo guardar la decisión. ${detalleError(err)}`);
  } finally {
    tutorsGuardando.delete(tutorId);
  }
}

// Abre la hoja de vida (PDF que el tutor subió; la API la entrega como data URL) en una pestaña nueva.
async function verHojaVida(tutorId, { pendiente = false } = {}) {
  // La pestaña se abre ya, dentro del clic, para que el navegador no la bloquee.
  const ventana = window.open("", "_blank");
  try {
    const hoja = await api.admin.hojaDeVida(tutorId, { pendiente });
    const blob = await (await fetch(hoja.dataURL)).blob();
    const url = URL.createObjectURL(blob);
    if (ventana) ventana.location.href = url;
    else window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
  } catch (err) {
    ventana?.close();
    if (err?.status === 404) {
      showToast(pendiente ? "Esa solicitud ya no tiene un PDF pendiente." : "Este tutor no tiene un PDF guardado.");
      return;
    }
    console.error("No se pudo abrir la hoja de vida:", err);
    showToast(`No se pudo abrir la hoja de vida. ${detalleError(err)}`);
  }
}

function openTutorDetail(tutorId) {
  const tutor = tutors.find((t) => t.id === tutorId);
  if (!tutor) return;

  const r = tutorRating(tutor.id);
  const dialog = $("#admin-tutor-dialog");

  $("#admin-tutor-detail").innerHTML = `
    <dl class="admin-detail-list">
      <dt>Nombre</dt><dd>${escapeHTML(tutor.name)}</dd>
      <dt>Correo</dt><dd>${escapeHTML(tutor.email)}</dd>
      <dt>Título / carrera</dt><dd>${escapeHTML(tutor.titulo || "—")}</dd>
      <dt>Nivel de estudios</dt><dd>${escapeHTML(textoCambio("nivelEstudios", tutor.nivelEstudios))}</dd>
      <dt>Institución</dt><dd>${escapeHTML(tutor.institucion || "—")}</dd>
      <dt>Ciudad</dt><dd>${escapeHTML(tutor.ciudad || "—")}</dd>
      <dt>Materias</dt><dd>${escapeHTML(textoCambio("materias", tutor.materias))}</dd>
      <dt>Enseña a</dt><dd>${escapeHTML(textoCambio("nivelEnsenanza", tutor.nivelEnsenanza))}</dd>
      <dt>Experiencia</dt><dd>${escapeHTML(textoCambio("experiencia", tutor.experiencia))}</dd>
      <dt>Modalidad</dt><dd>${escapeHTML(textoCambio("modalidad", tutor.modalidad))}</dd>
      <dt>Franjas</dt><dd>${escapeHTML(textoCambio("franjas", tutor.franjas))}</dd>
      <dt>Tarifa</dt><dd>${escapeHTML(textoCambio("tarifa", tutor.tarifa))}</dd>
      <dt>Calificación</dt><dd>${r.total ? `${r.promedio} (${r.total} opiniones)` : "Sin calificaciones"}</dd>
      <dt>Solicitud enviada</dt><dd>${escapeHTML(fechaCorta(tutor.solicitudEnviadaEn) || "—")}</dd>
      <dt>Estado</dt><dd><span class="admin-status ${tutor.status}">${TUTOR_STATUS_LABELS[tutor.status]}</span></dd>
      <dt>Presentación</dt><dd>${escapeHTML(tutor.presentacion || "—")}</dd>
      <dt>Hoja de vida</dt><dd>${
        tutor.tieneHojaVida
          ? `<button class="btn btn-secondary" type="button" id="admin-tutor-cv">Ver PDF${tutor.hojaVidaPDF ? ` (${escapeHTML(tutor.hojaVidaPDF)})` : ""}</button>`
          : escapeHTML(tutor.hojaVidaPDF ? `${tutor.hojaVidaPDF} (solo el nombre; el archivo no se guardó)` : "—")
      }</dd>
    </dl>
    <div class="admin-tutor-card-actions">
      ${tutorActionButtons(tutor, "data-dialog-tutor")}
    </div>
  `;

  const detalle = $("#admin-tutor-detail");
  $("#admin-tutor-cv", detalle)?.addEventListener("click", () => verHojaVida(tutor.id));
  bindTutorActions(detalle, "data-dialog-tutor");

  dialog.showModal();
}

/* ---------- Actualizaciones de datos de los tutores (API: /admin/cambios-perfil) ----------
   Un tutor aprobado no edita sus datos profesionales: envía una solicitud y aquí se
   aprueba o se rechaza. Mientras está pendiente, el perfil y la búsqueda no cambian. */
const ETIQUETAS_CAMBIO = {
  titulo: "Carrera o formación", nivelEstudios: "Nivel de estudios", institucion: "Institución",
  materias: "Materias", nivelEnsenanza: "Nivel al que enseña", experiencia: "Experiencia",
  modalidad: "Modalidad", ciudad: "Ciudad", tarifa: "Tarifa por hora", franjas: "Franjas",
  presentacion: "Presentación", hojaVidaPDF: "Hoja de vida"
};
const NIVELES_ESTUDIO = {
  tecnico: "Técnico o tecnólogo", "pregrado-curso": "Pregrado en curso", pregrado: "Pregrado finalizado", posgrado: "Posgrado"
};
const NIVELES_ENSENANZA = { secundaria: "Secundaria", universitario: "Universitario", ambos: "Secundaria y universitario" };
const NOMBRES_FRANJA = { manana: "Mañana", tarde: "Tarde", noche: "Noche" };

function textoCambio(campo, valor) {
  if (valor === undefined || valor === null || valor === "" || (Array.isArray(valor) && !valor.length)) return "—";
  switch (campo) {
    case "materias": return valor.map(nombreMateria).join(", ");
    case "franjas": return valor.map((f) => NOMBRES_FRANJA[f] || f).join(", ");
    case "nivelEstudios": return NIVELES_ESTUDIO[valor] || String(valor);
    case "nivelEnsenanza": return NIVELES_ENSENANZA[valor] || String(valor);
    case "experiencia": return `${valor} ${Number(valor) === 1 ? "año" : "años"}`;
    case "tarifa": return `$${Number(valor).toLocaleString("es-CO")} COP / hora`;
    default: return String(valor);
  }
}

const idCambio = (s) => s.tutorId || s.id;
const cambiosPendientes = () => cambios.filter((s) => s.estado === "pendiente");
const etiquetasCambio = (s) => Object.keys(s.cambios || {}).map((c) => ETIQUETAS_CAMBIO[c] || c);
const tutorDeCambio = (s) => tutors.find((t) => t.id === idCambio(s));

async function loadCambios() {
  try {
    cambios = await api.admin.cambiosPerfil();
    cambiosEstado = "listo";
    cambiosError = null;
  } catch (err) {
    console.error("No se pudieron cargar las actualizaciones de datos:", err);
    cambiosEstado = "error";
    cambiosError = err;
  }
  renderTutors();
  renderStats();
  renderPendingList();
  renderNotificationPreview();
  renderNotificationFull();
  renderActivity();
}

function renderCambios(grid, search, subject) {
  if (cambiosEstado === "cargando") {
    grid.innerHTML = '<p class="admin-empty">Cargando actualizaciones…</p>';
    return;
  }
  if (cambiosEstado === "error") {
    grid.innerHTML = `<p class="admin-empty">No se pudieron cargar las actualizaciones. ${escapeHTML(detalleError(cambiosError))}</p>`;
    return;
  }

  const pendientes = cambiosPendientes();
  const filtradas = pendientes.filter((s) => {
    const materias = [...(tutorDeCambio(s)?.materias || []), ...(s.cambios?.materias || [])];
    const coincideTexto = !search
      || `${s.tutorNombre || ""} ${s.tutorEmail || ""}`.toLowerCase().includes(search)
      || materias.some((m) => materiaNombre(m).toLowerCase().includes(search));
    return coincideTexto && (subject === "all" || materias.some((m) => materiaId(m) === subject));
  });

  if (filtradas.length === 0) {
    grid.innerHTML = `<p class="admin-empty">${pendientes.length ? "No hay actualizaciones con esos criterios." : "No hay actualizaciones pendientes."}</p>`;
    return;
  }

  grid.innerHTML = filtradas
    .map((s) => {
      const nombre = s.tutorNombre || s.tutorEmail || "Tutor";
      const enviada = fechaCorta(s.creadaEn);
      return `
      <article class="admin-tutor-card">
        <div class="admin-tutor-card-top">
          <span class="admin-initials">${escapeHTML(iniciales(nombre, "TU"))}</span>
          <div>
            <strong>${escapeHTML(nombre)}</strong>
            <small>${escapeHTML(s.tutorEmail || "")}</small>
          </div>
        </div>
        <p>Cambia: ${escapeHTML(etiquetasCambio(s).join(", "))}${enviada ? ` · Enviada: ${escapeHTML(enviada)}` : ""}</p>
        <span class="admin-status pending">Pendiente</span>
        <div class="admin-tutor-card-actions">
          <button class="btn btn-primary" type="button" data-change-detail="${escapeHTML(idCambio(s))}">Revisar</button>
        </div>
      </article>`;
    })
    .join("");

  $$("[data-change-detail]", grid).forEach((btn) =>
    btn.addEventListener("click", () => abrirCambio(btn.dataset.changeDetail))
  );
}

function abrirCambio(tutorId) {
  const s = cambios.find((x) => idCambio(x) === tutorId);
  if (!s) return;

  cambioAbierto = tutorId;
  const tutor = tutorDeCambio(s);
  const nombre = s.tutorNombre || s.tutorEmail || "Tutor";

  const filas = Object.entries(s.cambios || {}).map(([campo, nuevo]) => {
    const actual = campo === "hojaVidaPDF"
      ? (tutor?.hojaVidaPDF || (tutor?.tieneHojaVida ? "Archivo guardado" : ""))
      : tutor?.[campo];
    const propuesto = campo === "hojaVidaPDF" ? `${nuevo} (archivo nuevo)` : textoCambio(campo, nuevo);
    return `<tr>
      <td>${escapeHTML(ETIQUETAS_CAMBIO[campo] || campo)}</td>
      <td>${escapeHTML(textoCambio(campo, actual))}</td>
      <td class="is-new">${escapeHTML(propuesto)}</td>
    </tr>`;
  }).join("");

  const nueva = s.cambios?.modalidad;
  const aviso = nueva && nueva !== "Virtual y presencial"
    ? `<p class="admin-change-note">Si apruebas, la disponibilidad del tutor se ajusta a «${escapeHTML(nueva)}»: `
      + "se eliminan sus bloques de otra modalidad y los «Virtual y presencial» pasan a ser solo "
      + `${escapeHTML(nueva.toLowerCase())}.</p>`
    : "";

  const enviada = fechaCorta(s.creadaEn);
  $("#admin-change-detail").innerHTML = `
    <p><strong>${escapeHTML(nombre)}</strong> · ${escapeHTML(s.tutorEmail || "")}${enviada ? ` · Enviada el ${escapeHTML(enviada)}` : ""}</p>
    <table class="admin-change-table">
      <thead><tr><th scope="col">Dato</th><th scope="col">Actual</th><th scope="col">Propuesto</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    ${aviso}
    ${s.tieneHojaVida
      ? `<p><button class="btn btn-secondary" type="button" id="admin-change-cv">Ver el PDF nuevo${s.cambios?.hojaVidaPDF ? ` (${escapeHTML(s.cambios.hojaVidaPDF)})` : ""}</button></p>`
      : ""}
  `;
  $("#admin-change-cv")?.addEventListener("click", () => verHojaVida(tutorId, { pendiente: true }));

  $("#admin-change-note").value = "";
  $("#admin-change-error").textContent = "";
  $("#admin-change-approve").disabled = false;
  $("#admin-change-reject").disabled = false;
  $("#admin-change-dialog").showModal();
}

async function resolverCambio(estado) {
  const tutorId = cambioAbierto;
  const s = cambios.find((x) => idCambio(x) === tutorId);
  const clave = `cambio:${tutorId}`;
  if (!s) {
    // El tutor la canceló (o la respondió otra persona) mientras el diálogo estaba abierto.
    $("#admin-change-dialog").close();
    cambioAbierto = null;
    showToast("Esa solicitud ya no está pendiente.");
    return;
  }
  if (tutorsGuardando.has(clave)) return;

  const botones = [$("#admin-change-approve"), $("#admin-change-reject")];
  const nombre = s.tutorNombre || "el tutor";
  $("#admin-change-error").textContent = "";
  tutorsGuardando.add(clave);
  botones.forEach((b) => { b.disabled = true; });
  try {
    await api.admin.resolverCambio(tutorId, estado, $("#admin-change-note").value.trim());
    $("#admin-change-dialog").close();
    cambioAbierto = null;
    showToast(`Actualización de ${nombre} ${estado === "aprobada" ? "aprobada" : "rechazada"}.`);
    await loadCambios();
    if (estado === "aprobada") loadTutors(); // el perfil del tutor cambió
  } catch (err) {
    console.error("No se pudo responder la actualización:", err);
    if (err?.status === 404 || err?.status === 409) {
      // El tutor la canceló o la respondió otra persona: ya no hay nada que decidir aquí.
      $("#admin-change-dialog").close();
      cambioAbierto = null;
      showToast(detalleError(err));
      loadCambios();
    } else {
      $("#admin-change-error").textContent = `No se pudo guardar la decisión. ${detalleError(err)}`;
      botones.forEach((b) => { b.disabled = false; });
    }
  } finally {
    tutorsGuardando.delete(clave);
  }
}

function bindCambios() {
  $("#admin-change-approve").addEventListener("click", () => resolverCambio("aprobada"));
  $("#admin-change-reject").addEventListener("click", () => resolverCambio("rechazada"));
}

/* ---------- Renderizado: Materias ---------- */
// Se llama cuando el catálogo cambia (se agregó una materia) para que todo lo que lo usa se repinte.
function refrescarMaterias() {
  populateTutorSubjectFilter();
  renderSubjectList();
  renderStats();
}

// Agregar materia (API: POST /admin/materias). Queda disponible al instante en el registro
// de tutores, en la búsqueda y en el panel del estudiante.
function bindMateriaForm() {
  const form = $("#admin-subject-form");
  const input = $("#admin-subject-new");
  const error = $("#admin-subject-form-error");
  const boton = $("#admin-subject-add");

  input.addEventListener("input", () => { error.textContent = ""; });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const nombre = input.value.trim().replace(/\s+/g, " ");
    if (nombre.length < 2) {
      error.textContent = "Escribe el nombre de la materia (mínimo 2 letras).";
      input.focus();
      return;
    }

    error.textContent = "";
    boton.disabled = true;
    try {
      const materia = await api.admin.crearMateria(nombre);
      agregarMateria(materia);
      input.value = "";
      $("#admin-subject-search").value = "";
      activeSubjectId = materia.id;
      refrescarMaterias();
      showToast(`Materia «${materia.nombre}» agregada.`);
    } catch (err) {
      console.error("No se pudo agregar la materia:", err);
      error.textContent = detalleError(err);
    } finally {
      boton.disabled = false;
    }
  });
}

function subjectData(id) {
  const tutoresDe = tutors.filter(
    (t) => t.status === "verified" && t.materias.some((m) => materiaId(m) === id)
  );
  const tuts = statsTutorias.filter((t) => materiaId(t.materia) === id);
  const calif = ratings.filter((r) => materiaId(r.materia) === id && r.estado === "visible");
  const promedio = calif.length
    ? (calif.reduce((a, r) => a + (Number(r.estrellas) || 0), 0) / calif.length).toFixed(1)
    : null;
  return {
    tutores: tutoresDe,
    total: tuts.length,
    completadas: tuts.filter((t) => t.estado === "completada").length,
    programadas: tuts.filter((t) => t.estado === "programada").length,
    canceladas: tuts.filter((t) => t.estado === "cancelada").length,
    promedio,
    opiniones: calif.length
  };
}

function renderSubjectList() {
  const search = normMateria($("#admin-subject-search").value);
  const list = $("#admin-subject-list");

  const filtered = materiasActuales().filter((m) => !search || normMateria(m.nombre).includes(search));

  if (filtered.length === 0) {
    list.innerHTML = '<p class="admin-empty">No se encontraron materias.</p>';
    return;
  }

  list.innerHTML = filtered
    .map((m) => {
      const n = tutorsEstado === "listo" ? subjectData(m.id).tutores.length : null;
      return `
      <button class="admin-subject-item ${activeSubjectId === m.id ? "is-active" : ""}" type="button" data-subject-id="${escapeHTML(m.id)}">
        <svg class="icon" aria-hidden="true"><use href="#icon-book"></use></svg>
        <span>${escapeHTML(m.nombre)}</span>
        <small>${n === null ? "…" : `${n} ${n === 1 ? "tutor" : "tutores"}`}</small>
      </button>`;
    })
    .join("");

  $$(".admin-subject-item", list).forEach((btn) =>
    btn.addEventListener("click", () => {
      activeSubjectId = btn.dataset.subjectId;
      renderSubjectList();
    })
  );

  showSubjectDetail(activeSubjectId);
}

function showSubjectDetail(subjectId) {
  const materia = materiasActuales().find((m) => m.id === subjectId);
  const units = $("#admin-subject-units");
  if (!materia) {
    $("#admin-subject-detail-title").textContent = "Selecciona una materia";
    $("#admin-subject-detail-intro").hidden = false;
    units.hidden = true;
    return;
  }

  $("#admin-subject-detail-title").textContent = materia.nombre;
  $("#admin-subject-detail-intro").hidden = true;
  units.hidden = false;

  if (tutorsEstado !== "listo" || statsEstado !== "listo") {
    units.innerHTML = `<div class="admin-unit"><p>${tutorsEstado === "error" || statsEstado === "error" ? "No se pudieron cargar los datos de la materia." : "Cargando…"}</p></div>`;
    return;
  }

  const d = subjectData(materia.id);
  units.innerHTML = `
    <div class="admin-unit">
      <strong>Tutores aprobados (${d.tutores.length})</strong>
      <p>${d.tutores.length ? d.tutores.map((t) => escapeHTML(t.name)).join(", ") : "Aún no hay tutores aprobados en esta materia."}</p>
    </div>
    <div class="admin-unit">
      <strong>Tutorías (${d.total})</strong>
      <p>${d.completadas} completadas · ${d.programadas} programadas · ${d.canceladas} canceladas</p>
    </div>
    <div class="admin-unit">
      <strong>Calificación</strong>
      <p>${d.promedio ? `${d.promedio} ★ (${d.opiniones} ${d.opiniones === 1 ? "opinión visible" : "opiniones visibles"})` : "Sin calificaciones todavía."}</p>
    </div>
  `;
}

/* ---------- Tutorías: casos de soporte (API: /admin/soporte) ---------- */
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
    cases = (await api.admin.soporte()).sort((a, b) => aMillis(b.creadoEn) - aMillis(a.creadoEn));
    casesEstado = "listo";
    casesError = null;
  } catch (err) {
    console.error("No se pudieron cargar los casos:", err);
    casesEstado = "error";
    casesError = err;
  }
  renderCases();
  renderStats();
  renderNotificationPreview();
  renderNotificationFull();
  renderActivity();
}

function renderCaseTabs() {
  const counts = { open: 0, review: 0, resolved: 0 };
  cases.forEach((c) => { counts[caseStatus(c)] += 1; });
  $$("[data-case-count]").forEach((el) => {
    el.textContent = casesEstado === "listo" ? counts[el.dataset.caseCount] || 0 : "";
  });
}

// Casos abiertos junto a «Soporte» en el menú lateral.
function renderSoporteBadge() {
  const abiertos = cases.filter((c) => caseStatus(c) === "open").length;
  const insignia = $("#admin-support-badge");
  insignia.textContent = abiertos > 9 ? "9+" : String(abiertos);
  insignia.hidden = abiertos === 0;
}

function renderCases() {
  renderCaseTabs();
  renderSoporteBadge();
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
        <p>${escapeHTML(c.usuarioNombre || "Usuario")} · ${escapeHTML(ROLE_LABELS[c.rol] || "Usuario")}${c.creadoEn ? ` · ${escapeHTML(fechaCorta(c.creadoEn))}` : ""}${c.respuesta ? " · Respondido" : ""}</p>
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
    await api.admin.cambiarEstadoCaso(caseId, nuevoEstado);
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
  casoAbierto = caseId;
  const st = caseStatus(c);
  $("#admin-case-detail").innerHTML = `
    <dl class="admin-detail-list">
      <dt>Usuario</dt><dd>${escapeHTML(c.usuarioNombre || "Usuario")} (${escapeHTML(ROLE_LABELS[c.rol] || "—")})</dd>
      <dt>Correo</dt><dd>${c.usuarioEmail ? `<a href="mailto:${escapeHTML(c.usuarioEmail)}?subject=${encodeURIComponent("Re: " + (c.asunto || "Soporte TutoresOn-Line"))}">${escapeHTML(c.usuarioEmail)}</a>` : "—"}</dd>
      <dt>Asunto</dt><dd>${escapeHTML(c.asunto || "")}</dd>
      <dt>Fecha</dt><dd>${escapeHTML(fechaCorta(c.creadoEn) || "—")}</dd>
      <dt>Estado</dt><dd><span class="admin-status ${st}">${CASE_LABELS[st]}</span></dd>
      <dt>Mensaje</dt><dd class="admin-pre">${escapeHTML(c.mensaje || "")}</dd>
    </dl>
    ${c.respuesta ? `<p class="admin-case-reply"><strong>Tu respuesta anterior</strong>${escapeHTML(c.respuesta)}</p>` : ""}`;

  $("#admin-case-reply").value = "";
  $("#admin-case-error").textContent = "";
  $("#admin-case-send-resolve").hidden = st === "resolved";
  $("#admin-case-send").textContent = st === "resolved" ? "Enviar respuesta" : "Solo responder";
  $("#admin-case-dialog").showModal();
}

/* ---------- Calificaciones (API: moderación) ---------- */
async function loadRatings() {
  ratingsEstado = "cargando";
  renderRatings();
  try {
    ratings = (await api.admin.calificaciones()).sort((a, b) => aMillis(b.creadaEn) - aMillis(a.creadaEn));
    ratingsEstado = "listo";
    ratingsError = null;
  } catch (err) {
    console.error("No se pudieron cargar las calificaciones:", err);
    ratingsEstado = "error";
    ratingsError = err;
  }
  populateRatingFilters();
  renderRatings();
}

/* Sin escuchas en tiempo real: cada 30 s (con la pestaña visible) se vuelven a pedir las
   listas que cambian solas y solo se repinta lo que cambió. */
function sincronizarDatosAdmin() {
  if (detenerSondeo) detenerSondeo();
  detenerSondeo = sondear(async () => {
    const catalogoAntes = JSON.stringify(materiasActuales());
    const [tutorias, calificaciones, soporte, usuariosTutor, actualizaciones] = await Promise.all([
      api.admin.tutorias(),
      api.admin.calificaciones(),
      api.admin.soporte(),
      api.admin.usuarios("tutor"),
      api.admin.cambiosPerfil(),
      cargarMaterias({ forzar: true }), // otro administrador pudo agregar materias
      bandeja.cargar()                  // notificaciones nuevas (repinta sola la campana)
    ]);
    if (JSON.stringify(materiasActuales()) !== catalogoAntes) refrescarMaterias();

    const ordenar = (lista, campo) => lista.sort((a, b) => aMillis(b[campo]) - aMillis(a[campo]));
    const nuevasCalif = ordenar(calificaciones, "creadaEn");
    const nuevosCasos = ordenar(soporte, "creadoEn");

    const cambioTutorias = !sonIguales(tutorias, statsTutorias);
    const cambioCalif    = !sonIguales(nuevasCalif, ratings);
    const cambioCasos    = !sonIguales(nuevosCasos, cases);
    const cambioTutores  = !sonIguales(huellaTutores(usuariosTutor), huellaTutores(tutors));
    const cambioActualizaciones = !sonIguales(actualizaciones, cambios);

    if (cambioTutorias) {
      statsTutorias = tutorias;
      statsEstado = "listo";
      statsError = null;
    }
    if (cambioCalif) {
      ratings = nuevasCalif;
      ratingsEstado = "listo";
      ratingsError = null;
      populateRatingFilters();
      renderRatings();
      renderTutors();
    }
    if (cambioCasos) {
      cases = nuevosCasos;
      casesEstado = "listo";
      casesError = null;
      renderCases();
      renderNotificationPreview();
      renderNotificationFull();
    }
    if (cambioActualizaciones) {
      cambios = actualizaciones;
      cambiosEstado = "listo";
      cambiosError = null;
    }
    // hay solicitudes nuevas o alguien más decidió una (si aprobó una actualización, el perfil cambió)
    if (cambioTutores || cambioActualizaciones) loadTutors();
    if (cambioTutorias || cambioCalif || cambioCasos) {
      renderAnalytics();
      renderStats();
      renderSubjectList();
      renderActivity();
    }
  });
}

// Huella de los tutores que ya enviaron solicitud (id, estado y cuenta activa), para
// detectar cambios sin repintar. «incompleto» todavía no es una solicitud.
function huellaTutores(lista) {
  return lista
    .filter((t) => tutorStatusFromEstado(t.estado))
    .map((t) => `${t.id}|${t.estado}|${t.activo}`)
    .sort();
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
    await api.admin.moderarCalificacion(ratingId, cambios); // la API registra quién editó y cuándo
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

/* ---------- Notificaciones ----------
   Se guardan en la base de datos (siguen ahí al volver a entrar). Cada una abre lo que anuncia:
   un caso de soporte, una solicitud de tutor o una actualización de datos. */
const bandeja = crearBandeja({
  alCambiar: () => {
    renderNotificationPreview();
    renderNotificationFull();
  }
});

function listaAvisos(avisos, opciones) {
  const { cargado, fallo } = bandeja.estado;
  if (!avisos.length) {
    const texto = !cargado
      ? (fallo ? "No se pudieron cargar tus notificaciones." : "Cargando tus notificaciones…")
      : "No tienes notificaciones.";
    return `<li><p class="aviso-vacio">${texto}</p></li>`;
  }
  return avisos.map((a) => `<li>${htmlAviso(a, opciones)}</li>`).join("");
}

function renderNotificationPreview() {
  const { avisos, sinLeer } = bandeja.estado;
  $("#admin-notification-preview").innerHTML = listaAvisos(avisos.slice(0, 4), { compacto: true });
  const punto = $("#admin-notification-count");
  punto.textContent = sinLeer > 9 ? "9+" : String(sinLeer);
  punto.hidden = sinLeer === 0;
  $("#admin-notification-toggle").setAttribute(
    "aria-label", sinLeer ? `Notificaciones, ${sinLeer} sin leer` : "Notificaciones"
  );
}

function renderNotificationFull() {
  $("#admin-notification-full").innerHTML = listaAvisos(bandeja.estado.avisos, { etiquetaTitulo: "h2" });
  $("#admin-notifications-read-all").disabled = bandeja.estado.sinLeer === 0;
}

// Va a una sección aunque ya estemos en ella (el evento hashchange no se dispara si el hash no cambia).
function irASeccion(id) {
  if (window.location.hash === `#${id}`) showSection(id);
  else window.location.hash = id;
}

function abrirAviso(aviso) {
  bandeja.leer(aviso.id);
  $("#admin-notification-dropdown").hidden = true;
  $("#admin-notification-toggle").setAttribute("aria-expanded", "false");

  const { seccion, id, pestana } = aviso.destino || {};

  if (seccion === "soporte") {
    irASeccion("soporte");
    if (!id) return;
    if (cases.some((c) => c.id === id)) openCaseDetail(id);
    else loadCases().then(() => (cases.some((c) => c.id === id) ? openCaseDetail(id) : showToast("Ese caso ya no está disponible.")));
    return;
  }

  if (seccion === "tutores") {
    irASeccion("tutores");
    activarPestanaTutores(pestana === "updates" ? "updates" : "pending");
    if (!id) return;
    if (pestana === "updates") {
      if (cambiosPendientes().some((s) => idCambio(s) === id)) abrirCambio(id);
      else showToast("Esa actualización ya fue respondida.");
    } else if (tutors.some((t) => t.id === id)) {
      openTutorDetail(id);
    }
    return;
  }

  irASeccion(ADMIN_SECTIONS.some((s) => s.id === seccion) ? seccion : "resumen");
}

/* ---------- Perfil (API: GET/PATCH /usuarios/yo) ---------- */
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

async function loadProfile() {
  const d = await api.miPerfil();
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
  renderAnalytics();
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
      showToast(`"${button.dataset.pending}" estará disponible más adelante.`);
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

  activarClics($("#admin-notification-preview"), bandeja, abrirAviso);
  activarClics($("#admin-notification-full"), bandeja, abrirAviso);
  $("#admin-notifications-read-all").addEventListener("click", () => bandeja.leerTodas());

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

function activarPestanaTutores(tab) {
  tutorTab = tab;
  $$(".admin-tutor-tabs button").forEach((b) => {
    const active = b.dataset.tutorStatus === tab;
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-pressed", String(active));
  });
  renderTutors();
}

function bindTutorFilters() {
  $$(".admin-tutor-tabs button").forEach((button) => {
    button.addEventListener("click", () => activarPestanaTutores(button.dataset.tutorStatus));
  });

  $("#admin-tutor-search").addEventListener("input", renderTutors);

  $("#admin-tutor-subject").addEventListener("change", renderTutors);
}

function bindSubjectInteractions() {
  $("#admin-subject-search").addEventListener("input", renderSubjectList);
}

// Responde al usuario (le llega como notificación). Con «resolver» además cierra el caso;
// si no, un caso abierto pasa a «en revisión» porque ya se está atendiendo.
async function responderCaso(resolver) {
  const caso = cases.find((c) => c.id === casoAbierto);
  const error = $("#admin-case-error");
  if (!caso) return;

  const respuesta = $("#admin-case-reply").value.trim();
  if (!respuesta) {
    error.textContent = "Escribe la respuesta antes de enviarla.";
    $("#admin-case-reply").focus();
    return;
  }

  const cuerpo = { respuesta };
  if (resolver) cuerpo.estado = "resuelto";
  else if (caseStatus(caso) === "open") cuerpo.estado = "revision";

  const botones = [$("#admin-case-send-resolve"), $("#admin-case-send")];
  botones.forEach((b) => { b.disabled = true; });
  error.textContent = "";
  try {
    await api.admin.responderCaso(caso.id, cuerpo);
    caso.respuesta = respuesta;
    if (cuerpo.estado) caso.estado = cuerpo.estado;
    $("#admin-case-dialog").close();
    casoAbierto = null;
    renderCases();
    renderStats();
    showToast(`Respuesta enviada a ${caso.usuarioNombre || "el usuario"}.`);
  } catch (err) {
    console.error("No se pudo responder el caso:", err);
    error.textContent = `No se pudo enviar la respuesta. ${detalleError(err)}`;
  } finally {
    botones.forEach((b) => { b.disabled = false; });
  }
}

function bindCaseFilters() {
  $("#admin-case-form").addEventListener("submit", (event) => {
    event.preventDefault();
    responderCaso(true);
  });
  $("#admin-case-send").addEventListener("click", () => responderCaso(false));

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
      await api.actualizarPerfil({ nombre: name, apellido: lastname });
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

/* ---------- Foto de perfil (se guarda por la API en el perfil del usuario) ---------- */
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
  bindMateriaForm();
  bindCambios();
  bindCaseFilters();
  bindRatingFilters();
  bindProfile();
  bindFotoPerfil();
  bindDialogs();
  $("#admin-analytics-refresh").addEventListener("click", () => {
    loadStats();
    loadTutors();
    loadCambios();
    loadRatings().then(() => { renderTutors(); renderAnalytics(); renderSubjectList(); renderActivity(); });
  });

  renderAll();

  const hash = window.location.hash.replace("#", "");
  showSection(hash || "resumen");

  // Solo un usuario con rol «admin» puede quedarse en este panel.
  onAuthStateChanged(auth, async (usuario) => {
    if (!usuario) {
      if (detenerSondeo) detenerSondeo();
      detenerSondeo = null;
      adminUid = null;
      return; // auth.js redirige al login
    }
    adminUid = usuario.uid;
    try {
      const datos = await loadProfile();
      if (datos.rol !== "admin") {
        window.location.replace(datos.rol === "tutor" ? "tutor.html" : "estudiante.html");
        return;
      }
    } catch (err) {
      console.error("No se pudo verificar el rol:", err);
      $("#admin-profile-note").textContent = `No se pudo cargar tu perfil. ${detalleError(err)}`;
      return;
    }
    bandeja.cargar();
    cargarMaterias().then(refrescarMaterias); // catálogo real (las de base, más las que se agregaron)
    loadTutors();
    loadCambios();
    loadStats();
    loadRatings().then(() => { renderTutors(); renderAnalytics(); renderSubjectList(); renderActivity(); }); // los promedios salen de las calificaciones
    loadCases();
    sincronizarDatosAdmin();
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
