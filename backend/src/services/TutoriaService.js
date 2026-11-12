import { Conflicto, NoEncontrado, Prohibido } from "../errores.js";
import { esTutorAprobado } from "../utils/roles.js";

const nombreCompleto = (u) => `${u.nombre || ""} ${u.apellido || ""}`.trim();
const minutos = (hora) => {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
};
const hora = (total) => `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

function quitarHorarioCompletado(disponibilidad, tutoria) {
  const inicioTutoria = minutos(tutoria.horaInicio);
  const finTutoria = minutos(tutoria.horaFin);

  return (Array.isArray(disponibilidad) ? disponibilidad : []).flatMap((bloque) => {
    if (bloque.fecha !== tutoria.fecha || !bloque.horaInicio || !bloque.horaFin) return [bloque];

    const inicioBloque = minutos(bloque.horaInicio);
    const finBloque = minutos(bloque.horaFin);
    if (finBloque <= inicioTutoria || inicioBloque >= finTutoria) return [bloque];

    const partes = [];
    const baseId = bloque.id || "disponibilidad";
    if (inicioBloque < inicioTutoria) {
      partes.push({
        ...bloque,
        id: `${baseId}-antes-${tutoria.id}`,
        horaFin: hora(inicioTutoria)
      });
    }
    if (finBloque > finTutoria) {
      partes.push({
        ...bloque,
        id: `${baseId}-despues-${tutoria.id}`,
        horaInicio: hora(finTutoria)
      });
    }
    return partes;
  });
}

export class TutoriaService {
  constructor({ usuarioRepo, tutoriaRepo, reservaRepo, notificaciones, avisos }) {
    this.usuarioRepo = usuarioRepo;
    this.tutoriaRepo = tutoriaRepo;
    this.reservaRepo = reservaRepo;
    this.notificaciones = notificaciones;
    this.avisos = avisos;
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
    const tutoria = await this.#cambiarEstado(
      id,
      "completada",
      (t) => {
        if (t.tutorId !== usuario.id) throw new Prohibido("Esta tutoría no es tuya");
      },
      async (tutoria, tx) => {
        const tutor = await tx.obtenerUsuario(tutoria.tutorId);
        if (!tutor) throw new NoEncontrado("No se encontró el perfil del tutor");
        tx.actualizarUsuario(tutoria.tutorId, {
          disponibilidad: quitarHorarioCompletado(tutor.disponibilidad, { ...tutoria, id })
        });
      }
    );
    await this.avisos.avisar(tutoria.estudianteId, {
      tipo: "tutoria-completada",
      titulo: "Tutoría completada",
      detalle: `${tutoria.tutorNombre} marcó como realizada tu tutoría de ${tutoria.materia}. Ya puedes calificarla.`,
      destino: { seccion: "tutorias", id }
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
    await this.avisos.avisar(otroId, {
      tipo: "tutoria-cancelada",
      titulo: "Tutoría cancelada",
      detalle: `${nombreCompleto(usuario) || "Un participante"} canceló la tutoría de ${tutoria.materia} del ${tutoria.fecha}, de ${tutoria.horaInicio} a ${tutoria.horaFin}.`,
      destino: { seccion: "tutorias", id }
    });
    return { id, estado: "cancelada" };
  }

  #cambiarEstado(id, nuevoEstado, verificarPermiso, antesDeActualizar) {
    return this.reservaRepo.transaccion(async (tx) => {
      const tutoria = await tx.obtenerTutoria(id);
      if (!tutoria) throw new NoEncontrado("Tutoría no encontrada");
      await verificarPermiso(tutoria, tx);
      if (tutoria.estado !== "programada") {
        throw new Conflicto(`La tutoría ya está ${tutoria.estado}; solo se pueden modificar las programadas`);
      }
      if (antesDeActualizar) await antesDeActualizar(tutoria, tx);
      tx.actualizarTutoria(id, { estado: nuevoEstado });
      return tutoria;
    });
  }
}
