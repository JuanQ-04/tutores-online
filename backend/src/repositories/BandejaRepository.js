import { getDb, FieldValue } from "../config/firebase.js";
import { aObjeto } from "./utils.js";

// Notificaciones de cada usuario, guardadas en usuarios/{uid}/notificaciones. Al estar dentro del
// usuario, listarlas (las más nuevas primero) no necesita índices compuestos.
export class BandejaRepository {
  #col(uid) { return getDb().collection("usuarios").doc(uid).collection("notificaciones"); }

  async crear(uid, datos) {
    const ref = await this.#col(uid).add({ ...datos, leida: false, creadaEn: FieldValue.serverTimestamp() });
    return ref.id;
  }

  async listar(uid, limite) {
    const snap = await this.#col(uid).orderBy("creadaEn", "desc").limit(limite).get();
    return snap.docs.map(aObjeto);
  }

  async obtenerPorId(uid, id) {
    const doc = await this.#col(uid).doc(id).get();
    return doc.exists ? aObjeto(doc) : null;
  }

  async marcarLeida(uid, id) {
    await this.#col(uid).doc(id).update({ leida: true });
  }

  // Marca todas las que siguen sin leer (por lotes: Firestore admite 500 operaciones por lote).
  async marcarTodas(uid) {
    const db = getDb();
    let total = 0;
    for (;;) {
      const snap = await this.#col(uid).where("leida", "==", false).limit(400).get();
      if (snap.empty) return total;
      const lote = db.batch();
      snap.docs.forEach((doc) => lote.update(doc.ref, { leida: true }));
      await lote.commit();
      total += snap.size;
    }
  }
}
