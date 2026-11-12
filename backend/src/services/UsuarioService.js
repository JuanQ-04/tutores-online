import { randomBytes } from "node:crypto";
import { Conflicto, ErrorValidacion, NoEncontrado, Prohibido } from "../errores.js";
import { esTutorAprobado } from "../utils/roles.js";
import { seSolapan } from "../utils/tiempo.js";
import { MODALIDADES, ROLES_REGISTRABLES, modalidadesPermitidas } from "../utils/catalogos.js";
import { validarHojaVida, validarPerfilTutor } from "../utils/perfilTutor.js";
import * as v from "../utils/validar.js";

const MAX_BLOQUES = 200;
const MAX_FOTO = 200_100;      // mismo límite que aplica js/foto-perfil.js
const PATRON_FOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

const aMinutos = (hora) => {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
};

// Perfil, foto, disponibilidad y solicitud de verificación de tutor.
const nombreCompleto = (u) => `${u.nombre || ""} ${u.apellido || ""}`.trim();

export class UsuarioService {
  constructor({ usuarioRepo, hojaVidaRepo, reservaRepo, materiaService, avisos, reloj }) {
    this.usuarioRepo = usuarioRepo;
    this.hojaVidaRepo = hojaVidaRepo;
    this.reservaRepo = reservaRepo;
    this.materiaService = materiaService;
    this.avisos = avisos;
    this.reloj = reloj;
  }

  // ---------------------------------------------------------------- registro
  // Crea el perfil de quien acaba de registrarse en Firebase Auth (correo o Google).
  // El rol «admin» NO se puede pedir aquí: se asigna a mano en la base de datos.
  // Si el perfil ya existe lo devuelve tal cual (el login con Google lo llama siempre).
  async registrar(identidad, cuerpo = {}) {
    if (identidad.perfil) return { perfil: identidad.perfil, creado: false };

    const nombre = v.textoConLetras(cuerpo.nombre, "nombre", { max: 60 });
    const apellido = v.textoConLetras(cuerpo.apellido, "apellido", { max: 60 });
    const rol = v.opcion(cuerpo.rol, ROLES_REGISTRABLES, "rol");
    if (!identidad.email) throw new ErrorValidacion("Tu cuenta no tiene un correo asociado");

    const perfil = await this.usuarioRepo.crear(identidad.id, {
      nombre,
      apellido,
      email: identidad.email,
      rol,
      activo: true,
      // Ciclo de vida del tutor: incompleto → pendiente → aprobado | rechazado.
      estado: rol === "tutor" ? "incompleto" : "activo"
    });
    return { perfil, creado: true };
  }

  async miPerfil(identidad) {
    if (!identidad.perfil) throw new NoEncontrado("Tu perfil no existe en la plataforma");
    return identidad.perfil;
  }

  // ------------------------------------------------------------------ perfil
  // Solo nombre y apellido: nunca el rol, el estado ni el correo. Los datos profesionales del
  // tutor (materias, modalidad, tarifa, ciudad…) cambian solo con la aprobación de un
  // administrador: ver CambioPerfilService.
  async actualizarPerfil(usuario, cuerpo = {}) {
    const cambios = {};
    if (cuerpo.nombre !== undefined) cambios.nombre = v.textoConLetras(cuerpo.nombre, "nombre", { max: 60 });
    if (cuerpo.apellido !== undefined) cambios.apellido = v.textoConLetras(cuerpo.apellido, "apellido", { max: 60 });
    if (Object.keys(cambios).length === 0) throw new ErrorValidacion("No hay cambios válidos que guardar");

    await this.usuarioRepo.actualizar(usuario.id, cambios);
    return cambios;
  }

  async guardarFoto(usuario, fotoURL) {
    const foto = v.dataURL(fotoURL, "fotoURL", { patron: PATRON_FOTO, max: MAX_FOTO });
    await this.usuarioRepo.actualizar(usuario.id, { fotoURL: foto });
    return { fotoURL: foto };
  }

