import { Conflicto, NoEncontrado, Prohibido } from "../errores.js";
import * as v from "../utils/validar.js";

const nombreCompleto = (u) => `${u.nombre || ""} ${u.apellido || ""}`.trim();

export class CalificacionService {
  constructor({ tutoriaRepo, calificacionRepo }) {
    this.tutoriaRepo = tutoriaRepo;
    this.calificacionRepo = calificacionRepo;
  }

  // Una calificación por tutoría, solo del estudiante, solo si la tutoría está completada.
  async crear(usuario, cuerpo = {}) {
    const tutoriaId = v.texto(cuerpo.tutoriaId, "tutoriaId", { max: 128 });
    const estrellas = v.entero(cuerpo.estrellas, "estrellas", { min: 1, max: 5 });
    const comentario = v.texto(cuerpo.comentario, "comentario", { max: 500, opcional: true });

    const tutoria = await this.tutoriaRepo.obtenerPorId(tutoriaId);
    if (!tutoria) throw new NoEncontrado("Tutoría no encontrada");
    if (tutoria.estudianteId !== usuario.id) throw new Prohibido("Solo puedes calificar tus propias tutorías");
    if (tutoria.estado !== "completada") throw new Conflicto("Solo puedes calificar tutorías completadas");

    const datos = {
      tutoriaId,
      tutorId: tutoria.tutorId,
      tutorNombre: tutoria.tutorNombre,
      estudianteId: usuario.id,
      estudianteNombre: nombreCompleto(usuario) || tutoria.estudianteNombre || "Estudiante",
      materia: tutoria.materia,
      fechaTutoria: tutoria.fecha,
      estrellas,
      comentario,
      estado: "visible",
      retroalimentacion: ""
    };
    await this.calificacionRepo.crear(tutoriaId, datos); // lanza Conflicto si ya existe
    return { id: tutoriaId, ...datos };
  }
}
