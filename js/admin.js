/* js/admin.js — Panel del administrador
   Navegación por #. Conectado a Firestore: Mi perfil, Calificaciones y
   Tutorías (casos de soporte = colección «mensajesSoporte»).
   Tutores (solicitudes + hoja de vida, aprobar/rechazar) y el contador de
   pendientes del Resumen también son reales (colección «usuarios»,
   rol = tutor, y «hojasDeVida»).
   Estadísticas del Resumen (tutorías, solicitudes, calificaciones, usuarios) reales.
   Usuarios, Materias, Actividad reciente y Notificaciones también son reales
   (se arman con usuarios, tutorías, calificaciones y mensajes de soporte).
   Seguridad (contraseña) la maneja js/configuracion.js.
   Se carga como módulo: <script type="module" src="../js/admin.js"></script> */

import { auth, db } from "./firebase-config.js";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
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

/* ---------- Catálogo de materias ----------
   Mismas materias que las casillas de registro-tutor.html. En los tutores se
   guardan como «slug» (matematicas) y en las tutorías como texto (Matemáticas),
   así que todo se compara normalizado. */
const MATERIAS = [
  { id: "matematicas", nombre: "Matemáticas" },
  { id: "fisica", nombre: "Física" },
  { id: "quimica", nombre: "Química" },
  { id: "programacion", nombre: "Programación" },
  { id: "idiomas", nombre: "Idiomas" },
  { id: "estadistica", nombre: "Estadística" }
];

function normMateria(valor) {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function materiaId(valor) {
  const n = normMateria(valor);
  if (n === "estadisticas") return "estadistica";
  return MATERIAS.find((m) => m.id === n || normMateria(m.nombre) === n)?.id || n;
}

function materiaNombre(valor) {
  const id = materiaId(valor);
  return MATERIAS.find((m) => m.id === id)?.nombre || String(valor || "").trim() || "Sin materia";
}

function fechaDe(valor) {
  const f = typeof valor?.toDate === "function" ? valor.toDate() : null;
  return f && !Number.isNaN(f.getTime()) ? f : null;
}

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
  { id: "tutorias", label: "Tutorías" },
  { id: "calificaciones", label: "Calificaciones" },
  { id: "notificaciones", label: "Notificaciones" },
  { id: "perfil", label: "Mi perfil" },
  { id: "seguridad", label: "Configuración" },
  { id: "ayuda", label: "Centro de ayuda" }
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
let tutors = [];             // usuarios con rol «tutor» que ya enviaron solicitud
let tutorsEstado = "cargando";
let tutorsError = null;
const tutorsGuardando = new Set(); // evita doble clic mientras se guarda
let statsTutorias = [];      // colección «tutorias» (todas)
let statsSolicitudes = [];   // colección «solicitudes» (todas)
let statsUsuarios = [];      // colección «usuarios» (todos)
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
  $("#admin-stat-materias").textContent = MATERIAS.length;
  const openCases = cases.filter((c) => caseStatus(c) === "open").length;
  $("#admin-stat-pending").textContent = pendingTutors + openCases;
}