  // ----------------------------------------------------------- disponibilidad
  // Agregar o quitar UN bloque (en vez de reemplazar todo el arreglo) evita pisar los
  // cambios que el servidor hace al completar una tutoría. Va en transacción.
  async agregarBloque(usuario, cuerpo = {}) {
    this.#exigirTutorAprobado(usuario, "gestionar su disponibilidad");
    const bloque = this.#validarBloque(cuerpo);

    return this.reservaRepo.transaccion(async (tx) => {
      const tutor = await tx.obtenerUsuario(usuario.id);
      if (!tutor) throw new NoEncontrado("No se encontró tu perfil");
      const actuales = Array.isArray(tutor.disponibilidad) ? tutor.disponibilidad : [];
      if (actuales.length >= MAX_BLOQUES) throw new Conflicto("Llegaste al máximo de bloques de disponibilidad");
      if (actuales.some((b) => seSolapan(bloque, b))) {
        throw new Conflicto("Ese horario se cruza con un bloque existente");
      }
      const programadas = await tx.tutoriasProgramadas(usuario.id, bloque.fecha);
      if (programadas.some((t) => seSolapan(bloque, t))) {
        throw new Conflicto("Ese horario se cruza con una tutoría programada");
      }

      // El bloque debe ser de la modalidad que el tutor eligió en su perfil.
      const permitidas = modalidadesPermitidas(tutor.modalidad);
      if (!permitidas.includes(bloque.modalidad)) {
        const plural = { Virtual: "virtuales", Presencial: "presenciales" }[tutor.modalidad];
        throw new ErrorValidacion(
          `Tu perfil es «${tutor.modalidad}»: solo puedes ofrecer bloques ${plural}. ` +
          "Para cambiarlo, pide una actualización de tus datos desde «Mi perfil»."
        );
      }

      const nuevo = { id: `block-${randomBytes(6).toString("hex")}`, ...bloque };
      const disponibilidad = [...actuales, nuevo];
      tx.actualizarUsuario(usuario.id, { disponibilidad });
      return { bloque: nuevo, disponibilidad };
    });
  }

  async quitarBloque(usuario, bloqueId) {
    this.#exigirTutorAprobado(usuario, "gestionar su disponibilidad");
    return this.reservaRepo.transaccion(async (tx) => {
      const tutor = await tx.obtenerUsuario(usuario.id);
      if (!tutor) throw new NoEncontrado("No se encontró tu perfil");
      const actuales = Array.isArray(tutor.disponibilidad) ? tutor.disponibilidad : [];
      if (!actuales.some((b) => b.id === bloqueId)) throw new NoEncontrado("Ese bloque no existe");
      const disponibilidad = actuales.filter((b) => b.id !== bloqueId);
      tx.actualizarUsuario(usuario.id, { disponibilidad });
      return { disponibilidad };
    });
  }

  #validarBloque(cuerpo) {
    const fecha = v.fecha(cuerpo.fecha);
    const horaInicio = v.hora(cuerpo.horaInicio, "horaInicio");
    const horaFin = v.hora(cuerpo.horaFin, "horaFin");
    const modalidad = v.opcion(cuerpo.modalidad, MODALIDADES, "modalidad");

    const inicio = aMinutos(horaInicio);
    const fin = aMinutos(horaFin);
    if (fin <= inicio) throw new ErrorValidacion("La hora de fin debe ser posterior a la de inicio");
    if (inicio < 480 || fin > 1200 || inicio % 30 !== 0 || fin % 30 !== 0) {
      throw new ErrorValidacion("Usa horarios entre 08:00 y 20:00, en intervalos de 30 minutos");
    }
    if (this.reloj.yaPaso(fecha, horaFin)) throw new ErrorValidacion("No puedes crear un bloque en el pasado");
    return { fecha, horaInicio, horaFin, modalidad };
  }

  // ------------------------------------------------- solicitud de verificación
  // El tutor completa su perfil profesional y adjunta la hoja de vida (PDF). Solo se
  // puede mientras su estado es «incompleto»; después queda «pendiente» para el admin.
  async enviarSolicitudTutor(usuario, cuerpo = {}) {
    if (usuario.estado !== "incompleto") {
      throw new Conflicto("Tu solicitud ya fue enviada. El equipo la está revisando o ya respondió");
    }

    // Todo el formulario: formación, materias, modalidad, tarifa, ciudad, franjas y presentación.
    const perfil = validarPerfilTutor(cuerpo, await this.materiaService.ids());
    const hojaVida = validarHojaVida(cuerpo.hojaVida ?? {});

    // Primero el PDF y después el cambio de estado: si algo falla en medio, el estado sigue
    // «incompleto» y el tutor puede reintentar sin quedar a medias.
    await this.hojaVidaRepo.guardar(usuario.id, hojaVida);
    await this.usuarioRepo.enviarSolicitudTutor(usuario.id, {
      ...perfil,
      hojaVidaPDF: hojaVida.nombreArchivo,
      tieneHojaVida: true,
      estado: "pendiente"
    });
    await this.avisos.avisarAdmins({
      tipo: "tutor-solicitud",
      titulo: "Nueva solicitud de tutor",
      detalle: `${nombreCompleto(usuario) || "Un tutor"} envió su solicitud de verificación.`,
      destino: { seccion: "tutores", pestana: "pending", id: usuario.id }
    });
    return { estado: "pendiente" };
  }

  #exigirTutorAprobado(usuario, accion) {
    if (!esTutorAprobado(usuario)) throw new Prohibido(`Solo un tutor aprobado puede ${accion}`);
  }
}
