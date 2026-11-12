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

// Más reciente primero. Las colecciones usan «creadaEn» (solicitudes, tutorías, calificaciones)
// o «creadoEn» (usuarios, mensajes de soporte).
const marca = (x) => String(x.creadaEn || x.creadoEn || "");
export const porFechaDesc = (a, b) => marca(b).localeCompare(marca(a));

// Error de Firestore al crear un documento cuyo id ya existe.
export const yaExiste = (error) => error.code === 6 || /ALREADY_EXISTS/.test(error.message || "");
