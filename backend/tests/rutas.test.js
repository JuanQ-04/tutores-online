// Prueba de extremo a extremo SIN internet: Express real + controladores + servicios reales,
// con repositorios en memoria y una verificación de token simulada.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { crearApp } from "../src/app.js";
import { crearAutenticacion } from "../src/middlewares/autenticacion.js";
import { TutorService } from "../src/services/TutorService.js";
import { SolicitudService } from "../src/services/SolicitudService.js";
import { TutoriaService } from "../src/services/TutoriaService.js";
import { CalificacionService } from "../src/services/CalificacionService.js";
import { UsuarioService } from "../src/services/UsuarioService.js";
import { SoporteService } from "../src/services/SoporteService.js";
import { AdminService } from "../src/services/AdminService.js";
import { CambioPerfilService } from "../src/services/CambioPerfilService.js";
import { crearTutorController } from "../src/controllers/tutorController.js";
import { crearSolicitudController } from "../src/controllers/solicitudController.js";
import { crearTutoriaController } from "../src/controllers/tutoriaController.js";
import { crearCalificacionController } from "../src/controllers/calificacionController.js";
import { crearUsuarioController } from "../src/controllers/usuarioController.js";
import { crearSoporteController } from "../src/controllers/soporteController.js";
import { crearAdminController } from "../src/controllers/adminController.js";
import { crearMateriaController } from "../src/controllers/materiaController.js";
import { crearBandejaController } from "../src/controllers/bandejaController.js";
import { crearMundo, sembrar, relojFijo } from "./helpers/fakes.js";

let servidor, base, mundo;
const PDF_GRANDE = "data:application/pdf;base64," + "A".repeat(900_000);

// El "token" es "uid" o "uid:sinverificar" (solo para la prueba).
const verificarToken = async (token) => {
  const [uid, bandera] = token.split(":");
  if (uid === "malo") throw new Error("token inválido");
  return { uid, email: `${uid}@test.com`, email_verified: bandera !== "sinverificar" };
};

before(async () => {
  mundo = crearMundo();
  sembrar(mundo);
  const reloj = relojFijo();
  const m = { ...mundo, reloj };

  const { autenticar, identificar } = crearAutenticacion({ verificarToken, usuarioRepo: mundo.usuarioRepo });
  const cambioPerfilService = new CambioPerfilService(m);
  const controladores = {
    tutores: crearTutorController({ tutorService: new TutorService(m) }),
    materias: crearMateriaController({ materiaService: m.materiaService }),
    usuarios: crearUsuarioController({ usuarioService: new UsuarioService(m), cambioPerfilService }),
    solicitudes: crearSolicitudController({ solicitudService: new SolicitudService(m) }),
    tutorias: crearTutoriaController({ tutoriaService: new TutoriaService(m) }),
    calificaciones: crearCalificacionController({ calificacionService: new CalificacionService(m) }),
    soporte: crearSoporteController({ soporteService: new SoporteService(m) }),
    notificaciones: crearBandejaController({ bandejaService: m.avisos }),
    admin: crearAdminController({ adminService: new AdminService(m), materiaService: m.materiaService, cambioPerfilService })
  };
  const app = crearApp({ autenticar, identificar, controladores, origenesCors: ["http://localhost:3000"] });

  await new Promise((resolve) => { servidor = app.listen(0, resolve); });
  base = `http://localhost:${servidor.address().port}/api`;
});

after(() => servidor.close());

async function llamar(metodo, ruta, { token, cuerpo } = {}) {
  const r = await fetch(base + ruta, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
  });
  return { status: r.status, datos: await r.json().catch(() => ({})) };
}

test("público: buscar tutores no pide sesión; sin token lo demás es 401", async () => {
  assert.equal((await llamar("GET", "/tutores")).status, 200);
  assert.equal((await llamar("GET", "/usuarios/yo")).status, 401);
  assert.equal((await llamar("GET", "/solicitudes/mias")).status, 401);
  assert.equal((await llamar("GET", "/usuarios/yo", { token: "malo" })).status, 401);
});

