# TutoresOn-Line · Backend (API REST)

API en **Node.js + Express** que se conecta a **Firebase** (Auth + Firestore) con el Admin SDK.
Es la **única** pieza que habla con la base de datos: el frontend solo la llama por HTTP con el token
de Firebase del usuario. Aplica las reglas de negocio, valida los datos (lo que antes hacían las reglas
de Firestore), envía los correos y crea las salas de videoconferencia (Jitsi Meet).

## Qué resuelve

| Requisito de la rúbrica | Dónde está |
|---|---|
| API RESTful | `src/routes`, documentada en `/api/docs` (Swagger) |
| Búsqueda por materia, nivel*, zona y disponibilidad | `GET /api/tutores` |
| Reserva sin choques de horario | `SolicitudService.aceptar` (transacción) |
| Gestión de solicitudes por el tutor | `PATCH /api/solicitudes/:id/aceptar` · `rechazar` |
| Reputación por estrellas | `POST /api/calificaciones`, promedio en `GET /api/tutores` |
| Videoconferencia integrada | `JitsiService`: sala única por tutoría virtual |
| Correo con registro de la tutoría | `NotificacionService` + `plantillasCorreo.js` |
| Seguridad y autenticación | Token de Firebase verificado en cada petición, roles, `helmet`, CORS, límite de peticiones |
| SOLID / organización | Capas + inyección de dependencias (ver abajo) |

\* Falta el **nivel educativo**: hoy el perfil del tutor no guarda ese dato (ver «Pendientes»).

## Endpoints

Base: `/api`. Los marcados con 🔒 piden `Authorization: Bearer <token de Firebase>`, correo verificado
y perfil activo. Documentación completa con ejemplos en `/api/docs`.

| Grupo | Endpoints |
|---|---|
| Públicos | `GET /health` · `GET /tutores` · `GET /tutores/:id` · `GET /tutores/:id/calificaciones` · `GET /materias` |
| Cuenta (token, correo puede estar sin verificar) | `POST /usuarios` (crea el perfil tras registrarse) · `GET /usuarios/yo` |
| Mi cuenta 🔒 | `PATCH /usuarios/yo` (nombre y apellido) · `PUT /usuarios/yo/foto` · `POST /usuarios/yo/solicitud-tutor` (tutor) · `GET`, `POST` y `DELETE /usuarios/yo/solicitud-cambio` (tutor aprobado: pedir, ver o cancelar la actualización de sus datos) · `POST /usuarios/yo/disponibilidad` y `DELETE /usuarios/yo/disponibilidad/:id` (tutor) |
| Solicitudes 🔒 | `POST /solicitudes` (estudiante) · `GET /solicitudes/mias` · `PATCH /solicitudes/:id/aceptar` · `.../rechazar` (tutor) · `.../cancelar` (estudiante) |
| Tutorías 🔒 | `GET /tutorias/mias` · `GET /tutorias/:id` · `PATCH /tutorias/:id/completar` (tutor) · `.../cancelar` |
| Calificaciones 🔒 | `POST /calificaciones` (estudiante) · `GET /calificaciones/mias` |
| Soporte 🔒 | `POST /soporte` |
| Notificaciones 🔒 (cualquier rol) | `GET /notificaciones` (las 60 más recientes + `sinLeer`) · `PATCH /notificaciones/:id/leida` · `POST /notificaciones/leer-todas` |
| Administrador 🔒 (rol `admin`) | `GET /admin/usuarios?rol=` · `PATCH /admin/usuarios/:id/activo` · `GET /admin/tutores/:id/hoja-de-vida` (`?pendiente=true` para el PDF de una actualización) · `PATCH /admin/tutores/:id/estado` · `POST /admin/materias` · `GET /admin/cambios-perfil` · `PATCH /admin/cambios-perfil/:id` · `GET /admin/tutorias` · `GET /admin/solicitudes` · `GET /admin/calificaciones` · `PATCH /admin/calificaciones/:id` · `GET /admin/soporte` · `PATCH /admin/soporte/:id` (`estado` y/o `respuesta`) |

