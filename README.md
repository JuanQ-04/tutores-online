# TutoresOn-Line

Plataforma web de tutorías (presenciales y virtuales) que conecta estudiantes con tutores por materia, nivel, zona y disponibilidad.
Proyecto final del curso, con metodología ágil (Scrum).

## Tecnología

- **Frontend:** HTML, CSS y JavaScript (módulos ES), sin bundler.
- **Autenticación y base de datos:** Firebase Authentication + Cloud Firestore (SDK modular por CDN).
- **Backend:** API REST en Node.js + Express (carpeta `backend/`) con Firebase Admin SDK. Se encarga de las reservas
  (sin choques de horario), la búsqueda de tutores, las calificaciones, el correo y la videollamada con Jitsi Meet.
  Documentación interactiva en `/api/docs`. Ver `backend/README.md`.
- **Despliegue:** Azure Static Web Apps, con despliegue automático desde GitHub Actions.

## Roles

| Rol | Qué hace |
|-----|----------|
| Estudiante | Busca tutores, solicita y califica tutorías, abre tickets de soporte |
| Tutor | Completa su perfil y hoja de vida, gestiona disponibilidad, acepta o rechaza solicitudes |
| Administrador | Aprueba tutores, modera calificaciones, atiende mensajes de soporte |

Para crear un administrador: en Firestore → `usuarios` → documento del usuario → `rol: "admin"`.

## Estructura

```
index.html          Landing pública
pages/              Login, registros, buscar, paneles (estudiante, tutor, admin)
css/  js/  images/  Estilos, lógica y recursos
firestore.rules     Reglas de seguridad de Firestore (fuente de verdad)
staticwebapp.config.json   Cabeceras de seguridad y rutas en Azure
.github/workflows/  Despliegue automático
```

## Ejecutar en local

Los módulos ES no funcionan abriendo el archivo directamente; usa un servidor local:

```bash
npx serve .
# o con la extensión Live Server de VS Code
```

Para que reservar, aceptar, calificar y buscar funcionen, también debe estar corriendo el backend
(en otra terminal):

```bash
cd backend
npm install        # solo la primera vez
npm run dev        # http://localhost:4000
```

El frontend detecta `localhost` y usa `http://localhost:4000/api` (ver `js/api.js`). Al desplegar,
cambia `API_URL` en ese archivo por la URL real del backend.

`localhost` ya debe estar en los dominios autorizados de Firebase Authentication.

## Seguridad

- La `apiKey` de `js/firebase-config.js` es un identificador público de Firebase, **no un secreto**. Está restringida por dominio en Google Cloud Console.
- La protección real de los datos está en `firestore.rules`.
- **Nunca** subir: `.env`, cuentas de servicio (`*-adminsdk-*.json`), claves de correo/WhatsApp/IA o secretos OAuth (ver `.gitignore`).

## Publicar las reglas de Firestore desde el repo

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

## Despliegue en Azure

1. En Azure Portal crea un recurso **Static Web App** (plan Free) y enlázalo a este repositorio, rama `main`.
2. Ubicación de la app: `/`. Sin build ni ubicación de API por ahora.
3. Azure agrega a GitHub el secreto `AZURE_STATIC_WEB_APPS_API_TOKEN`. Si el workflow del repo y el generado por Azure chocan, conserva uno solo.
4. Agrega la URL resultante en Firebase → Authentication → Configuración → Dominios autorizados y en las restricciones de la API key.

## Flujo de trabajo

- `main` está protegida: los cambios entran por pull request.
- Ramas por persona o por funcionalidad; commits descriptivos.

## Equipo

<!-- Completar con nombres y roles (líder técnico / Scrum Master, desarrolladores). -->

## Funcionalidades recientes

- Calificaciones de 1 a 5 estrellas por tutoría, con moderación del administrador.
- Centro de ayuda y mensajes de soporte.
- Cambio de contraseña y configuración de cuenta para los tres roles.
- Foto de perfil y hoja de vida del tutor.
- Verificación de correo al registrarse (`pages/verificar.html`): sin correo verificado no se entra a ningún panel.
- Recuperación de contraseña desde el login (`pages/recuperar.html`), con Firebase Authentication.
