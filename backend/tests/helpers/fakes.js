// Dobles de prueba en memoria: permiten probar las reglas SIN Firebase ni internet.
import { Reloj } from "../../src/utils/tiempo.js";

export const relojFijo = (iso = "2026-11-11T15:00:00Z") =>
  new Reloj({ zona: "America/Bogota", ahoraFn: () => new Date(iso) }); // = 2026-11-11 10:00 en Bogotá

export function crearMundo() {
  const datos = {
    usuarios: new Map(),
    solicitudes: new Map(),
    tutorias: new Map(),
    calificaciones: new Map()
  };
  let contador = 0;
  const nuevoId = (p) => `${p}${++contador}`;
  const copia = (o) => (o ? structuredClone(o) : null);

  const usuarioRepo = {
    async obtenerPorId(id) { return copia(datos.usuarios.get(id)); },
    async listarTutoresVisibles() {
      return [...datos.usuarios.values()]
        .filter((u) => u.rol === "tutor" && ["aprobado", "aceptado"].includes(u.estado) && u.activo !== false)
        .map(copia);
    }
  };
  const solicitudRepo = {
    async obtenerPorId(id) { return copia(datos.solicitudes.get(id)); },
    async crear(d) { const id = nuevoId("sol"); datos.solicitudes.set(id, { id, ...d }); return id; },
    async existePendiente({ estudianteId, tutorId, fecha, horaInicio }) {
      return [...datos.solicitudes.values()].some((s) => s.estado === "pendiente" &&
        s.estudianteId === estudianteId && s.tutorId === tutorId && s.fecha === fecha && s.horaInicio === horaInicio);
    },
    async listarPorEstudiante(uid) { return [...datos.solicitudes.values()].filter((s) => s.estudianteId === uid).map(copia); },
    async listarPorTutor(uid) { return [...datos.solicitudes.values()].filter((s) => s.tutorId === uid).map(copia); }
  };
  const tutoriaRepo = {
    async obtenerPorId(id) { return copia(datos.tutorias.get(id)); },
    async listarProgramadas(tutorId) {
      return [...datos.tutorias.values()].filter((t) => t.estado === "programada" && (!tutorId || t.tutorId === tutorId)).map(copia);
    },
    async listarPorEstudiante(uid) { return [...datos.tutorias.values()].filter((t) => t.estudianteId === uid).map(copia); },
    async listarPorTutor(uid) { return [...datos.tutorias.values()].filter((t) => t.tutorId === uid).map(copia); }
  };
  const calificacionRepo = {
    async crear(id, d) {
      if (datos.calificaciones.has(id)) {
        const { Conflicto } = await import("../../src/errores.js");
        throw new Conflicto("Esta tutoría ya fue calificada");
      }
      datos.calificaciones.set(id, { id, ...d });
    },
    async listarVisiblesPorTutor(tutorId) {
      return [...datos.calificaciones.values()].filter((c) => c.tutorId === tutorId && c.estado === "visible").map(copia);
    },
    async resumenPorTutor(tutorId) {
      const r = {};
      for (const c of datos.calificaciones.values()) {
        if (c.estado !== "visible" || (tutorId && c.tutorId !== tutorId)) continue;
        r[c.tutorId] ??= { suma: 0, n: 0 };
        r[c.tutorId].suma += c.estrellas; r[c.tutorId].n += 1;
      }
      return Object.fromEntries(Object.entries(r).map(([k, x]) => [k, { promedio: Math.round((x.suma / x.n) * 10) / 10, opiniones: x.n }]));
    }
  };
  // Transacción simulada: ejecuta fn con acceso directo a los mapas.
  const reservaRepo = {
    async transaccion(fn) {
      const tx = {
        async obtenerSolicitud(id) { return copia(datos.solicitudes.get(id)); },
        async obtenerTutoria(id) { return copia(datos.tutorias.get(id)); },
        async tutoriasProgramadas(tutorId, fecha) {
          return [...datos.tutorias.values()].filter((t) => t.tutorId === tutorId && t.fecha === fecha && t.estado === "programada").map(copia);
        },
        actualizarSolicitud(id, d) { Object.assign(datos.solicitudes.get(id), d); },
        actualizarTutoria(id, d) { Object.assign(datos.tutorias.get(id), d); },
        crearTutoria(d) { const id = nuevoId("tut"); datos.tutorias.set(id, { id, ...d }); return id; }
      };
      return fn(tx);
    }
  };
  const correos = [];
  const notificaciones = {
    async nuevaSolicitud(x) { correos.push({ tipo: "nuevaSolicitud", ...x }); },
    async solicitudRechazada(x) { correos.push({ tipo: "solicitudRechazada", ...x }); },
    async tutoriaProgramada(x) { correos.push({ tipo: "tutoriaProgramada", ...x }); },
    async tutoriaCancelada(x) { correos.push({ tipo: "tutoriaCancelada", ...x }); }
  };
  const videoconferencia = { crearSala: () => "https://meet.jit.si/TutoresOnline-sala-de-prueba" };

  return { datos, usuarioRepo, solicitudRepo, tutoriaRepo, calificacionRepo, reservaRepo, notificaciones, videoconferencia, correos };
}

// Datos base: un tutor aprobado con un bloque virtual mañana, y un estudiante.
export function sembrar(mundo) {
  mundo.datos.usuarios.set("tutor1", {
    id: "tutor1", rol: "tutor", estado: "aprobado", nombre: "Ana", apellido: "Ruiz", email: "ana@test.com",
    ciudad: "Bogotá", materias: ["matematicas", "fisica"], tarifa: 40000, presentacion: "Ingeniera",
    disponibilidad: [
      { id: "b1", fecha: "2026-11-12", horaInicio: "15:00", horaFin: "16:00", modalidad: "Virtual" },
      { id: "b2", fecha: "2026-11-12", horaInicio: "15:30", horaFin: "16:30", modalidad: "Presencial" },
      { id: "b3", fecha: "2026-11-10", horaInicio: "09:00", horaFin: "10:00", modalidad: "Virtual" }
    ]
  });
  mundo.datos.usuarios.set("est1", { id: "est1", rol: "estudiante", estado: "activo", nombre: "Luis", apellido: "Perez", email: "luis@test.com" });
  mundo.datos.usuarios.set("est2", { id: "est2", rol: "estudiante", estado: "activo", nombre: "Marta", apellido: "Gil", email: "marta@test.com" });
  const tutorUsuario = { id: "tutor1", rol: "tutor", estado: "aprobado", nombre: "Ana", apellido: "Ruiz", email: "ana@test.com" };
  const est1 = { id: "est1", rol: "estudiante", estado: "activo", nombre: "Luis", apellido: "Perez", email: "luis@test.com" };
  const est2 = { id: "est2", rol: "estudiante", estado: "activo", nombre: "Marta", apellido: "Gil", email: "marta@test.com" };
  return { tutorUsuario, est1, est2 };
}

export const cuerpoSolicitud = (extra = {}) => ({
  tutorId: "tutor1", materia: "Matemáticas", fecha: "2026-11-12",
  horaInicio: "15:00", horaFin: "16:00", modalidad: "Virtual", mensaje: "Necesito ayuda con derivadas", ...extra
});
