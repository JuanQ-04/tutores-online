// js/buscar.js — Pantalla pública «Tutores disponibles»
//
// - Muestra los tutores y permite filtrarlos (materia, fecha, modalidad).
// - Lee los filtros que llegan desde la landing (?materia=...&disponibilidad=...).
// - «Reservar» exige sesión: sin sesión → login.html.
//
// Los tutores son datos de demostración (los mismos de js/estudiante.js).
// `dias` = días de la semana en que atiende (0 = domingo … 6 = sábado).

(() => {
  "use strict";

  const TUTORES = [
    {
      id: 1,
      name: "María Rodríguez",
      subject: "Matemáticas",
      nivel: "Secundaria · Bachillerato",
      lugar: "Bogotá · Chapinero",
      bio: "Te ayudo a entender lo que parecía difícil con ejemplos claros y un ritmo que se adapta a ti.",
      rating: 4.9,
      reviews: 38,
      availability: "Disponible hoy",
      availabilityRank: 0,
      modality: "Virtual",
      dias: [1, 2, 3, 4, 5],
      photo: "../images/tutor-maria.webp",
      tone: "tone-green"
    },
    {
      id: 2,
      name: "Diego Salazar",
      subject: "Física",
      nivel: "Bachillerato · Universidad",
      lugar: "Disponible en línea",
      bio: "Convertimos fórmulas en intuición. Sesiones prácticas para resolver problemas con confianza.",
      rating: 4.8,
      reviews: 24,
      availability: "3 espacios esta semana",
      availabilityRank: 2,
      modality: "Virtual",
      dias: [1, 3, 5, 6],
      photo: "../images/tutor-diego.webp",
      tone: "tone-blue"
    },
    {
      id: 3,
      name: "Inés Morales",
      subject: "Inglés",
      nivel: "Todos los niveles",
      lugar: "Bogotá · Teusaquillo",
      bio: "Conversaciones reales, objetivos concretos y un espacio amable para que te animes a hablar.",
      rating: 5.0,
      reviews: 51,
      availability: "Disponible mañana",
      availabilityRank: 1,
      modality: "Presencial",
      dias: [2, 4, 6],
      photo: "../images/tutor-ines.webp",
      tone: "tone-sand"
    }
  ];

  const $ = (selector) => document.querySelector(selector);

  const grid = $("#pub-grid");
  const count = $("#pub-count");
  const fTexto = $("#f-texto");
  const fMateria = $("#f-materia");
  const fFecha = $("#f-fecha");
  const fModalidad = $("#f-modalidad");
  const fOrden = $("#f-orden");
  const dialog = $("#pub-dialog");

  let tutorEnDialogo = null;

  /* ---------- Utilidades ---------- */
  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  function normalizar(value) {
    return String(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function diaDeSemana(isoDate) {
    const [y, m, d] = isoDate.split("-").map(Number);
    return new Date(y, m - 1, d).getDay();
  }

  function fechaLegible(isoDate) {
    const [y, m, d] = isoDate.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("es-CO", {
      weekday: "short", day: "numeric", month: "short"
    });
  }

  function hoyISO() {
    const h = new Date();
    return [
      h.getFullYear(),
      String(h.getMonth() + 1).padStart(2, "0"),
      String(h.getDate()).padStart(2, "0")
    ].join("-");
  }

  const icono = (name) =>
    `<svg class="icon" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;

  /* ---------- Filtrado ---------- */
  function tutoresFiltrados() {
    const texto = normalizar(fTexto.value);
    const materia = fMateria.value;
    const modalidad = fModalidad.value;
    const fecha = fFecha.value;

    const lista = TUTORES.filter((t) => {
      const coincideTexto =
        !texto ||
        normalizar(t.name).includes(texto) ||
        normalizar(t.subject).includes(texto) ||
        normalizar(t.bio).includes(texto);
      const coincideMateria = !materia || normalizar(t.subject) === materia;
      const coincideModalidad = !modalidad || normalizar(t.modality) === modalidad;
      const coincideFecha = !fecha || t.dias.includes(diaDeSemana(fecha));
      return coincideTexto && coincideMateria && coincideModalidad && coincideFecha;
    });

    const orden = fOrden.value;
    if (orden === "disponibilidad") {
      return lista.sort((a, b) => a.availabilityRank - b.availabilityRank);
    }
    if (orden === "reseñas") {
      return lista.sort((a, b) => b.reviews - a.reviews);
    }
    return lista.sort((a, b) => b.rating - a.rating);
  }

  /* ---------- Pintado ---------- */
  function tarjeta(t) {
    const disponibilidad = fFecha.value
      ? `Disponible el ${fechaLegible(fFecha.value)}`
      : t.availability;

    return `
      <article class="pub-card ${t.tone}">
        <div class="pub-cover">
          <img class="pub-photo" src="${t.photo}" alt="Foto de ${escapeHTML(t.name)}" width="104" height="104">
        </div>
        <div class="pub-body">
          <p class="pub-subject">${escapeHTML(t.subject)}</p>
          <h2>${escapeHTML(t.name)}</h2>
          <p class="pub-bio">${escapeHTML(t.bio)}</p>
          <ul class="pub-meta">
            <li>${icono("cap")}${escapeHTML(t.nivel)}</li>
            <li>${icono("pin")}${escapeHTML(t.lugar)}</li>
            <li>${icono(t.modality === "Presencial" ? "pin" : "video")}${escapeHTML(t.modality)}</li>
          </ul>
          <div class="pub-rating">
            <span class="pub-stars" aria-hidden="true">${icono("star").repeat(5)}</span>
            <strong>${t.rating}</strong><small>(${t.reviews})</small>
            <span class="pub-availability">${escapeHTML(disponibilidad)}</span>
          </div>
          <div class="pub-actions">
            <button class="pub-btn pub-btn-outline" type="button" data-perfil="${t.id}">Ver perfil</button>
            <button class="pub-btn pub-btn-solid" type="button" data-reservar="${t.id}">
              ${icono("calendar")}Reservar
            </button>
          </div>
        </div>
      </article>`;
  }

  function render() {
    const lista = tutoresFiltrados();

    count.innerHTML = lista.length === 1
      ? "<strong>1</strong> tutor disponible"
      : `<strong>${lista.length}</strong> tutores disponibles`;

    grid.innerHTML = lista.length
      ? lista.map(tarjeta).join("")
      : '<p class="pub-empty">No encontramos tutores con esos filtros. Prueba con otra materia, fecha o modalidad.</p>';
  }

  /* ---------- Reserva: exige sesión ---------- */
  // Guardamos qué tutor quería reservar para retomarlo en el panel del
  // estudiante una vez inicie sesión (lo lee js/estudiante.js).
  const CLAVE_RESERVA = "tutorReservaPendiente";

  async function reservar(tutorId) {
    try {
      sessionStorage.setItem(CLAVE_RESERVA, String(tutorId));
    } catch (_) { /* sessionStorage no disponible: no es crítico */ }

    try {
      // Import dinámico: si Firebase no carga, la página sigue funcionando
      // y simplemente enviamos al login.
      const { auth, db } = await import("./firebase-config.js");
      await auth.authStateReady();

      if (!auth.currentUser) {
        window.location.href = "login.html";
        return;
      }

      const { doc, getDoc } = await import(
        "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js"
      );

      let rol = "estudiante";
      try {
        const snap = await getDoc(doc(db, "usuarios", auth.currentUser.uid));
        if (snap.exists()) rol = snap.data().rol || "estudiante";
      } catch (error) {
        console.warn("No se pudo leer el perfil:", error);
      }

      // Solo los estudiantes reservan; tutor y admin van a su panel.
      if (rol === "admin") window.location.href = "admin.html";
      else if (rol === "tutor") window.location.href = "tutor.html";
      else window.location.href = "estudiante.html#buscar";
    } catch (error) {
      console.error("No se pudo comprobar la sesión:", error);
      window.location.href = "login.html";
    }
  }

  /* ---------- Diálogo de perfil ---------- */
  function abrirPerfil(tutor) {
    tutorEnDialogo = tutor;
    dialog.className = `pub-dialog ${tutor.tone}`;

    $("#pd-photo").src = tutor.photo;
    $("#pd-photo").alt = `Foto de ${tutor.name}`;
    $("#pd-subject").textContent = tutor.subject;
    $("#pd-name").textContent = tutor.name;
    $("#pd-rating").textContent =
      `★ ${tutor.rating} (${tutor.reviews} opiniones) · ${tutor.availability}`;
    $("#pd-bio").textContent = tutor.bio;
    $("#pd-meta").innerHTML = `
      <li>${icono("cap")}${escapeHTML(tutor.nivel)}</li>
      <li>${icono("pin")}${escapeHTML(tutor.lugar)}</li>
      <li>${icono(tutor.modality === "Presencial" ? "pin" : "video")}${escapeHTML(tutor.modality)}</li>`;

    dialog.showModal();
  }

  /* ---------- Eventos ---------- */
  document.addEventListener("click", (event) => {
    const btnPerfil = event.target.closest("[data-perfil]");
    if (btnPerfil) {
      const t = TUTORES.find((x) => String(x.id) === btnPerfil.dataset.perfil);
      if (t) abrirPerfil(t);
      return;
    }

    const btnReservar = event.target.closest("[data-reservar]");
    if (btnReservar) {
      reservar(btnReservar.dataset.reservar);
      return;
    }

    if (event.target.closest("[data-cerrar]")) {
      dialog.close();
      return;
    }

    // Clic en el fondo oscuro del diálogo
    if (event.target === dialog) dialog.close();
  });

  $("#pd-reservar").addEventListener("click", () => {
    if (tutorEnDialogo) reservar(tutorEnDialogo.id);
  });

  [fTexto, fMateria, fFecha, fModalidad, fOrden].forEach((campo) => {
    campo.addEventListener("input", render);
    campo.addEventListener("change", render);
  });

  $("#pub-filters").addEventListener("submit", (e) => e.preventDefault());

  $("#f-limpiar").addEventListener("click", () => {
    fTexto.value = "";
    fMateria.value = "";
    fFecha.value = "";
    fModalidad.value = "";
    fOrden.value = "rating";
    render();
  });

  /* ---------- Estado inicial (filtros que vienen de la landing) ---------- */
  fFecha.min = hoyISO();

  const params = new URLSearchParams(window.location.search);
  const materia = params.get("materia");
  const modalidad = params.get("modalidad");
  const fecha = params.get("disponibilidad");

  if (materia && [...fMateria.options].some((o) => o.value === materia)) {
    fMateria.value = materia;
  }
  if (modalidad && [...fModalidad.options].some((o) => o.value === modalidad)) {
    fModalidad.value = modalidad;
  }
  if (fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    fFecha.value = fecha;
  }

  render();
})();
