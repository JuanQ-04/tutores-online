import * as v from "../utils/validar.js";

const nombreCompleto = (u) => `${u.nombre || ""} ${u.apellido || ""}`.trim();

// Centro de ayuda: cualquier usuario con sesión escribe al equipo de soporte.
export class SoporteService {
  constructor({ soporteRepo, avisos }) {
    this.soporteRepo = soporteRepo;
    this.avisos = avisos;
  }

  // Quién escribe (id, nombre, correo y rol) lo pone el servidor, no el cliente.
  async crear(usuario, cuerpo = {}) {
    const datos = {
      usuarioId: usuario.id,
      usuarioNombre: nombreCompleto(usuario) || "Usuario",
      usuarioEmail: usuario.email || "",
      rol: usuario.rol,
      asunto: v.texto(cuerpo.asunto, "asunto", { max: 120 }),
      mensaje: v.texto(cuerpo.mensaje, "mensaje", { max: 1000 }),
      estado: "abierto"
    };
    const id = await this.soporteRepo.crear(datos);
    await this.avisos.avisarAdmins({
      tipo: "soporte-nuevo",
      titulo: "Nuevo caso de soporte",
      detalle: `${datos.usuarioNombre}: ${datos.asunto}`,
      destino: { seccion: "soporte", id }
    });
    return { id, ...datos };
  }
}
