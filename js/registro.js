const form = document.getElementById("registro-form");
const roleInputs = form.querySelectorAll('input[name="tipo-cuenta"]');
const roleHelp = document.getElementById("registro-role-help");
const button = document.getElementById("btn-registro");
const buttonText = button.querySelector("span");
const statusNote = document.getElementById("registro-demo-note");

const DEMO_MESSAGE =
  "Vista de demostración: no se guardan datos ni se crean cuentas.";

// Avisos accesibles sin usar ventanas emergentes.
statusNote.setAttribute("role", "status");
statusNote.setAttribute("aria-live", "polite");

function getSelectedRole() {
  return form.querySelector('input[name="tipo-cuenta"]:checked').value;
}

function updateRegistrationView() {
  const isTutor = getSelectedRole() === "tutor";

  buttonText.textContent = isTutor
    ? "Continuar como tutor"
    : "Crear cuenta";

  roleHelp.textContent = isTutor
    ? "En el siguiente paso completarás tu información profesional. "
      + "Un administrador deberá aprobar tu solicitud antes de que "
      + "puedas ofrecer tutorías."
    : "Completa tus datos para registrarte como estudiante.";

  statusNote.textContent = DEMO_MESSAGE;

  // El botón ya permite probar las validaciones del formulario.
  button.disabled = false;
}

// Reglas de interfaz; no verifican identidad ni existencia del correo.
function validateRegistrationFields() {
  const nameInput = document.getElementById("nombre");
  const surnameInput = document.getElementById("apellido");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");

  // Admite letras de distintos idiomas, tildes, espacios,
  // apóstrofos y guiones entre partes del nombre.
  const namePattern = /^\p{L}[\p{L}\p{M}]*(?:[ '\u2019-][\p{L}\p{M}]+)*$/u;

  [nameInput, surnameInput].forEach((input) => {
    input.setCustomValidity("");
    input.value = input.value.trim().replace(/\s+/g, " ");

    if (input.value && !namePattern.test(input.value)) {
      input.setCustomValidity(
        "Escribe un nombre o apellido con letras. "
        + "Puedes usar tildes, espacios, guiones y apóstrofos, pero no números."
      );
    }
  });

  emailInput.setCustomValidity("");
  emailInput.value = emailInput.value.trim();

  // Regla adicional de la interfaz: exige un punto en el dominio.
  const emailPattern = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

  if (emailInput.value && !emailPattern.test(emailInput.value)) {
    emailInput.setCustomValidity(
      "Escribe un correo con dominio completo, por ejemplo: nombre@correo.com."
    );
  }

  passwordInput.setCustomValidity("");

  // No recortamos ni modificamos la contraseña.
  if (passwordInput.value && !passwordInput.value.trim()) {
    passwordInput.setCustomValidity(
      "La contraseña no puede contener únicamente espacios."
    );
  } else if (passwordInput.value && passwordInput.value.length < 8) {
    passwordInput.setCustomValidity(
      "La contraseña debe tener al menos 8 caracteres."
    );
  }
}

function handleContinue(event) {
  event.preventDefault();

  validateRegistrationFields();

  // Combina nuestras reglas con required, type="email" y los términos.
  if (!form.reportValidity()) {
    statusNote.textContent =
      "Revisa el campo indicado antes de continuar. No se han guardado datos.";
    return;
  }

  if (getSelectedRole() === "tutor") {
    statusNote.textContent =
      "Los campos cumplen las validaciones del formulario. "
      + "El siguiente paso será completar tu perfil profesional; "
      + "esa pantalla todavía está en preparación. "
      + "No se ha enviado ninguna solicitud.";

    window.location.href = "registro-tutor.html";

    return;
  }

  statusNote.textContent =
    "Los campos cumplen las validaciones del formulario. "
    + "La creación de la cuenta estará disponible al conectar Firebase. "
    + "Por ahora no se ha creado ninguna cuenta.";
}

// Limpia el error anterior al corregir un campo y restablece el aviso.
form.addEventListener("input", (event) => {
  const input = event.target;

  if (typeof input.setCustomValidity === "function") {
    input.setCustomValidity("");
  }

  statusNote.textContent = DEMO_MESSAGE;
});

roleInputs.forEach((input) => {
  input.addEventListener("change", updateRegistrationView);
});

button.addEventListener("click", handleContinue);

// Evita que un envío del formulario recargue la página.
form.addEventListener("submit", handleContinue);

// Aplica el estado inicial: Estudiante.
updateRegistrationView();