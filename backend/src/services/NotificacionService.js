import { plantillas } from "./plantillasCorreo.js";

// Envía correos "al mejor esfuerzo": si el correo falla, la reserva NO se deshace.
export class NotificacionService {
  constructor({ mailer }) {
    this.mailer = mailer;
  }

  async #enviar(para, correo) {
    if (!para) return;
    try {
      await this.mailer.enviar({ para, asunto: correo.asunto, html: correo.html, texto: correo.texto });
    } catch (error) {
      console.error(`No se pudo enviar el correo a ${para}:`, error.message);
    }
  }

  nuevaSolicitud({ tutor, solicitud }) {
    return this.#enviar(tutor?.email, plantillas.nuevaSolicitud(solicitud));
  }

  solicitudRechazada({ estudiante, solicitud }) {
    return this.#enviar(estudiante?.email, plantillas.solicitudRechazada(solicitud));
  }

  // Registro de la tutoría para AMBOS participantes.
  async tutoriaProgramada({ tutor, estudiante, tutoria }) {
    await Promise.all([
      this.#enviar(tutor?.email, plantillas.tutoriaProgramada(tutoria, tutoria.estudianteNombre)),
      this.#enviar(estudiante?.email, plantillas.tutoriaProgramada(tutoria, tutoria.tutorNombre))
    ]);
  }

  tutoriaCancelada({ destinatario, tutoria, canceladaPor }) {
    return this.#enviar(destinatario?.email, plantillas.tutoriaCancelada(tutoria, canceladaPor));
  }
}
