import { normalizar } from "./texto.js";

// Dos franjas se solapan si son el mismo día y se cruzan (HH:MM compara bien como texto).
export function seSolapan(a, b) {
  return a.fecha === b.fecha && a.horaInicio < b.horaFin && b.horaInicio < a.horaFin;
}

// "Virtual" y "Virtual y presencial" generan sala de videoconferencia.
export function esVirtual(modalidad) {
  return normalizar(modalidad).includes("virtual");
}

// Reloj inyectable: en producción usa la hora de Bogotá; en pruebas se fija a mano.
export class Reloj {
  constructor({ zona = "America/Bogota", ahoraFn = () => new Date() } = {}) {
    this.zona = zona;
    this.ahoraFn = ahoraFn;
  }

  ahora() {
    const partes = new Intl.DateTimeFormat("en-CA", {
      timeZone: this.zona,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(this.ahoraFn());
    const p = Object.fromEntries(partes.map((x) => [x.type, x.value]));
    return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
  }

  // ¿La franja que termina en (fecha, hora) ya pasó?
  yaPaso(fecha, hora) {
    const a = this.ahora();
    return fecha < a.fecha || (fecha === a.fecha && hora <= a.hora);
  }
}
