import { Router } from "express";
import { asyncHandler as h } from "../utils/asyncHandler.js";
import { requerirRol } from "../middlewares/autenticacion.js";

export function crearRutas({ autenticar, identificar, controladores }) {
  const { tutores, materias, usuarios, solicitudes, tutorias, calificaciones, soporte, notificaciones, admin } = controladores;
  const api = Router();

  api.get("/health", (_req, res) => res.json({ estado: "ok", hora: new Date().toISOString() }));

  // ---- Públicas (catálogo) ----
  api.get("/tutores", h(tutores.buscar));
  api.get("/tutores/:id", h(tutores.obtener));
  api.get("/tutores/:id/calificaciones", h(tutores.calificaciones));
  api.get("/materias", h(materias.listar));

  // ---- Token válido; el correo puede estar sin verificar (registro y lectura del propio perfil) ----
  api.post("/usuarios", identificar, h(usuarios.registrar));
  api.get("/usuarios/yo", identificar, h(usuarios.miPerfil));

  // ---- Requieren cuenta completa (correo verificado, perfil activo) ----
  api.use(autenticar);

  // Mi cuenta
  api.patch("/usuarios/yo", h(usuarios.actualizar));
  api.put("/usuarios/yo/foto", h(usuarios.guardarFoto));
  api.post("/usuarios/yo/disponibilidad", requerirRol("tutor"), h(usuarios.agregarBloque));
  api.delete("/usuarios/yo/disponibilidad/:id", requerirRol("tutor"), h(usuarios.quitarBloque));
  api.post("/usuarios/yo/solicitud-tutor", requerirRol("tutor"), h(usuarios.enviarSolicitudTutor));
  // Cambios en los datos profesionales: los revisa un administrador antes de aplicarse.
  api.get("/usuarios/yo/solicitud-cambio", requerirRol("tutor"), h(usuarios.miSolicitudCambio));
  api.post("/usuarios/yo/solicitud-cambio", requerirRol("tutor"), h(usuarios.solicitarCambio));
  api.delete("/usuarios/yo/solicitud-cambio", requerirRol("tutor"), h(usuarios.cancelarCambio));

  // Solicitudes y tutorías
  api.post("/solicitudes", requerirRol("estudiante"), h(solicitudes.crear));
  api.get("/solicitudes/mias", requerirRol("estudiante", "tutor"), h(solicitudes.mias));
  api.patch("/solicitudes/:id/aceptar", requerirRol("tutor"), h(solicitudes.aceptar));
  api.patch("/solicitudes/:id/rechazar", requerirRol("tutor"), h(solicitudes.rechazar));
  api.patch("/solicitudes/:id/cancelar", requerirRol("estudiante"), h(solicitudes.cancelar));

  api.get("/tutorias/mias", requerirRol("estudiante", "tutor"), h(tutorias.mias));
  api.get("/tutorias/:id", h(tutorias.obtener));
  api.patch("/tutorias/:id/completar", requerirRol("tutor"), h(tutorias.completar));
  api.patch("/tutorias/:id/cancelar", requerirRol("estudiante", "tutor"), h(tutorias.cancelar));

  // Calificaciones
  api.post("/calificaciones", requerirRol("estudiante"), h(calificaciones.crear));
  api.get("/calificaciones/mias", requerirRol("estudiante", "tutor"), h(calificaciones.mias));

  // Centro de ayuda
  api.post("/soporte", h(soporte.crear));

  // Notificaciones de la campana (guardadas en la base de datos; las ve cualquier rol)
  api.get("/notificaciones", h(notificaciones.listar));
  api.post("/notificaciones/leer-todas", h(notificaciones.marcarTodas));
  api.patch("/notificaciones/:id/leida", h(notificaciones.marcarLeida));

  // ---- Panel de administración ----
  const panel = Router();
  panel.use(requerirRol("admin"));
  panel.get("/usuarios", h(admin.usuarios));
  panel.patch("/usuarios/:id/activo", h(admin.cambiarActivo));
  panel.get("/tutores/:id/hoja-de-vida", h(admin.hojaDeVida));
  panel.patch("/tutores/:id/estado", h(admin.revisarTutor));
  panel.get("/tutorias", h(admin.tutorias));
  panel.get("/solicitudes", h(admin.solicitudes));
  panel.get("/calificaciones", h(admin.calificaciones));
  panel.patch("/calificaciones/:id", h(admin.moderarCalificacion));
  panel.post("/materias", h(admin.crearMateria));
  panel.get("/cambios-perfil", h(admin.cambiosPerfil));
  panel.patch("/cambios-perfil/:id", h(admin.resolverCambioPerfil));
  panel.get("/soporte", h(admin.soporte));
  panel.patch("/soporte/:id", h(admin.actualizarCaso));
  api.use("/admin", panel);

  return api;
}
