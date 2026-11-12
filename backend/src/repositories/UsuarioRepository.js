import { getDb } from "../config/firebase.js";
import { aObjeto } from "./utils.js";

export const ESTADOS_TUTOR_VISIBLE = ["aprobado", "aceptado"];

export class UsuarioRepository {
  get #col() { return getDb().collection("usuarios"); }

  async obtenerPorId(uid) {
    const doc = await this.#col.doc(uid).get();
    return doc.exists ? aObjeto(doc) : null;
  }

  async listarTutoresVisibles() {
    const snap = await this.#col
      .where("rol", "==", "tutor")
      .where("estado", "in", ESTADOS_TUTOR_VISIBLE)
      .get();
    return snap.docs.map(aObjeto).filter((t) => t.activo !== false);
  }
}
