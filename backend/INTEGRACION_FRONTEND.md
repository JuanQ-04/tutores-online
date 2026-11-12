# Conectar el frontend con la API (cambio por cambio)

Hazlo **de a un flujo por vez** y prueba cada uno antes de pasar al siguiente.
La lectura de datos (listas del panel) puede seguir usando Firestore; lo que se
mueve a la API son las **escrituras con reglas de negocio**.

Primero copia `frontend-snippets/api.js` a `js/api.js` de tu frontend.

## 1. Estudiante reserva (`js/estudiante.js`, ~línea 1462–1495)

Reemplaza la consulta de duplicados + el `addDoc(...)` por una sola llamada.
El servidor ya valida duplicados, horario real del tutor, tarifa y fechas pasadas.

```js
import { api } from "./api.js";
// ...
try {
  nextBtn.disabled = true;
  if (note) note.textContent = "Enviando solicitud…";

  await api.crearSolicitud({
    tutorId:    reservaTutor.id,
    materia,
    fecha:      reservaBloque.fecha,
    horaInicio: reservaBloque.horaInicio,
    horaFin:    reservaBloque.horaFin,
    modalidad:  reservaBloque.modalidad,
    mensaje
  });

  await cargarTutorias(estudianteUid);
  refrescarVistas();
  $("#reserva-card").hidden = true;
  $("#reserva-ok").hidden = false;
} catch (err) {
  // El mensaje viene del servidor: "Ese horario ya no está disponible", etc.
  if (note) note.textContent = err.message;
} finally {
  nextBtn.disabled = false;
  enviandoSolicitud = false;
}
```

## 2. Tutor acepta (`js/tutor.js`, ~línea 1080–1135)

Borra el `writeBatch` y la validación local de choques; el servidor lo hace en una transacción.

```js
try {
  await api.aceptarSolicitud(solicitudId);
  await Promise.all([cargarSolicitudes(tutorUid), cargarTutorias(tutorUid)]); // tus funciones de recarga
  // ...cerrar diálogo, toast, renderAll()
} catch (err) {
  showToast(err.message);
}
```

## 3. Tutor rechaza / completa / cancela

```js
await api.rechazarSolicitud(solicitudId);            // tutor.js ~1144
await api.completarTutoria(tutoriaId);               // tutor.js ~1166 (nuevoEstado === "completada")
await api.cancelarTutoria(tutoriaId);                // tutor.js ~1166 (nuevoEstado === "cancelada")
```

## 4. Estudiante cancela (`js/estudiante.js`, ~línea 882–886)

```js
if (selectedSession.tipo === "solicitud") await api.cancelarSolicitud(selectedSession.id);
else                                      await api.cancelarTutoria(selectedSession.id);
```

## 5. Estudiante califica (`js/estudiante.js`, ~línea 800–825)

Reemplaza el objeto `datos` y el `setDoc(...)`:

```js
await api.calificar({ tutoriaId: raw.id, estrellas: valor, comentario });
```

## 6. Buscar tutores (`js/buscar.js`, ~línea 110–175, y `cargarTutores` en `js/estudiante.js`, ~línea 911)

Un solo `fetch` reemplaza las dos consultas a Firestore (tutores + calificaciones):

```js
import { api } from "./api.js";

const { tutores } = await api.buscarTutores({ limite: 100 });
TUTORES = tutores.map((t, i) => ({
  id: t.id,
  name: `${t.nombre} ${t.apellido}`.trim(),
  materias: t.materias,
  subject: t.materias.map(materiaLabel).join(", ") || "General",
  titulo: t.titulo || "Profesional",
  lugar: t.ciudad || "Colombia",
  bio: t.presentacion || "Tutor registrado en la plataforma.",
  tarifa: t.tarifa,
  disponibilidad: t.disponibilidad,   // ya viene filtrada: sin pasados ni ocupados
  foto: t.fotoURL,
  tone: TONES[i % TONES.length],
  promedio: t.promedio,
  opiniones: t.opiniones
}));
```

Los filtros por materia, ciudad, modalidad y fecha también pueden hacerse en el servidor:
`api.buscarTutores({ materia: "matematicas", ciudad: "Bogotá", fecha: "2026-11-20" })`.

## 7. Mostrar la videollamada

Cuando el tutor acepta una solicitud virtual, la tutoría trae `enlaceReunion`
(sala de Jitsi). Ese campo ya llega con tus lecturas actuales de Firestore; solo
falta mostrar el botón en el detalle de la tutoría (estudiante y tutor):

```js
const enlace = raw.enlaceReunion;
if (enlace && enlace.startsWith("https://")) {
  html += `<a class="btn" href="${escapeHTML(enlace)}" target="_blank" rel="noopener noreferrer">Unirme a la videollamada</a>`;
}
```

Se abre en una pestaña nueva, así que **no necesitas cambiar tu CSP** por Jitsi.

## 8. Cuando todo funcione: cerrar `firestore.rules`

El Admin SDK del servidor **ignora** las reglas, así que puedes prohibir esas
escrituras desde el navegador. Hazlo flujo por flujo, probando en el Simulador:

| Colección | Quitar del cliente |
|-----------|--------------------|
| `solicitudes` | `allow create` y `allow update` |
| `tutorias` | `allow create` y `allow update` |
| `calificaciones` | `allow create` (deja `update`/`delete` del admin) |

`usuarios`, `hojasDeVida`, `mensajesSoporte` y la moderación del admin siguen igual por ahora.

## 9. Ajustes al desplegar

1. **CSP** en `staticwebapp.config.json`: agrega la URL del backend a `connect-src`
   (p. ej. `https://tu-backend.onrender.com`).
2. **CORS** en el backend: pon la URL de tu Static Web App en `CORS_ORIGINS`.
3. **`API_URL`** en `js/api.js`: la URL real del backend.
4. Si el backend vive dentro del mismo repo (carpeta `backend/`), Azure Static Web Apps
   publicaría esa carpeta junto al sitio. Para que no sea pública, agrega en
   `staticwebapp.config.json` un arreglo `routes` con esta regla:
   `"routes": [ { "route": "/backend/*", "statusCode": 404 } ]`.
   La opción más limpia es un repositorio aparte para la API.
