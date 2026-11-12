// js/api.js  —  copia este archivo a la carpeta js/ de tu frontend.
// Cliente de la API REST: agrega solo el token de Firebase y traduce los errores.
import { auth } from "./firebase-config.js";

const esLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
// Cambia la URL de producción cuando despliegues el backend.
export const API_URL = esLocal ? "http://localhost:4000/api" : "https://TU-BACKEND.onrender.com/api";

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
      body: cuerpo ? JSON.stringify(cuerpo) : undefined
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
  // Público (no requiere sesión)
  buscarTutores: (filtros = {}) => {
    const limpios = Object.fromEntries(Object.entries(filtros).filter(([, v]) => v));
    return pedir(`/tutores?${new URLSearchParams(limpios)}`, { conSesion: false });
  },
  obtenerTutor: (id) => pedir(`/tutores/${id}`, { conSesion: false }),

  // Estudiante
  crearSolicitud: (datos) => pedir("/solicitudes", { metodo: "POST", cuerpo: datos }),
  cancelarSolicitud: (id) => pedir(`/solicitudes/${id}/cancelar`, { metodo: "PATCH" }),
  calificar: (datos) => pedir("/calificaciones", { metodo: "POST", cuerpo: datos }),

  // Tutor
  aceptarSolicitud: (id) => pedir(`/solicitudes/${id}/aceptar`, { metodo: "PATCH" }),
  rechazarSolicitud: (id) => pedir(`/solicitudes/${id}/rechazar`, { metodo: "PATCH" }),
  completarTutoria: (id) => pedir(`/tutorias/${id}/completar`, { metodo: "PATCH" }),

  // Ambos
  cancelarTutoria: (id) => pedir(`/tutorias/${id}/cancelar`, { metodo: "PATCH" }),
  misSolicitudes: () => pedir("/solicitudes/mias"),
  misTutorias: () => pedir("/tutorias/mias")
};
