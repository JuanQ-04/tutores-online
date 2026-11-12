import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import { crearRutas } from "./routes/index.js";
import { noEncontrado, manejarErrores } from "./middlewares/errores.js";
import { openapi } from "./docs/openapi.js";

export function crearApp({ autenticar, identificar, controladores, origenesCors, limitePeticiones = 1000 }) {
  const app = express();
  app.set("trust proxy", 1); // detrás del proxy de Render, para que el límite use la IP real

  app.use(helmet());
  app.use(cors({ origin: origenesCors }));
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: limitePeticiones, standardHeaders: true, legacyHeaders: false }));

  // Cuerpos grandes solo donde hacen falta (foto de perfil y hoja de vida en PDF, ambas en base64).
  // Van ANTES del parser general: el que llega primero es el que lee el cuerpo.
  app.use("/api/usuarios/yo/foto", express.json({ limit: "300kb" }));
  app.use("/api/usuarios/yo/solicitud-tutor", express.json({ limit: "1200kb" }));
  app.use("/api/usuarios/yo/solicitud-cambio", express.json({ limit: "1200kb" }));
  app.use(express.json({ limit: "50kb" }));

  app.get("/", (_req, res) => res.json({ nombre: "TutoresOn-Line API", documentacion: "/api/docs" }));
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapi));
  app.use("/api", crearRutas({ autenticar, identificar, controladores }));

  app.use(noEncontrado);
  app.use(manejarErrores);
  return app;
}
