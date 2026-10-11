// js/firebase-config.js
// Configuración e inicialización de Firebase para TutoresOn-Line
// SDK v9 modular cargado por CDN — no requiere npm ni bundler.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth }       from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore }  from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyAk6-l7wDpjPnQdPRgnea3R8nbn0w5RuHg",
  authDomain:        "tutores-online.firebaseapp.com",
  projectId:         "tutores-online",
  storageBucket:     "tutores-online.firebasestorage.app",
  messagingSenderId: "639023210900",
  appId:             "1:639023210900:web:cbb93308da44787c452f81"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

export { auth, db };