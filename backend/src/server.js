import { env } from "./config/env.js";
import { construirContenedor } from "./container.js";
import { crearApp } from "./app.js";

const { autenticar, controladores } = construirContenedor();
const app = crearApp({ autenticar, controladores, origenesCors: env.origenesCors });

app.listen(env.puerto, () => {
  console.log(`API de TutoresOn-Line en http://localhost:${env.puerto}`);
  console.log(`Documentación (Swagger):  http://localhost:${env.puerto}/api/docs`);
});
