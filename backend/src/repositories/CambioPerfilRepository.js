import { getDb, FieldValue } from "../config/firebase.js";
import { aObjeto, porFechaDesc } from "./utils.js";

// Solicitudes de actualización de los datos del tutor. Hay una por tutor (el id es su uid):
// una nueva reemplaza a la anterior, y mientras esté «pendiente» el perfil NO cambia.
export class CambioPerfilRepository {
  get #col() { return getDb().collection("cambiosPerfil"); }

  async obtenerPorId(tutorId) {
    const doc = await this.#col.doc(tutorId).get();
    return doc.exists ? aObjeto(doc) : null;
  }

  async guardar(tutorId, datos) {
    await this.#col.doc(tutorId).set({ ...datos, tutorId, creadaEn: FieldValue.serverTimestamp() });
  }

  async eliminar(tutorId) {
    await this.#col.doc(tutorId).delete();
  }

  async resolver(tutorId, estado, adminId, nota) {
    await this.#col.doc(tutorId).update({
      estado,
      nota,
      revisadaPor: adminId,
      revisadaEn: FieldValue.serverTimestamp()
    });
  }

  async listarTodos() {
    const snap = await this.#col.get();
    return snap.docs.map(aObjeto).sort(porFechaDesc);
  }
}
