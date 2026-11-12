import { ErrorConfiguracion, NoAutenticado, Prohibido } from "../errores.js";

// Dos formas de entrar, las dos con el ID token de Firebase (Authorization: Bearer <token>):
//  - autenticar:  cuenta completa. Correo verificado, perfil existente y activo. Carga req.usuario.
//  - identificar: solo comprueba el token (el correo puede estar sin verificar y el perfil puede
//                 no existir todavía). Sirve para el registro y para leer el propio perfil.
//                 Carga req.identidad = { id, email, perfil | null }.
export function crearAutenticacion({ verificarToken, usuarioRepo }) {
  async function leerToken(req) {
    const [tipo, token] = (req.headers.authorization || "").split(" ");
    if (tipo !== "Bearer" || !token) throw new NoAutenticado("Falta el token de acceso");
    try {
      return await verificarToken(token);
    } catch (error) {
      // Si el servidor mismo está mal configurado, no se le echa la culpa al token del usuario.
      if (error instanceof ErrorConfiguracion) throw error;
      throw new NoAutenticado("Token inválido o vencido");
    }
  }

  async function autenticar(req, _res, next) {
    try {
      const decodificado = await leerToken(req);
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
  }

  async function identificar(req, _res, next) {
    try {
      const decodificado = await leerToken(req);
      req.identidad = {
        id: decodificado.uid,
        email: decodificado.email || "",
        perfil: await usuarioRepo.obtenerPorId(decodificado.uid)
      };
      next();
    } catch (error) {
      next(error);
    }
  }

  return { autenticar, identificar };
}

export const requerirRol = (...roles) => (req, _res, next) => {
  if (!req.usuario || !roles.includes(req.usuario.rol)) {
    return next(new Prohibido(`Esta acción es solo para: ${roles.join(", ")}`));
  }
  next();
};