function renderPendingList() {
  const container = $("#admin-pending-list");
  const pendientes = tutors.filter((t) => t.status === "pending");

  if (tutorsEstado === "cargando") {
    container.innerHTML = '<p class="admin-empty">Cargando solicitudes…</p>';
    return;
  }
  if (tutorsEstado === "error") {
    container.innerHTML = `<p class="admin-empty">No se pudieron cargar las solicitudes. ${escapeHTML(detalleError(tutorsError))}</p>`;
    return;
  }
  if (pendientes.length === 0) {
    container.innerHTML = '<p class="admin-empty">No hay pendientes por revisar.</p>';
    return;
  }

  container.innerHTML = pendientes
    .map(
      (t) => `
      <div class="admin-pending-item">
        <svg class="icon" aria-hidden="true"><use href="#icon-award"></use></svg>
        <div>
          <strong>Solicitud de ${escapeHTML(t.name)}</strong>
          <p>Verificación como tutor de ${escapeHTML(t.subject || "sin materia")}</p>
        </div>
        <span class="admin-status pending">Pendiente</span>
      </div>
    `
    )
    .join("");
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
    await updateDoc(doc(db, "usuarios", uid), { activo });
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
/* ---------- Estadísticas (Firestore: tutorias, solicitudes, usuarios, calificaciones) ---------- */
async function loadStats() {
  statsEstado = "cargando";
  renderAnalytics();
  try {
    const [tut, sol, usu] = await Promise.all([
      getDocs(collection(db, "tutorias")),
      getDocs(collection(db, "solicitudes")),
      getDocs(collection(db, "usuarios"))
    ]);
    statsTutorias = tut.docs.map((d) => ({ id: d.id, ...d.data() }));
    statsSolicitudes = sol.docs.map((d) => ({ id: d.id, ...d.data() }));
    statsUsuarios = usu.docs.map((d) => ({ id: d.id, ...d.data() }));
    statsEstado = "listo";
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

/* ---------- Tutores (Firestore: usuarios con rol «tutor») ----------
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
    const snap = await getDocs(query(collection(db, "usuarios"), where("rol", "==", "tutor")));
    tutors = snap.docs
      .map((d) => {
        const x = d.data();
        const materias = Array.isArray(x.materias) ? x.materias : [];
        const name = `${x.nombre || ""} ${x.apellido || ""}`.trim() || x.email || "Tutor";
        return {
          id: d.id,
          ...x,
          materias,
          name,
          email: x.email || "",
          subject: materias.map(materiaNombre).join(", "),
          initial: iniciales(name, "TU"),
          status: tutorStatusFromEstado(x.estado)
        };
      })
      .filter((t) => t.status) // «incompleto» todavía no es una solicitud
      .sort((a, b) => (b.solicitudEnviadaEn?.toMillis?.() ?? 0) - (a.solicitudEnviadaEn?.toMillis?.() ?? 0));
    tutorsEstado = "listo";
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
    MATERIAS.map((m) => `<option value="${m.id}">${m.nombre}</option>`).join("");
  select.value = MATERIAS.some((m) => m.id === actual) ? actual : "all";
}

function renderTutorTabs() {
  const counts = { pending: 0, verified: 0, rejected: 0 };
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
    // Solo el admin puede cambiar «estado» (lo exigen las reglas de Firestore).
    await updateDoc(doc(db, "usuarios", tutorId), {
      estado: nuevoEstado,
      revisadoPor: adminUid,
      revisadoEn: serverTimestamp()
    });
    tutor.estado = nuevoEstado;
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

// Abre la hoja de vida (PDF guardado en hojasDeVida/{uid}) en una pestaña nueva.
async function verHojaVida(tutorId) {
  // La pestaña se abre ya, dentro del clic, para que el navegador no la bloquee.
  const ventana = window.open("", "_blank");
  try {
    const snap = await getDoc(doc(db, "hojasDeVida", tutorId));
    if (!snap.exists() || !snap.data().dataURL) {
      ventana?.close();
      showToast("Este tutor no tiene un PDF guardado.");
      return;
    }
    const blob = await (await fetch(snap.data().dataURL)).blob();
    const url = URL.createObjectURL(blob);
    if (ventana) ventana.location.href = url;
    else window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
  } catch (err) {
    console.error("No se pudo abrir la hoja de vida:", err);
    ventana?.close();
    showToast(`No se pudo abrir la hoja de vida. ${detalleError(err)}`);
  }
}

function openTutorDetail(tutorId) {
  const tutor = tutors.find((t) => t.id === tutorId);
  if (!tutor) return;

  const r = tutorRating(tutor.id);
  const dialog = $("#admin-tutor-dialog");
  const lista = (arr) => escapeHTML(arr?.length ? arr.join(", ") : "—");
  const tarifa = Number(tutor.tarifa) > 0
    ? `$${Number(tutor.tarifa).toLocaleString("es-CO")} COP / hora`
    : "—";

  $("#admin-tutor-detail").innerHTML = `
    <dl class="admin-detail-list">
      <dt>Nombre</dt><dd>${escapeHTML(tutor.name)}</dd>
      <dt>Correo</dt><dd>${escapeHTML(tutor.email)}</dd>
      <dt>Título / carrera</dt><dd>${escapeHTML(tutor.titulo || "—")}</dd>
      <dt>Institución</dt><dd>${escapeHTML(tutor.institucion || "—")}</dd>
      <dt>Ciudad</dt><dd>${escapeHTML(tutor.ciudad || "—")}</dd>
      <dt>Materias</dt><dd>${lista(tutor.materias)}</dd>
      <dt>Disponibilidad</dt><dd>${lista(tutor.franjas)}</dd>
      <dt>Tarifa</dt><dd>${escapeHTML(tarifa)}</dd>
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

/* ---------- Renderizado: Materias ---------- */
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

  const filtered = MATERIAS.filter((m) => !search || normMateria(m.nombre).includes(search));

  if (filtered.length === 0) {
    list.innerHTML = '<p class="admin-empty">No se encontraron materias.</p>';
    return;
  }

  list.innerHTML = filtered
    .map((m) => {
      const n = tutorsEstado === "listo" ? subjectData(m.id).tutores.length : null;
      return `
      <button class="admin-subject-item ${activeSubjectId === m.id ? "is-active" : ""}" type="button" data-subject-id="${m.id}">
        <svg class="icon" aria-hidden="true"><use href="#icon-book"></use></svg>
        <span>${m.nombre}</span>
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
  const materia = MATERIAS.find((m) => m.id === subjectId);
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
// Pendientes reales: solicitudes de tutores por revisar y casos de soporte abiertos.
function getNotifications() {
  const solicitudes = tutors
    .filter((t) => t.status === "pending")
    .map((t) => ({
      title: "Nueva solicitud de tutor",
      detail: `${escapeHTML(t.name)} envió su solicitud de verificación.`,
      time: fechaCorta(t.solicitudEnviadaEn) || "Reciente",
      ms: t.solicitudEnviadaEn?.toMillis?.() ?? 0
    }));
  const casos = cases
    .filter((c) => caseStatus(c) === "open")
    .map((c) => ({
      title: "Caso de soporte abierto",
      detail: `${escapeHTML(c.usuarioNombre || "Un usuario")}: ${escapeHTML(c.asunto || "sin asunto")}`,
      time: fechaCorta(c.creadoEn) || "Reciente",
      ms: c.creadoEn?.toMillis?.() ?? 0
    }));
  return [...solicitudes, ...casos].sort((a, b) => b.ms - a.ms);
}

function notificationItems(avisos) {
  return avisos.length
    ? avisos
        .map((n) => `<li><h3>${n.title}</h3><p>${n.detail} · ${escapeHTML(n.time)}</p></li>`)
        .join("")
    : "<li><p>No tienes pendientes por atender.</p></li>";
}

function renderNotificationPreview() {
  const avisos = getNotifications();
  $("#admin-notification-preview").innerHTML = notificationItems(avisos.slice(0, 3));
  const unread = avisos.length;
  $("#admin-notification-count").textContent = unread > 9 ? "9+" : unread;
  $("#admin-notification-count").hidden = unread === 0;
}

function renderNotificationFull() {
  $("#admin-notification-full").innerHTML = notificationItems(getNotifications());
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

  $("#admin-tutor-subject").addEventListener("change", renderTutors);
}

function bindSubjectInteractions() {
  $("#admin-subject-search").addEventListener("input", renderSubjectList);
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
  $("#admin-analytics-refresh").addEventListener("click", () => {
    loadStats();
    loadTutors();
    loadRatings().then(() => { renderTutors(); renderAnalytics(); renderSubjectList(); renderActivity(); });
  });

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
    loadTutors();
    loadStats();
    loadRatings().then(() => { renderTutors(); renderAnalytics(); renderSubjectList(); renderActivity(); }); // los promedios salen de las calificaciones
    loadCases();
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();