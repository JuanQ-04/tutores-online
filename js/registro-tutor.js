const form = document.getElementById("tutor-form");
const statusNote = document.getElementById("tutor-form-note");

const titleInput = document.getElementById("titulo");
const institutionInput = document.getElementById("institucion");
const cityInput = document.getElementById("ciudad");
const tarifaInput = document.getElementById("tarifa");
const presentationInput = document.getElementById("presentacion");
const presentationCount = document.getElementById("presentacion-count");
const fileInput = document.getElementById("hoja-vida");

const subjectInputs = [
  ...form.querySelectorAll('input[name="materias"]')
];

const timeInputs = [
  ...form.querySelectorAll('input[name="franjas"]')
];

const fields = [
  ...form.querySelectorAll("input, select, textarea")
];

// Límite del PDF: se guarda dentro de Firestore (máx. 1 MiB por documento) y
// el base64 pesa ~33 % más que el archivo, así que 700 KB deja margen.
const MAX_PDF_BYTES = 700 * 1024;

const FORM_NOTE =
  "Tu solicitud será revisada por el equipo administrador antes de activar tu perfil.";

// Lee el PDF y lo devuelve como data URL (data:application/pdf;base64,...).
function leerArchivoComoDataURL(file) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result);
    lector.onerror = () => reject(lector.error);
    lector.readAsDataURL(file);
  });
}

statusNote.setAttribute("role", "status");
statusNote.setAttribute("aria-live", "polite");

// Si el tutor ya envió su solicitud (en revisión) o fue rechazada,
// mostrar el aviso correspondiente en lugar del formulario.
const resultadoParam = new URLSearchParams(window.location.search).get("resultado");

if (resultadoParam === "pendiente" || resultadoParam === "rechazado") {
  form.style.display = "none";
  const aviso = document.getElementById(
    resultadoParam === "pendiente" ? "tutor-pendiente" : "tutor-rechazado"
  );
  if (aviso) aviso.style.display = "block";
}

// Actualiza el contador según el límite definido en el HTML.
function updatePresentationCount() {
  presentationCount.textContent =
    `${presentationInput.value.length} / `
    + `${presentationInput.maxLength} caracteres`;
}

// Elimina errores anteriores antes de comprobar todo nuevamente.
function clearValidationErrors() {
  fields.forEach((field) => {
    field.setCustomValidity("");
    field.removeAttribute("aria-invalid");
  });
}

// Rechaza campos vacíos, solo espacios o sin ninguna letra.
// No exige un nombre específico ni verifica credenciales reales.
function validateText(field, message) {
  field.value = field.value.trim();

  if (!field.value || !/\p{L}/u.test(field.value)) {
    field.setCustomValidity(message);
  }
}

// Para grupos de casillas, coloca el error en la primera casilla.
// No usamos required en cada casilla: eso exigiría marcarlas todas.
function validateCheckboxGroup(inputs, message) {
  if (!inputs.some((input) => input.checked)) {
    inputs[0].setCustomValidity(message);
  }
}

