import {
  FRANJAS, MODALIDADES, NIVELES_ENSENANZA, NIVELES_ESTUDIO
} from "./catalogos.js";
import * as v from "./validar.js";

const MAX_PDF = 950_000; // caracteres del data URL (≈ 700 KB de PDF)
const PATRON_PDF = /^data:application\/pdf;base64,[A-Za-z0-9+/=]+$/;

// Campos del perfil profesional del tutor. Se usan igual al enviar la solicitud inicial y al
// pedir una actualización: en los dos casos llega el formulario completo.
export const CAMPOS_PERFIL = [
  "titulo", "nivelEstudios", "institucion", "materias", "nivelEnsenanza", "experiencia",
  "modalidad", "ciudad", "tarifa", "franjas", "presentacion"
];

export function validarPerfilTutor(cuerpo, materiasValidas) {
  return {
    titulo: v.texto(cuerpo.titulo, "titulo", { max: 80 }),
    nivelEstudios: v.opcion(cuerpo.nivelEstudios, NIVELES_ESTUDIO, "nivelEstudios"),
    institucion: v.textoConLetras(cuerpo.institucion, "institucion", { max: 80 }),
    materias: v.listaDe(cuerpo.materias, materiasValidas, "materias"),
    nivelEnsenanza: v.opcion(cuerpo.nivelEnsenanza, NIVELES_ENSENANZA, "nivelEnsenanza"),
    experiencia: v.entero(cuerpo.experiencia, "experiencia", { min: 0, max: 60 }),
    modalidad: v.opcion(cuerpo.modalidad, MODALIDADES, "modalidad"),
    ciudad: v.textoConLetras(cuerpo.ciudad, "ciudad", { max: 60 }),
    tarifa: v.entero(cuerpo.tarifa, "tarifa", { min: 0, max: 10_000_000 }),
    franjas: v.listaDe(cuerpo.franjas, FRANJAS, "franjas"),
    presentacion: v.textoConLetras(cuerpo.presentacion, "presentacion", { max: 500 })
  };
}

export function validarHojaVida(hoja = {}) {
  return {
    nombreArchivo: v.texto(hoja.nombreArchivo, "hojaVida.nombreArchivo", { max: 200 }),
    tamano: v.entero(hoja.tamano, "hojaVida.tamano", { min: 1, max: 1_000_000 }),
    dataURL: v.dataURL(hoja.dataURL, "hojaVida.dataURL", { patron: PATRON_PDF, max: MAX_PDF })
  };
}

// Las listas (materias, franjas) son conjuntos: el orden no cuenta.
const clave = (valor) => (Array.isArray(valor) ? JSON.stringify([...valor].sort()) : JSON.stringify(valor ?? null));

// Campos de `propuesto` que difieren de lo que hay guardado en `actual`.
export function diferencias(actual, propuesto) {
  const cambios = {};
  for (const campo of CAMPOS_PERFIL) {
    if (clave(actual?.[campo]) !== clave(propuesto[campo])) cambios[campo] = propuesto[campo];
  }
  return cambios;
}
