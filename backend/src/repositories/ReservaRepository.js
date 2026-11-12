import { getDb, FieldValue } from "../config/firebase.js";
import { aObjeto } from "./utils.js";

// Operaciones que deben ser ATÓMICAS (solicitud + tutoría juntas).
// El servicio decide las reglas; este repositorio solo da acceso transaccional.
// Importante: dentro de fn, primero se lee todo y después se escribe.
export class ReservaRepository {
  transaccion(fn) {
    const db = getDb();
    const solicitudes = db.collection("solicitudes");
    const tutorias = db.collection("tutorias");

    return db.runTransaction(async (t) => {
      const tx = {
        async obtenerSolicitud(id) {
          const doc = await t.get(solicitudes.doc(id));
          return doc.exists ? aObjeto(doc) : null;
        },
        async obtenerTutoria(id) {
          const doc = await t.get(tutorias.doc(id));
          return doc.exists ? aObjeto(doc) : null;
        },
        async tutoriasProgramadas(tutorId, fecha) {
          const snap = await t.get(
            tutorias
              .where("tutorId", "==", tutorId)
              .where("fecha", "==", fecha)
              .where("estado", "==", "programada")
          );
          return snap.docs.map(aObjeto);
        },
        actualizarSolicitud(id, datos) {
          t.update(solicitudes.doc(id), datos);
        },
        actualizarTutoria(id, datos) {
          t.update(tutorias.doc(id), datos);
        },
        crearTutoria(datos) {
          const ref = tutorias.doc();
          t.set(ref, { ...datos, creadaEn: FieldValue.serverTimestamp() });
          return ref.id;
        }
      };
      return fn(tx);
    });
  }
}
