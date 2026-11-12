import { getDb, FieldValue } from "../config/firebase.js";
import { aObjeto, porFechaDesc } from "./utils.js";

export class SolicitudRepository {
  get #col() { return getDb().collection("solicitudes"); }

  async obtenerPorId(id) {
    const doc = await this.#col.doc(id).get();
    return doc.exists ? aObjeto(doc) : null;
  }

  async crear(datos) {
    const ref = await this.#col.add({ ...datos, creadaEn: FieldValue.serverTimestamp() });
    return ref.id;
  }

  async existePendiente({ estudianteId, tutorId, fecha, horaInicio }) {
    const snap = await this.#col
      .where("estudianteId", "==", estudianteId)
      .where("tutorId", "==", tutorId)
      .where("estado", "==", "pendiente")
      .where("fecha", "==", fecha)
      .where("horaInicio", "==", horaInicio)
      .limit(1)
      .get();
    return !snap.empty;
  }

  async listarPorEstudiante(uid) {
    const snap = await this.#col.where("estudianteId", "==", uid).get();
    return snap.docs.map(aObjeto).sort(porFechaDesc);
  }

  async listarPorTutor(uid) {
    const snap = await this.#col.where("tutorId", "==", uid).get();
    return snap.docs.map(aObjeto).sort(porFechaDesc);
  }

  async listarTodas() {
    const snap = await this.#col.get();
    return snap.docs.map(aObjeto).sort(porFechaDesc);
  }
}
