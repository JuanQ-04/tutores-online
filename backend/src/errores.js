// Falla de configuración del servidor (por ejemplo, faltan las credenciales de Firebase).
// No es culpa del usuario: sale como 500 y el detalle queda en el log del servidor.
export class ErrorConfiguracion extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = "ErrorConfiguracion";
  }
}

// Errores de dominio. El manejador global los convierte en respuestas HTTP.
export class ErrorApp extends Error {
  constructor(status, codigo, mensaje, detalles) {
    super(mensaje);
    this.name = new.target.name;
    this.status = status;
    this.codigo = codigo;
    this.detalles = detalles;
  }
}

export class ErrorValidacion extends ErrorApp {
  constructor(mensaje, detalles) { super(400, "VALIDACION", mensaje, detalles); }
}
export class NoAutenticado extends ErrorApp {
  constructor(mensaje = "No autenticado") { super(401, "NO_AUTENTICADO", mensaje); }
}
export class Prohibido extends ErrorApp {
  constructor(mensaje = "No tienes permiso para esta acción") { super(403, "PROHIBIDO", mensaje); }
}
export class NoEncontrado extends ErrorApp {
  constructor(mensaje = "Recurso no encontrado") { super(404, "NO_ENCONTRADO", mensaje); }
}
export class Conflicto extends ErrorApp {
  constructor(mensaje = "Conflicto con el estado actual") { super(409, "CONFLICTO", mensaje); }
}
