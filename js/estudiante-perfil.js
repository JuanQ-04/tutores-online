// js/estudiante-perfil.js — Validaciones de interfaz, sin Firebase

const profileForm = document.getElementById("profile-form");
const profileNote = document.getElementById("profile-note");

if (profileForm && profileNote) {
  const nameInput = document.getElementById("perfil-nombre");
  const lastNameInput = document.getElementById("perfil-apellido");
  const emailInput = document.getElementById("perfil-correo");
  const profileName = profileForm.querySelector(".profile-name");
  const profileAvatar = profileForm.querySelector(".profile-avatar");

  const DEMO_MESSAGE =
    "Vista de demostración: los cambios no se guardan.";

  function isValidText(input) {
    input.value = input.value.trim();
    return /\p{L}/u.test(input.value);
  }

  function markInvalid(input, invalid) {
    if (invalid) {
      input.setAttribute("aria-invalid", "true");
    } else {
      input.removeAttribute("aria-invalid");
    }
  }

  function handleSave(event) {
    event.preventDefault();

    const nameOk = isValidText(nameInput);
    const lastNameOk = isValidText(lastNameInput);
    const emailOk = emailInput.checkValidity() && emailInput.value.trim() !== "";

    markInvalid(nameInput, !nameOk);
    markInvalid(lastNameInput, !lastNameOk);
    markInvalid(emailInput, !emailOk);

    if (!nameOk || !lastNameOk || !emailOk) {
      profileNote.textContent =
        "Revisa los campos marcados: nombre, apellido y un correo válido.";
      return;
    }

    // Solo actualiza la vista; no se envía nada.
    profileName.textContent =
      `${nameInput.value} ${lastNameInput.value}`;
    profileAvatar.textContent =
      (nameInput.value[0] + lastNameInput.value[0]).toUpperCase();

    profileNote.textContent = `Cambios aplicados en pantalla. ${DEMO_MESSAGE}`;
  }

  profileForm.addEventListener("submit", handleSave);
}