// js/auth.js — Autenticación de TutoresOn-Line
// Registro, login con correo, login con Google, cierre de sesión,
// protección de páginas, errores en español y ciclo de vida de roles.
// Trabaja junto a js/firebase-config.js (SDK v9 modular por CDN, sin npm).

import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

/* ---------------------------------------------------------
   Mensajes de error legibles en español
   --------------------------------------------------------- */
function mensajeDeError(codigo) {
  const mensajes = {
    "auth/email-already-in-use": "Ya existe una cuenta con este correo. Intenta iniciar sesión.",
    "auth/invalid-credential": "Correo o contraseña incorrectos.",
    "auth/user-not-found": "No encontramos una cuenta con este correo.",
    "auth/wrong-password": "La contraseña no es correcta.",
    "auth/invalid-email": "El correo no tiene un formato válido.",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
    "auth/operation-not-allowed": "Este método de inicio de sesión no está habilitado.",
    "auth/popup-closed-by-user": "Cerraste la ventana de Google antes de terminar.",
    "auth/network-request-failed": "Revisa tu conexión a internet.",
    "auth/unauthorized-domain": "El dominio no está autorizado en Firebase (Authentication → Configuración → Dominios autorizados)."
  };

  if (mensajes[codigo]) {
    return mensajes[codigo];
  }

  // Si el error no trae código, casi siempre es un problema del propio JS
  // (no de Firebase). Dejamos el dato visible para poder diagnosticarlo.
  return "Error: " + (codigo || "sin código") + ". Revisa la consola.";
}

// Muestra el error SIEMPRE en pantalla: en el panel del login/registro o
// en el aviso del formulario del tutor. Si no hay dónde, usa alert().
function mostrarError(texto) {
  const destino = document.getElementById("auth-alert")
    || document.getElementById("registro-demo-note")
    || document.getElementById("tutor-demo-note");

  if (!destino) {
    console.error("No se encontró un lugar para mostrar el error:", texto);
    window.alert(texto); // último recurso: nunca dejar el fallo invisible
    return;
  }

  destino.textContent = texto;
  destino.style.display = "block"; // hace visible la alerta oculta
  destino.classList.add("is-visible");
  console.warn(texto);
}

// Oculta la alerta cuando el usuario vuelve a escribir.
document.addEventListener("input", () => {
  const alerta = document.getElementById("auth-alert");
  if (alerta && alerta.style.display !== "none") {
    alerta.style.display = "none";
    alerta.classList.remove("is-visible");
  }
});

/* ---------------------------------------------------------
   Registro (lo llama js/registro.js cuando el formulario valida)
   --------------------------------------------------------- */
window.registrarNuevoUsuario = async function (rol) {
  const nombre = document.getElementById("nombre")?.value.trim() || "";
  const apellido = document.getElementById("apellido")?.value.trim() || "";
  const email = document.getElementById("email")?.value.trim() || "";
  const password = document.getElementById("password")?.value || "";

  if (!nombre || !apellido || !email || !password) {
    mostrarError("Completa los campos del formulario.");
    return;
  }

  try {
    const credencial = await createUserWithEmailAndPassword(auth, email, password);
    const uid = credencial.user.uid;

    await setDoc(doc(db, "usuarios", uid), {
      nombre: nombre,
      apellido: apellido,
      email: email,
      rol: rol,
      activo: true,
      // Ciclo de vida del tutor: incompleto → pendiente → aprobado/rechazado.
      // El estudiante nace "activo".
      estado: rol === "tutor" ? "incompleto" : "activo",
      creadoEn: serverTimestamp()
    });

    // Estudiante → panel; Tutor → completar perfil profesional.
    window.location.href = rol === "tutor" ? "registro-tutor.html" : "estudiante.html";
  } catch (error) {
    mostrarError(mensajeDeError(error.code));
  }
};

/* ---------------------------------------------------------
   Completar perfil profesional del tutor
   (lo llama js/registro-tutor.js al enviar su formulario)
   --------------------------------------------------------- */
window.completarPerfilTutor = async function (datos) {
  if (!auth.currentUser) {
    mostrarError("Tu sesión expiró. Vuelve a iniciar sesión.");
    return;
  }

  try {
    const refPerfil = doc(db, "usuarios", auth.currentUser.uid);
    await updateDoc(refPerfil, {
      ...datos,
      estado: "pendiente",
      solicitudEnviadaEn: serverTimestamp()
    });

    // Llevar a la pantalla de solicitud pendiente.
    window.location.href = "registro-tutor.html?resultado=pendiente";
  } catch (error) {
    console.error("No se pudo enviar la solicitud:", error);
    mostrarError(
      "No se pudo enviar la solicitud. Revisa tu conexión e inténtalo de nuevo."
    );
  }
};

/* ---------------------------------------------------------
   Persistencia: "Mantenerme conectado" (checkbox del login)
   --------------------------------------------------------- */
async function aplicarPersistencia() {
  try {
    const recordar = document.getElementById("remember-me")?.checked ?? true;
    await setPersistence(
      auth,
      recordar ? browserLocalPersistence : browserSessionPersistence
    );
  } catch (error) {
    console.warn("No se pudo cambiar la persistencia:", error.code);
  }
}

