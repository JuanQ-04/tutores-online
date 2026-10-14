// js/foto-perfil.js — Foto de perfil (estudiante, tutor y administrador)
//
// El usuario elige una imagen de su equipo; aquí se recorta en cuadrado, se
// reduce a 256×256 px y se guarda como texto (data URL, ~15–40 KB) en el campo
// «fotoURL» de su documento en la colección «usuarios».
//
// Se guarda en Firestore y no en Firebase Storage para que funcione sin
// configurar Storage (que hoy exige el plan Blaze). Si más adelante migras a
// Storage, solo cambia guardarFotoPerfil().

import { auth, db } from "./firebase-config.js";
import {
  doc,
  getDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const LADO = 256;                       // px del lado de la foto final
const MAX_ARCHIVO = 8 * 1024 * 1024;    // 8 MB de imagen original
const MAX_CARACTERES = 200000;          // límite del texto guardado (~150 KB)
const FORMATOS = ["image/jpeg", "image/png", "image/webp"];
const PATRON_FOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

/** Solo se pintan fotos con el formato esperado (evita inyectar CSS raro). */
export function esFotoValida(valor) {
  return typeof valor === "string"
    && valor.length < MAX_CARACTERES + 100
    && PATRON_FOTO.test(valor);
}

/** Fragmento de estilo en línea para usar dentro de un style="…". */
export function estiloFoto(fotoURL) {
  return esFotoValida(fotoURL)
    ? `background-image:url('${fotoURL}');background-size:cover;background-position:center;background-repeat:no-repeat;`
    : "";
}

/** Texto (iniciales) que se muestra solo si NO hay foto. */
export function textoSinFoto(fotoURL, iniciales) {
  return esFotoValida(fotoURL) ? "" : iniciales;
}

/** Pinta la foto en un elemento; si no hay foto, deja (o pone) las iniciales. */
export function pintarAvatar(el, fotoURL, iniciales) {
  if (!el) return;
  if (esFotoValida(fotoURL)) {
    el.textContent = "";
    el.style.backgroundImage = `url('${fotoURL}')`;
    el.style.backgroundSize = "cover";
    el.style.backgroundPosition = "center";
    el.style.backgroundRepeat = "no-repeat";
    el.classList.add("has-photo");
  } else {
    el.style.backgroundImage = "";
    el.classList.remove("has-photo");
    if (iniciales != null) el.textContent = iniciales;
  }
}

function cargarImagen(file) {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file).then((bmp) => ({
      fuente: bmp, ancho: bmp.width, alto: bmp.height
    }));
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ fuente: img, ancho: img.naturalWidth, alto: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen."));
    };
    img.src = url;
  });
}

/** Valida, recorta al centro y reduce la imagen. Devuelve un data URL JPEG. */
export async function procesarImagen(file) {
  if (!file) throw new Error("No se eligió ninguna imagen.");
  if (!FORMATOS.includes(file.type)) {
    throw new Error("Usa una imagen JPG, PNG o WebP.");
  }
  if (file.size > MAX_ARCHIVO) {
    throw new Error("La imagen pesa más de 8 MB. Elige una más liviana.");
  }

  let datos;
  try {
    datos = await cargarImagen(file);
  } catch (_) {
    throw new Error("No se pudo leer la imagen. Prueba con otra.");
  }

  const lado = Math.min(datos.ancho, datos.alto);
  if (!lado) throw new Error("La imagen está vacía.");

  const canvas = document.createElement("canvas");
  canvas.width = LADO;
  canvas.height = LADO;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; // fondo para PNG/WebP con transparencia
  ctx.fillRect(0, 0, LADO, LADO);
  ctx.drawImage(
    datos.fuente,
    (datos.ancho - lado) / 2, (datos.alto - lado) / 2, lado, lado,
    0, 0, LADO, LADO
  );
  if (datos.fuente.close) datos.fuente.close();

  let calidad = 0.85;
  let url = canvas.toDataURL("image/jpeg", calidad);
  while (url.length > MAX_CARACTERES && calidad > 0.3) {
    calidad -= 0.1;
    url = canvas.toDataURL("image/jpeg", calidad);
  }
  if (url.length > MAX_CARACTERES) {
    throw new Error("No se pudo reducir la imagen lo suficiente. Prueba con otra.");
  }
  return url;
}

/** Lee la foto guardada de un usuario (cadena vacía si no tiene). */
export async function leerFotoPerfil(uid) {
  const snap = await getDoc(doc(db, "usuarios", uid));
  const foto = snap.exists() ? snap.data().fotoURL : "";
  return esFotoValida(foto) ? foto : "";
}

/** Guarda la foto en el documento del usuario que tiene la sesión abierta. */
export async function guardarFotoPerfil(fotoURL) {
  const usuario = auth.currentUser;
  if (!usuario) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
  if (!esFotoValida(fotoURL)) throw new Error("La imagen no es válida.");
  await updateDoc(doc(db, "usuarios", usuario.uid), { fotoURL });
}

/**
 * Conecta un botón con el selector de archivos.
 *  - alElegir(dataURL): guarda y refresca la pantalla (puede ser async).
 *  - alError(mensaje): muestra el mensaje al usuario.
 */
export function activarSelectorFoto(boton, alElegir, alError) {
  if (!boton) return;

  const input = document.createElement("input");
  input.type = "file";
  input.accept = FORMATOS.join(",");
  input.hidden = true;
  document.body.appendChild(input);

  boton.addEventListener("click", () => input.click());

  input.addEventListener("change", async () => {
    const archivo = input.files && input.files[0];
    input.value = ""; // permite elegir la misma imagen otra vez
    if (!archivo) return;

    boton.disabled = true;
    try {
      const url = await procesarImagen(archivo);
      await alElegir(url);
    } catch (error) {
      console.error("Error al actualizar la foto:", error);
      const mensaje = error && error.message && !/permission|insufficient|firestore/i.test(error.message)
        ? error.message
        : "No se pudo guardar la foto. Revisa tu conexión e inténtalo de nuevo.";
      if (alError) alError(mensaje);
    } finally {
      boton.disabled = false;
    }
  });
}