Las fechas y marcas de tiempo salen como texto (`"2026-05-20"` o ISO 8601), nunca como objetos de Firestore.
La disponibilidad del tutor se edita por bloques (agregar / quitar), no reemplazando la lista completa, para
no pisar cambios hechos por el servidor al aceptar solicitudes.

### Materias, modalidad y actualización de datos del tutor

- **Materias**: viven en la colección `materias` (el id es el nombre sin tildes ni espacios: «Inglés técnico» →
  `ingles-tecnico`) más seis de base que están en código (`MATERIAS_BASE`), así que los tutores que ya existían no
  necesitan migración. El administrador agrega nuevas con `POST /admin/materias`; `GET /materias` las lista (público)
  y el registro del tutor, la búsqueda y el panel del estudiante las toman de ahí. Por ahora solo se pueden agregar
  (no borrar), para no dejar tutores con una materia que ya no existe.
- **Datos del formulario del tutor**: se guardan completos en su documento de `usuarios` (`titulo`, `nivelEstudios`,
  `institucion`, `materias`, `nivelEnsenanza`, `experiencia`, `modalidad`, `ciudad`, `tarifa`, `franjas`,
  `presentacion`). Las modalidades son `Virtual`, `Presencial` y `Virtual y presencial`.
- **Filtro por modalidad**: `GET /tutores?modalidad=` compara con la modalidad del **perfil** (un tutor «Virtual y
  presencial» aparece en ambos filtros), ya no con sus bloques. `fecha` sí sigue exigiendo un bloque libre ese día.
  Los tutores creados antes de este cambio no tienen modalidad: se deduce de sus bloques hasta que completen sus datos.
- **Disponibilidad limitada a la modalidad del perfil**: «Virtual» solo admite bloques Virtual, «Presencial» solo
  Presencial y «Virtual y presencial» las tres (también sin modalidad guardada). La API lo valida dentro de la misma
  transacción que agrega el bloque.
- **Actualizar datos (aprobación del administrador)**: un tutor aprobado ya no edita sus datos profesionales por
  `PATCH /usuarios/yo`. Envía el formulario con `POST /usuarios/yo/solicitud-cambio`; se guarda en `cambiosPerfil`
  (una por tutor, la nueva reemplaza a la pendiente) solo lo que cambió, y el perfil, la búsqueda y la disponibilidad
  siguen igual hasta que el administrador responde con `PATCH /admin/cambios-perfil/:id` (`aprobada` o `rechazada`,
  con un mensaje opcional). Al aprobar, los datos pasan al perfil en una transacción; si cambió la modalidad, los
  bloques que ya no encajan se quitan y los «Virtual y presencial» pasan a la modalidad única. Una hoja de vida nueva
  espera en `hojasDeVidaPendientes` y reemplaza a la vigente solo si se aprueba.
### Notificaciones y casos de soporte

- **Dónde viven**: subcolección `usuarios/{uid}/notificaciones` (la crea Firestore sola al escribir el primer aviso;
  no hace falta índice ni configuración). Cada aviso guarda `tipo`, `titulo`, `detalle`, `destino`, `leida` y `creadaEn`.
  `GET /notificaciones` devuelve los 60 más recientes y cuántos están sin leer; solo se pueden leer y marcar los propios.
- **Destino**: `destino = { seccion, id?, pestana? }` le dice al panel a dónde llevar al usuario al hacer clic
  (`solicitudes` + id, `tutorias` + id, `soporte` + id, `tutores` + pestaña `pending` / `updates` + id, `perfil`,
  `disponibilidad`, `notificaciones`…). Cada panel resuelve el destino a su propia pantalla.
