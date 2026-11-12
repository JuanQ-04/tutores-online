import test from "node:test";
import assert from "node:assert/strict";
import { TutorService } from "../src/services/TutorService.js";
import { SolicitudService } from "../src/services/SolicitudService.js";
import { crearMundo, sembrar, relojFijo, cuerpoSolicitud } from "./helpers/fakes.js";

function armar() {
  const m = crearMundo();
  const u = sembrar(m);
  const reloj = relojFijo();
  return { m, u, tutores: new TutorService({ ...m, reloj }), solicitudes: new SolicitudService({ ...m, reloj }) };
}

test("buscar: no expone correo y oculta bloques ya pasados", async () => {
  const { tutores } = armar();
  const { tutores: lista } = await tutores.buscar();
  assert.equal(lista.length, 1);
  assert.equal("email" in lista[0], false);
  assert.deepEqual(lista[0].disponibilidad.map((b) => b.id), ["b1", "b2"]); // b3 es de ayer
});

test("buscar: filtra por materia (sin tildes), ciudad, modalidad y fecha", async () => {
  const { tutores } = armar();
  assert.equal((await tutores.buscar({ materia: "Matemáticas" })).total, 1);
  assert.equal((await tutores.buscar({ materia: "quimica" })).total, 0);
  assert.equal((await tutores.buscar({ ciudad: "bogota" })).total, 1);
  assert.equal((await tutores.buscar({ ciudad: "Cali" })).total, 0);
  assert.equal((await tutores.buscar({ modalidad: "presencial" })).total, 1);
  assert.equal((await tutores.buscar({ fecha: "2026-11-12" })).total, 1);
  assert.equal((await tutores.buscar({ fecha: "2026-11-30" })).total, 0);
  await assert.rejects(() => tutores.buscar({ fecha: "mañana" }), { status: 400 });
});

test("buscar: un horario ya reservado deja de aparecer como disponible", async () => {
  const { u, tutores, solicitudes } = armar();
  const sol = await solicitudes.crear(u.est1, cuerpoSolicitud());
  await solicitudes.aceptar(u.tutorUsuario, sol.id);
  const t = await tutores.obtener("tutor1");
  assert.deepEqual(t.disponibilidad, []); // b1 reservado y b2 se cruza con b1
});

test("buscar: incluye promedio y número de opiniones", async () => {
  const { m, tutores } = armar();
  m.datos.calificaciones.set("x1", { tutorId: "tutor1", estrellas: 5, estado: "visible" });
  m.datos.calificaciones.set("x2", { tutorId: "tutor1", estrellas: 4, estado: "visible" });
  m.datos.calificaciones.set("x3", { tutorId: "tutor1", estrellas: 1, estado: "oculta" });
  const { tutores: lista } = await tutores.buscar();
  assert.equal(lista[0].promedio, 4.5);
  assert.equal(lista[0].opiniones, 2);
});

test("obtener: un tutor no aprobado o inexistente => 404", async () => {
  const { m, tutores } = armar();
  await assert.rejects(() => tutores.obtener("nadie"), { status: 404 });
  m.datos.usuarios.get("tutor1").estado = "pendiente";
  await assert.rejects(() => tutores.obtener("tutor1"), { status: 404 });
});
