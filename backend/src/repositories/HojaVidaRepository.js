import { getDb, FieldValue } from "../config/firebase.js";
import { aObjeto } from "./utils.js";

// Hoja de vida (PDF en base64) del tutor. Va en su propia colección para que no
// viaje con el perfil público ni pese en cada lectura. El id es el uid del tutor.
// La misma clase sirve para la hoja vigente («hojasDeVida») y para la que el tutor
// propone en una solicitud de actualización («hojasDeVidaPendientes»).
export class HojaVidaRepository {
  constructor(coleccion = "hojasDeVida") {
    this.coleccion = coleccion;
  }

  get #col() { return getDb().collection(this.coleccion); }

  async obtenerPorId(tutorId) {
    const doc = await this.#col.doc(tutorId).get();
    return doc.exists ? aObjeto(doc) : null;
  }

  async guardar(tutorId, datos) {
    await this.#col.doc(tutorId).set({ ...datos, tutorId, subidaEn: FieldValue.serverTimestamp() });
  }

  async eliminar(tutorId) {
    await this.#col.doc(tutorId).delete();
  }
}
