import { getDb, FieldValue } from "../config/firebase.js";
import { Conflicto } from "../errores.js";
import { aObjeto, porFechaDesc } from "./utils.js";

export class CalificacionRepository {
  get #col() { return getDb().collection("calificaciones"); }

  // El id de la calificación ES el id de la tutoría: create() falla si ya existe.
  async crear(id, datos) {
    try {
      await this.#col.doc(id).create({ ...datos, creadaEn: FieldValue.serverTimestamp() });
    } catch (error) {
      if (error.code === 6 || /ALREADY_EXISTS/.test(error.message || "")) {
        throw new Conflicto("Esta tutoría ya fue calificada");
      }
      throw error;
    }
  }

  async obtenerPorId(id) {
    const doc = await this.#col.doc(id).get();
    return doc.exists ? aObjeto(doc) : null;
  }

  // Moderación del administrador: estrellas, visibilidad y retroalimentación.
  async moderar(id, cambios, adminId) {
    await this.#col.doc(id).update({
      ...cambios,
      editadaPorAdmin: adminId,
      editadaEn: FieldValue.serverTimestamp()
    });
  }

  // Todas las que dio un estudiante (visibles u ocultas).
  async listarPorEstudiante(uid) {
    const snap = await this.#col.where("estudianteId", "==", uid).get();
    return snap.docs.map(aObjeto).sort(porFechaDesc);
  }

  // Todas las que recibió un tutor (el tutor ve también las que el administrador ocultó).
  async listarPorTutor(uid) {
    const snap = await this.#col.where("tutorId", "==", uid).get();
    return snap.docs.map(aObjeto).sort(porFechaDesc);
  }

  async listarTodas() {
    const snap = await this.#col.get();
    return snap.docs.map(aObjeto).sort(porFechaDesc);
  }

  async listarVisiblesPorTutor(tutorId, limite = 50) {
    const snap = await this.#col
      .where("tutorId", "==", tutorId)
      .where("estado", "==", "visible")
      .get();
    return snap.docs.map(aObjeto).sort(porFechaDesc).slice(0, limite);
  }

  // { [tutorId]: { promedio, opiniones } } con las calificaciones visibles.
  async resumenPorTutor(tutorId) {
    let q = this.#col.where("estado", "==", "visible");
    if (tutorId) q = q.where("tutorId", "==", tutorId);
    const snap = await q.get();
    const acumulado = {};
    for (const doc of snap.docs) {
      const c = doc.data();
      if (!c.tutorId) continue;
      acumulado[c.tutorId] ??= { suma: 0, opiniones: 0 };
      acumulado[c.tutorId].suma += Number(c.estrellas) || 0;
      acumulado[c.tutorId].opiniones += 1;
    }
    return Object.fromEntries(
      Object.entries(acumulado).map(([id, { suma, opiniones }]) => [
        id,
        { promedio: Math.round((suma / opiniones) * 10) / 10, opiniones }
      ])
    );
  }
}
