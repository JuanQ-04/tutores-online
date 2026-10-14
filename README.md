# tutores-online

## Últimos cambios: calificaciones, perfil del administrador y configuración

**Calificaciones**
- El tutor marca la tutoría como *completada* → el estudiante la abre en *Mis tutorías → Completadas* y la califica de 1 a 5 estrellas con comentario (una sola vez).
- Se guardan en la colección `calificaciones` (el id del documento es el id de la tutoría).
- El promedio aparece en *Buscar tutores* (panel y catálogo público), en el perfil del tutor y en el Inicio/Mi perfil del tutor.
- El administrador, en *Calificaciones*, filtra por materia, tutor y estado, y puede editar las estrellas, ocultar la calificación y dejar retroalimentación (la ve el tutor).

**Perfil del administrador**
- `admin.js` ahora es módulo y lee/guarda nombre y apellido en `usuarios/{uid}`.
- Si alguien sin rol `admin` abre `admin.html`, se le manda a su panel.
- *Tutorías* del admin muestra los mensajes reales de soporte (`mensajesSoporte`): Abierto → En revisión → Resuelto.

**Configuración de los perfiles (los 3 roles)**
- `js/configuracion.js` + `css/configuracion.css`, compartidos.
- *Configuración → Seguridad y cuenta*: cambio real de contraseña (pide la actual), correo para restablecerla, datos de la sesión y cerrar sesión.
- *Centro de ayuda*: preguntas frecuentes y formulario/modal para escribir al equipo (llega al admin en *Tutorías*).

**Firestore**
- Publicar el `firestore.rules` actualizado (se agregaron `calificaciones` y `mensajesSoporte`).
- Para tener un administrador: en Firestore → `usuarios` → el documento del usuario → `rol: "admin"`.
