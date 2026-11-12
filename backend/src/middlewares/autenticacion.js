import { NoAutenticado, Prohibido } from "../errores.js";

// Verifica el ID token de Firebase (header Authorization: Bearer <token>)
// y carga el perfil (rol, estado) desde Firestore.
export function crearAutenticacion({ verificarToken, usuarioRepo }) {
  return async function autenticar(req, _res, next) {
    try {
      const [tipo, token] = (req.headers.authorization || "").split(" ");
      if (tipo !== "Bearer" || !token) throw new NoAutenticado("Falta el token de acceso");

      let decodificado;
      try {
        decodificado = await verificarToken(token);
      } catch {
        throw new NoAutenticado("Token inválido o vencido");
      }
      if (!decodificado.email_verified) throw new Prohibido("Debes verificar tu correo primero");

      const perfil = await usuarioRepo.obtenerPorId(decodificado.uid);
      if (!perfil) throw new Prohibido("Tu perfil no existe en la plataforma");
      if (perfil.activo === false) throw new Prohibido("Tu cuenta está desactivada");

      req.usuario = {
        id: decodificado.uid,
        email: decodificado.email || perfil.email || "",
        rol: perfil.rol,
        estado: perfil.estado,
        nombre: perfil.nombre || "",
        apellido: perfil.apellido || ""
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}

export const requerirRol = (...roles) => (req, _res, next) => {
  if (!req.usuario || !roles.includes(req.usuario.rol)) {
    return next(new Prohibido(`Esta acción es solo para: ${roles.join(", ")}`));
  }
  next();
};
