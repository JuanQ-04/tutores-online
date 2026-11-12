import { Router } from "express";
import { asyncHandler as h } from "../utils/asyncHandler.js";
import { requerirRol } from "../middlewares/autenticacion.js";

export function crearRutas({ autenticar, controladores }) {
  const { tutores, solicitudes, tutorias, calificaciones } = controladores;
  const api = Router();

  api.get("/health", (_req, res) => res.json({ estado: "ok", hora: new Date().toISOString() }));

  // ---- Públicas (catálogo) ----
  api.get("/tutores", h(tutores.buscar));
  api.get("/tutores/:id", h(tutores.obtener));
  api.get("/tutores/:id/calificaciones", h(tutores.calificaciones));

  // ---- Requieren sesión ----
  api.use(autenticar);

  api.post("/solicitudes", requerirRol("estudiante"), h(solicitudes.crear));
  api.get("/solicitudes/mias", requerirRol("estudiante", "tutor"), h(solicitudes.mias));
  api.patch("/solicitudes/:id/aceptar", requerirRol("tutor"), h(solicitudes.aceptar));
  api.patch("/solicitudes/:id/rechazar", requerirRol("tutor"), h(solicitudes.rechazar));
  api.patch("/solicitudes/:id/cancelar", requerirRol("estudiante"), h(solicitudes.cancelar));

  api.get("/tutorias/mias", requerirRol("estudiante", "tutor"), h(tutorias.mias));
  api.get("/tutorias/:id", h(tutorias.obtener));
  api.patch("/tutorias/:id/completar", requerirRol("tutor"), h(tutorias.completar));
  api.patch("/tutorias/:id/cancelar", requerirRol("estudiante", "tutor"), h(tutorias.cancelar));

  api.post("/calificaciones", requerirRol("estudiante"), h(calificaciones.crear));

  return api;
}
