// Documentación OpenAPI 3 (se ve en /api/docs). Sirve también para el Manual del Sistema.
const seguridad = [{ bearerAuth: [] }];
const id = { name: "id", in: "path", required: true, schema: { type: "string" } };
const err = (descripcion) => ({
  description: descripcion,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } }
});
const ok = (descripcion, ref) => ({
  description: descripcion,
  content: { "application/json": { schema: ref ? { $ref: `#/components/schemas/${ref}` } : { type: "object" } } }
});
const comunes = { 401: err("Sin sesión o token inválido"), 403: err("Sin permiso"), 404: err("No encontrado"), 409: err("Conflicto de estado u horario") };

export const openapi = {
  openapi: "3.0.3",
  info: {
    title: "TutoresOn-Line API",
    version: "1.0.0",
    description: "API REST de la plataforma de tutorías. Autenticación: ID token de Firebase en `Authorization: Bearer <token>`."
  },
  tags: [{ name: "Tutores" }, { name: "Solicitudes" }, { name: "Tutorías" }, { name: "Calificaciones" }],
  paths: {
    "/api/health": { get: { summary: "Estado del servidor", responses: { 200: ok("OK") } } },
    "/api/tutores": {
      get: {
        tags: ["Tutores"],
        summary: "Buscar tutores (público)",
        description: "Filtra por texto, materia, modalidad, ciudad (área geográfica) y fecha disponible. La disponibilidad excluye horarios pasados u ocupados.",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "materia", in: "query", schema: { type: "string" }, example: "matematicas" },
          { name: "modalidad", in: "query", schema: { type: "string", enum: ["virtual", "presencial"] } },
          { name: "ciudad", in: "query", schema: { type: "string" } },
          { name: "fecha", in: "query", schema: { type: "string", format: "date" } },
          { name: "limite", in: "query", schema: { type: "integer", default: 50, maximum: 100 } },
          { name: "desplazamiento", in: "query", schema: { type: "integer", default: 0 } }
        ],
        responses: { 200: ok("Lista paginada de tutores"), 400: err("Parámetro inválido") }
      }
    },
    "/api/tutores/{id}": {
      get: { tags: ["Tutores"], summary: "Perfil público de un tutor", parameters: [id], responses: { 200: ok("Tutor"), 404: err("No encontrado") } }
    },
    "/api/tutores/{id}/calificaciones": {
      get: { tags: ["Tutores"], summary: "Calificaciones visibles de un tutor", parameters: [id], responses: { 200: ok("Lista de calificaciones") } }
    },
    "/api/solicitudes": {
      post: {
        tags: ["Solicitudes"],
        summary: "Reservar: crear solicitud (estudiante)",
        security: seguridad,
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/NuevaSolicitud" } } } },
        responses: { 201: ok("Solicitud creada", "Solicitud"), 400: err("Datos inválidos"), ...comunes }
      }
    },
    "/api/solicitudes/mias": {
      get: { tags: ["Solicitudes"], summary: "Mis solicitudes (estudiante o tutor)", security: seguridad, responses: { 200: ok("Lista"), ...comunes } }
    },
    "/api/solicitudes/{id}/aceptar": {
      patch: { tags: ["Solicitudes"], summary: "Aceptar (tutor): crea la tutoría y el enlace de Jitsi", security: seguridad, parameters: [id], responses: { 200: ok("Tutoría programada"), ...comunes } }
    },
    "/api/solicitudes/{id}/rechazar": {
      patch: { tags: ["Solicitudes"], summary: "Rechazar (tutor)", security: seguridad, parameters: [id], responses: { 200: ok("Rechazada"), ...comunes } }
    },
    "/api/solicitudes/{id}/cancelar": {
      patch: { tags: ["Solicitudes"], summary: "Cancelar solicitud pendiente (estudiante)", security: seguridad, parameters: [id], responses: { 200: ok("Cancelada"), ...comunes } }
    },
    "/api/tutorias/mias": {
      get: { tags: ["Tutorías"], summary: "Mis tutorías", security: seguridad, responses: { 200: ok("Lista"), ...comunes } }
    },
    "/api/tutorias/{id}": {
      get: { tags: ["Tutorías"], summary: "Detalle de una tutoría (solo participantes)", security: seguridad, parameters: [id], responses: { 200: ok("Tutoría", "Tutoria"), ...comunes } }
    },
    "/api/tutorias/{id}/completar": {
      patch: { tags: ["Tutorías"], summary: "Marcar como completada (tutor)", security: seguridad, parameters: [id], responses: { 200: ok("Completada"), ...comunes } }
    },
    "/api/tutorias/{id}/cancelar": {
      patch: { tags: ["Tutorías"], summary: "Cancelar tutoría programada (tutor o estudiante)", security: seguridad, parameters: [id], responses: { 200: ok("Cancelada"), ...comunes } }
    },
    "/api/calificaciones": {
      post: {
        tags: ["Calificaciones"],
        summary: "Calificar una tutoría completada (estudiante, 1 a 5 estrellas)",
        security: seguridad,
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/NuevaCalificacion" } } } },
        responses: { 201: ok("Calificación creada"), 400: err("Datos inválidos"), ...comunes }
      }
    }
  },
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "Firebase ID token" } },
    schemas: {
      Error: {
        type: "object",
        properties: { error: { type: "object", properties: { codigo: { type: "string" }, mensaje: { type: "string" } } } }
      },
      NuevaSolicitud: {
        type: "object",
        required: ["tutorId", "materia", "fecha", "horaInicio", "horaFin", "modalidad"],
        properties: {
          tutorId: { type: "string" },
          materia: { type: "string" },
          fecha: { type: "string", example: "2026-11-20" },
          horaInicio: { type: "string", example: "15:00" },
          horaFin: { type: "string", example: "16:00" },
          modalidad: { type: "string", example: "Virtual" },
          mensaje: { type: "string", maxLength: 500 }
        }
      },
      Solicitud: {
        type: "object",
        properties: {
          id: { type: "string" }, tutorId: { type: "string" }, estudianteId: { type: "string" },
          materia: { type: "string" }, fecha: { type: "string" }, horaInicio: { type: "string" }, horaFin: { type: "string" },
          modalidad: { type: "string" }, tarifa: { type: "number" }, estado: { type: "string", enum: ["pendiente", "aceptada", "rechazada"] }
        }
      },
      Tutoria: {
        type: "object",
        properties: {
          id: { type: "string" }, solicitudId: { type: "string" }, tutorId: { type: "string" }, estudianteId: { type: "string" },
          materia: { type: "string" }, fecha: { type: "string" }, horaInicio: { type: "string" }, horaFin: { type: "string" },
          modalidad: { type: "string" }, enlaceReunion: { type: "string", description: "Sala de Jitsi Meet (vacía si es presencial)" },
          estado: { type: "string", enum: ["programada", "completada", "cancelada"] }
        }
      },
      NuevaCalificacion: {
        type: "object",
        required: ["tutoriaId", "estrellas"],
        properties: { tutoriaId: { type: "string" }, estrellas: { type: "integer", minimum: 1, maximum: 5 }, comentario: { type: "string", maxLength: 500 } }
      }
    }
  }
};
