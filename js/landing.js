const toggle = document.querySelector(".nav-toggle");
const menu = document.getElementById("menu-principal");

function setMenu(open) {
  menu.classList.toggle("is-open", open);
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
}

// Abrir o cerrar al pulsar el botón
toggle.addEventListener("click", () => {
  setMenu(!menu.classList.contains("is-open"));
});

// Cerrar al elegir un enlace del menú
menu.addEventListener("click", (event) => {
  if (event.target.closest("a")) {
    setMenu(false);
  }
});

// Cerrar con la tecla Escape
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setMenu(false);
  }
});

// Búsqueda rápida de la portada: las materias vienen de la API (las agrega el administrador).
// Si no responde, se queda la lista que trae el HTML.
const selectMateria = document.getElementById("materia");
if (selectMateria) {
  import("./materias.js")
    .then(async (materias) => {
      await materias.cargarMaterias();
      materias.llenarSelectMaterias(selectMateria, { placeholder: "Buscar por materia" });
    })
    .catch(() => { /* se mantiene la lista del HTML */ });
}
