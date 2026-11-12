# TutoresOn-Line

Plataforma web de tutorías (presenciales y virtuales) que conecta estudiantes con tutores por materia, nivel, zona y disponibilidad.
Proyecto final del curso, con metodología ágil (Scrum).

## Cómo se comunican las piezas

```
Navegador ──(token de Firebase)──▶ API (Render) ──▶ Firebase Admin ──▶ Firestore
    │
    └──▶ Firebase Authentication (solo login, registro, verificación y contraseñas)
```

- El **navegador nunca lee ni escribe en la base de datos**. Todo dato (perfil, tutores, solicitudes,
  tutorías, calificaciones, soporte, panel de administración) pasa por la API (`js/api.js`).
- La API verifica el token de Firebase en cada petición, aplica las reglas del negocio y es la única
  que habla con Firestore.
- Firebase Authentication sí se usa desde el navegador, porque es autenticación, no base de datos.
- Las reglas de Firestore (`firestore.rules`) niegan todo a los clientes; el Admin SDK las omite.

## Tecnología

- **Frontend:** HTML, CSS y JavaScript (módulos ES), sin bundler. Firebase Authentication por CDN.
- **Backend:** API REST en Node.js + Express (carpeta `backend/`) con Firebase Admin SDK. Se encarga de
  perfiles, reservas (sin choques de horario), búsqueda de tutores, calificaciones, soporte, panel de
  administración, correo y videollamada con Jitsi Meet. Documentación interactiva en `/api/docs`.
  Ver `backend/README.md`.
- **Despliegue:** Render (sitio estático + servicio web), descrito en `render.yaml`.

## Roles

| Rol | Qué hace |
|-----|----------|
| Estudiante | Busca tutores, solicita y califica tutorías, abre tickets de soporte |
| Tutor | Completa su perfil y hoja de vida, gestiona disponibilidad (solo en la modalidad que eligió), acepta o rechaza solicitudes y pide actualizar sus datos profesionales |
| Administrador | Aprueba tutores y sus actualizaciones de datos, agrega materias, suspende cuentas, modera calificaciones, atiende y responde los casos de soporte |

Para crear un administrador: en Firestore → `usuarios` → documento del usuario → `rol: "admin"`
(la API no permite registrarse como administrador).

## Estructura

```
index.html          Landing pública
pages/              Login, registros, buscar, paneles (estudiante, tutor, admin)
css/  js/  images/  Estilos, lógica y recursos
js/api.js           Único cliente de la API (y utilidades de sondeo)
js/materias.js      Catálogo de materias (se pide a la API y se comparte entre pantallas)
js/notificaciones.js  Bandeja de notificaciones compartida por los tres paneles (lista, leídas, clic que lleva al elemento)
backend/            API (Express + Firebase Admin)
firestore.rules     Reglas de Firestore: denegar todo a los clientes
render.yaml         Blueprint de despliegue en Render
```

## Ejecutar en local

Los módulos ES no funcionan abriendo el archivo directamente; usa un servidor local:

```bash
npx serve .
# o con la extensión Live Server de VS Code
```

El backend debe estar corriendo (en otra terminal); sin él no cargan perfiles, tutores ni tutorías:

```bash
cd backend
npm install        # solo la primera vez
cp .env.example .env   # y deja tu serviceAccountKey.json en backend/ (ver backend/README.md)
npm run dev        # http://localhost:4000
```

El frontend detecta `localhost` y usa `http://localhost:4000/api`; en cualquier otro dominio usa la API
de Render (ver `js/api.js`). `localhost` debe estar en los dominios autorizados de Firebase Authentication.

Los paneles se actualizan solos cada 30 segundos mientras la pestaña está visible (ya no hay escuchas
en tiempo real).

## Despliegue en Render

1. Sube el repositorio a GitHub (sin `backend/.env` ni `serviceAccountKey.json`; ya están en `.gitignore`).
2. En Render: **New → Blueprint** y elige el repositorio. Render lee `render.yaml` y crea:
   - `tutores-online` (sitio estático) → `https://tutores-online.onrender.com`
   - `tutores-online-api` (API) → `https://tutores-online-api.onrender.com`
