import { randomBytes } from "node:crypto";

// Puerto "Videoconferencia": cualquier clase con crearSala() -> url sirve
// (Jitsi hoy; Google Meet o Teams mañana, sin tocar SolicitudService).
export class JitsiService {
  constructor({ baseUrl = "https://meet.jit.si", generarId = () => randomBytes(9).toString("hex") } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.generarId = generarId;
  }

  // Nombre de sala aleatorio: quien no tenga el enlace no puede adivinarlo.
  crearSala() {
    return `${this.baseUrl}/TutoresOnline-${this.generarId()}`;
  }
}
