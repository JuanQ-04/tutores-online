import { ErrorApp } from "../errores.js";

export function noEncontrado(req, _res, next) {
  next(new ErrorApp(404, "RUTA_NO_ENCONTRADA", `No existe ${req.method} ${req.originalUrl}`));
}

// Manejador global: toda respuesta de error tiene la forma { error: { codigo, mensaje } }.
// eslint-disable-next-line no-unused-vars
export function manejarErrores(err, _req, res, _next) {
  if (err instanceof ErrorApp) {
    return res.status(err.status).json({
      error: { codigo: err.codigo, mensaje: err.message, detalles: err.detalles }
    });
  }
  if (err.type === "entity.parse.failed" || err.type === "entity.too.large") {
    return res.status(400).json({ error: { codigo: "JSON_INVALIDO", mensaje: "El cuerpo de la petición no es válido" } });
  }
  console.error(err);
  res.status(500).json({ error: { codigo: "ERROR_INTERNO", mensaje: "Error interno del servidor" } });
}