3. Cuando Render lo pida, completa las variables de la API con los valores del JSON de la cuenta de
   servicio (Firebase Console → Configuración del proyecto → Cuentas de servicio → *Generar nueva clave
   privada*): `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` y `FIREBASE_PRIVATE_KEY` (con los `\n`).
4. Si Render asigna nombres distintos a los de arriba, ajusta en tres sitios: `API_URL` en `js/api.js`,
   `CORS_ORIGINS` de la API y el `connect-src` de las cabeceras en `render.yaml`.
5. En Firebase → Authentication → Configuración → **Dominios autorizados**, agrega
   `tutores-online.onrender.com` (y en las restricciones de la API key de Google Cloud, si las tienes).
6. Publica las reglas de Firestore (sección siguiente).

Notas del plan gratuito de Render:
- La API se duerme tras ~15 minutos sin tráfico; la primera petición puede tardar cerca de un minuto
  (el frontend espera hasta 60 s antes de mostrar un error).
- Bloquea los puertos SMTP (25, 465 y 587): los correos de notificación no saldrán por SMTP clásico.
  La reserva y las demás operaciones funcionan igual; el error queda en el log. Para correo real usa un
  plan de pago o un proveedor con API HTTP.

## Seguridad

- La `apiKey` de `js/firebase-config.js` es un identificador público de Firebase, **no un secreto**.
- La protección real de los datos está en la API (token + rol + validaciones) y en `firestore.rules`
  (denegar todo a los clientes).
- **Nunca** subir: `.env`, cuentas de servicio (`*-adminsdk-*.json`, `serviceAccountKey.json`), claves de
  correo o secretos OAuth (ver `.gitignore`).

## Publicar las reglas de Firestore desde el repo

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

Hazlo junto con el primer despliegue de la API: con las reglas nuevas, cualquier acceso directo desde
el navegador queda bloqueado (la API no se ve afectada).

## Flujo de trabajo

- `main` está protegida: los cambios entran por pull request.
- Ramas por persona o por funcionalidad; commits descriptivos.

## Equipo

<!-- Completar con nombres y roles (líder técnico / Scrum Master, desarrolladores). -->

## Funcionalidades

- Calificaciones de 1 a 5 estrellas por tutoría, con moderación del administrador.
- Centro de ayuda y casos de soporte: el administrador los ve en su sección «Soporte» (con el contador de casos abiertos), abre cada caso, lo responde y lo pasa a revisión o resuelto. La respuesta le llega al usuario como notificación.
- Notificaciones persistentes: se guardan por usuario en la base de datos (siguen ahí al volver a iniciar sesión), tienen estado leída / sin leer («Marcar todas como leídas») y al hacer clic en una te llevan directo a lo que la generó: la solicitud o tutoría, el caso de soporte, la actualización de datos pendiente, etc. Se crean al pasar los hechos (solicitud nueva, aceptada o rechazada, tutoría completada o cancelada, calificación, caso de soporte, verificación y actualización de datos del tutor); no se regeneran a partir de datos antiguos.
- Cambio de contraseña y configuración de cuenta para los tres roles.
- Foto de perfil y hoja de vida del tutor.
- Materias dinámicas: el administrador agrega materias desde su panel (sección «Materias») y aparecen al instante en el registro de tutores, la búsqueda y el panel del estudiante.
- El tutor guarda todo su formulario (nivel de estudios, nivel de enseñanza, experiencia, modalidad…) y la búsqueda filtra por la modalidad de su perfil, no por sus bloques de disponibilidad.
- Los datos profesionales se cambian con una solicitud de actualización desde «Mi perfil»: el administrador la aprueba o la rechaza (pestaña «Actualizaciones» de Tutores) y mientras tanto el perfil no cambia.
- La disponibilidad del tutor se limita a la modalidad de su perfil (Virtual, Presencial o ambas).
- Verificación de correo al registrarse (`pages/verificar.html`): sin correo verificado no se entra a ningún panel.
- Recuperación de contraseña desde el login (`pages/recuperar.html`), con Firebase Authentication.
