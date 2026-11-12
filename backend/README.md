# TutoresOn-Line · Backend (API REST)

API en **Node.js + Express** que se conecta a tu **Firebase** (Auth + Firestore) con el Admin SDK.
No reemplaza tu frontend: se encarga de las operaciones con reglas de negocio, de los correos
y de la videoconferencia (Jitsi Meet).

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
│  ├─ repositories/        Único lugar que habla con Firestore
│  ├─ middlewares/         Autenticación por token, roles, errores
│  ├─ utils/               Validación, tiempo, textos
│  └─ docs/openapi.js      Swagger
├─ tests/                  28 pruebas de las reglas del negocio (sin internet)
├─ frontend-snippets/api.js  Cliente para copiar a tu frontend
└─ INTEGRACION_FRONTEND.md   Cambios exactos en tus archivos JS
```

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
Dura una hora. El usuario debe tener el correo verificado y su perfil en la colección `usuarios`.

## Correo

Edita `.env` con tu proveedor SMTP. Opciones para la sustentación:
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
calificación única, filtros de búsqueda, escape de HTML en correos y enlaces de Jitsi.

## Despliegue

1. Sube el backend a Render, Railway o Azure App Service (revisa el plan gratuito vigente de cada uno).
2. Directorio raíz: `backend` · Build: `npm install` · Start: `npm start`.
3. Variables de entorno en el panel (no uses el archivo JSON en producción):
   `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
   (copiada tal cual del JSON, con los `\n`), `CORS_ORIGINS` (URL de tu Static Web App),
   y las `SMTP_*`.
4. Sigue la sección 9 de `INTEGRACION_FRONTEND.md` (CSP, `API_URL`, carpeta `backend/`).

## Pendientes y mejoras posibles

- **Nivel educativo**: agregar el campo al registro del tutor y un filtro `nivel` en `TutorService`.
- **Endpoints de administrador**: aprobar tutores y moderar calificaciones siguen en el frontend.
- **Completar tutoría**: hoy se puede marcar como completada antes de que empiece (igual que tu frontend).
  Para exigir que la hora ya haya pasado, valida con `reloj.yaPaso` en `TutoriaService.completar`.
- **Rendimiento**: el promedio de estrellas se calcula al consultar. Si crece mucho, guárdalo
  agregado en el documento del tutor.
- **Tiempo real**: Firestore ya ofrece `onSnapshot` para refrescar paneles sin recargar.
