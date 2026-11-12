// Minúsculas y sin tildes, para comparar textos ("Matemáticas" == "matematicas").
export function normalizar(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

// Identificador estable a partir de un nombre: «Inglés técnico» → «ingles-tecnico».
export function aSlug(valor) {
  return normalizar(valor).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function escaparHtml(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
