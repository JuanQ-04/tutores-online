import { NoEncontrado } from "../errores.js";
import { MODALIDADES } from "../utils/catalogos.js";
import { normalizar } from "../utils/texto.js";
import { fecha as validarFecha } from "../utils/validar.js";
import { seSolapan } from "../utils/tiempo.js";

const ESTADOS_VISIBLES = ["aprobado", "aceptado"];
const LIMITE_MAXIMO = 100;

// La modalidad es la que el tutor eligió en su perfil, no la de sus bloques. Solo un perfil
// antiguo, sin modalidad guardada, se deduce de los bloques que ya tiene (hasta que la complete).
function modalidadDe(tutor, bloques) {
  if (MODALIDADES.includes(tutor.modalidad)) return tutor.modalidad;
  const usadas = new Set(bloques.map((b) => b.modalidad));
  const virtual = usadas.has("Virtual") || usadas.has("Virtual y presencial");
  const presencial = usadas.has("Presencial") || usadas.has("Virtual y presencial");
  if (virtual && presencial) return "Virtual y presencial";
  return virtual ? "Virtual" : presencial ? "Presencial" : "";
}

// Búsqueda y consulta pública de tutores. Solo expone campos públicos
// (nunca correo ni hoja de vida) y calcula la disponibilidad REAL:
// bloques futuros que no chocan con tutorías ya programadas.
export class TutorService {
  constructor({ usuarioRepo, tutoriaRepo, calificacionRepo, reloj }) {
    this.usuarioRepo = usuarioRepo;
    this.tutoriaRepo = tutoriaRepo;
    this.calificacionRepo = calificacionRepo;
    this.reloj = reloj;
  }

  async buscar(consulta = {}) {
    const f = this.#filtros(consulta);
    const [tutores, programadas, resumen] = await Promise.all([
      this.usuarioRepo.listarTutoresVisibles(),
      this.tutoriaRepo.listarProgramadas(),
      this.calificacionRepo.resumenPorTutor()
    ]);

    const porTutor = new Map();
    for (const t of programadas) {
      if (!porTutor.has(t.tutorId)) porTutor.set(t.tutorId, []);
      porTutor.get(t.tutorId).push(t);
    }

    const lista = tutores
      .map((t) => this.#publico(t, porTutor.get(t.id) || [], resumen[t.id]))
      .filter((t) => this.#coincide(t, f))
      .sort((a, b) => b.promedio - a.promedio || b.opiniones - a.opiniones || a.nombre.localeCompare(b.nombre));

    return {
      total: lista.length,
      limite: f.limite,
      desplazamiento: f.desplazamiento,
      tutores: lista.slice(f.desplazamiento, f.desplazamiento + f.limite)
    };
  }

  async obtener(id) {
    const tutor = await this.usuarioRepo.obtenerPorId(id);
    const visible = tutor && tutor.rol === "tutor" && ESTADOS_VISIBLES.includes(tutor.estado) && tutor.activo !== false;
    if (!visible) throw new NoEncontrado("Tutor no encontrado");
    const [programadas, resumen] = await Promise.all([
      this.tutoriaRepo.listarProgramadas(id),
      this.calificacionRepo.resumenPorTutor(id)
    ]);
    return this.#publico(tutor, programadas, resumen[id]);
  }

  async listarCalificaciones(tutorId, limite = 50) {
    return this.calificacionRepo.listarVisiblesPorTutor(tutorId, Math.min(Number(limite) || 50, LIMITE_MAXIMO));
  }

  // ---------------------------------------------------------------- privados
  #filtros(c) {
    const limite = Math.min(Math.max(parseInt(c.limite, 10) || 50, 1), LIMITE_MAXIMO);
    const desplazamiento = Math.max(parseInt(c.desplazamiento, 10) || 0, 0);
    return {
      q: normalizar(c.q),
      materia: normalizar(c.materia),
      modalidad: normalizar(c.modalidad),
      ciudad: normalizar(c.ciudad),
      fecha: c.fecha ? validarFecha(c.fecha, "fecha") : "",
      limite,
      desplazamiento
    };
  }

  #publico(t, programadasDelTutor, resumen) {
    const materias = Array.isArray(t.materias) ? t.materias : [];
    const bloques = (Array.isArray(t.disponibilidad) ? t.disponibilidad : [])
      .filter((b) => b && b.fecha && b.horaInicio && b.horaFin);
    const disponibilidad = bloques
      .filter((b) => !this.reloj.yaPaso(b.fecha, b.horaFin))
      .filter((b) => !programadasDelTutor.some((p) => seSolapan(b, p)))
      .sort((a, b) => `${a.fecha}T${a.horaInicio}`.localeCompare(`${b.fecha}T${b.horaInicio}`))
      .map((b) => ({ id: b.id, fecha: b.fecha, horaInicio: b.horaInicio, horaFin: b.horaFin, modalidad: b.modalidad }));

    return {
      id: t.id,
      nombre: t.nombre || "Tutor",
      apellido: t.apellido || "",
      titulo: t.titulo || "",
      institucion: t.institucion || "",
      ciudad: t.ciudad || "",
      presentacion: t.presentacion || "",
      materias,
      modalidad: modalidadDe(t, bloques),
      nivelEnsenanza: t.nivelEnsenanza || "",
      experiencia: Number.isInteger(t.experiencia) ? t.experiencia : null,
      tarifa: Number(t.tarifa) || 0,
      fotoURL: t.fotoURL || "",
      promedio: resumen?.promedio ?? 0,
      opiniones: resumen?.opiniones ?? 0,
      disponibilidad
    };
  }

  #coincide(t, f) {
    if (f.q) {
      const pajar = normalizar([t.nombre, t.apellido, t.titulo, t.presentacion, ...t.materias].join(" "));
      if (!pajar.includes(f.q)) return false;
    }
    if (f.materia && !t.materias.some((m) => normalizar(m) === f.materia)) return false;
    if (f.ciudad && !normalizar(t.ciudad).includes(f.ciudad)) return false;
    // La modalidad sale del perfil del tutor: «Presencial» incluye a «Virtual y presencial».
    if (f.modalidad && !normalizar(t.modalidad).includes(f.modalidad)) return false;
    // La fecha sí depende de la agenda: el tutor debe tener un bloque libre ese día.
    if (f.fecha && !t.disponibilidad.some((b) => b.fecha === f.fecha)) return false;
    return true;
  }
}
