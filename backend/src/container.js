// Raíz de composición: aquí (y solo aquí) se "enchufan" las dependencias concretas.
import { env } from "./config/env.js";
import { getAuthAdmin } from "./config/firebase.js";
import { UsuarioRepository } from "./repositories/UsuarioRepository.js";
import { SolicitudRepository } from "./repositories/SolicitudRepository.js";
import { TutoriaRepository } from "./repositories/TutoriaRepository.js";
import { CalificacionRepository } from "./repositories/CalificacionRepository.js";
import { ReservaRepository } from "./repositories/ReservaRepository.js";
import { HojaVidaRepository } from "./repositories/HojaVidaRepository.js";
import { SoporteRepository } from "./repositories/SoporteRepository.js";
import { MateriaRepository } from "./repositories/MateriaRepository.js";
import { CambioPerfilRepository } from "./repositories/CambioPerfilRepository.js";
import { BandejaRepository } from "./repositories/BandejaRepository.js";
import { JitsiService } from "./services/JitsiService.js";
import { SmtpMailer, ConsolaMailer } from "./services/mailers.js";
import { NotificacionService } from "./services/NotificacionService.js";
import { TutorService } from "./services/TutorService.js";
import { SolicitudService } from "./services/SolicitudService.js";
import { TutoriaService } from "./services/TutoriaService.js";
import { CalificacionService } from "./services/CalificacionService.js";
import { UsuarioService } from "./services/UsuarioService.js";
import { SoporteService } from "./services/SoporteService.js";
import { AdminService } from "./services/AdminService.js";
import { MateriaService } from "./services/MateriaService.js";
import { CambioPerfilService } from "./services/CambioPerfilService.js";
import { BandejaService } from "./services/BandejaService.js";
import { Reloj } from "./utils/tiempo.js";
import { crearAutenticacion } from "./middlewares/autenticacion.js";
import { crearTutorController } from "./controllers/tutorController.js";
import { crearSolicitudController } from "./controllers/solicitudController.js";
import { crearTutoriaController } from "./controllers/tutoriaController.js";
import { crearCalificacionController } from "./controllers/calificacionController.js";
import { crearUsuarioController } from "./controllers/usuarioController.js";
import { crearSoporteController } from "./controllers/soporteController.js";
import { crearAdminController } from "./controllers/adminController.js";
import { crearMateriaController } from "./controllers/materiaController.js";
import { crearBandejaController } from "./controllers/bandejaController.js";

export function construirContenedor() {
  const reloj = new Reloj({ zona: env.zonaHoraria });

  const usuarioRepo = new UsuarioRepository();
  const solicitudRepo = new SolicitudRepository();
  const tutoriaRepo = new TutoriaRepository();
  const calificacionRepo = new CalificacionRepository();
  const reservaRepo = new ReservaRepository();
  const hojaVidaRepo = new HojaVidaRepository();
  const hojaVidaPendienteRepo = new HojaVidaRepository("hojasDeVidaPendientes");
  const soporteRepo = new SoporteRepository();
  const materiaRepo = new MateriaRepository();
  const cambioRepo = new CambioPerfilRepository();
  const bandejaRepo = new BandejaRepository();

  const mailer = env.correo.host ? new SmtpMailer(env.correo) : new ConsolaMailer();
  if (!env.correo.host) console.warn("SMTP_HOST vacío: los correos se imprimirán en la consola.");
  const notificaciones = new NotificacionService({ mailer });
  const videoconferencia = new JitsiService({ baseUrl: env.jitsiBaseUrl });

  const avisos = new BandejaService({ bandejaRepo, usuarioRepo });

  const tutorService = new TutorService({ usuarioRepo, tutoriaRepo, calificacionRepo, reloj });
  const solicitudService = new SolicitudService({
    usuarioRepo, solicitudRepo, tutoriaRepo, reservaRepo, notificaciones, avisos, videoconferencia, reloj
  });
  const tutoriaService = new TutoriaService({ usuarioRepo, tutoriaRepo, reservaRepo, notificaciones, avisos });
  const calificacionService = new CalificacionService({ tutoriaRepo, calificacionRepo, avisos });
  const materiaService = new MateriaService({ materiaRepo });
  const usuarioService = new UsuarioService({ usuarioRepo, hojaVidaRepo, reservaRepo, materiaService, avisos, reloj });
  const cambioPerfilService = new CambioPerfilService({
    usuarioRepo, cambioRepo, hojaVidaRepo, hojaVidaPendienteRepo, reservaRepo, materiaService, avisos
  });
  const soporteService = new SoporteService({ soporteRepo, avisos });
  const adminService = new AdminService({
    usuarioRepo, solicitudRepo, tutoriaRepo, calificacionRepo, soporteRepo, hojaVidaRepo, hojaVidaPendienteRepo, avisos
  });

  const { autenticar, identificar } = crearAutenticacion({
    verificarToken: (token) => getAuthAdmin().verifyIdToken(token),
    usuarioRepo
  });

  return {
    autenticar,
    identificar,
    controladores: {
      tutores: crearTutorController({ tutorService }),
      materias: crearMateriaController({ materiaService }),
      usuarios: crearUsuarioController({ usuarioService, cambioPerfilService }),
      solicitudes: crearSolicitudController({ solicitudService }),
      tutorias: crearTutoriaController({ tutoriaService }),
      calificaciones: crearCalificacionController({ calificacionService }),
      soporte: crearSoporteController({ soporteService }),
      notificaciones: crearBandejaController({ bandejaService: avisos }),
      admin: crearAdminController({ adminService, materiaService, cambioPerfilService })
    }
  };
}
