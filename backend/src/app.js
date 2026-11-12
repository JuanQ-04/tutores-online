import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import { crearRutas } from "./routes/index.js";
import { noEncontrado, manejarErrores } from "./middlewares/errores.js";
import { openapi } from "./docs/openapi.js";

export function crearApp({ autenticar, controladores, origenesCors }) {
  const app = express();
  app.set("trust proxy", 1); // detrás de Azure/Render, para que el límite use la IP real

  app.use(helmet());
  app.use(cors({ origin: origenesCors }));
  app.use(express.json({ limit: "50kb" }));
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

  app.get("/", (_req, res) => res.json({ nombre: "TutoresOn-Line API", documentacion: "/api/docs" }));
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapi));
  app.use("/api", crearRutas({ autenticar, controladores }));

  app.use(noEncontrado);
  app.use(manejarErrores);
  return app;
}
