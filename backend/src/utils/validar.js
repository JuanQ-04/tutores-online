import { ErrorValidacion } from "../errores.js";

export function texto(valor, campo, { min = 1, max = 200, opcional = false } = {}) {
  if (valor === undefined || valor === null || valor === "") {
    if (opcional) return "";
    throw new ErrorValidacion(`El campo «${campo}» es obligatorio`);
  }
  if (typeof valor !== "string") {
    throw new ErrorValidacion(`El campo «${campo}» debe ser texto`);
  }
  const limpio = valor.trim();
  if (limpio.length < min) throw new ErrorValidacion(`El campo «${campo}» es obligatorio`);
  if (limpio.length > max) {
    throw new ErrorValidacion(`El campo «${campo}» admite máximo ${max} caracteres`);
  }
  return limpio;
}

export function fecha(valor, campo = "fecha") {
  const t = texto(valor, campo, { max: 10 });
  const d = new Date(`${t}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== t) {
    throw new ErrorValidacion(`El campo «${campo}» debe tener formato AAAA-MM-DD`);
  }
  return t;
}

export function hora(valor, campo) {
  const t = texto(valor, campo, { max: 5 });
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) {
    throw new ErrorValidacion(`El campo «${campo}» debe tener formato HH:MM`);
  }
  return t;
}

export function entero(valor, campo, { min, max }) {
  if (!Number.isInteger(valor) || valor < min || valor > max) {
    throw new ErrorValidacion(`El campo «${campo}» debe ser un entero entre ${min} y ${max}`);
  }
  return valor;
}
