import test from "node:test";
import assert from "node:assert/strict";
import { SolicitudService } from "../src/services/SolicitudService.js";
import { TutoriaService } from "../src/services/TutoriaService.js";
import { CalificacionService } from "../src/services/CalificacionService.js";
import { crearMundo, sembrar, relojFijo, cuerpoSolicitud } from "./helpers/fakes.js";

async function conTutoriaProgramada() {
  const m = crearMundo();
  const u = sembrar(m);
  const solicitudes = new SolicitudService({ ...m, reloj: relojFijo() });
  const tutorias = new TutoriaService(m);
  const calificaciones = new CalificacionService(m);
  const sol = await solicitudes.crear(u.est1, cuerpoSolicitud());
  const { tutoria } = await solicitudes.aceptar(u.tutorUsuario, sol.id);
  return { m, u, tutorias, calificaciones, tutoriaId: tutoria.id };
}

test("completar: solo el tutor dueño; luego ya no se puede cancelar", async () => {
  const { u, tutorias, tutoriaId } = await conTutoriaProgramada();
  await assert.rejects(() => tutorias.completar(u.est1, tutoriaId), { status: 403 });
  await assert.rejects(() => tutorias.completar({ ...u.tutorUsuario, id: "otro" }, tutoriaId), { status: 403 });
  await tutorias.completar(u.tutorUsuario, tutoriaId);
  await assert.rejects(() => tutorias.cancelar(u.est1, tutoriaId), { status: 409 });
});

test("cancelar: el estudiante cancela y el tutor recibe aviso; un tercero no puede", async () => {
  const { m, u, tutorias, tutoriaId } = await conTutoriaProgramada();
  await assert.rejects(() => tutorias.cancelar(u.est2, tutoriaId), { status: 403 });
  await tutorias.cancelar(u.est1, tutoriaId);
  assert.equal(m.datos.tutorias.get(tutoriaId).estado, "cancelada");
  const aviso = m.correos.find((c) => c.tipo === "tutoriaCancelada");
  assert.equal(aviso.destinatario.email, "ana@test.com");
});

test("obtener: solo participantes ven el detalle (y el enlace)", async () => {
  const { u, tutorias, tutoriaId } = await conTutoriaProgramada();
  assert.match((await tutorias.obtener(u.est1, tutoriaId)).enlaceReunion, /jit\.si/);
  await tutorias.obtener(u.tutorUsuario, tutoriaId);
  await assert.rejects(() => tutorias.obtener(u.est2, tutoriaId), { status: 403 });
});

test("calificar: exige tutoría completada, dueña, 1-5 estrellas y una sola vez", async () => {
  const { u, tutorias, calificaciones, tutoriaId } = await conTutoriaProgramada();
  await assert.rejects(() => calificaciones.crear(u.est1, { tutoriaId, estrellas: 5 }), { status: 409 }); // aún programada
  await tutorias.completar(u.tutorUsuario, tutoriaId);

  await assert.rejects(() => calificaciones.crear(u.est2, { tutoriaId, estrellas: 5 }), { status: 403 });
  await assert.rejects(() => calificaciones.crear(u.est1, { tutoriaId, estrellas: 6 }), { status: 400 });
  await assert.rejects(() => calificaciones.crear(u.est1, { tutoriaId, estrellas: 4.5 }), { status: 400 });

  const r = await calificaciones.crear(u.est1, { tutoriaId, estrellas: 5, comentario: "Excelente" });
  assert.equal(r.estado, "visible");
  assert.equal(r.tutorId, "tutor1");
  await assert.rejects(() => calificaciones.crear(u.est1, { tutoriaId, estrellas: 3 }), { status: 409 });
});