function validateTutorForm() {
  clearValidationErrors();

  // Lee el catálogo definido en el datalist del HTML.
  const careerOptions = [
    ...document.querySelectorAll("#carreras-opciones option")
  ].map((option) => option.value);

  const normalizeCareer = (value) => value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es");

  const selectedCareer = careerOptions.find(
    (career) => normalizeCareer(career) === normalizeCareer(titleInput.value)
  );

  if (selectedCareer) {
    titleInput.value = selectedCareer;
  } else {
    titleInput.setCustomValidity(
      "Selecciona una carrera del catálogo. Escribe, por ejemplo, «ing» para buscar."
    );
  }

  validateText(
    institutionInput,
    "Escribe el nombre de tu institución; no uses solo números o símbolos."
  );

  cityInput.value = cityInput.value.trim().replace(/\s+/g, " ");

  // Admite letras, tildes y separadores habituales en nombres de ciudades.
  const cityPattern =
    /^\p{L}[\p{L}\p{M}]*(?:[ '\u2019.-][\p{L}\p{M}]+)*$/u;

  if (cityInput.value && !cityPattern.test(cityInput.value)) {
    cityInput.setCustomValidity(
      "Escribe una ciudad con letras, sin números ni símbolos no admitidos."
    );
  }

  validateText(
    presentationInput,
    "Escribe una presentación; no uses solo espacios, números o símbolos."
  );

  updatePresentationCount();

  validateCheckboxGroup(
    subjectInputs,
    "Selecciona al menos una materia que quieras enseñar."
  );

  validateCheckboxGroup(
    timeInputs,
    "Selecciona al menos una franja de disponibilidad."
  );

  // Comprobación básica del archivo seleccionado (extensión, tipo y tamaño).
  const file = fileInput.files[0];

  if (!file) {
    fileInput.setCustomValidity("Adjunta tu hoja de vida en formato PDF.");
  } else {
    const hasPdfExtension = /\.pdf$/i.test(file.name);
    const hasCompatibleType =
      file.type === "" || file.type === "application/pdf";

    if (!hasPdfExtension || !hasCompatibleType) {
      fileInput.setCustomValidity(
        "Selecciona un archivo PDF para la hoja de vida."
      );
    } else if (file.size > MAX_PDF_BYTES) {
      fileInput.setCustomValidity(
        "El PDF pesa más de 700 KB. Comprímelo e inténtalo de nuevo."
      );
    }
  }

  // required, min, max, step y maxlength siguen siendo
  // los establecidos en el HTML.
  fields.forEach((field) => {
    if (!field.validity.valid) {
      field.setAttribute("aria-invalid", "true");
    }
  });

  return form.reportValidity();
}

let enviando = false;

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (enviando) return; // evita doble clic mientras sube el PDF

  if (!validateTutorForm()) {
    statusNote.textContent =
      "Revisa el campo indicado antes de continuar. "
      + "Tu solicitud todavía no se ha enviado.";
    return;
  }

  // js/auth.js (módulo) define completarPerfilTutor en window.
  if (typeof completarPerfilTutor !== "function") {
    console.error(
      "completarPerfilTutor no está definida. "
      + "¿Se cargó js/auth.js? Revisa la consola por errores de red o de módulo."
    );
    statusNote.textContent =
      "Error interno: la autenticación no se cargó. "
      + "Abre la consola (F12) y verifica que js/auth.js exista y que "
      + "registro-tutor.html lo cargue como script type=\"module\".";
    return;
  }

  const submitButton = form.querySelector('[type="submit"]');
  enviando = true;
  if (submitButton) submitButton.disabled = true;
  statusNote.textContent = "Enviando tu solicitud…";

  try {
    const archivo = fileInput.files[0];
    const dataURL = await leerArchivoComoDataURL(archivo);

    await completarPerfilTutor(
      {
        titulo: titleInput.value,
        institucion: institutionInput.value,
        ciudad: cityInput.value,
        presentacion: presentationInput.value,
        materias: subjectInputs
          .filter((input) => input.checked)
          .map((input) => input.value),
        franjas: timeInputs
          .filter((input) => input.checked)
          .map((input) => input.value),
        tarifa: Number(tarifaInput.value) || 0,
        hojaVidaPDF: archivo.name
      },
      { nombreArchivo: archivo.name, tamano: archivo.size, dataURL }
    );
  } catch (error) {
    console.error("No se pudo leer el PDF:", error);
    statusNote.textContent =
      "No se pudo leer el archivo PDF. Selecciónalo de nuevo.";
  } finally {
    // Si todo salió bien auth.js redirige; si falló, se puede reintentar.
    enviando = false;
    if (submitButton) submitButton.disabled = false;
  }
});

// Retira errores y avisos desactualizados al modificar un campo.
function handleFieldEdit(event) {
  const field = event.target;

  if (typeof field.setCustomValidity !== "function") {
    return;
  }

  field.setCustomValidity("");
  field.removeAttribute("aria-invalid");

  // El error del grupo puede estar en una casilla diferente
  // de la que acaba de marcar el usuario.
  if (field.name === "materias" || field.name === "franjas") {
    const group = field.name === "materias"
      ? subjectInputs
      : timeInputs;

    group.forEach((input) => {
      input.setCustomValidity("");
      input.removeAttribute("aria-invalid");
    });
  }

  if (field === presentationInput) {
    updatePresentationCount();
  }

  statusNote.textContent = FORM_NOTE;
}

form.addEventListener("input", handleFieldEdit);
form.addEventListener("change", handleFieldEdit);

// Estado inicial.
updatePresentationCount();
statusNote.textContent = FORM_NOTE;
