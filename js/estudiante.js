// js/estudiante.js — Navegación del panel del estudiante (solo interfaz)

const sections = [
  ...document.querySelectorAll(".dashboard-main > section[id]")
];

const titles = {
  inicio: "Inicio",
  buscar: "Buscar tutores",
  tutorias: "Mis tutorías",
  notificaciones: "Notificaciones",
  perfil: "Mi perfil"
};

const DEFAULT_SECTION = "inicio";

const navLinks = [
  ...document.querySelectorAll(".main-navigation a")
];
const breadcrumbCurrent = document.querySelector(
  ".breadcrumb [aria-current='page']"
);
const mainArea = document.getElementById("contenido-principal");

const sidebar = document.getElementById("student-sidebar");
const overlay = document.querySelector(".sidebar-overlay");
const menuToggle = document.querySelector(".menu-toggle");
const closeButton = document.querySelector(".sidebar-close");

// Menú móvil
function setMenu(open) {
  sidebar.classList.toggle("is-open", open);
  overlay.hidden = !open;
  overlay.classList.toggle("is-open", open);
  menuToggle.setAttribute("aria-expanded", String(open));
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

  // Si el # no corresponde a una sección existente, vuelve a Inicio
  if (!titles[id]) id = DEFAULT_SECTION;

  sections.forEach((section) => {
    section.hidden = section.id !== id;
  });

  // Menú activo: "Notificaciones" y "Mi perfil" no están en el menú
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
showSection();