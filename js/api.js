// js/api.js — Cliente de la API REST (único camino hacia los datos).
// Flujo: navegador → API (Render) → Firebase Admin → Firestore. Aquí solo se agrega el
// token de Firebase a cada petición y se traducen los errores a mensajes legibles.
import { auth } from "./firebase-config.js";
import { API_URL } from "./api-url.js";

export { API_URL };

export class ErrorApi extends Error {
  constructor(mensaje, status, codigo) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}

async function pedir(ruta, { metodo = "GET", cuerpo, conSesion = true } = {}) {
  const cabeceras = { "Content-Type": "application/json" };
  if (conSesion) {
    const usuario = auth.currentUser;
    if (!usuario) throw new ErrorApi("Debes iniciar sesión", 401, "NO_AUTENTICADO");
    cabeceras.Authorization = `Bearer ${await usuario.getIdToken()}`;
  }

  let respuesta;
  try {
    respuesta = await fetch(`${API_URL}${ruta}`, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined
    });
  } catch {
    throw new ErrorApi("No se pudo conectar con el servidor. Revisa tu conexión.", 0, "SIN_CONEXION");
  }

  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    throw new ErrorApi(datos?.error?.mensaje || "Ocurrió un error inesperado", respuesta.status, datos?.error?.codigo);
  }
  return datos;
}

export const api = {
  // ---- Público (no requiere sesión) ----
  buscarTutores: (filtros = {}) => {
    const limpios = Object.fromEntries(Object.entries(filtros).filter(([, v]) => v));
    return pedir(`/tutores?${new URLSearchParams(limpios)}`, { conSesion: false });
  },
  calificacionesDeTutor: (id) => pedir(`/tutores/${id}/calificaciones`, { conSesion: false }),

  // ---- Cuenta (el correo puede estar sin verificar) ----
  registrarPerfil: (datos) => pedir("/usuarios", { metodo: "POST", cuerpo: datos }),
  miPerfil: () => pedir("/usuarios/yo"),

  // ---- Cuenta (correo verificado) ----
  actualizarPerfil: (cambios) => pedir("/usuarios/yo", { metodo: "PATCH", cuerpo: cambios }),
  guardarFoto: (fotoURL) => pedir("/usuarios/yo/foto", { metodo: "PUT", cuerpo: { fotoURL } }),
  enviarSoporte: (datos) => pedir("/soporte", { metodo: "POST", cuerpo: datos }),

  // ---- Estudiante ----
  crearSolicitud: (datos) => pedir("/solicitudes", { metodo: "POST", cuerpo: datos }),
  cancelarSolicitud: (id) => pedir(`/solicitudes/${id}/cancelar`, { metodo: "PATCH" }),
  calificar: (datos) => pedir("/calificaciones", { metodo: "POST", cuerpo: datos }),

  // ---- Tutor ----
  enviarSolicitudTutor: (datos) => pedir("/usuarios/yo/solicitud-tutor", { metodo: "POST", cuerpo: datos }),
  // Los datos profesionales no se editan directo: se pide la actualización y la revisa un administrador.
  notificaciones: () => pedir("/notificaciones"),
  leerNotificacion: (id) => pedir(`/notificaciones/${encodeURIComponent(id)}/leida`, { metodo: "PATCH" }),
  leerTodasNotificaciones: () => pedir("/notificaciones/leer-todas", { metodo: "POST" }),
  solicitudCambio: () => pedir("/usuarios/yo/solicitud-cambio"),
  solicitarCambio: (datos) => pedir("/usuarios/yo/solicitud-cambio", { metodo: "POST", cuerpo: datos }),
  cancelarCambio: () => pedir("/usuarios/yo/solicitud-cambio", { metodo: "DELETE" }),
  agregarBloque: (bloque) => pedir("/usuarios/yo/disponibilidad", { metodo: "POST", cuerpo: bloque }),
  quitarBloque: (id) => pedir(`/usuarios/yo/disponibilidad/${encodeURIComponent(id)}`, { metodo: "DELETE" }),
  aceptarSolicitud: (id) => pedir(`/solicitudes/${id}/aceptar`, { metodo: "PATCH" }),
  rechazarSolicitud: (id) => pedir(`/solicitudes/${id}/rechazar`, { metodo: "PATCH" }),
  completarTutoria: (id) => pedir(`/tutorias/${id}/completar`, { metodo: "PATCH" }),

  // ---- Estudiante y tutor ----
  cancelarTutoria: (id) => pedir(`/tutorias/${id}/cancelar`, { metodo: "PATCH" }),
  misSolicitudes: () => pedir("/solicitudes/mias"),
  misTutorias: () => pedir("/tutorias/mias"),
  misCalificaciones: () => pedir("/calificaciones/mias"),

  // ---- Administrador ----
  admin: {
    usuarios: (rol) => pedir(`/admin/usuarios${rol ? `?rol=${encodeURIComponent(rol)}` : ""}`),
    tutorias: () => pedir("/admin/tutorias"),
    solicitudes: () => pedir("/admin/solicitudes"),
    calificaciones: () => pedir("/admin/calificaciones"),
    soporte: () => pedir("/admin/soporte"),
    hojaDeVida: (tutorId, { pendiente = false } = {}) =>
      pedir(`/admin/tutores/${tutorId}/hoja-de-vida${pendiente ? "?pendiente=true" : ""}`),
    crearMateria: (nombre) => pedir("/admin/materias", { metodo: "POST", cuerpo: { nombre } }),
    cambiosPerfil: () => pedir("/admin/cambios-perfil"),
    resolverCambio: (tutorId, estado, nota) =>
      pedir(`/admin/cambios-perfil/${tutorId}`, { metodo: "PATCH", cuerpo: { estado, nota } }),
    cambiarActivo: (usuarioId, activo) => pedir(`/admin/usuarios/${usuarioId}/activo`, { metodo: "PATCH", cuerpo: { activo } }),
    revisarTutor: (tutorId, estado) => pedir(`/admin/tutores/${tutorId}/estado`, { metodo: "PATCH", cuerpo: { estado } }),
    moderarCalificacion: (id, cambios) => pedir(`/admin/calificaciones/${id}`, { metodo: "PATCH", cuerpo: cambios }),
    cambiarEstadoCaso: (id, estado) => pedir(`/admin/soporte/${id}`, { metodo: "PATCH", cuerpo: { estado } }),
    responderCaso: (id, cuerpo) => pedir(`/admin/soporte/${id}`, { metodo: "PATCH", cuerpo }) // { respuesta, estado? }
  }
};