- **Quién avisa**: los servicios, con `BandejaService` (`avisar` a un usuario, `avisarAdmins` a todos los administradores
  activos) al terminar la operación. Es de «mejor esfuerzo»: si guardar el aviso falla, se registra en consola y la
  operación principal (aceptar, cancelar, calificar…) sigue sin romperse. Es independiente de `NotificacionService`, que
  envía correos.
- **Casos de soporte**: `POST /soporte` guarda el caso y avisa a todos los administradores. En el panel, la sección
  «Soporte» lista los casos; `PATCH /admin/soporte/:id` acepta `estado` (`abierto`, `revision`, `resuelto`) y/o `respuesta`
  (hasta 1000 caracteres, se guarda con `respondidoPor`). La respuesta, o el cambio de estado, le llegan al usuario
  como notificación. No hay una vista «mis casos» para el usuario: lee la respuesta en su lista de notificaciones.

## Estructura

```
backend/
├─ src/
│  ├─ server.js            Arranca el servidor
│  ├─ app.js               Express: seguridad, rutas, errores
│  ├─ container.js         Raíz de composición (aquí se conectan las piezas)
│  ├─ config/              env.js · firebase.js
│  ├─ routes/              Rutas y permisos por rol
│  ├─ controllers/         Delgados: reciben la petición y llaman al servicio
│  ├─ services/            Reglas del negocio (lo más importante)
│  ├─ repositories/        Único lugar del proyecto que habla con Firestore
│  ├─ middlewares/         Autenticación (autenticar / identificar), roles, errores
│  ├─ utils/               Validación, tiempo, textos
│  └─ docs/openapi.js      Swagger
└─ tests/                  90 pruebas de las reglas del negocio y de las rutas (sin internet)
```

El cliente de esta API en el navegador es `../js/api.js`.

## Puesta en marcha (local)

1. **Instalar** (necesitas Node 20 o superior):
   ```bash
   cd backend
   npm install
   ```
2. **Credenciales de Firebase**: Firebase Console → ⚙ Configuración del proyecto → *Cuentas de servicio* →
   *Generar nueva clave privada*. Guarda el archivo como `backend/serviceAccountKey.json`.
   **Nunca lo subas a GitHub** (ya está en `.gitignore`).
3. **Variables de entorno**:
   ```bash
   cp .env.example .env
   ```
   Con eso basta para desarrollar. Sin `SMTP_HOST`, los correos se imprimen en la consola.
4. **Arrancar**:
   ```bash
   npm run dev
   ```
   - API: http://localhost:4000/api/health
   - Documentación: http://localhost:4000/api/docs
5. Tu frontend con `npx serve .` usa el puerto 3000 y el backend el 4000, así que no chocan.

### Probar los endpoints protegidos

Necesitas un token de Firebase de un usuario real. Con sesión iniciada en tu app, abre la
consola del navegador y ejecuta:

```js
const { auth } = await import("/js/firebase-config.js");
console.log(await auth.currentUser.getIdToken());
```

Pega el token en Swagger (botón *Authorize*) o en Postman como `Authorization: Bearer <token>`.
Dura una hora. El usuario debe tener el correo verificado y su perfil creado (se crea al registrarse).

## Correo

Edita `.env` con tu proveedor SMTP. **En Render, el plan gratuito bloquea los puertos SMTP 25, 465 y 587**,
así que allí los correos no saldrán aunque configures SMTP (la reserva sí se guarda y el error queda en el
log). Para correo real en producción usa un plan de pago de Render o un proveedor con API HTTP.
Opciones para desarrollo y la sustentación en local:
- **Gmail**: `SMTP_HOST=smtp.gmail.com`, puerto `587`, usuario = tu correo y una *contraseña de aplicación*
  (requiere verificación en dos pasos).
- **Mailtrap / Ethereal**: bandejas de prueba, no envían correos reales.

Si el envío falla, la reserva **no se cancela**: el error queda en el log del servidor.

## Videoconferencia (Jitsi)

