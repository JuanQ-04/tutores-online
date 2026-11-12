import { NoEncontrado } from "../errores.js";

const MAX_LISTA = 60;
const recorta = (t, max) => String(t ?? "").slice(0, max);

// Notificaciones dentro de la plataforma (la campana de cada panel). Se guardan en la base de
// datos, así que siguen ahí al cerrar sesión o recargar. Distinto de NotificacionService, que envía correos.
//
// Cada aviso lleva un «destino» ({ seccion, id?, pestana? }) para que el panel sepa a dónde llevar
// al usuario cuando haga clic.
export class BandejaService {
  constructor({ bandejaRepo, usuarioRepo }) {
    this.bandejaRepo = bandejaRepo;
    this.usuarioRepo = usuarioRepo;
  }

  // Al mejor esfuerzo, como los correos: si falla, la operación que lo originó NO se deshace.
  async avisar(destinatarioId, { tipo, titulo, detalle = "", destino = {} }) {
    if (!destinatarioId) return;
    try {
      await this.bandejaRepo.crear(destinatarioId, {
        tipo: recorta(tipo, 40),
        titulo: recorta(titulo, 120),
        detalle: recorta(detalle, 1000),
        destino: {
          seccion: recorta(destino.seccion, 30),
          ...(destino.id ? { id: recorta(destino.id, 128) } : {}),
          ...(destino.pestana ? { pestana: recorta(destino.pestana, 30) } : {})
        }
      });
    } catch (error) {
      console.error(`No se pudo guardar la notificación de ${destinatarioId}:`, error.message);
    }
  }

  async avisarAdmins(aviso) {
    try {
      const admins = await this.usuarioRepo.listarTodos("admin");
      await Promise.all(admins.filter((a) => a.activo !== false).map((a) => this.avisar(a.id, aviso)));
    } catch (error) {
      console.error("No se pudo avisar a los administradores:", error.message);
    }
  }

  async listar(usuario) {
    const avisos = await this.bandejaRepo.listar(usuario.id, MAX_LISTA);
    return { avisos, sinLeer: avisos.filter((a) => !a.leida).length };
  }

  async marcarLeida(usuario, id) {
    const aviso = await this.bandejaRepo.obtenerPorId(usuario.id, id);
    if (!aviso) throw new NoEncontrado("Notificación no encontrada");
    if (!aviso.leida) await this.bandejaRepo.marcarLeida(usuario.id, id);
    return { id, leida: true };
  }

  async marcarTodas(usuario) {
    return { marcadas: await this.bandejaRepo.marcarTodas(usuario.id) };
  }
}