test("registro: con el correo SIN verificar se crea el perfil y se lee; el resto sigue bloqueado", async () => {
  const t = "nuevoGoogle:sinverificar";
  assert.equal((await llamar("GET", "/usuarios/yo", { token: t })).status, 404); // aún no hay perfil

  const creado = await llamar("POST", "/usuarios", { token: t, cuerpo: { nombre: "Gala", apellido: "Rey", rol: "estudiante" } });
  assert.equal(creado.status, 201);
  assert.equal(creado.datos.estado, "activo");

  const repetido = await llamar("POST", "/usuarios", { token: t, cuerpo: { nombre: "Otra", apellido: "Cosa", rol: "tutor" } });
  assert.equal(repetido.status, 200);
  assert.equal(repetido.datos.rol, "estudiante"); // no se pudo cambiar

  assert.equal((await llamar("GET", "/usuarios/yo", { token: t })).status, 200);
  assert.equal((await llamar("PATCH", "/usuarios/yo", { token: t, cuerpo: { nombre: "Zoe" } })).status, 403); // correo sin verificar
  assert.equal((await llamar("POST", "/soporte", { token: t, cuerpo: { asunto: "a", mensaje: "b" } })).status, 403);
});

test("registro: el rol admin se rechaza por HTTP", async () => {
  const r = await llamar("POST", "/usuarios", { token: "otroNuevo", cuerpo: { nombre: "Eve", apellido: "Hack", rol: "admin" } });
  assert.equal(r.status, 400);
  assert.equal(mundo.datos.usuarios.has("otroNuevo"), false);
});

test("mi cuenta: perfil, foto, soporte y calificaciones propias", async () => {
  assert.equal((await llamar("PATCH", "/usuarios/yo", { token: "est1", cuerpo: { nombre: "Luisa" } })).status, 200);
  assert.equal((await llamar("PATCH", "/usuarios/yo", { token: "est1", cuerpo: { rol: "admin" } })).status, 400);
  assert.equal(mundo.datos.usuarios.get("est1").rol, "estudiante");

  // La foto pesa más de 50 KB: pasa por su propio límite (300 KB).
  const foto = "data:image/jpeg;base64," + "A".repeat(150_000);
  assert.equal((await llamar("PUT", "/usuarios/yo/foto", { token: "est1", cuerpo: { fotoURL: foto } })).status, 200);

  const caso = await llamar("POST", "/soporte", { token: "est1", cuerpo: { asunto: "Hola", mensaje: "Necesito ayuda" } });
  assert.equal(caso.status, 201);
  assert.equal(caso.datos.usuarioId, "est1");

  const mias = await llamar("GET", "/calificaciones/mias", { token: "est1" });
  assert.equal(mias.status, 200);
  assert.ok(Array.isArray(mias.datos));
});

test("límites de cuerpo: 50 KB en general, más solo en foto y solicitud de tutor", async () => {
  const demasiado = await llamar("POST", "/soporte", { token: "est1", cuerpo: { asunto: "a", mensaje: "x".repeat(60_000) } });
  assert.equal(demasiado.status, 400);
  assert.equal(demasiado.datos.error.codigo, "JSON_INVALIDO");

  const envio = await llamar("POST", "/usuarios/yo/solicitud-tutor", {
    token: "nuevo1",
    cuerpo: {
      titulo: "Ingeniería", nivelEstudios: "pregrado", institucion: "UNAL", presentacion: "Hola", materias: ["fisica"],
      nivelEnsenanza: "universitario", experiencia: 2, modalidad: "Virtual", ciudad: "Cali", franjas: ["tarde"], tarifa: 30000,
      hojaVida: { nombreArchivo: "cv.pdf", tamano: 600_000, dataURL: PDF_GRANDE }
    }
  });
  assert.equal(envio.status, 200);
  assert.equal(mundo.datos.usuarios.get("nuevo1").estado, "pendiente");
  assert.ok(mundo.datos.hojasDeVida.get("nuevo1").dataURL.length > 800_000);
});

test("disponibilidad del tutor por HTTP: agregar y quitar", async () => {
  const nuevo = await llamar("POST", "/usuarios/yo/disponibilidad", {
    token: "tutor1", cuerpo: { fecha: "2026-11-25", horaInicio: "09:00", horaFin: "10:00", modalidad: "Presencial" }
  });
  assert.equal(nuevo.status, 201);
  const id = nuevo.datos.bloque.id;
  assert.equal((await llamar("DELETE", `/usuarios/yo/disponibilidad/${id}`, { token: "tutor1" })).status, 200);
  assert.equal((await llamar("DELETE", `/usuarios/yo/disponibilidad/${id}`, { token: "tutor1" })).status, 404);
  assert.equal((await llamar("POST", "/usuarios/yo/disponibilidad", { token: "est1", cuerpo: {} })).status, 403); // rol
});

