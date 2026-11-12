import { readFileSync } from "node:fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { env } from "./env.js";

function credencial() {
  const { rutaCuenta, projectId, clientEmail, privateKey } = env.firebase;
  if (rutaCuenta) {
    return cert(JSON.parse(readFileSync(rutaCuenta, "utf8")));
  }
  if (projectId && clientEmail && privateKey) {
    return cert({ projectId, clientEmail, privateKey });
  }
  throw new Error(
    "Faltan credenciales de Firebase. Define GOOGLE_APPLICATION_CREDENTIALS " +
    "o FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY (ver .env.example)."
  );
}

// Inicialización perezosa: solo se conecta cuando alguien la necesita.
function app() {
  return getApps()[0] ?? initializeApp({ credential: credencial() });
}

export const getDb = () => getFirestore(app());
export const getAuthAdmin = () => getAuth(app());
export { FieldValue };