/* ---------------------------------------------------------------
   Utilidades para los paneles
   --------------------------------------------------------------- */

// La API entrega las fechas de creación como texto ISO. Devuelve milisegundos (0 si no hay).
export function aMillis(valor) {
  const t = typeof valor === "number" ? valor : Date.parse(valor);
  return Number.isNaN(t) ? 0 : t;
}

// Reemplaza a las escuchas en tiempo real: ejecuta `tarea` cada `cada` ms, solo con la
// pestaña visible, y al volver a ella. Devuelve una función para cancelar.
export function sondear(tarea, { cada = 30000 } = {}) {
  let activo = true;
  let enCurso = false;

  const ejecutar = async () => {
    if (!activo || enCurso || document.hidden) return;
    enCurso = true;
    try {
      await tarea();
    } catch (error) {
      console.warn("No se pudo actualizar:", error);
    } finally {
      enCurso = false;
    }
  };

  const temporizador = setInterval(ejecutar, cada);
  document.addEventListener("visibilitychange", ejecutar);
  return () => {
    activo = false;
    clearInterval(temporizador);
    document.removeEventListener("visibilitychange", ejecutar);
  };
}

// ¿Cambió algo? Sirve para repintar un panel solo cuando llegan datos distintos.
export const sonIguales = (a, b) => JSON.stringify(a) === JSON.stringify(b);
