import { Conflicto, ErrorValidacion } from "../errores.js";
import { MATERIAS_BASE } from "../utils/catalogos.js";
import { aSlug, normalizar } from "../utils/texto.js";
import * as v from "../utils/validar.js";

const MAX_MATERIAS_EXTRA = 100;
const PATRON_NOMBRE = /^[\p{L}\p{N}][\p{L}\p{N} .,'&+()-]*$/u;

// Catálogo de materias: las de base (siempre existen, así los tutores ya registrados no
// necesitan migración) más las que agregue el administrador.
export class MateriaService {
  constructor({ materiaRepo }) {
    this.materiaRepo = materiaRepo;
  }

  async listar() {
    const guardadas = await this.materiaRepo.listar();
    const base = new Set(MATERIAS_BASE.map((m) => m.id));
    const extra = guardadas
      .filter((m) => !base.has(m.id) && m.nombre)
      .map((m) => ({ id: m.id, nombre: m.nombre, base: false }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    return [...MATERIAS_BASE.map((m) => ({ ...m, base: true })), ...extra];
  }

  // Identificadores válidos para el perfil de un tutor.
  async ids() {
    return (await this.listar()).map((m) => m.id);
  }

  async crear(admin, cuerpo = {}) {
    const escrito = v.textoConLetras(cuerpo.nombre, "nombre", { min: 2, max: 40 }).replace(/\s+/g, " ");
    if (!PATRON_NOMBRE.test(escrito)) {
      throw new ErrorValidacion("El nombre solo admite letras, números, espacios y . , ' & + ( ) -");
    }
    const nombre = escrito.charAt(0).toLocaleUpperCase("es") + escrito.slice(1);
    const id = aSlug(nombre);
    if (!id) throw new ErrorValidacion("El nombre debe incluir letras del alfabeto latino");

    const existentes = await this.listar();
    if (existentes.some((m) => m.id === id || normalizar(m.nombre) === normalizar(nombre))) {
      throw new Conflicto("Ya existe una materia con ese nombre");
    }
    if (existentes.filter((m) => !m.base).length >= MAX_MATERIAS_EXTRA) {
      throw new Conflicto("Se alcanzó el máximo de materias adicionales");
    }

    await this.materiaRepo.crear(id, { nombre, creadaPor: admin.id });
    return { id, nombre, base: false };
  }
}
