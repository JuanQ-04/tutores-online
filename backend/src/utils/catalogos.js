// Catálogos cerrados: los mismos valores que ofrecen los formularios del frontend.
// Las materias SÍ son abiertas: estas son las de base y el administrador puede agregar más
// (colección «materias», ver MateriaService).
export const MATERIAS_BASE = [
  { id: "matematicas", nombre: "Matemáticas" },
  { id: "fisica", nombre: "Física" },
  { id: "quimica", nombre: "Química" },
  { id: "programacion", nombre: "Programación" },
  { id: "idiomas", nombre: "Idiomas" },
  { id: "estadistica", nombre: "Estadística" }
];
export const FRANJAS = ["manana", "tarde", "noche"];
export const MODALIDADES = ["Virtual", "Presencial", "Virtual y presencial"];
export const NIVELES_ESTUDIO = ["tecnico", "pregrado-curso", "pregrado", "posgrado"];
export const NIVELES_ENSENANZA = ["secundaria", "universitario", "ambos"];
export const ROLES_REGISTRABLES = ["estudiante", "tutor"];
export const ESTADOS_CASO = ["abierto", "revision", "resuelto"];
export const ESTADOS_TUTOR_APROBADO = ["aprobado", "aceptado"];

export const esTutorAprobado = (usuario) =>
  usuario?.rol === "tutor" && ESTADOS_TUTOR_APROBADO.includes(usuario.estado);

// Modalidades de bloque que un tutor puede ofrecer según la que eligió en su perfil:
// «Virtual» → solo Virtual, «Presencial» → solo Presencial, «Virtual y presencial» → las tres.
// Un perfil antiguo sin modalidad guardada no tiene restricción hasta que la complete.
export const modalidadesPermitidas = (modalidad) =>
  modalidad === "Virtual" || modalidad === "Presencial" ? [modalidad] : MODALIDADES;
