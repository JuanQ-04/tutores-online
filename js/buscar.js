// js/buscar.js — Pantalla pública «Tutores disponibles»
//
// - Lee de Firestore los tutores aprobados (colección «usuarios») y los muestra
//   como catálogo. No requiere sesión para ver.
// - Filtros: texto, materia, fecha y modalidad (según los bloques de
//   disponibilidad que el tutor publicó).
// - «Reservar» exige sesión: sin sesión → login.html.
// - Lee los filtros que llegan desde la landing (?materia=...&disponibilidad=...).

(() => {
  "use strict";

  const MATERIAS = {
    matematicas: "Matemáticas",
    fisica: "Física",
    quimica: "Química",
    programacion: "Programación",
    idiomas: "Idiomas",
    estadistica: "Estadística"
  };

  const ESTADOS_VISIBLES = ["aprobado", "aceptado"];
  const TONES = ["tone-green", "tone-blue", "tone-sand"];

  let TUTORES = [];
  let estado = "cargando"; // cargando | listo | error
  let tutorEnDialogo = null;

  const $ = (selector) => document.querySelector(selector);

  const grid = $("#pub-grid");
  const count = $("#pub-count");
  const fTexto = $("#f-texto");
  const fMateria = $("#f-materia");
  const fFecha = $("#f-fecha");
  const fModalidad = $("#f-modalidad");
  const fOrden = $("#f-orden");
  const dialog = $("#pub-dialog");

  /* ---------- Utilidades ---------- */
  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  function normalizar(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function pad(n) { return String(n).padStart(2, "0"); }

  function hoyISO() {
    const h = new Date();
    return `${h.getFullYear()}-${pad(h.getMonth() + 1)}-${pad(h.getDate())}`;
  }

  function horaActual() {
    const h = new Date();
    return `${pad(h.getHours())}:${pad(h.getMinutes())}`;
  }

  function fechaLegible(isoDate) {
    const [y, m, d] = isoDate.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("es-CO", {
      weekday: "short", day: "numeric", month: "short"
    });
  }

  function materiaLabel(valor) {
    const texto = String(valor || "").trim();
    return MATERIAS[normalizar(texto)] || (texto.charAt(0).toUpperCase() + texto.slice(1));
  }

  function iniciales(nombre) {
    return String(nombre).split(/\s+/).filter(Boolean).slice(0, 2)
      .map((p) => p[0].toUpperCase()).join("") || "T";
  }

  const icono = (name) =>
    `<svg class="icon" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;

  // Foto de perfil: módulo compartido con los paneles. Si no carga, se ven las iniciales.
  let FOTO = null; // { estiloFoto, textoSinFoto }

  function avatar(nombre, size, fotoURL) {
    const estilo = FOTO ? FOTO.estiloFoto(fotoURL) : "";
    const texto = FOTO ? FOTO.textoSinFoto(fotoURL, iniciales(nombre)) : iniciales(nombre);
    return `<div class="pub-photo" aria-hidden="true" style="width:${size}px;height:${size}px;border-radius:50%;
      background:var(--color-primary,#6366f1);color:#fff;display:flex;align-items:center;
      justify-content:center;font-size:${Math.round(size / 2.6)}px;font-weight:700;${estilo}">${escapeHTML(texto)}</div>`;
  }

  /* ---------- Carga desde Firestore ---------- */
  async function cargarTutores() {
    estado = "cargando";
    render();
    try {
      const { db } = await import("./firebase-config.js");
      const { collection, query, where, getDocs } = await import(
        "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js"
      );

      try {
        FOTO = await import("./foto-perfil.js");
      } catch (e) {
        console.warn("No se pudo cargar el módulo de fotos:", e);
      }

      const snap = await getDocs(query(
        collection(db, "usuarios"),
        where("rol", "==", "tutor"),
        where("estado", "in", ESTADOS_VISIBLES)
      ));

      const hoy = hoyISO();
      const hora = horaActual();

      TUTORES = snap.docs.map((d, i) => {
        const data = d.data();
        // Solo bloques que todavía no pasaron, del más próximo al más lejano
        const disponibilidad = (Array.isArray(data.disponibilidad) ? data.disponibilidad : [])
          .filter((b) => b && b.fecha &&
            (b.fecha > hoy || (b.fecha === hoy && (b.horaFin || "23:59") > hora)))
          .sort((a, b) => `${a.fecha}T${a.horaInicio}`.localeCompare(`${b.fecha}T${b.horaInicio}`));

        const nombre = `${data.nombre || ""} ${data.apellido || ""}`.trim() || "Tutor";
        return {
          id: d.id,
          name: nombre,
          materias: (Array.isArray(data.materias) ? data.materias : []),
          subject: (Array.isArray(data.materias) ? data.materias : []).map(materiaLabel).join(", ") || "General",
          titulo: data.titulo || "Profesional",
          lugar: data.ciudad || "Colombia",
          bio: data.presentacion || "Tutor registrado en la plataforma.",
          tarifa: Number(data.tarifa) || 0,
          disponibilidad,
          foto: data.fotoURL || "",
          tone: TONES[i % TONES.length],
          promedio: 0,
          opiniones: 0
        };
      });

      // Calificaciones visibles → promedio por tutor. Si falla, el catálogo sigue.
      try {
        const califSnap = await getDocs(query(
          collection(db, "calificaciones"),
          where("estado", "==", "visible")
        ));
        const suma = {};
        califSnap.docs.forEach((d) => {
          const c = d.data();
          if (!c.tutorId) return;
          suma[c.tutorId] = suma[c.tutorId] || { s: 0, n: 0 };
          suma[c.tutorId].s += Number(c.estrellas) || 0;
          suma[c.tutorId].n += 1;
        });
        TUTORES.forEach((t) => {
          const r = suma[t.id];
          if (r && r.n) { t.promedio = r.s / r.n; t.opiniones = r.n; }
        });
      } catch (errorCalif) {
        console.warn("No se pudieron cargar las calificaciones:", errorCalif);
      }

      estado = "listo";
    } catch (error) {
      console.error("No se pudieron cargar los tutores:", error);
      TUTORES = [];
      estado = "error";
    }
    render();
  }

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
      const coincideMateria = !materia || t.materias.some((m) => normalizar(m) === materia);

      // Fecha y modalidad se evalúan sobre los mismos bloques
      const coincideBloque = !fecha && !modalidad
        ? true
        : t.disponibilidad.some((b) =>
            (!fecha || b.fecha === fecha) &&
            (!modalidad || normalizar(b.modalidad) === modalidad));

      return coincideTexto && coincideMateria && coincideBloque;
    });

    const orden = fOrden.value;
    if (orden === "tarifa") return lista.sort((a, b) => a.tarifa - b.tarifa);
    if (orden === "calificacion") return lista.sort((a, b) => b.promedio - a.promedio);
    if (orden === "nombre") return lista.sort((a, b) => a.name.localeCompare(b.name, "es"));
    // Por defecto: quien tiene el horario más próximo primero
    const proximo = (t) => t.disponibilidad.length
      ? `${t.disponibilidad[0].fecha}T${t.disponibilidad[0].horaInicio}`
      : "9999";
    return lista.sort((a, b) => proximo(a).localeCompare(proximo(b)));
  }

  /* ---------- Pintado ---------- */
  function textoDisponibilidad(t) {
    const n = t.disponibilidad.length;
    if (!n) return "Sin horarios por ahora";
    return n === 1 ? "1 horario disponible" : `${n} horarios disponibles`;
  }

  function textoCalificacion(t) {
    return t.opiniones
      ? `★ ${t.promedio.toFixed(1)} (${t.opiniones} ${t.opiniones === 1 ? "opinión" : "opiniones"})`
      : "Sin calificaciones aún";
  }

  function tarjeta(t) {
    const prox = t.disponibilidad[0];
    return `
      <article class="pub-card ${t.tone}">
        <div class="pub-cover">${avatar(t.name, 104, t.foto)}</div>
        <div class="pub-body">
          <p class="pub-subject">${escapeHTML(t.subject)}</p>
          <h2>${escapeHTML(t.name)}</h2>
          <p class="pub-bio">${escapeHTML(t.bio)}</p>
          <ul class="pub-meta">
            <li>${icono("cap")}${escapeHTML(t.titulo)}</li>
            <li>${icono("pin")}${escapeHTML(t.lugar)}</li>
            ${prox ? `<li>${icono("clock")}Próximo: ${escapeHTML(fechaLegible(prox.fecha))} · ${escapeHTML(prox.horaInicio)}</li>` : ""}
          </ul>
          <p class="pub-score">${escapeHTML(textoCalificacion(t))}</p>
          <div class="pub-rating">
            <span class="pub-availability">${escapeHTML(textoDisponibilidad(t))}</span>
            ${t.tarifa ? `<small>$${t.tarifa.toLocaleString("es-CO")}/hora</small>` : ""}
          </div>
          <div class="pub-actions">
            <button class="pub-btn pub-btn-outline" type="button" data-perfil="${escapeHTML(t.id)}">Ver perfil</button>
            <button class="pub-btn pub-btn-solid" type="button" data-reservar="${escapeHTML(t.id)}">
              ${icono("calendar")}Reservar
            </button>
          </div>
        </div>
      </article>`;
  }

  function render() {
    if (estado === "cargando") {
      count.textContent = "Cargando tutores…";
      grid.innerHTML = '<p class="pub-empty">Cargando tutores…</p>';
      return;
    }
    if (estado === "error") {
      count.textContent = "";
      grid.innerHTML = '<p class="pub-empty">No pudimos cargar los tutores en este momento. Intenta de nuevo en unos minutos.</p>';
      return;
    }

    const lista = tutoresFiltrados();

    count.innerHTML = lista.length === 1
      ? "<strong>1</strong> tutor disponible"
      : `<strong>${lista.length}</strong> tutores disponibles`;

    grid.innerHTML = lista.length
      ? lista.map(tarjeta).join("")
      : '<p class="pub-empty">No encontramos tutores con esos filtros. Prueba con otra materia, fecha o modalidad.</p>';
  }

  /* ---------- Reserva: exige sesión ---------- */
  // Guardamos qué tutor quería reservar para retomarlo tras iniciar sesión.
  const CLAVE_RESERVA = "tutorReservaPendiente";

  async function reservar(tutorId) {
    try {
      sessionStorage.setItem(CLAVE_RESERVA, String(tutorId));
    } catch (_) { /* no es crítico */ }

    try {
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

    $("#pd-avatar").innerHTML = avatar(tutor.name, 104, tutor.foto);
    $("#pd-subject").textContent = tutor.subject;
    $("#pd-name").textContent = tutor.name;
    $("#pd-rating").textContent =
      `${textoCalificacion(tutor)} · ${textoDisponibilidad(tutor)}${tutor.tarifa ? ` · $${tutor.tarifa.toLocaleString("es-CO")}/hora` : ""}`;
    $("#pd-bio").textContent = tutor.bio;

    const bloques = tutor.disponibilidad.slice(0, 5).map((b) =>
      `<li>${icono("clock")}${escapeHTML(fechaLegible(b.fecha))} · ${escapeHTML(b.horaInicio)} – ${escapeHTML(b.horaFin)} · ${escapeHTML(b.modalidad)}</li>`
    ).join("");

    $("#pd-meta").innerHTML = `
      <li>${icono("cap")}${escapeHTML(tutor.titulo)}</li>
      <li>${icono("pin")}${escapeHTML(tutor.lugar)}</li>
      ${bloques}`;

    dialog.showModal();
  }

  /* ---------- Eventos ---------- */
  document.addEventListener("click", (event) => {
    const btnPerfil = event.target.closest("[data-perfil]");
    if (btnPerfil) {
      const t = TUTORES.find((x) => x.id === btnPerfil.dataset.perfil);
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
    fOrden.value = "proximo";
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

  cargarTutores();
})();