Al aceptar una solicitud **Virtual** (o «Virtual y presencial»), el servidor crea la tutoría con
`enlaceReunion` = `https://meet.jit.si/TutoresOnline-<código aleatorio>`. Las presenciales quedan sin enlace.

Prueba el enlace antes de la sustentación: el servicio público de Jitsi puede pedir que quien
abre la sala primero inicie sesión. Si molesta, cambia `JITSI_BASE_URL` por otra instancia
(por ejemplo una propia o 8x8 JaaS) sin tocar el código.

## Arquitectura y SOLID

- **Responsabilidad única**: rutas → controladores → servicios → repositorios; cada capa hace una cosa.
- **Inversión de dependencias**: los servicios reciben sus dependencias por el constructor y no importan
  Firebase. Por eso las pruebas usan repositorios en memoria.
- **Abierto/cerrado**: para cambiar Jitsi por Google Meet creas otra clase con `crearSala()` y cambias
  una línea en `container.js`. Igual con el correo (`SmtpMailer` / `ConsolaMailer`).
- **Sustitución de Liskov**: `SmtpMailer` y `ConsolaMailer` son intercambiables.
- **Segregación de interfaces**: `ReservaRepository` solo expone lo que la transacción necesita.

## Pruebas

```bash
npm test
```

Cubren: choques de horario, doble aceptación, permisos por rol, fechas pasadas, duplicados,
calificación única, filtros de búsqueda, escape de HTML en correos y enlaces de Jitsi, registro de
usuarios (roles permitidos, tutor incompleto → pendiente → aprobado/rechazado, PDF y foto), disponibilidad,
soporte, operaciones del administrador y permisos de cada ruta, catálogo de materias (alta, duplicados,
validación), datos completos del tutor, filtro por modalidad del perfil, disponibilidad limitada a la modalidad
el ciclo completo de actualización de datos (solicitar, reemplazar, cancelar, aprobar con ajuste de bloques, rechazar) y las notificaciones (quién recibe cada aviso, destino, leídas, privacidad entre usuarios y que un fallo nunca rompe la operación).

## Despliegue en Render

Lo hace el `render.yaml` de la raíz del repositorio (New → Blueprint). Para este servicio:

- Directorio raíz: `backend` · Build: `npm ci` · Start: `npm start` · Health check: `/api/health`.
- Variables de entorno (en el panel de Render, nunca el archivo JSON): `FIREBASE_PROJECT_ID`,
  `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (copiada tal cual del JSON, con los `\n`),
  `CORS_ORIGINS` (URL del sitio estático, sin barra final) y, si quieres correo, las `SMTP_*`.
  Alternativa a las tres primeras: un *Secret File* con el JSON y `GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/<nombre>.json`.
- Render termina el HTTPS delante de la API; `app.js` usa `trust proxy` para que el límite de peticiones
  use la IP real de cada usuario (`RATE_LIMIT_MAX`, por defecto 1000 cada 15 minutos).
- Plan gratuito: la API se duerme tras ~15 minutos sin tráfico y la primera petición tarda cerca de un minuto.

## Pendientes y mejoras posibles

- **Nivel educativo**: el tutor ya guarda `nivelEstudios` y `nivelEnsenanza`; falta un filtro `nivel` en `TutorService` y en la búsqueda.
- **Completar tutoría**: hoy se puede marcar como completada antes de que empiece (igual que tu frontend).
  Para exigir que la hora ya haya pasado, valida con `reloj.yaPaso` en `TutoriaService.completar`.
- **Rendimiento**: el promedio de estrellas se calcula al consultar. Si crece mucho, guárdalo
  agregado en el documento del tutor.
- **Tiempo real**: los paneles consultan la API cada 30 s (`sondear` en `js/api.js`). Si hace falta
  inmediatez, se puede agregar Server-Sent Events o WebSocket en la API sin exponer Firestore al navegador.
