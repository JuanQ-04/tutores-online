import { getDb, FieldValue } from "../config/firebase.js";
import { Conflicto } from "../errores.js";
import { aObjeto, porFechaDesc, yaExiste } from "./utils.js";

export const ESTADOS_TUTOR_VISIBLE = ["aprobado", "aceptado"];

export class UsuarioRepository {
  get #col() { return getDb().collection("usuarios"); }

  async obtenerPorId(uid) {
    const doc = await this.#col.doc(uid).get();
    return doc.exists ? aObjeto(doc) : null;
  }

  // Alta del perfil: falla si ya existe (el id del documento es el uid de Firebase Auth).
  async crear(uid, datos) {
    try {
      await this.#col.doc(uid).create({ ...datos, creadoEn: FieldValue.serverTimestamp() });
    } catch (error) {
      if (yaExiste(error)) throw new Conflicto("El perfil ya existe");
      throw error;
    }
    return this.obtenerPorId(uid);
  }

  async actualizar(uid, cambios) {
    await this.#col.doc(uid).update(cambios);
  }

  // El tutor envía su solicitud de verificación: perfil profesional + paso a «pendiente».
  async enviarSolicitudTutor(uid, datos) {
    await this.#col.doc(uid).update({ ...datos, solicitudEnviadaEn: FieldValue.serverTimestamp() });
  }

  // Decisión del administrador sobre un tutor (aprobado / rechazado).
  async registrarRevision(uid, estado, adminId) {
    await this.#col.doc(uid).update({
      estado,
      revisadoPor: adminId,
      revisadoEn: FieldValue.serverTimestamp()
    });
  }

  async listarTutoresVisibles() {
    const snap = await this.#col
      .where("rol", "==", "tutor")
      .where("estado", "in", ESTADOS_TUTOR_VISIBLE)
      .get();
    return snap.docs.map(aObjeto).filter((t) => t.activo !== false);
  }

  // Solo para el administrador. Con «rol» devuelve únicamente ese rol.
  async listarTodos(rol) {
    const snap = await (rol ? this.#col.where("rol", "==", rol) : this.#col).get();
    return snap.docs.map(aObjeto).sort(porFechaDesc);
  }
}
