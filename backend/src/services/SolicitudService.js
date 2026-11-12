import { Conflicto, ErrorValidacion, NoEncontrado, Prohibido } from "../errores.js";
import { normalizar } from "../utils/texto.js";
import { esTutorAprobado } from "../utils/roles.js";
import { esVirtual, seSolapan } from "../utils/tiempo.js";
import * as v from "../utils/validar.js";

const ESTADOS_VISIBLES = ["aprobado", "aceptado"];
const nombreCompleto = (u) => `${u.nombre || ""} ${u.apellido || ""}`.trim();

// Reglas de negocio de solicitudes: crear, aceptar, rechazar, cancelar.
// Depende de abstracciones inyectadas (repositorios, notificaciones, videoconferencia, reloj).
export class SolicitudService {
  constructor({ usuarioRepo, solicitudRepo, tutoriaRepo, reservaRepo, notificaciones, avisos, videoconferencia, reloj }) {
    this.usuarioRepo = usuarioRepo;
    this.solicitudRepo = solicitudRepo;
    this.tutoriaRepo = tutoriaRepo;
    this.reservaRepo = reservaRepo;
    this.notificaciones = notificaciones;
    this.avisos = avisos;
    this.videoconferencia = videoconferencia;
    this.reloj = reloj;
  }

  // ------------------------------------------------------------------ crear
  async crear(usuario, cuerpo = {}) {
    const tutorId = v.texto(cuerpo.tutorId, "tutorId", { max: 128 });
    const materia = v.texto(cuerpo.materia, "materia", { max: 100 });
    const fecha = v.fecha(cuerpo.fecha);
    const horaInicio = v.hora(cuerpo.horaInicio, "horaInicio");
    const horaFin = v.hora(cuerpo.horaFin, "horaFin");
    const modalidad = v.texto(cuerpo.modalidad, "modalidad", { max: 40 });
    const mensaje = v.texto(cuerpo.mensaje, "mensaje", { max: 500, opcional: true });

    if (horaFin <= horaInicio) throw new ErrorValidacion("La hora de fin debe ser posterior a la de inicio");
    if (this.reloj.yaPaso(fecha, horaFin)) throw new ErrorValidacion("No puedes reservar una tutoría en el pasado");

    const tutor = await this.usuarioRepo.obtenerPorId(tutorId);
    const visible = tutor && tutor.rol === "tutor" && ESTADOS_VISIBLES.includes(tutor.estado) && tutor.activo !== false;
    if (!visible) throw new NoEncontrado("El tutor no existe o no está disponible");

    // El horario pedido debe ser un bloque que el tutor publicó (no confiamos en el cliente).
    const bloque = (Array.isArray(tutor.disponibilidad) ? tutor.disponibilidad : []).find(
      (b) => b && b.fecha === fecha && b.horaInicio === horaInicio && b.horaFin === horaFin &&
             normalizar(b.modalidad) === normalizar(modalidad)
    );
    if (!bloque) throw new Conflicto("Ese horario ya no está disponible");

    const programadas = await this.tutoriaRepo.listarProgramadas(tutorId);
    if (programadas.some((t) => seSolapan({ fecha, horaInicio, horaFin }, t))) {
      throw new Conflicto("El tutor ya tiene una tutoría programada en ese horario");
    }

    if (await this.solicitudRepo.existePendiente({ estudianteId: usuario.id, tutorId, fecha, horaInicio })) {
      throw new Conflicto("Ya enviaste una solicitud pendiente para ese horario");
    }

    const datos = {
      tutorId,
      tutorNombre: nombreCompleto(tutor) || "Tutor",
      estudianteId: usuario.id,
      estudianteNombre: nombreCompleto(usuario) || "Estudiante",
      materia,
      fecha,
      horaInicio,
      horaFin,
      modalidad: bloque.modalidad,
      mensaje,
      tarifa: Number(tutor.tarifa) || 0, // la tarifa la pone el servidor, no el cliente
      estado: "pendiente"
    };
    const id = await this.solicitudRepo.crear(datos);
    await this.notificaciones.nuevaSolicitud({ tutor, solicitud: datos });
    await this.avisos.avisar(tutorId, {
      tipo: "solicitud-nueva",
      titulo: "Nueva solicitud de tutoría",
      detalle: `${datos.estudianteNombre} pidió ${materia} el ${fecha}, de ${horaInicio} a ${horaFin} (${bloque.modalidad}).`,
      destino: { seccion: "solicitudes", id }
    });
    return { id, ...datos };
  }

  // ----------------------------------------------------------------- listar
  async listarMias(usuario) {
    if (usuario.rol === "tutor") return this.solicitudRepo.listarPorTutor(usuario.id);
    if (usuario.rol === "estudiante") return this.solicitudRepo.listarPorEstudiante(usuario.id);
    throw new Prohibido("Solo estudiantes y tutores tienen solicitudes");
  }

