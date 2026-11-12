import test from "node:test";
import assert from "node:assert/strict";
import { AdminService } from "../src/services/AdminService.js";
import { SoporteService } from "../src/services/SoporteService.js";
import { CalificacionService } from "../src/services/CalificacionService.js";
import { crearMundo, sembrar } from "./helpers/fakes.js";

function armar() {
  const m = crearMundo();
  const u = sembrar(m);
  return { m, u, admin: new AdminService(m), soporte: new SoporteService(m), calificaciones: new CalificacionService(m) };
}

test("listarUsuarios: no manda la foto y puede filtrar por rol", async () => {
  const { m, admin } = armar();
  m.datos.usuarios.get("est1").fotoURL = "data:image/jpeg;base64,AAAA";
  const todos = await admin.listarUsuarios();
  assert.ok(todos.length >= 4);
  assert.ok(todos.every((x) => !("fotoURL" in x)));
  const tutores = await admin.listarUsuarios("tutor");
  assert.ok(tutores.length >= 1 && tutores.every((x) => x.rol === "tutor"));
});

test("cambiarActivo: suspende y reactiva, pero nunca a un admin ni a uno mismo", async () => {
  const { m, u, admin } = armar();
  await admin.cambiarActivo(u.adminUsuario, "est1", { activo: false });
  assert.equal(m.datos.usuarios.get("est1").activo, false);
  await admin.cambiarActivo(u.adminUsuario, "est1", { activo: true });
  assert.equal(m.datos.usuarios.get("est1").activo, true);

  await assert.rejects(() => admin.cambiarActivo(u.adminUsuario, "admin1", { activo: false }), { status: 403 });
  await assert.rejects(() => admin.cambiarActivo(u.adminUsuario, "est1", { activo: "no" }), { status: 400 });
  await assert.rejects(() => admin.cambiarActivo(u.adminUsuario, "fantasma", { activo: false }), { status: 404 });
});

test("revisarTutor: aprueba, rechaza y revoca; no sobre incompletos ni no-tutores", async () => {
  const { m, u, admin } = armar();
  m.datos.usuarios.get("nuevo1").estado = "pendiente";
  await admin.revisarTutor(u.adminUsuario, "nuevo1", { estado: "aprobado" });
  assert.equal(m.datos.usuarios.get("nuevo1").estado, "aprobado");
  assert.equal(m.datos.usuarios.get("nuevo1").revisadoPor, "admin1");
  await admin.revisarTutor(u.adminUsuario, "nuevo1", { estado: "rechazado" }); // revocar

  m.datos.usuarios.get("nuevo1").estado = "incompleto";
  await assert.rejects(() => admin.revisarTutor(u.adminUsuario, "nuevo1", { estado: "aprobado" }), { status: 409 });
  await assert.rejects(() => admin.revisarTutor(u.adminUsuario, "est1", { estado: "aprobado" }), { status: 400 });
  await assert.rejects(() => admin.revisarTutor(u.adminUsuario, "tutor1", { estado: "pendiente" }), { status: 400 });
});

test("moderarCalificacion: edita estrellas, oculta y deja retroalimentación (con validación)", async () => {
  const { m, u, admin } = armar();
  m.datos.calificaciones.set("c1", { id: "c1", tutorId: "tutor1", estrellas: 5, estado: "visible" });
  await admin.moderarCalificacion(u.adminUsuario, "c1", { estado: "oculta", retroalimentacion: "Lenguaje ofensivo" });
  assert.equal(m.datos.calificaciones.get("c1").estado, "oculta");
  assert.equal(m.datos.calificaciones.get("c1").editadaPorAdmin, "admin1");

  await assert.rejects(() => admin.moderarCalificacion(u.adminUsuario, "c1", { estrellas: 9 }), { status: 400 });
  await assert.rejects(() => admin.moderarCalificacion(u.adminUsuario, "c1", { estado: "borrada" }), { status: 400 });
  await assert.rejects(() => admin.moderarCalificacion(u.adminUsuario, "c1", {}), { status: 400 });
  await assert.rejects(() => admin.moderarCalificacion(u.adminUsuario, "nada", { estrellas: 3 }), { status: 404 });
});

test("hoja de vida: el admin la lee; sin PDF => 404", async () => {
  const { m, admin } = armar();
  await assert.rejects(() => admin.obtenerHojaVida("nuevo1"), { status: 404 });
  m.datos.hojasDeVida.set("nuevo1", { dataURL: "data:application/pdf;base64,AAAA", nombreArchivo: "cv.pdf" });
  assert.equal((await admin.obtenerHojaVida("nuevo1")).nombreArchivo, "cv.pdf");
});

test("soporte: el usuario escribe (datos de identidad del servidor) y el admin cambia el estado", async () => {
  const { m, u, soporte, admin } = armar();
  const caso = await soporte.crear(u.est1, { asunto: "No puedo reservar", mensaje: "Me sale un error", usuarioId: "otro", rol: "admin" });
  assert.equal(caso.usuarioId, "est1");   // no se puede suplantar
  assert.equal(caso.rol, "estudiante");
  assert.equal(caso.estado, "abierto");
  assert.equal(caso.usuarioNombre, "Luis Perez");

  await assert.rejects(() => soporte.crear(u.est1, { asunto: "", mensaje: "x" }), { status: 400 });
  await assert.rejects(() => soporte.crear(u.est1, { asunto: "a", mensaje: "x".repeat(1001) }), { status: 400 });

  await admin.actualizarCaso(u.adminUsuario, caso.id, { estado: "revision" });
  assert.equal(m.datos.soporte.get(caso.id).estado, "revision");
  await assert.rejects(() => admin.actualizarCaso(u.adminUsuario, caso.id, { estado: "borrado" }), { status: 400 });
  await assert.rejects(() => admin.actualizarCaso(u.adminUsuario, "nada", { estado: "resuelto" }), { status: 404 });
});

test("calificaciones/mias: el estudiante ve las que dio y el tutor las que recibió (incluso ocultas)", async () => {
  const { m, u, calificaciones } = armar();
  m.datos.calificaciones.set("t1", { id: "t1", tutorId: "tutor1", estudianteId: "est1", estrellas: 5, estado: "visible" });
  m.datos.calificaciones.set("t2", { id: "t2", tutorId: "tutor1", estudianteId: "est2", estrellas: 2, estado: "oculta" });
  assert.deepEqual((await calificaciones.listarMias(u.est1)).map((c) => c.id), ["t1"]);
  assert.deepEqual((await calificaciones.listarMias(u.tutorUsuario)).map((c) => c.id).sort(), ["t1", "t2"]);
  await assert.rejects(() => calificaciones.listarMias(u.adminUsuario), { status: 403 });
});
