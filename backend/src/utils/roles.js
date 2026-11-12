export const ESTADOS_TUTOR_APROBADO = ["aprobado", "aceptado"];

export const esTutorAprobado = (usuario) =>
  usuario?.rol === "tutor" && ESTADOS_TUTOR_APROBADO.includes(usuario.estado);
