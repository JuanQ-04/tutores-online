import { getDb } from "../config/firebase.js";
import { aObjeto, porFechaDesc } from "./utils.js";

export class TutoriaRepository {
  get #col() { return getDb().collection("tutorias"); }

  async obtenerPorId(id) {
    const doc = await this.#col.doc(id).get();
    return doc.exists ? aObjeto(doc) : null;
  }

  async listarPorEstudiante(uid) {
    const snap = await this.#col.where("estudianteId", "==", uid).get();
    return snap.docs.map(aObjeto).sort(porFechaDesc);
  }

  async listarPorTutor(uid) {
    const snap = await this.#col.where("tutorId", "==", uid).get();
    return snap.docs.map(aObjeto).sort(porFechaDesc);
  }

  // Tutorías "programadas" (ocupan horario). Con tutorId, solo las de ese tutor.
  async listarProgramadas(tutorId) {
    let q = this.#col.where("estado", "==", "programada");
    if (tutorId) q = q.where("tutorId", "==", tutorId);
    const snap = await q.get();
    return snap.docs.map(aObjeto);
  }

  async listarTodas() {
    const snap = await this.#col.get();
    return snap.docs.map(aObjeto).sort(porFechaDesc);
  }
}
