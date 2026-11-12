// js/materias.js — Catálogo de materias, compartido por todas las pantallas.
// Viene de la API (GET /api/materias): las de base más las que agrega el administrador.
// Si la API no responde (por ejemplo, mientras Render despierta) se usan las de base, para que
// los formularios sigan funcionando.
import { API_URL } from "./api-url.js";

const BASE = [
  { id: "matematicas", nombre: "Matemáticas" },
  { id: "fisica", nombre: "Física" },
  { id: "quimica", nombre: "Química" },
  { id: "programacion", nombre: "Programación" },
  { id: "idiomas", nombre: "Idiomas" },
  { id: "estadistica", nombre: "Estadística" }
];

let lista = BASE;
let promesa = null;

export function cargarMaterias({ forzar = false } = {}) {
  if (!promesa || forzar) {
    promesa = fetch(`${API_URL}/materias`)
      .then((respuesta) => {
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        return respuesta.json();
      })
      .then((datos) => {
        if (Array.isArray(datos) && datos.length) lista = datos;
        return lista;
      })
      .catch((error) => {
        console.warn("No se pudo cargar el catálogo de materias; se usan las de base:", error);
        promesa = null; // la próxima vez se vuelve a intentar
        return lista;
      });
  }
  return promesa;
}

export const materiasActuales = () => lista;

// El administrador acaba de crear una: se suma a la lista sin volver a pedirla.
export function agregarMateria(materia) {
  if (!lista.some((m) => m.id === materia.id)) lista = [...lista, materia];
}

const normalizar = (valor) => String(valor || "")
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "")
  .trim()
  .toLowerCase();

// Las tutorías guardan el nombre ("Matemáticas") y los tutores el identificador ("matematicas"):
// esta función lleva cualquiera de los dos al identificador.
export function idMateria(valor) {
  const n = normalizar(valor) === "estadisticas" ? "estadistica" : normalizar(valor);
  return lista.find((m) => m.id === n || normalizar(m.nombre) === n)?.id || n;
}

export function nombreMateria(valor) {
  const n = normalizar(valor) === "estadisticas" ? "estadistica" : normalizar(valor);
  const encontrada = lista.find((m) => m.id === n || normalizar(m.nombre) === n);
  if (encontrada) return encontrada.nombre;
  const texto = String(valor || "").trim();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// Rellena un <select> con el catálogo. `valor`: «id» (por defecto) o «nombre».
export function llenarSelectMaterias(select, { placeholder, valor = "id" } = {}) {
  if (!select) return;
  const actual = select.value;
  select.replaceChildren();
  const agregar = (value, texto) => {
    const opcion = document.createElement("option");
    opcion.value = value;
    opcion.textContent = texto;
    select.append(opcion);
  };
  if (placeholder !== undefined) agregar("", placeholder);
  lista.forEach((m) => agregar(valor === "id" ? m.id : m.nombre, m.nombre));
  if ([...select.options].some((o) => o.value === actual)) select.value = actual;
}