test("panel de administración: solo el rol admin", async () => {
  for (const ruta of ["/admin/usuarios", "/admin/tutorias", "/admin/solicitudes", "/admin/calificaciones", "/admin/soporte"]) {
    assert.equal((await llamar("GET", ruta, { token: "est1" })).status, 403, `${ruta} estudiante`);
    assert.equal((await llamar("GET", ruta, { token: "tutor1" })).status, 403, `${ruta} tutor`);
    assert.equal((await llamar("GET", ruta, { token: "admin1" })).status, 200, `${ruta} admin`);
  }
  assert.equal((await llamar("PATCH", "/admin/usuarios/est2/activo", { token: "est1", cuerpo: { activo: false } })).status, 403);
  assert.equal(mundo.datos.usuarios.get("est2").activo, undefined);

  const susp = await llamar("PATCH", "/admin/usuarios/est2/activo", { token: "admin1", cuerpo: { activo: false } });
  assert.equal(susp.status, 200);
  assert.equal(mundo.datos.usuarios.get("est2").activo, false);

  const tutores = await llamar("GET", "/admin/usuarios?rol=tutor", { token: "admin1" });
  assert.ok(tutores.datos.length >= 1 && tutores.datos.every((u) => u.rol === "tutor"));
});

test("materias: el catálogo es público y solo un administrador agrega materias", async () => {
  const lista = await llamar("GET", "/materias");
  assert.equal(lista.status, 200);
  assert.equal(lista.datos.length, 6);

  assert.equal((await llamar("POST", "/admin/materias", { cuerpo: { nombre: "Dibujo" } })).status, 401);
  assert.equal((await llamar("POST", "/admin/materias", { token: "est1", cuerpo: { nombre: "Dibujo" } })).status, 403);
  assert.equal((await llamar("POST", "/admin/materias", { token: "tutor1", cuerpo: { nombre: "Dibujo" } })).status, 403);

  const creada = await llamar("POST", "/admin/materias", { token: "admin1", cuerpo: { nombre: "Dibujo técnico" } });
  assert.equal(creada.status, 201);
  assert.equal(creada.datos.id, "dibujo-tecnico");
  assert.equal((await llamar("POST", "/admin/materias", { token: "admin1", cuerpo: { nombre: "dibujo tecnico" } })).status, 409);
  assert.equal((await llamar("POST", "/admin/materias", { token: "admin1", cuerpo: { nombre: "" } })).status, 400);

  const despues = await llamar("GET", "/materias");
  assert.equal(despues.datos.length, 7);
  assert.equal(despues.datos.at(-1).nombre, "Dibujo técnico");
});

