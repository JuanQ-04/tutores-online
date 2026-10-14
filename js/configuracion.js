// js/configuracion.js — Configuración compartida de los perfiles
// (estudiante.html, tutor.html y admin.html).
//
// Maneja, si existen en la página:
//   #security-form   → cambio real de contraseña (Firebase Auth)
//   #security-reset  → correo para restablecer la contraseña
//   #config-*        → datos de la cuenta y de la sesión actual
//   #contact-form    → mensaje al equipo de soporte (Firestore: mensajesSoporte)
//   [data-open-contact] → abre el diálogo #contact-dialog
//
// Se carga con: <script type="module" src="../js/configuracion.js"></script>

import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  doc,
  getDoc,
  addDoc,
  collection,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const $ = (selector, scope = document) => scope.querySelector(selector);

auth.languageCode = "es"; // los correos de Firebase llegan en español

let perfil = { nombre: "", rol: "" };

/* ---------- Aviso flotante (usa el toast de cada panel) ---------- */
let avisoTimer = null;
function avisar(mensaje) {
  const toastPanel = $("#tutor-toast") || $("#admin-toast");
  if (toastPanel) {
    toastPanel.textContent = mensaje;
    toastPanel.hidden = false;
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => { toastPanel.hidden = true; }, 4000);
    return;
  }
  let toast = $(".demo-toast");
  if (!toast) {
    toast = document.createElement("p");
    toast.className = "demo-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }
  toast.textContent = mensaje;
  requestAnimationFrame(() => toast.classList.add("is-visible"));
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => toast.classList.remove("is-visible"), 4000);
}

function escribir(id, texto) {
  const el = document.getElementById(id);
  if (el) el.textContent = texto;
}

function fechaLarga(valor) {
  if (!valor) return "—";
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return "—";
  return fecha.toLocaleString("es-CO", {
    day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit"
  });
}

function dispositivoActual() {
  const ua = navigator.userAgent;
  const navegador = /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Safari\//.test(ua) ? "Safari"
    : "Navegador";
  const sistema = /Android/.test(ua) ? "Android"
    : /iPhone|iPad/.test(ua) ? "iOS"
    : /Windows/.test(ua) ? "Windows"
    : /Mac OS X/.test(ua) ? "macOS"
    : /Linux/.test(ua) ? "Linux"
    : "sistema desconocido";
  return `${navegador} en ${sistema}`;
}

function usaContrasena(usuario) {
  return usuario.providerData.some((p) => p.providerId === "password");
}

/* ---------- Datos de la cuenta y la sesión ---------- */
function pintarCuenta(usuario) {
  const proveedores = usuario.providerData.map((p) =>
    p.providerId === "password" ? "Correo y contraseña"
      : p.providerId === "google.com" ? "Google"
      : p.providerId
  );
  escribir("config-email", usuario.email || "—");
  escribir("config-provider", proveedores.join(" y ") || "—");
  escribir("config-created", fechaLarga(usuario.metadata.creationTime));
  escribir("config-last-login", fechaLarga(usuario.metadata.lastSignInTime));
  escribir("config-device", dispositivoActual());

  const form = $("#security-form");
  const note = $("#security-note");
  const reset = $("#security-reset");
  if (!form) return;

  if (!usaContrasena(usuario)) {
    // Cuenta creada con Google: la contraseña la administra Google.
    [...form.elements].forEach((el) => { el.disabled = true; });
    if (reset) reset.hidden = true;
    if (note) note.textContent = "Entraste con Google: tu contraseña se cambia desde tu cuenta de Google.";
  } else if (note) {
    note.textContent = "Por seguridad te pedimos tu contraseña actual antes de cambiarla.";
  }
}

/* ---------- Cambiar contraseña ---------- */
function errorContrasena(codigo) {
  const mensajes = {
    "auth/wrong-password": "La contraseña actual no es correcta.",
    "auth/invalid-credential": "La contraseña actual no es correcta.",
    "auth/weak-password": "La nueva contraseña es muy débil. Usa al menos 8 caracteres.",
    "auth/too-many-requests": "Demasiados intentos. Espera unos minutos y vuelve a intentarlo.",
    "auth/requires-recent-login": "Vuelve a iniciar sesión y repite el cambio.",
    "auth/network-request-failed": "Revisa tu conexión a internet."
  };
  return mensajes[codigo] || `No se pudo cambiar la contraseña (${codigo || "error"}).`;
}

