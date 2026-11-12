// Dobles de prueba en memoria: permiten probar las reglas SIN Firebase ni internet.
import { Reloj } from "../../src/utils/tiempo.js";
import { MateriaService } from "../../src/services/MateriaService.js";
import { BandejaService } from "../../src/services/BandejaService.js";

export const relojFijo = (iso = "2026-11-11T15:00:00Z") =>
  new Reloj({ zona: "America/Bogota", ahoraFn: () => new Date(iso) }); // = 2026-11-11 10:00 en Bogotá

export function crearMundo() {
  const datos = {
    usuarios: new Map(),
    solicitudes: new Map(),
    tutorias: new Map(),
    calificaciones: new Map(),
    hojasDeVida: new Map(),
    hojasPendientes: new Map(),
    soporte: new Map(),
    materias: new Map(),
    cambios: new Map(),
    bandeja: new Map() // uid → avisos (el más nuevo al final)
  };
  let contador = 0;
  const nuevoId = (p) => `${p}${++contador}`;
  const copia = (o) => (o ? structuredClone(o) : null);

  const usuarioRepo = {
    async obtenerPorId(id) { return copia(datos.usuarios.get(id)); },
    async crear(id, d) {
      if (datos.usuarios.has(id)) {
        const { Conflicto } = await import("../../src/errores.js");
        throw new Conflicto("El perfil ya existe");
      }
      datos.usuarios.set(id, { id, ...d, creadoEn: "2026-11-11T15:00:00.000Z" });
      return copia(datos.usuarios.get(id));
    },
    async actualizar(id, cambios) { Object.assign(datos.usuarios.get(id), cambios); },
    async enviarSolicitudTutor(id, d) {
      Object.assign(datos.usuarios.get(id), d, { solicitudEnviadaEn: "2026-11-11T15:00:00.000Z" });
    },
    async registrarRevision(id, estado, adminId) {
      Object.assign(datos.usuarios.get(id), { estado, revisadoPor: adminId, revisadoEn: "2026-11-11T15:00:00.000Z" });
    },
    async listarTodos(rol) { return [...datos.usuarios.values()].filter((u) => !rol || u.rol === rol).map(copia); },
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
    async listarPorTutor(uid) { return [...datos.solicitudes.values()].filter((s) => s.tutorId === uid).map(copia); },
    async listarTodas() { return [...datos.solicitudes.values()].map(copia); }
  };
  const tutoriaRepo = {
    async obtenerPorId(id) { return copia(datos.tutorias.get(id)); },
    async listarProgramadas(tutorId) {
      return [...datos.tutorias.values()].filter((t) => t.estado === "programada" && (!tutorId || t.tutorId === tutorId)).map(copia);
    },
    async listarPorEstudiante(uid) { return [...datos.tutorias.values()].filter((t) => t.estudianteId === uid).map(copia); },
    async listarPorTutor(uid) { return [...datos.tutorias.values()].filter((t) => t.tutorId === uid).map(copia); },
    async listarTodas() { return [...datos.tutorias.values()].map(copia); }
  };
  const calificacionRepo = {
    async crear(id, d) {
      if (datos.calificaciones.has(id)) {
        const { Conflicto } = await import("../../src/errores.js");
        throw new Conflicto("Esta tutoría ya fue calificada");
      }
      datos.calificaciones.set(id, { id, ...d });
    },
    async obtenerPorId(id) { return copia(datos.calificaciones.get(id)); },
    async moderar(id, cambios, adminId) {
      Object.assign(datos.calificaciones.get(id), cambios, { editadaPorAdmin: adminId });
    },
    async listarPorEstudiante(uid) { return [...datos.calificaciones.values()].filter((c) => c.estudianteId === uid).map(copia); },
    async listarPorTutor(uid) { return [...datos.calificaciones.values()].filter((c) => c.tutorId === uid).map(copia); },
    async listarTodas() { return [...datos.calificaciones.values()].map(copia); },
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
        async obtenerUsuario(id) { return copia(datos.usuarios.get(id)); },
        async tutoriasProgramadas(tutorId, fecha) {
          return [...datos.tutorias.values()].filter((t) => t.tutorId === tutorId && t.fecha === fecha && t.estado === "programada").map(copia);
        },
        actualizarSolicitud(id, d) { Object.assign(datos.solicitudes.get(id), d); },
        actualizarTutoria(id, d) { Object.assign(datos.tutorias.get(id), d); },
        actualizarUsuario(id, d) { Object.assign(datos.usuarios.get(id), d); },
        crearTutoria(d) { const id = nuevoId("tut"); datos.tutorias.set(id, { id, ...d }); return id; }
      };
      return fn(tx);
    }
  };
  const hojaVidaRepo = {
    async obtenerPorId(id) { return copia(datos.hojasDeVida.get(id)); },
    async guardar(id, d) { datos.hojasDeVida.set(id, { id, ...d, tutorId: id }); },
    async eliminar(id) { datos.hojasDeVida.delete(id); }
  };
  const hojaVidaPendienteRepo = {
    async obtenerPorId(id) { return copia(datos.hojasPendientes.get(id)); },
    async guardar(id, d) { datos.hojasPendientes.set(id, { id, ...d, tutorId: id }); },
    async eliminar(id) { datos.hojasPendientes.delete(id); }
  };
  const materiaRepo = {
    async listar() { return [...datos.materias.values()].map(copia); },
    async crear(id, d) {
      if (datos.materias.has(id)) {
        const { Conflicto } = await import("../../src/errores.js");
        throw new Conflicto("Ya existe una materia con ese nombre");
      }
      datos.materias.set(id, { id, ...d });
    }
  };
  const materiaService = new MateriaService({ materiaRepo });
  const cambioRepo = {
    async obtenerPorId(id) { return copia(datos.cambios.get(id)); },
    async guardar(id, d) { datos.cambios.set(id, { id, ...d, tutorId: id, creadaEn: "2026-11-11T15:00:00.000Z" }); },
    async eliminar(id) { datos.cambios.delete(id); },
    async resolver(id, estado, adminId, nota) {
      Object.assign(datos.cambios.get(id), { estado, nota, revisadaPor: adminId, revisadaEn: "2026-11-11T16:00:00.000Z" });
    },
    async listarTodos() { return [...datos.cambios.values()].map(copia); }
  };
  const soporteRepo = {
    async obtenerPorId(id) { return copia(datos.soporte.get(id)); },
    async crear(d) { const id = nuevoId("caso"); datos.soporte.set(id, { id, ...d }); return id; },
    async actualizar(id, cambios) { Object.assign(datos.soporte.get(id), cambios); },
    async listarTodos() { return [...datos.soporte.values()].map(copia); }
  };
  const bandejaRepo = {
    async crear(uid, d) {
      const lista = datos.bandeja.get(uid) || [];
      const id = nuevoId("aviso");
      lista.push({ id, ...d, leida: false, creadaEn: "2026-11-11T15:00:00.000Z" });
      datos.bandeja.set(uid, lista);
      return id;
    },
    async listar(uid, limite) { return [...(datos.bandeja.get(uid) || [])].reverse().slice(0, limite).map(copia); },
    async obtenerPorId(uid, id) { return copia((datos.bandeja.get(uid) || []).find((a) => a.id === id)); },
    async marcarLeida(uid, id) { (datos.bandeja.get(uid) || []).find((a) => a.id === id).leida = true; },
    async marcarTodas(uid) {
      const sin = (datos.bandeja.get(uid) || []).filter((a) => !a.leida);
      sin.forEach((a) => { a.leida = true; });
      return sin.length;
    }
  };
  const avisos = new BandejaService({ bandejaRepo, usuarioRepo });
  const correos = [];
  const notificaciones = {
    async nuevaSolicitud(x) { correos.push({ tipo: "nuevaSolicitud", ...x }); },
    async solicitudRechazada(x) { correos.push({ tipo: "solicitudRechazada", ...x }); },
    async tutoriaProgramada(x) { correos.push({ tipo: "tutoriaProgramada", ...x }); },
    async tutoriaCancelada(x) { correos.push({ tipo: "tutoriaCancelada", ...x }); }
  };
  const videoconferencia = { crearSala: () => "https://meet.jit.si/TutoresOnline-sala-de-prueba" };

  return {
    datos, usuarioRepo, solicitudRepo, tutoriaRepo, calificacionRepo, reservaRepo,
    hojaVidaRepo, hojaVidaPendienteRepo, materiaRepo, materiaService, cambioRepo,
    soporteRepo, notificaciones, videoconferencia, correos, bandejaRepo, avisos
  };
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
  mundo.datos.usuarios.set("admin1", { id: "admin1", rol: "admin", estado: "activo", nombre: "Root", apellido: "Admin", email: "admin@test.com" });
  mundo.datos.usuarios.set("nuevo1", { id: "nuevo1", rol: "tutor", estado: "incompleto", nombre: "Nora", apellido: "Vega", email: "nora@test.com", activo: true });
  const adminUsuario = { id: "admin1", rol: "admin", estado: "activo", nombre: "Root", apellido: "Admin", email: "admin@test.com" };
  const tutorNuevo = { id: "nuevo1", rol: "tutor", estado: "incompleto", nombre: "Nora", apellido: "Vega", email: "nora@test.com" };
  const tutorUsuario = { id: "tutor1", rol: "tutor", estado: "aprobado", nombre: "Ana", apellido: "Ruiz", email: "ana@test.com" };
  const est1 = { id: "est1", rol: "estudiante", estado: "activo", nombre: "Luis", apellido: "Perez", email: "luis@test.com" };
  const est2 = { id: "est2", rol: "estudiante", estado: "activo", nombre: "Marta", apellido: "Gil", email: "marta@test.com" };
  return { tutorUsuario, est1, est2, adminUsuario, tutorNuevo };
}

export const cuerpoSolicitud = (extra = {}) => ({
  tutorId: "tutor1", materia: "Matemáticas", fecha: "2026-11-12",
  horaInicio: "15:00", horaFin: "16:00", modalidad: "Virtual", mensaje: "Necesito ayuda con derivadas", ...extra
});