test("solicitud de cambio de perfil por HTTP: el tutor la pide, el administrador la responde", async () => {
  // Perfil completo del tutor aprobado (en la vida real lo dejó así su solicitud inicial).
  Object.assign(mundo.datos.usuarios.get("tutor1"), {
    titulo: "Ingeniería", nivelEstudios: "pregrado", institucion: "UNAL", nivelEnsenanza: "ambos",
    experiencia: 2, modalidad: "Virtual y presencial", franjas: ["tarde"]
  });
  const t = mundo.datos.usuarios.get("tutor1");
  const formulario = (extra = {}) => ({
    titulo: t.titulo, nivelEstudios: t.nivelEstudios, institucion: t.institucion, materias: t.materias,
    nivelEnsenanza: t.nivelEnsenanza, experiencia: t.experiencia, modalidad: t.modalidad, ciudad: t.ciudad,
    tarifa: t.tarifa, franjas: t.franjas, presentacion: t.presentacion, ...extra
  });

  assert.equal((await llamar("GET", "/usuarios/yo/solicitud-cambio", { token: "est1" })).status, 403);
  assert.deepEqual((await llamar("GET", "/usuarios/yo/solicitud-cambio", { token: "tutor1" })).datos, { solicitud: null });
  assert.equal((await llamar("POST", "/usuarios/yo/solicitud-cambio", { token: "tutor1", cuerpo: formulario() })).status, 400); // sin cambios

  const pedida = await llamar("POST", "/usuarios/yo/solicitud-cambio", { token: "tutor1", cuerpo: formulario({ modalidad: "Virtual", tarifa: 52000 }) });
  assert.equal(pedida.status, 201);
  assert.deepEqual(pedida.datos.cambios, { modalidad: "Virtual", tarifa: 52000 });
  assert.equal(t.tarifa, 40000); // todavía no cambia

  const lista = await llamar("GET", "/admin/cambios-perfil", { token: "admin1" });
  assert.equal(lista.status, 200);
  assert.equal(lista.datos[0].tutorId, "tutor1");
  assert.equal((await llamar("GET", "/admin/cambios-perfil", { token: "tutor1" })).status, 403);
  assert.equal((await llamar("PATCH", "/admin/cambios-perfil/tutor1", { token: "tutor1", cuerpo: { estado: "aprobada" } })).status, 403);

  const resuelta = await llamar("PATCH", "/admin/cambios-perfil/tutor1", { token: "admin1", cuerpo: { estado: "aprobada" } });
  assert.equal(resuelta.status, 200);
  assert.equal(t.tarifa, 52000);
  assert.equal(t.modalidad, "Virtual");

  // Con modalidad «Virtual» ya no puede crear un bloque presencial.
  const presencial = await llamar("POST", "/usuarios/yo/disponibilidad", {
    token: "tutor1", cuerpo: { fecha: "2026-12-01", horaInicio: "09:00", horaFin: "10:00", modalidad: "Presencial" }
  });
  assert.equal(presencial.status, 400);

  const mia = await llamar("GET", "/usuarios/yo/solicitud-cambio", { token: "tutor1" });
  assert.equal(mia.datos.solicitud.estado, "aprobada");
  assert.equal((await llamar("DELETE", "/usuarios/yo/solicitud-cambio", { token: "tutor1" })).status, 409); // ya respondida
});

test("notificaciones por HTTP: cada quien ve solo las suyas, las marca como leídas y el administrador responde un caso", async () => {
  assert.equal((await llamar("GET", "/notificaciones")).status, 401);

  const caso = await llamar("POST", "/soporte", { token: "est1", cuerpo: { asunto: "Ayuda", mensaje: "No carga mi perfil" } });
  assert.equal(caso.status, 201);

  const admin = await llamar("GET", "/notificaciones", { token: "admin1" });
  assert.equal(admin.status, 200);
  const aviso = admin.datos.avisos.find((a) => a.tipo === "soporte-nuevo" && a.destino.id === caso.datos.id);
  assert.ok(aviso, "el administrador debe recibir el caso");
  assert.ok(admin.datos.sinLeer >= 1);

  // el estudiante no ve la del administrador y no puede marcarla
  const est = await llamar("GET", "/notificaciones", { token: "est1" });
  assert.ok(!est.datos.avisos.some((a) => a.id === aviso.id));
  assert.equal((await llamar("PATCH", `/notificaciones/${aviso.id}/leida`, { token: "est1" })).status, 404);

  assert.equal((await llamar("PATCH", `/notificaciones/${aviso.id}/leida`, { token: "admin1" })).status, 200);
  const despues = await llamar("GET", "/notificaciones", { token: "admin1" });
  assert.equal(despues.datos.avisos.find((a) => a.id === aviso.id).leida, true);
  assert.equal(despues.datos.sinLeer, admin.datos.sinLeer - 1);

  // responder el caso: llega al estudiante como notificación y queda en el caso
  const resp = await llamar("PATCH", `/admin/soporte/${caso.datos.id}`, {
    token: "admin1", cuerpo: { estado: "resuelto", respuesta: "Ya lo revisamos, prueba de nuevo." }
  });
  assert.equal(resp.status, 200);
  assert.equal((await llamar("PATCH", `/admin/soporte/${caso.datos.id}`, { token: "est1", cuerpo: { estado: "resuelto" } })).status, 403);
  const delEst = await llamar("GET", "/notificaciones", { token: "est1" });
  assert.equal(delEst.datos.avisos[0].tipo, "soporte-respuesta");
  assert.equal(delEst.datos.avisos[0].detalle, "Ya lo revisamos, prueba de nuevo.");

  const todas = await llamar("POST", "/notificaciones/leer-todas", { token: "est1" });
  assert.equal(todas.status, 200);
  assert.equal((await llamar("GET", "/notificaciones", { token: "est1" })).datos.sinLeer, 0);
});
