// js/recuperar.js — Recuperación de contraseña (Firebase Authentication)
// Envía el correo con el enlace de restablecimiento. No usa Firestore.

import { auth } from "./firebase-config.js";
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

// El correo de Firebase sale en español.
auth.languageCode = "es";

const form  = document.getElementById("recuperar-form");
const input = document.getElementById("email");
const boton = document.getElementById("btn-submit");
const error = document.getElementById("auth-alert");
const ok    = document.getElementById("recuperar-ok");

function mostrar(elemento, texto) {
  error.style.display = "none";
  ok.style.display = "none";
  elemento.textContent = texto;
  elemento.style.display = "block";
}

// Cooldown para no spamear envíos (Firebase también limita por su lado).
let enEspera = false;
function esperar(segundos) {
  enEspera = true;
  boton.disabled = true;
  const etiqueta = boton.querySelector("span");
  const original = etiqueta.textContent;
  let restante = segundos;
  const tick = setInterval(() => {
    restante -= 1;
    etiqueta.textContent = `Reenviar en ${restante}s`;
    if (restante <= 0) {
      clearInterval(tick);
      etiqueta.textContent = original;
      boton.disabled = false;
      enEspera = false;
    }
  }, 1000);
  etiqueta.textContent = `Reenviar en ${restante}s`;
}

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  if (enEspera) return;

  const correo = input.value.trim();
  if (!correo || !input.checkValidity()) {
    mostrar(error, "Escribe un correo válido.");
    return;
  }

  boton.disabled = true;
  try {
    await sendPasswordResetEmail(auth, correo);
  } catch (e) {
    // Errores que sí conviene mostrar.
    if (e.code === "auth/invalid-email") {
      mostrar(error, "El correo no tiene un formato válido.");
      boton.disabled = false;
      return;
    }
    if (e.code === "auth/network-request-failed") {
      mostrar(error, "Revisa tu conexión a internet e inténtalo de nuevo.");
      boton.disabled = false;
      return;
    }
    if (e.code === "auth/too-many-requests") {
      mostrar(error, "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.");
      boton.disabled = false;
      return;
    }
    // «auth/user-not-found» y cualquier otro: NO se revela si el correo existe.
    console.warn("Recuperación:", e.code);
  }

  // Mismo mensaje exista o no la cuenta (evita descubrir qué correos están registrados).
  mostrar(ok, "Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña. Revisa también la carpeta de spam.");
  esperar(60);
});
