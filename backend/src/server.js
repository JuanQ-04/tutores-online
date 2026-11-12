import { env } from "./config/env.js";
import { verificarCredenciales } from "./config/firebase.js";
import { construirContenedor } from "./container.js";
import { crearApp } from "./app.js";

try {
  verificarCredenciales();
} catch (error) {
  console.error(`\n✖ ${error.message}\n`);
  process.exit(1);
}

const { autenticar, identificar, controladores } = construirContenedor();
const app = crearApp({
  autenticar,
  identificar,
  controladores,
  origenesCors: env.origenesCors,
  limitePeticiones: env.limitePeticiones
});

app.listen(env.puerto, () => {
  console.log(`API de TutoresOn-Line en http://localhost:${env.puerto}`);
  console.log(`Documentación (Swagger):  http://localhost:${env.puerto}/api/docs`);
});
