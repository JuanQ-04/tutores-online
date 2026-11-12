// js/verificar.js — Pantalla de verificación de correo (Firebase Authentication)
// Muestra el correo, permite reenviar el enlace y entra al panel en cuanto
// el correo queda verificado. Solo pide a la API el rol propio para saber a qué panel ir.

import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { api } from "./api.js";
import { enviarVerificacion, destinoSegunRol } from "./auth.js";

const elCorreo   = document.getElementById("verificar-correo");
const btnYa      = document.getElementById("btn-ya-verifique");
const btnReenviar = document.getElementById("btn-reenviar");
const error      = document.getElementById("auth-alert");
const ok         = document.getElementById("verificar-ok");

function mostrar(elemento, texto) {
  error.style.display = "none";
  ok.style.display = "none";
  elemento.textContent = texto;
  elemento.style.display = "block";
}

let entrando = false;

// Refresca el usuario desde el servidor; si ya está verificado, entra.
async function comprobar(manual = false) {
  const usuario = auth.currentUser;
  if (!usuario || entrando) return;

  try {
    await usuario.reload();
  } catch (e) {
    if (manual) mostrar(error, "No se pudo comprobar. Revisa tu conexión e inténtalo de nuevo.");
    return;
  }

  if (!usuario.emailVerified) {
    if (manual) mostrar(error, "Aún no aparece verificado. Abre el enlace del correo y vuelve a intentarlo.");
    return;
  }

  entrando = true;
  // Renueva el token para que la API vea «email_verified = true».
  await usuario.getIdToken(true);

  let rol = "estudiante";
  let estado = "";
  try {
    const perfil = await api.miPerfil();
    rol = perfil.rol || "estudiante";
    estado = perfil.estado || "";
  } catch (e) {
    console.warn("No se pudo leer el perfil:", e.message);
  }
  window.location.href = destinoSegunRol(rol, estado);
}

// Cooldown del reenvío.
let enEspera = false;
function esperar(segundos) {
  enEspera = true;
  btnReenviar.disabled = true;
  const etiqueta = btnReenviar.querySelector("span");
  const original = "Reenviar correo";
  let restante = segundos;
  etiqueta.textContent = `Reenviar en ${restante}s`;
  const tick = setInterval(() => {
    restante -= 1;
    etiqueta.textContent = `Reenviar en ${restante}s`;
    if (restante <= 0) {
      clearInterval(tick);
      etiqueta.textContent = original;
      btnReenviar.disabled = false;
      enEspera = false;
    }
  }, 1000);
}

btnYa.addEventListener("click", () => comprobar(true));

btnReenviar.addEventListener("click", async () => {
  if (enEspera || !auth.currentUser) return;
  try {
    await enviarVerificacion(auth.currentUser);
    mostrar(ok, "Listo, te enviamos otro correo. Revisa también el spam.");
    esperar(60);
  } catch (e) {
    mostrar(
      error,
      e.code === "auth/too-many-requests"
        ? "Demasiados intentos. Espera unos minutos e inténtalo de nuevo."
        : "No se pudo enviar el correo. Inténtalo de nuevo en un momento."
    );
  }
});

onAuthStateChanged(auth, (usuario) => {
  if (!usuario) {
    window.location.href = "login.html";
    return;
  }
  elCorreo.textContent = usuario.email || "tu correo";
  comprobar(false);                       // por si ya estaba verificado
  setInterval(() => comprobar(false), 5000);  // detecta la verificación sola
});
