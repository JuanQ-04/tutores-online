import { getDb, FieldValue } from "../config/firebase.js";
import { aObjeto, porFechaDesc } from "./utils.js";

// Centro de ayuda: mensajes que los usuarios envían al equipo (colección «mensajesSoporte»).
export class SoporteRepository {
  get #col() { return getDb().collection("mensajesSoporte"); }

  async obtenerPorId(id) {
    const doc = await this.#col.doc(id).get();
    return doc.exists ? aObjeto(doc) : null;
  }

  async crear(datos) {
    const ref = await this.#col.add({ ...datos, creadoEn: FieldValue.serverTimestamp() });
    return ref.id;
  }

  // Estado y/o respuesta del administrador.
  async actualizar(id, cambios) {
    await this.#col.doc(id).update({ ...cambios, actualizadoEn: FieldValue.serverTimestamp() });
  }

  async listarTodos() {
    const snap = await this.#col.get();
    return snap.docs.map(aObjeto).sort(porFechaDesc);
  }
}