  // ----------------------------------------------------------------- aceptar
  // Todo ocurre en UNA transacción: dos aceptaciones simultáneas no pueden
  // dejar al tutor con dos tutorías en el mismo horario.
  async aceptar(usuario, id) {
    if (!esTutorAprobado(usuario)) throw new Prohibido("Solo un tutor aprobado puede aceptar solicitudes");

    const { solicitud, tutoria } = await this.reservaRepo.transaccion(async (tx) => {
      const sol = await tx.obtenerSolicitud(id);
      if (!sol) throw new NoEncontrado("Solicitud no encontrada");
      if (sol.tutorId !== usuario.id) throw new Prohibido("Esta solicitud no es tuya");
      if (sol.estado !== "pendiente") throw new Conflicto("Esta solicitud ya fue respondida");
      if (this.reloj.yaPaso(sol.fecha, sol.horaFin)) throw new Conflicto("Esa franja horaria ya pasó");

      const programadas = await tx.tutoriasProgramadas(sol.tutorId, sol.fecha);
      if (programadas.some((t) => seSolapan(sol, t))) {
        throw new Conflicto("Ya tienes una tutoría programada en ese horario");
      }

      const datos = {
        solicitudId: sol.id,
        tutorId: sol.tutorId,
        tutorNombre: sol.tutorNombre,
        estudianteId: sol.estudianteId,
        estudianteNombre: sol.estudianteNombre,
        materia: sol.materia,
        fecha: sol.fecha,
        horaInicio: sol.horaInicio,
        horaFin: sol.horaFin,
        modalidad: sol.modalidad,
        tarifa: sol.tarifa || 0,
        estado: "programada",
        enlaceReunion: esVirtual(sol.modalidad) ? this.videoconferencia.crearSala() : "",
        calificacion: null,
        comentario: ""
      };
      const tutoriaId = tx.crearTutoria(datos);
      tx.actualizarSolicitud(id, { estado: "aceptada" });
      return { solicitud: { ...sol, estado: "aceptada" }, tutoria: { id: tutoriaId, ...datos } };
    });

    // Fuera de la transacción (puede reintentarse): correos con el registro de la tutoría.
    const estudiante = await this.usuarioRepo.obtenerPorId(solicitud.estudianteId);
    await this.notificaciones.tutoriaProgramada({ tutor: usuario, estudiante, tutoria });
    await this.avisos.avisar(solicitud.estudianteId, {
      tipo: "solicitud-aceptada",
      titulo: "Tu tutoría fue confirmada",
      detalle: `${tutoria.tutorNombre} aceptó tu solicitud de ${tutoria.materia}: ${tutoria.fecha}, de ${tutoria.horaInicio} a ${tutoria.horaFin}.`,
      destino: { seccion: "tutorias", id: tutoria.id }
    });
    return { solicitud: { id: solicitud.id, estado: "aceptada" }, tutoria };
  }

  // ---------------------------------------------------------------- rechazar
  async rechazar(usuario, id) {
    if (!esTutorAprobado(usuario)) throw new Prohibido("Solo un tutor aprobado puede rechazar solicitudes");
    const sol = await this.#cerrarPendiente(id, (s) => {
      if (s.tutorId !== usuario.id) throw new Prohibido("Esta solicitud no es tuya");
    });
    const estudiante = await this.usuarioRepo.obtenerPorId(sol.estudianteId);
    await this.notificaciones.solicitudRechazada({ estudiante, solicitud: sol });
    await this.avisos.avisar(sol.estudianteId, {
      tipo: "solicitud-rechazada",
      titulo: "Tu solicitud fue rechazada",
      detalle: `${sol.tutorNombre} no pudo atender tu solicitud de ${sol.materia} del ${sol.fecha}. Puedes buscar otro horario o tutor.`,
      destino: { seccion: "tutorias" }
    });
    return { id, estado: "rechazada" };
  }

  // ---------------------------------------------------------------- cancelar
  // El estudiante retira su solicitud pendiente (mismo estado "rechazada" que usa el frontend).
  async cancelar(usuario, id) {
    const sol = await this.#cerrarPendiente(id, (s) => {
      if (s.estudianteId !== usuario.id) throw new Prohibido("Esta solicitud no es tuya");
    });
    await this.avisos.avisar(sol.tutorId, {
      tipo: "solicitud-cancelada",
      titulo: "Solicitud cancelada",
      detalle: `${sol.estudianteNombre} retiró su solicitud de ${sol.materia} del ${sol.fecha}.`,
      destino: { seccion: "solicitudes", id }
    });
    return { id, estado: "rechazada" };
  }

  async #cerrarPendiente(id, verificarDueno) {
    return this.reservaRepo.transaccion(async (tx) => {
      const sol = await tx.obtenerSolicitud(id);
      if (!sol) throw new NoEncontrado("Solicitud no encontrada");
      verificarDueno(sol);
      if (sol.estado !== "pendiente") throw new Conflicto("Esta solicitud ya fue respondida");
      tx.actualizarSolicitud(id, { estado: "rechazada" });
      return sol;
    });
  }
}
