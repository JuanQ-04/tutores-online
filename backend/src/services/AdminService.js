import { Conflicto, ErrorValidacion, NoEncontrado, Prohibido } from "../errores.js";
import { ESTADOS_CASO } from "../utils/catalogos.js";
import * as v from "../utils/validar.js";

// La foto (hasta ~200 KB por usuario) no hace falta para las listas del panel.
const sinFoto = ({ fotoURL, ...resto }) => resto;

// Operaciones del panel de administración. La ruta ya exige rol «admin».
export class AdminService {
  constructor({ usuarioRepo, solicitudRepo, tutoriaRepo, calificacionRepo, soporteRepo, hojaVidaRepo, hojaVidaPendienteRepo, avisos }) {
    this.avisos = avisos;
    this.usuarioRepo = usuarioRepo;
    this.solicitudRepo = solicitudRepo;
    this.tutoriaRepo = tutoriaRepo;
    this.calificacionRepo = calificacionRepo;
    this.soporteRepo = soporteRepo;
    this.hojaVidaRepo = hojaVidaRepo;
    this.hojaVidaPendienteRepo = hojaVidaPendienteRepo;
  }

  // ------------------------------------------------------------------ lecturas
  async listarUsuarios(rol) {
    const usuarios = await this.usuarioRepo.listarTodos(rol || undefined);
    return usuarios.map(sinFoto);
  }
  listarTutorias() { return this.tutoriaRepo.listarTodas(); }
  listarSolicitudes() { return this.solicitudRepo.listarTodas(); }
  listarCalificaciones() { return this.calificacionRepo.listarTodas(); }
  listarSoporte() { return this.soporteRepo.listarTodos(); }

  // «pendiente» = el PDF nuevo que el tutor propone en una solicitud de actualización.
  async obtenerHojaVida(tutorId, { pendiente = false } = {}) {
    const repo = pendiente ? this.hojaVidaPendienteRepo : this.hojaVidaRepo;
    const hoja = await repo.obtenerPorId(tutorId);
    if (!hoja?.dataURL) throw new NoEncontrado("Este tutor no tiene un PDF guardado");
    return hoja;
  }

  // ------------------------------------------------------------------ acciones
  // Suspender o reactivar una cuenta. No se suspende a un administrador (ni a uno mismo).
  async cambiarActivo(admin, usuarioId, cuerpo = {}) {
    const activo = v.booleano(cuerpo.activo, "activo");
    const objetivo = await this.#usuario(usuarioId);
    if (objetivo.rol === "admin" || objetivo.id === admin.id) {
      throw new Prohibido("No se puede suspender a un administrador");
    }
    await this.usuarioRepo.actualizar(usuarioId, { activo });
    return { id: usuarioId, activo };
  }

  // Aprobar, rechazar o revocar a un tutor que ya envió su solicitud.
  async revisarTutor(admin, tutorId, cuerpo = {}) {
    const estado = v.opcion(cuerpo.estado, ["aprobado", "rechazado"], "estado");
    const tutor = await this.#usuario(tutorId);
    if (tutor.rol !== "tutor") throw new ErrorValidacion("Este usuario no es un tutor");
    if (tutor.estado === "incompleto") throw new Conflicto("Este tutor todavía no envió su solicitud");
    await this.usuarioRepo.registrarRevision(tutorId, estado, admin.id);
    await this.avisos.avisar(tutorId, estado === "aprobado"
      ? {
        tipo: "tutor-aprobado",
        titulo: "¡Tu perfil de tutor fue aprobado!",
        detalle: "Ya apareces en la búsqueda. Agrega tus bloques de disponibilidad para recibir solicitudes.",
        destino: { seccion: "disponibilidad" }
      }
      : {
        tipo: "tutor-rechazado",
        titulo: "Tu solicitud de tutor no fue aprobada",
        detalle: "Un administrador revisó tu perfil y no lo aprobó. Si crees que es un error, escribe al Centro de ayuda.",
        destino: { seccion: "ayuda" }
      });
    return { id: tutorId, estado };
  }

  // Moderación: editar estrellas, ocultar/mostrar y dejar retroalimentación.
  async moderarCalificacion(admin, id, cuerpo = {}) {
    const cambios = {};
    if (cuerpo.estrellas !== undefined) cambios.estrellas = v.entero(cuerpo.estrellas, "estrellas", { min: 1, max: 5 });
    if (cuerpo.estado !== undefined) cambios.estado = v.opcion(cuerpo.estado, ["visible", "oculta"], "estado");
    if (cuerpo.retroalimentacion !== undefined) {
      cambios.retroalimentacion = v.texto(cuerpo.retroalimentacion, "retroalimentacion", { max: 500, opcional: true });
    }
    if (Object.keys(cambios).length === 0) throw new ErrorValidacion("No hay cambios válidos que guardar");

    if (!(await this.calificacionRepo.obtenerPorId(id))) throw new NoEncontrado("Calificación no encontrada");
    await this.calificacionRepo.moderar(id, cambios, admin.id);
    return { id, ...cambios };
  }

  // Cambiar el estado de un caso y/o responderle al usuario. La respuesta le llega como
  // notificación (y queda guardada en el caso).
  async actualizarCaso(admin, id, cuerpo = {}) {
    const cambios = {};
    if (cuerpo.estado !== undefined) cambios.estado = v.opcion(cuerpo.estado, ESTADOS_CASO, "estado");
    if (cuerpo.respuesta !== undefined) {
      cambios.respuesta = v.texto(cuerpo.respuesta, "respuesta", { max: 1000 });
      cambios.respondidoPor = admin.id;
    }
    if (Object.keys(cambios).length === 0) throw new ErrorValidacion("Indica el estado o una respuesta");

    const caso = await this.soporteRepo.obtenerPorId(id);
    if (!caso) throw new NoEncontrado("Caso no encontrado");
    await this.soporteRepo.actualizar(id, cambios);

    const asunto = caso.asunto || "tu mensaje";
    const destino = { seccion: "notificaciones" };
    if (cambios.respuesta) {
      await this.avisos.avisar(caso.usuarioId, {
        tipo: "soporte-respuesta", titulo: `Respondieron tu caso: «${asunto}»`, detalle: cambios.respuesta, destino
      });
    } else if (cambios.estado && cambios.estado !== caso.estado) {
      await this.avisos.avisar(caso.usuarioId, {
        tipo: "soporte-estado",
        titulo: cambios.estado === "resuelto" ? "Tu caso fue marcado como resuelto" : "Tu caso está en revisión",
        detalle: `Caso: «${asunto}».`,
        destino
      });
    }
    return { id, ...cambios };
  }

  async #usuario(id) {
    const usuario = await this.usuarioRepo.obtenerPorId(id);
    if (!usuario) throw new NoEncontrado("Usuario no encontrado");
    return usuario;
  }
}
