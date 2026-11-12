// Convierte un documento de Firestore en objeto plano (los Timestamp pasan a texto ISO).
function plano(valor) {
  if (valor && typeof valor.toDate === "function") return valor.toDate().toISOString();
  if (Array.isArray(valor)) return valor.map(plano);
  if (valor && typeof valor === "object") {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, plano(v)]));
  }
  return valor;
}

export const aObjeto = (doc) => ({ id: doc.id, ...plano(doc.data()) });

export const porFechaDesc = (a, b) => String(b.creadaEn || "").localeCompare(String(a.creadaEn || ""));