{
  const form = $("#security-form");
  const note = $("#security-note");

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const usuario = auth.currentUser;
    if (!usuario) return;

    const { actual, nueva, confirmar } = form.elements;
    let msg = "";
    if (!actual.value) msg = "Escribe tu contraseña actual.";
    else if (nueva.value.length < 8) msg = "La nueva contraseña debe tener al menos 8 caracteres.";
    else if (nueva.value !== confirmar.value) msg = "Las contraseñas nuevas no coinciden.";
    else if (nueva.value === actual.value) msg = "La nueva contraseña debe ser distinta a la actual.";
    if (msg) { if (note) note.textContent = msg; return; }

    const boton = $("button[type=submit]", form);
    if (boton) boton.disabled = true;
    if (note) note.textContent = "Actualizando…";

    try {
      const credencial = EmailAuthProvider.credential(usuario.email, actual.value);
      await reauthenticateWithCredential(usuario, credencial);
      await updatePassword(usuario, nueva.value);
      form.reset();
      if (note) note.textContent = "Listo: tu contraseña quedó actualizada.";
      avisar("Contraseña actualizada.");
    } catch (err) {
      console.warn("No se pudo cambiar la contraseña:", err);
      if (note) note.textContent = errorContrasena(err.code);
    } finally {
      if (boton) boton.disabled = false;
    }
  });

  $("#security-reset")?.addEventListener("click", async () => {
    const usuario = auth.currentUser;
    if (!usuario?.email) return;
    try {
      await sendPasswordResetEmail(auth, usuario.email);
      if (note) note.textContent = `Te enviamos un enlace a ${usuario.email} para crear una nueva contraseña.`;
      avisar("Correo de restablecimiento enviado.");
    } catch (err) {
      console.warn("No se pudo enviar el correo:", err);
      if (note) note.textContent = errorContrasena(err.code);
    }
  });
}

/* ---------- Contacto con soporte ---------- */
{
  const form = $("#contact-form");
  const note = $("#contact-note");
  const dialog = $("#contact-dialog");

  document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-open-contact]") || !dialog) return;
    form?.reset();
    if (note) note.textContent = "";
    dialog.showModal();
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const usuario = auth.currentUser;
    const asunto = form.elements.asunto.value.trim();
    const mensaje = form.elements.mensaje.value.trim();

    if (!asunto || !mensaje) {
      if (note) note.textContent = "Completa el asunto y el mensaje.";
      return;
    }
    if (!usuario) {
      if (note) note.textContent = "Tu sesión expiró. Vuelve a iniciar sesión.";
      return;
    }

    const boton = $("button[type=submit]", form);
    if (boton) boton.disabled = true;
    if (note) note.textContent = "Enviando…";

    try {
      await addDoc(collection(db, "mensajesSoporte"), {
        usuarioId: usuario.uid,
        usuarioNombre: perfil.nombre || usuario.displayName || "Usuario",
        usuarioEmail: usuario.email || "",
        rol: perfil.rol || "",
        asunto,
        mensaje,
        estado: "abierto",
        creadoEn: serverTimestamp()
      });
      form.reset();
      if (note) note.textContent = "Mensaje enviado. El equipo te responderá a tu correo.";
      dialog?.close();
      avisar("Mensaje enviado al equipo de soporte.");
    } catch (err) {
      console.error("No se pudo enviar el mensaje:", err);
      if (note) {
        note.textContent = err?.code === "permission-denied"
          ? "Firestore no permite guardar el mensaje: revisa las reglas (mensajesSoporte)."
          : "No se pudo enviar el mensaje. Revisa tu conexión.";
      }
    } finally {
      if (boton) boton.disabled = false;
    }
  });
}

/* ---------- Inicio ---------- */
onAuthStateChanged(auth, async (usuario) => {
  if (!usuario) return; // auth.js redirige al login
  pintarCuenta(usuario);
  try {
    const snap = await getDoc(doc(db, "usuarios", usuario.uid));
    if (snap.exists()) {
      const d = snap.data();
      perfil = { nombre: `${d.nombre || ""} ${d.apellido || ""}`.trim(), rol: d.rol || "" };
    }
  } catch (err) {
    console.warn("No se pudo leer el perfil para Configuración:", err);
  }
});
