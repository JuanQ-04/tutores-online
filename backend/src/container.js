// Raíz de composición: aquí (y solo aquí) se "enchufan" las dependencias concretas.
import { env } from "./config/env.js";
import { getAuthAdmin } from "./config/firebase.js";
import { UsuarioRepository } from "./repositories/UsuarioRepository.js";
import { SolicitudRepository } from "./repositories/SolicitudRepository.js";
import { TutoriaRepository } from "./repositories/TutoriaRepository.js";
import { CalificacionRepository } from "./repositories/CalificacionRepository.js";
import { ReservaRepository } from "./repositories/ReservaRepository.js";
import { JitsiService } from "./services/JitsiService.js";
import { SmtpMailer, ConsolaMailer } from "./services/mailers.js";
import { NotificacionService } from "./services/NotificacionService.js";
import { TutorService } from "./services/TutorService.js";
import { SolicitudService } from "./services/SolicitudService.js";
import { TutoriaService } from "./services/TutoriaService.js";
import { CalificacionService } from "./services/CalificacionService.js";
import { Reloj } from "./utils/tiempo.js";
import { crearAutenticacion } from "./middlewares/autenticacion.js";
import { crearTutorController } from "./controllers/tutorController.js";
import { crearSolicitudController } from "./controllers/solicitudController.js";
import { crearTutoriaController } from "./controllers/tutoriaController.js";
import { crearCalificacionController } from "./controllers/calificacionController.js";

export function construirContenedor() {
  const reloj = new Reloj({ zona: env.zonaHoraria });

  const usuarioRepo = new UsuarioRepository();
  const solicitudRepo = new SolicitudRepository();
  const tutoriaRepo = new TutoriaRepository();
  const calificacionRepo = new CalificacionRepository();
  const reservaRepo = new ReservaRepository();

  const mailer = env.correo.host ? new SmtpMailer(env.correo) : new ConsolaMailer();
  if (!env.correo.host) console.warn("SMTP_HOST vacío: los correos se imprimirán en la consola.");
  const notificaciones = new NotificacionService({ mailer });
  const videoconferencia = new JitsiService({ baseUrl: env.jitsiBaseUrl });

  const tutorService = new TutorService({ usuarioRepo, tutoriaRepo, calificacionRepo, reloj });
  const solicitudService = new SolicitudService({
    usuarioRepo, solicitudRepo, tutoriaRepo, reservaRepo, notificaciones, videoconferencia, reloj
  });
  const tutoriaService = new TutoriaService({ usuarioRepo, tutoriaRepo, reservaRepo, notificaciones });
  const calificacionService = new CalificacionService({ tutoriaRepo, calificacionRepo });

  const autenticar = crearAutenticacion({
    verificarToken: (token) => getAuthAdmin().verifyIdToken(token),
    usuarioRepo
  });

  return {
    autenticar,
    controladores: {
      tutores: crearTutorController({ tutorService }),
      solicitudes: crearSolicitudController({ solicitudService }),
      tutorias: crearTutoriaController({ tutoriaService }),
      calificaciones: crearCalificacionController({ calificacionService })
    }
  };
}
