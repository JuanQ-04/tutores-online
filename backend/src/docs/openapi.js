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
    description: "API REST de la plataforma de tutorías. Es la única puerta a la base de datos: el frontend nunca habla directo con Firestore. Autenticación: ID token de Firebase en `Authorization: Bearer <token>`."
  },
  tags: [
    { name: "Tutores" }, { name: "Materias" }, { name: "Usuarios" }, { name: "Solicitudes" }, { name: "Tutorías" },
    { name: "Calificaciones" }, { name: "Soporte" }, { name: "Notificaciones" }, { name: "Administración" }
  ],
  paths: {
    "/api/health": { get: { summary: "Estado del servidor", responses: { 200: ok("OK") } } },
    "/api/tutores": {
      get: {
        tags: ["Tutores"],
        summary: "Buscar tutores (público)",
        description: "Filtra por texto, materia, modalidad, ciudad (área geográfica) y fecha disponible. La modalidad se compara con la que el tutor eligió en su perfil (un tutor «Virtual y presencial» aparece en ambas), no con sus bloques; la fecha sí exige un bloque libre ese día. La disponibilidad excluye horarios pasados u ocupados.",
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
    "/api/materias": {
      get: {
        tags: ["Materias"],
        summary: "Catálogo de materias (público)",
        description: "Las seis materias de base más las que agregó el administrador. El `id` es el que se guarda en los tutores.",
        responses: { 200: ok("Lista de materias", "Materia") }
      }
    },
    "/api/usuarios": {
      post: {
        tags: ["Usuarios"],
        summary: "Crear mi perfil tras registrarme (el correo puede estar sin verificar)",
        description: "Si el perfil ya existe lo devuelve (200). El rol «admin» no se puede pedir.",
        security: seguridad,
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/NuevoUsuario" } } } },
        responses: { 200: ok("El perfil ya existía"), 201: ok("Perfil creado"), 400: err("Datos inválidos"), 401: comunes[401] }
      }
    },
    "/api/usuarios/yo": {
      get: { tags: ["Usuarios"], summary: "Mi perfil (el correo puede estar sin verificar)", security: seguridad, responses: { 200: ok("Perfil"), 401: comunes[401], 404: err("Aún no tienes perfil") } },
      patch: {
        tags: ["Usuarios"],
        summary: "Editar mi nombre y apellido",
        description: "Los datos profesionales del tutor (materias, modalidad, tarifa, ciudad…) no se editan aquí: se piden con `POST /usuarios/yo/solicitud-cambio` y los aprueba un administrador.",
        security: seguridad,
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CambiosPerfil" } } } },
        responses: { 200: ok("Campos guardados"), 400: err("Datos inválidos"), ...comunes }
      }
    },
    "/api/usuarios/yo/foto": {
      put: {
        tags: ["Usuarios"],
        summary: "Guardar mi foto de perfil (data URL jpeg/png/webp de hasta ~200 KB)",
        security: seguridad,
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["fotoURL"], properties: { fotoURL: { type: "string" } } } } } },
        responses: { 200: ok("Foto guardada"), 400: err("Imagen no válida"), ...comunes }
      }
    },
    "/api/usuarios/yo/disponibilidad": {
      post: {
        tags: ["Usuarios"],
        summary: "Agregar un bloque de disponibilidad (tutor aprobado)",
        description: "La modalidad del bloque debe encajar con la del perfil: «Virtual» solo admite bloques Virtual, «Presencial» solo Presencial y «Virtual y presencial» admite las tres.",
        security: seguridad,
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/NuevoBloque" } } } },
        responses: { 201: ok("Bloque creado y disponibilidad actualizada"), 400: err("Datos inválidos"), ...comunes }
      }
    },
    "/api/usuarios/yo/disponibilidad/{id}": {
      delete: { tags: ["Usuarios"], summary: "Quitar un bloque de disponibilidad (tutor aprobado)", security: seguridad, parameters: [id], responses: { 200: ok("Disponibilidad actualizada"), ...comunes } }
    },
    "/api/usuarios/yo/solicitud-tutor": {
      post: {
        tags: ["Usuarios"],
        summary: "Enviar mi solicitud de verificación como tutor (perfil profesional + hoja de vida PDF)",
        description: "Solo mientras el estado del tutor es «incompleto»; después pasa a «pendiente».",
        security: seguridad,
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/PerfilTutor" } } } },
        responses: { 200: ok("Solicitud enviada"), 400: err("Datos inválidos"), ...comunes }
      }
    },
    "/api/usuarios/yo/solicitud-cambio": {
      get: {
        tags: ["Usuarios"],
        summary: "Mi última solicitud de actualización de datos (tutor aprobado)",
        description: "Devuelve `{ solicitud }` con `estado` pendiente, aprobada o rechazada, los `cambios` pedidos y la `nota` del administrador; `solicitud` es `null` si no hay ninguna.",
        security: seguridad,
        responses: { 200: ok("Solicitud o null"), ...comunes }
      },
      post: {
        tags: ["Usuarios"],
        summary: "Pedir la actualización de mis datos profesionales (tutor aprobado)",
        description: "Se envía el formulario completo; solo se guardan como solicitud los campos que cambian. El perfil NO cambia hasta que un administrador la apruebe. Una solicitud nueva reemplaza a la pendiente. `hojaVida` es opcional (reemplaza el PDF al aprobarse).",
        security: seguridad,
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/PerfilTutor" } } } },
        responses: { 201: ok("Solicitud pendiente creada"), 400: err("Datos inválidos o sin cambios"), ...comunes }
      },
      delete: {
        tags: ["Usuarios"],
        summary: "Cancelar mi solicitud de actualización pendiente",
        security: seguridad,
        responses: { 200: ok("Cancelada"), ...comunes }
      }
    },
    "/api/soporte": {
      post: {
        tags: ["Soporte"],
        summary: "Escribir al equipo de soporte (Centro de ayuda)",
        security: seguridad,
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["asunto", "mensaje"], properties: { asunto: { type: "string", maxLength: 120 }, mensaje: { type: "string", maxLength: 1000 } } } } } },
        responses: { 201: ok("Mensaje enviado"), 400: err("Datos inválidos"), ...comunes }
      }
    },
    "/api/notificaciones": {
      get: {
        tags: ["Notificaciones"],
        summary: "Mis notificaciones (las 60 más recientes) y cuántas están sin leer",
        description: "Cualquier rol. Se guardan por usuario, así que siguen ahí al volver a iniciar sesión.",
        security: seguridad,
        responses: {
          200: {
            description: "Bandeja del usuario",
            content: { "application/json": { schema: { type: "object", properties: { avisos: { type: "array", items: { $ref: "#/components/schemas/Notificacion" } }, sinLeer: { type: "integer" } } } } }
          },
          401: comunes[401]
        }
      }
    },
    "/api/notificaciones/leer-todas": {
      post: {
        tags: ["Notificaciones"],
        summary: "Marcar todas mis notificaciones como leídas",
        security: seguridad,
        responses: {
          200: { description: "Cantidad marcada", content: { "application/json": { schema: { type: "object", properties: { marcadas: { type: "integer" } } } } } },
          401: comunes[401]
        }
      }
    },
    "/api/notificaciones/{id}/leida": {
      patch: {
        tags: ["Notificaciones"],
        summary: "Marcar una notificación mía como leída",
        security: seguridad,
        parameters: [id],
        responses: { 200: ok("Notificación leída", "Notificacion"), 401: comunes[401], 404: err("No existe o no es tuya") }
      }
    },
    "/api/calificaciones/mias": {
      get: { tags: ["Calificaciones"], summary: "Calificaciones que di (estudiante) o que recibí (tutor)", security: seguridad, responses: { 200: ok("Lista"), ...comunes } }
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
    },
    "/api/admin/usuarios": {
      get: {
        tags: ["Administración"], summary: "Todos los usuarios (sin foto). Con ?rol=tutor, solo los tutores", security: seguridad,
        parameters: [{ name: "rol", in: "query", schema: { type: "string", enum: ["estudiante", "tutor", "admin"] } }],
        responses: { 200: ok("Lista"), ...comunes }
      }
    },
    "/api/admin/usuarios/{id}/activo": {
      patch: {
        tags: ["Administración"], summary: "Suspender o reactivar una cuenta", security: seguridad, parameters: [id],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["activo"], properties: { activo: { type: "boolean" } } } } } },
        responses: { 200: ok("Actualizada"), ...comunes }
      }
    },
    "/api/admin/tutores/{id}/hoja-de-vida": {
      get: {
        tags: ["Administración"], summary: "Hoja de vida (PDF en data URL) de un tutor", security: seguridad,
        parameters: [id, { name: "pendiente", in: "query", schema: { type: "boolean" }, description: "true: el PDF nuevo de una solicitud de actualización aún sin responder" }],
        responses: { 200: ok("Hoja de vida"), ...comunes }
      }
    },
    "/api/admin/materias": {
      post: {
        tags: ["Administración"], summary: "Agregar una materia al catálogo", security: seguridad,
        description: "Queda disponible de inmediato en el registro de tutores, la búsqueda y el panel del estudiante. El identificador sale del nombre («Inglés técnico» → `ingles-tecnico`).",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["nombre"], properties: { nombre: { type: "string", minLength: 2, maxLength: 40 } } } } } },
        responses: { 201: ok("Materia creada", "Materia"), 400: err("Nombre inválido"), 409: err("Ya existe una materia con ese nombre"), 401: comunes[401], 403: comunes[403] }
      }
    },
    "/api/admin/cambios-perfil": {
      get: { tags: ["Administración"], summary: "Solicitudes de actualización de datos de los tutores", security: seguridad, responses: { 200: ok("Lista (la más reciente primero)"), ...comunes } }
    },
    "/api/admin/cambios-perfil/{id}": {
      patch: {
        tags: ["Administración"], summary: "Aprobar o rechazar una actualización de datos (el id es el del tutor)", security: seguridad, parameters: [id],
        description: "Al aprobar, los datos pasan al perfil; si cambió la modalidad, los bloques de disponibilidad que ya no encajan se quitan y los «Virtual y presencial» pasan a la modalidad única. Al rechazar, el PDF pendiente se descarta.",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["estado"], properties: { estado: { type: "string", enum: ["aprobada", "rechazada"] }, nota: { type: "string", maxLength: 300, description: "Mensaje para el tutor" } } } } } },
        responses: { 200: ok("Decisión guardada"), 400: err("Estado inválido"), ...comunes }
      }
    },
    "/api/admin/tutores/{id}/estado": {
      patch: {
        tags: ["Administración"], summary: "Aprobar, rechazar o revocar a un tutor", security: seguridad, parameters: [id],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["estado"], properties: { estado: { type: "string", enum: ["aprobado", "rechazado"] } } } } } },
        responses: { 200: ok("Decisión guardada"), ...comunes }
      }
    },
    "/api/admin/tutorias": { get: { tags: ["Administración"], summary: "Todas las tutorías", security: seguridad, responses: { 200: ok("Lista"), ...comunes } } },
    "/api/admin/solicitudes": { get: { tags: ["Administración"], summary: "Todas las solicitudes", security: seguridad, responses: { 200: ok("Lista"), ...comunes } } },
    "/api/admin/calificaciones": { get: { tags: ["Administración"], summary: "Todas las calificaciones (visibles y ocultas)", security: seguridad, responses: { 200: ok("Lista"), ...comunes } } },
    "/api/admin/calificaciones/{id}": {
      patch: {
        tags: ["Administración"], summary: "Moderar una calificación (estrellas, visibilidad, retroalimentación)", security: seguridad, parameters: [id],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { estrellas: { type: "integer", minimum: 1, maximum: 5 }, estado: { type: "string", enum: ["visible", "oculta"] }, retroalimentacion: { type: "string", maxLength: 500 } } } } } },
        responses: { 200: ok("Moderada"), ...comunes }
      }
    },
    "/api/admin/soporte": { get: { tags: ["Administración"], summary: "Mensajes del Centro de ayuda", security: seguridad, responses: { 200: ok("Lista"), ...comunes } } },
    "/api/admin/soporte/{id}": {
      patch: {
        tags: ["Administración"],
        summary: "Cambiar el estado de un caso de soporte y/o responderlo",
        description: "Hay que enviar al menos `estado` o `respuesta`. La respuesta (y el cambio de estado) le llegan al usuario como notificación.",
        security: seguridad,
        parameters: [id],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", minProperties: 1, properties: { estado: { type: "string", enum: ["abierto", "revision", "resuelto"] }, respuesta: { type: "string", maxLength: 1000 } } } } }
        },
        responses: { 200: ok("Caso actualizado (incluye `respuesta` y `respondidoPor` si hubo)"), 400: err("Datos inválidos"), ...comunes }
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
      NuevoUsuario: {
        type: "object",
        required: ["nombre", "apellido", "rol"],
        properties: { nombre: { type: "string" }, apellido: { type: "string" }, rol: { type: "string", enum: ["estudiante", "tutor"] } }
      },
      CambiosPerfil: {
        type: "object",
        properties: { nombre: { type: "string" }, apellido: { type: "string" } }
      },
      Materia: {
        type: "object",
        properties: { id: { type: "string", example: "matematicas" }, nombre: { type: "string", example: "Matemáticas" }, base: { type: "boolean", description: "true en las seis de base" } }
      },
      NuevoBloque: {
        type: "object",
        required: ["fecha", "horaInicio", "horaFin", "modalidad"],
        properties: {
          fecha: { type: "string", example: "2026-11-20" },
          horaInicio: { type: "string", example: "15:00", description: "Entre 08:00 y 20:00, en intervalos de 30 minutos" },
          horaFin: { type: "string", example: "16:00" },
          modalidad: { type: "string", enum: ["Virtual", "Presencial", "Virtual y presencial"] }
        }
      },
      PerfilTutor: {
        type: "object",
        required: ["titulo", "nivelEstudios", "institucion", "materias", "nivelEnsenanza", "experiencia", "modalidad", "ciudad", "tarifa", "franjas", "presentacion"],
        properties: {
          titulo: { type: "string" },
          nivelEstudios: { type: "string", enum: ["tecnico", "pregrado-curso", "pregrado", "posgrado"] },
          institucion: { type: "string" },
          materias: { type: "array", items: { type: "string" }, description: "Identificadores del catálogo (`GET /materias`)" },
          nivelEnsenanza: { type: "string", enum: ["secundaria", "universitario", "ambos"] },
          experiencia: { type: "integer", minimum: 0, maximum: 60, description: "Años enseñando" },
          modalidad: { type: "string", enum: ["Virtual", "Presencial", "Virtual y presencial"] },
          ciudad: { type: "string" },
          tarifa: { type: "integer", description: "COP por hora" },
          franjas: { type: "array", items: { type: "string", enum: ["manana", "tarde", "noche"] } },
          presentacion: { type: "string", maxLength: 500 },
          hojaVida: {
            type: "object",
            description: "Obligatoria en la solicitud de verificación; opcional en la de actualización",
            required: ["nombreArchivo", "tamano", "dataURL"],
            properties: { nombreArchivo: { type: "string" }, tamano: { type: "integer" }, dataURL: { type: "string", description: "data:application/pdf;base64,..." } }
          }
        }
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
      Notificacion: {
        type: "object",
        properties: {
          id: { type: "string" },
          tipo: { type: "string", example: "solicitud-nueva" },
          titulo: { type: "string", maxLength: 120 },
          detalle: { type: "string", maxLength: 1000 },
          destino: {
            type: "object",
            description: "A dónde lleva al tocarla: sección del panel y, si aplica, el elemento (`id`) o la pestaña",
            properties: { seccion: { type: "string", example: "solicitudes" }, id: { type: "string" }, pestana: { type: "string", example: "updates" } }
          },
          leida: { type: "boolean" },
          creadaEn: { type: "string", format: "date-time" }
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
