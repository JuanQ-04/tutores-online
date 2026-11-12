import { escaparHtml } from "../utils/texto.js";

// Arma el correo (HTML + texto plano). Todo dato del usuario se escapa.
function armar({ titulo, intro, detalles = [], enlace }) {
  const filas = detalles
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#555">${escaparHtml(k)}</td><td><strong>${escaparHtml(v)}</strong></td></tr>`)
    .join("");
  const boton = enlace
    ? `<p><a href="${escaparHtml(enlace)}" style="background:#1f6feb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Unirme a la videollamada</a></p>
       <p style="color:#555;font-size:13px">Si el botón no funciona, copia este enlace: ${escaparHtml(enlace)}</p>`
    : "";
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px">
    <h2>${escaparHtml(titulo)}</h2><p>${escaparHtml(intro)}</p>
    <table>${filas}</table>${boton}
    <p style="color:#888;font-size:12px">TutoresOn-Line</p></div>`;
  const texto = [titulo, "", intro, "", ...detalles.map(([k, v]) => `${k}: ${v}`), enlace ? `\nEnlace: ${enlace}` : ""].join("\n");
  return { html, texto };
}

const resumen = (s) => [
  ["Materia", s.materia],
  ["Fecha", s.fecha],
  ["Horario", `${s.horaInicio} – ${s.horaFin}`],
  ["Modalidad", s.modalidad]
];

export const plantillas = {
  nuevaSolicitud: (solicitud) => ({
    asunto: "Nueva solicitud de tutoría",
    ...armar({
      titulo: "Tienes una nueva solicitud",
      intro: `${solicitud.estudianteNombre} quiere reservar una tutoría contigo. Entra a tu panel para aceptarla o rechazarla.`,
      detalles: [...resumen(solicitud), ...(solicitud.mensaje ? [["Mensaje", solicitud.mensaje]] : [])]
    })
  }),

  solicitudRechazada: (solicitud) => ({
    asunto: "Tu solicitud de tutoría no fue aceptada",
    ...armar({
      titulo: "Solicitud no aceptada",
      intro: `${solicitud.tutorNombre} no puede atender esta solicitud. Puedes buscar otro horario u otro tutor.`,
      detalles: resumen(solicitud)
    })
  }),

  tutoriaProgramada: (tutoria, conQuien) => ({
    asunto: "Tutoría programada",
    ...armar({
      titulo: "¡Tu tutoría quedó programada!",
      intro: "Este correo es el registro de tu tutoría.",
      detalles: [["Con", conQuien], ...resumen(tutoria)],
      enlace: tutoria.enlaceReunion || undefined
    })
  }),

  tutoriaCancelada: (tutoria, canceladaPor) => ({
    asunto: "Tutoría cancelada",
    ...armar({
      titulo: "Una tutoría fue cancelada",
      intro: `${canceladaPor} canceló esta tutoría.`,
      detalles: resumen(tutoria)
    })
  })
};
