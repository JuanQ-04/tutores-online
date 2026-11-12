import { readFileSync } from "node:fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { env } from "./env.js";
import { ErrorConfiguracion } from "../errores.js";

function credencial() {
  const { rutaCuenta, projectId, clientEmail, privateKey } = env.firebase;
  if (rutaCuenta) {
    try {
      return cert(JSON.parse(readFileSync(rutaCuenta, "utf8")));
    } catch (error) {
      throw new ErrorConfiguracion(
        `No se pudo leer la cuenta de servicio de Firebase en «${rutaCuenta}» (${error.message}). ` +
        "Revisa GOOGLE_APPLICATION_CREDENTIALS en backend/.env y que el archivo exista."
      );
    }
  }
  if (projectId && clientEmail && privateKey) {
    return cert({ projectId, clientEmail, privateKey });
  }
  throw new ErrorConfiguracion(
    "Faltan credenciales de Firebase. Crea backend/.env (copia .env.example) y define " +
    "GOOGLE_APPLICATION_CREDENTIALS, o bien FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY."
  );
}

// Inicialización perezosa: solo se conecta cuando alguien la necesita.
function app() {
  return getApps()[0] ?? initializeApp({ credential: credencial() });
}

// Se llama al arrancar el servidor para fallar de inmediato (y con un mensaje claro) si faltan.
export const verificarCredenciales = () => { app(); };

export const getDb = () => getFirestore(app());
export const getAuthAdmin = () => getAuth(app());
export { FieldValue };
