import { Conflicto, ErrorValidacion, NoEncontrado, Prohibido } from "../errores.js";
import { esTutorAprobado, modalidadesPermitidas } from "../utils/catalogos.js";
import { diferencias, validarHojaVida, validarPerfilTutor } from "../utils/perfilTutor.js";
import * as v from "../utils/validar.js";

const ETIQUETAS = {
  titulo: "carrera", nivelEstudios: "nivel de estudios", institucion: "institución", materias: "materias",
  nivelEnsenanza: "nivel de enseñanza", experiencia: "experiencia", modalidad: "modalidad", ciudad: "ciudad",
  tarifa: "tarifa", franjas: "franjas", presentacion: "presentación", hojaVidaPDF: "hoja de vida"
};

// Un bloque que la nueva modalidad no permite: «Virtual y presencial» se queda con la modalidad
// única del tutor; los demás se quitan.
function ajustarDisponibilidad(bloques, modalidad) {
  const permitidas = modalidadesPermitidas(modalidad);
  return (Array.isArray(bloques) ? bloques : []).flatMap((b) => {
    if (permitidas.includes(b.modalidad)) return [b];
    if (b.modalidad === "Virtual y presencial" && permitidas.length === 1) return [{ ...b, modalidad }];
    return [];
  });
}

// El tutor aprobado no edita sus datos profesionales directamente: envía una solicitud de
// actualización y un administrador la aprueba o la rechaza. Hasta entonces (y si la rechazan)
// el perfil, la búsqueda y la disponibilidad siguen con los datos vigentes.
export class CambioPerfilService {
  constructor({ usuarioRepo, cambioRepo, hojaVidaRepo, hojaVidaPendienteRepo, reservaRepo, materiaService, avisos }) {
    this.avisos = avisos;
    this.usuarioRepo = usuarioRepo;
    this.cambioRepo = cambioRepo;
    this.hojaVidaRepo = hojaVidaRepo;
    this.hojaVidaPendienteRepo = hojaVidaPendienteRepo;
    this.reservaRepo = reservaRepo;
    this.materiaService = materiaService;
  }

  // ------------------------------------------------------------------ tutor
  async obtenerMia(usuario) {
    this.#exigirTutorAprobado(usuario);
    return { solicitud: await this.cambioRepo.obtenerPorId(usuario.id) };
  }

  async solicitar(usuario, cuerpo = {}) {
    this.#exigirTutorAprobado(usuario);

    const propuesto = validarPerfilTutor(cuerpo, await this.materiaService.ids());
    const actual = await this.usuarioRepo.obtenerPorId(usuario.id);
    if (!actual) throw new NoEncontrado("No se encontró tu perfil");

    const cambios = diferencias(actual, propuesto);
    let hojaVida = null;
    if (cuerpo.hojaVida !== undefined && cuerpo.hojaVida !== null) {
      hojaVida = validarHojaVida(cuerpo.hojaVida);
      cambios.hojaVidaPDF = hojaVida.nombreArchivo;
    }
    if (Object.keys(cambios).length === 0) throw new ErrorValidacion("No cambiaste ningún dato");

    // Primero el PDF y después la solicitud: si algo falla en medio no queda una solicitud sin archivo.
    if (hojaVida) await this.hojaVidaPendienteRepo.guardar(usuario.id, hojaVida);
    else await this.hojaVidaPendienteRepo.eliminar(usuario.id); // por si había uno de una solicitud anterior
    await this.cambioRepo.guardar(usuario.id, {
      tutorNombre: `${actual.nombre || ""} ${actual.apellido || ""}`.trim(),
      tutorEmail: actual.email || "",
      estado: "pendiente",
      cambios,
      tieneHojaVida: Boolean(hojaVida)
    });
    const nombre = `${actual.nombre || ""} ${actual.apellido || ""}`.trim() || "Un tutor";
    await this.avisos.avisarAdmins({
      tipo: "cambio-solicitado",
      titulo: "Actualización de datos de un tutor",
      detalle: `${nombre} pidió cambiar: ${Object.keys(cambios).map((c) => ETIQUETAS[c] || c).join(", ")}.`,
      destino: { seccion: "tutores", pestana: "updates", id: usuario.id }
    });
    return { estado: "pendiente", cambios };
  }