/* Marca que se acaba de iniciar sesión en esta página (en vez de venir
   con una sesión previa). Se usa para redirigir directo al panel. */
let sesionRecienIniciada = false;

async function redirigirAlPanel() {
  let rol = "estudiante";
  let estado = "";
  try {
    const refPerfil = doc(db, "usuarios", auth.currentUser.uid);
    const snap = await getDoc(refPerfil);
    if (snap.exists()) {
      rol = snap.data().rol || "estudiante";
      estado = snap.data().estado || "";
    }
  } catch (error) {
    console.warn("No se pudo leer el perfil:", error);
  }
  window.location.href = destinoSegunRol(rol, estado);
}

/* ---------------------------------------------------------
   Inicio de sesión con correo y contraseña
   --------------------------------------------------------- */
const loginForm = document.getElementById("login-form");
if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    // Marcar ANTES de iniciar sesión para evitar que onAuthStateChanged
    // muestre el aviso de "sesión activa" durante la redirección.
    sesionRecienIniciada = true;

    try {
      await aplicarPersistencia();
      await signInWithEmailAndPassword(auth, email, password);
      redirigirAlPanel();
    } catch (error) {
      sesionRecienIniciada = false;
      mostrarError(mensajeDeError(error.code));
    }
  });
}

/* ---------------------------------------------------------
   Inicio de sesión con Google
   --------------------------------------------------------- */
const btnGoogle = document.getElementById("btn-google");
if (btnGoogle) {
  btnGoogle.addEventListener("click", async () => {
    // Marcar ANTES de abrir el popup: mientras Firebase confirma la sesión,
    // onAuthStateChanged no debe mostrar el aviso de "sesión activa".
    sesionRecienIniciada = true;

    try {
      await aplicarPersistencia();
      const provider = new GoogleAuthProvider();
      const resultado = await signInWithPopup(auth, provider);
      const usuario = resultado.user;

      // Primera vez con Google → crear su perfil como estudiante.
      const refPerfil = doc(db, "usuarios", usuario.uid);
      const existe = await getDoc(refPerfil);
      if (!existe.exists()) {
        const partes = (usuario.displayName || "Estudiante").split(" ");
        await setDoc(refPerfil, {
          nombre: partes[0],
          apellido: partes.slice(1).join(" ") || "TutoresOn",
          email: usuario.email,
          rol: "estudiante",
          activo: true,
          estado: "activo",
          creadoEn: serverTimestamp()
        });
      }

      redirigirAlPanel();
    } catch (error) {
      // Si falla o cierras el popup, volver a permitir el aviso de sesión activa.
      sesionRecienIniciada = false;
      console.error("Error al iniciar sesión con Google:", error);
      mostrarError(mensajeDeError(error.code));
    }
  });
}

/* ---------------------------------------------------------
   Cerrar sesión (botón compartido en los 3 paneles)
   --------------------------------------------------------- */
document.querySelectorAll(".logout-button").forEach((btn) => {
  btn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "login.html";
  });
});

/* ---------------------------------------------------------
   Rutas protegidas + aviso de sesión activa en el login
   --------------------------------------------------------- */
const PAGINAS_PROTEGIDAS = [
  "estudiante.html",
  "tutor.html",
  "admin.html",
  "registro-tutor.html"
];
const paginaActual = window.location.pathname.split("/").pop();

function destinoSegunRol(rol, estado = "activo") {
  // Normaliza el estado: ignora mayúsculas y espacios. Así funciona aunque
  // en Firestore quede "Rechazado", "rechazada", "rechazado " u "aceptado".
  const e = String(estado || "").trim().toLowerCase();

  if (rol === "tutor") {
    // El tutor solo entra a su panel si el administrador lo aprobó.
    if (e === "aprobado" || e === "aceptado") return "tutor.html";
    if (e === "pendiente") return "registro-tutor.html?resultado=pendiente";
    if (e === "rechazado" || e === "rechazada") return "registro-tutor.html?resultado=rechazado";
    return "registro-tutor.html"; // incompleto → completar el formulario
  }
  if (rol === "admin") return "admin.html";
  return "estudiante.html";
}
onAuthStateChanged(auth, async (usuario) => {
  if (usuario) {
    // Si acabas de iniciar sesión aquí, redirigirAlPanel() ya se encargó.
    if (paginaActual === "login.html" && sesionRecienIniciada) return;

    // Viniste con una sesión previa: mostrar el aviso en vez de redirigir.
    if (paginaActual === "login.html") {
      let rol = "estudiante";
      let estado = "";
      try {
        const refPerfil = doc(db, "usuarios", usuario.uid);
        const snap = await getDoc(refPerfil);
        if (snap.exists()) {
          rol = snap.data().rol || "estudiante";
          estado = snap.data().estado || "";
        }
      } catch (error) {
        console.warn("No se pudo leer el perfil:", error);
      }

      const aviso = document.getElementById("auth-sesion-activa");
      const enlace = document.getElementById("auth-ir-panel");
      if (aviso) aviso.style.display = "block";
      if (enlace) enlace.href = destinoSegunRol(rol, estado);
    }
  } else {
    if (PAGINAS_PROTEGIDAS.includes(paginaActual)) {
      window.location.href = "login.html";
    }
  }
});

console.log("✅ Firebase conectado y autenticación lista");