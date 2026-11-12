// js/firebase-config.js
// Firebase en el navegador: SOLO Authentication (registro, login, verificación de correo,
// recuperación y cambio de contraseña). SDK v9 modular por CDN — no requiere npm ni bundler.
//
// Los datos NO se leen ni se escriben desde aquí: todo pasa por la API (js/api.js), que
// verifica el token de esta sesión y es la única que habla con la base de datos.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth }       from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

const firebaseConfig = {
  apiKey:            "AIzaSyAk6-l7wDpjPnQdPRgnea3R8nbn0w5RuHg",
  authDomain:        "tutores-online.firebaseapp.com",
  projectId:         "tutores-online",
  messagingSenderId: "639023210900",
  appId:             "1:639023210900:web:cbb93308da44787c452f81"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);

export { auth };
