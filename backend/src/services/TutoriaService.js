import { Conflicto, NoEncontrado, Prohibido } from "../errores.js";
import { esTutorAprobado } from "../utils/roles.js";

const nombreCompleto = (u) => `${u.nombre || ""} ${u.apellido || ""}`.trim();

export class TutoriaService {
  constructor({ usuarioRepo, tutoriaRepo, reservaRepo, notificaciones }) {
    this.usuarioRepo = usuarioRepo;
    this.tutoriaRepo = tutoriaRepo;
    this.reservaRepo = reservaRepo;
    this.notificaciones = notificaciones;
  }

  async listarMias(usuario) {
    if (usuario.rol === "tutor") return this.tutoriaRepo.listarPorTutor(usuario.id);
    if (usuario.rol === "estudiante") return this.tutoriaRepo.listarPorEstudiante(usuario.id);
    throw new Prohibido("Solo estudiantes y tutores tienen tutorías");
  }

  async obtener(usuario, id) {
    const tutoria = await this.tutoriaRepo.obtenerPorId(id);
    if (!tutoria) throw new NoEncontrado("Tutoría no encontrada");
    const participa = tutoria.tutorId === usuario.id || tutoria.estudianteId === usuario.id;
    if (!participa && usuario.rol !== "admin") throw new Prohibido("No participas en esta tutoría");
    return tutoria;
  }

  // Solo el tutor marca la tutoría como realizada (habilita la calificación del estudiante).
  async completar(usuario, id) {
    if (!esTutorAprobado(usuario)) throw new Prohibido("Solo un tutor aprobado puede completar tutorías");
    await this.#cambiarEstado(id, "completada", (t) => {
      if (t.tutorId !== usuario.id) throw new Prohibido("Esta tutoría no es tuya");
    });
    return { id, estado: "completada" };
  }

  // Cualquiera de los dos participantes puede cancelar; el otro recibe un correo.
  async cancelar(usuario, id) {
    const tutoria = await this.#cambiarEstado(id, "cancelada", (t) => {
      if (t.tutorId !== usuario.id && t.estudianteId !== usuario.id) {
        throw new Prohibido("No participas en esta tutoría");
      }
    });
    const otroId = tutoria.tutorId === usuario.id ? tutoria.estudianteId : tutoria.tutorId;
    const destinatario = await this.usuarioRepo.obtenerPorId(otroId);
    await this.notificaciones.tutoriaCancelada({
      destinatario,
      tutoria,
      canceladaPor: nombreCompleto(usuario) || "Un participante"
    });
    return { id, estado: "cancelada" };
  }

  #cambiarEstado(id, nuevoEstado, verificarPermiso) {
    return this.reservaRepo.transaccion(async (tx) => {
      const tutoria = await tx.obtenerTutoria(id);
      if (!tutoria) throw new NoEncontrado("Tutoría no encontrada");
      verificarPermiso(tutoria);
      if (tutoria.estado !== "programada") {
        throw new Conflicto(`La tutoría ya está ${tutoria.estado}; solo se pueden modificar las programadas`);
      }
      tx.actualizarTutoria(id, { estado: nuevoEstado });
      return tutoria;
    });
  }
}
