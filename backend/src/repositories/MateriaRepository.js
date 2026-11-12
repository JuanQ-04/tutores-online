import { getDb, FieldValue } from "../config/firebase.js";
import { Conflicto } from "../errores.js";
import { aObjeto, yaExiste } from "./utils.js";

// Materias que agregó el administrador. El id del documento es el identificador
// («ingles-tecnico»), el mismo que guardan los tutores en su perfil.
export class MateriaRepository {
  get #col() { return getDb().collection("materias"); }

  async listar() {
    const snap = await this.#col.get();
    return snap.docs.map(aObjeto);
  }

  async crear(id, datos) {
    try {
      await this.#col.doc(id).create({ ...datos, creadaEn: FieldValue.serverTimestamp() });
    } catch (error) {
      if (yaExiste(error)) throw new Conflicto("Ya existe una materia con ese nombre");
      throw error;
    }
  }
}
