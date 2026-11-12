import "dotenv/config";

const lista = (valor, porDefecto = "") =>
  (valor ?? porDefecto).split(",").map((s) => s.trim()).filter(Boolean);

export const env = {
  puerto: Number(process.env.PORT) || 4000,
  entorno: process.env.NODE_ENV || "development",
  origenesCors: lista(
    process.env.CORS_ORIGINS,
    "http://localhost:3000,http://localhost:5500,http://127.0.0.1:5500"
  ),
  // Peticiones por IP cada 15 minutos. Los paneles consultan la API cada ~30 s, y varios
  // usuarios pueden compartir IP (una red de colegio, por ejemplo), así que se deja holgado.
  limitePeticiones: Number(process.env.RATE_LIMIT_MAX) || 1000,
  zonaHoraria: process.env.ZONA_HORARIA || "America/Bogota",
  jitsiBaseUrl: (process.env.JITSI_BASE_URL || "https://meet.jit.si").replace(/\/$/, ""),
  firebase: {
    rutaCuenta: process.env.GOOGLE_APPLICATION_CREDENTIALS || "",
    projectId: process.env.FIREBASE_PROJECT_ID || "",
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || "",
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n")
  },
  correo: {
    host: process.env.SMTP_HOST || "",
    puerto: Number(process.env.SMTP_PORT) || 587,
    seguro: process.env.SMTP_SECURE === "true",
    usuario: process.env.SMTP_USER || "",
    clave: process.env.SMTP_PASS || "",
    remitente: process.env.MAIL_FROM || "TutoresOn-Line <no-reply@tutoresonline.local>"
  }
};