  async cancelar(usuario) {
    this.#exigirTutorAprobado(usuario);
    const solicitud = await this.cambioRepo.obtenerPorId(usuario.id);
    if (!solicitud) throw new NoEncontrado("No tienes una solicitud de actualización");
    if (solicitud.estado !== "pendiente") throw new Conflicto("Esa solicitud ya fue respondida");
    await this.hojaVidaPendienteRepo.eliminar(usuario.id);
    await this.cambioRepo.eliminar(usuario.id);
    return { cancelada: true };
  }

  // ------------------------------------------------------------------ admin
  listar() {
    return this.cambioRepo.listarTodos();
  }

  async resolver(admin, tutorId, cuerpo = {}) {
    const estado = v.opcion(cuerpo.estado, ["aprobada", "rechazada"], "estado");
    const nota = v.texto(cuerpo.nota, "nota", { max: 300, opcional: true });

    const solicitud = await this.cambioRepo.obtenerPorId(tutorId);
    if (!solicitud) throw new NoEncontrado("Solicitud de actualización no encontrada");
    if (solicitud.estado !== "pendiente") throw new Conflicto("Esta solicitud ya fue respondida");

    if (estado === "aprobada") {
      await this.#aplicar(tutorId, solicitud);
    } else if (solicitud.tieneHojaVida) {
      await this.hojaVidaPendienteRepo.eliminar(tutorId);
    }
    await this.cambioRepo.resolver(tutorId, estado, admin.id, nota);
    await this.avisos.avisar(tutorId, {
      tipo: estado === "aprobada" ? "cambio-aprobado" : "cambio-rechazado",
      titulo: estado === "aprobada" ? "Tu actualización de datos fue aprobada" : "Tu actualización de datos fue rechazada",
      detalle: nota || (estado === "aprobada"
        ? "Los cambios ya están en tu perfil."
        : "Tu perfil sigue con los datos anteriores."),
      destino: { seccion: "perfil" }
    });
    return { id: tutorId, estado, nota };
  }

  // Los datos nuevos pasan al perfil. Si cambió la modalidad, los bloques de disponibilidad
  // que ya no encajan se ajustan en la misma transacción. Si algo falla antes de marcar la
  // solicitud como aprobada, sigue pendiente y el administrador puede repetir la decisión.
  async #aplicar(tutorId, solicitud) {
    const { cambios } = solicitud;
    await this.reservaRepo.transaccion(async (tx) => {
      const tutor = await tx.obtenerUsuario(tutorId);
      if (!tutor || tutor.rol !== "tutor") throw new NoEncontrado("El tutor ya no existe");
      const datos = { ...cambios };
      if (solicitud.tieneHojaVida) datos.tieneHojaVida = true;
      if (cambios.modalidad) datos.disponibilidad = ajustarDisponibilidad(tutor.disponibilidad, cambios.modalidad);
      tx.actualizarUsuario(tutorId, datos);
    });

    if (solicitud.tieneHojaVida) {
      const hoja = await this.hojaVidaPendienteRepo.obtenerPorId(tutorId);
      if (hoja) {
        await this.hojaVidaRepo.guardar(tutorId, {
          nombreArchivo: hoja.nombreArchivo, tamano: hoja.tamano, dataURL: hoja.dataURL
        });
      }
      await this.hojaVidaPendienteRepo.eliminar(tutorId);
    }
  }

  #exigirTutorAprobado(usuario) {
    if (!esTutorAprobado(usuario)) {
      throw new Prohibido("Solo un tutor aprobado puede pedir cambios en su perfil profesional");
    }
  }
}
