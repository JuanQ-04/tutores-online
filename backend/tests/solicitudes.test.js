import test from "node:test";
import assert from "node:assert/strict";
import { SolicitudService } from "../src/services/SolicitudService.js";
import { crearMundo, sembrar, relojFijo, cuerpoSolicitud } from "./helpers/fakes.js";

function armar() {
  const m = crearMundo();
  const u = sembrar(m);
  const servicio = new SolicitudService({ ...m, reloj: relojFijo() });
  return { m, u, servicio };
}

test("crear: guarda la solicitud con tarifa y nombres tomados del servidor y avisa al tutor", async () => {
  const { m, u, servicio } = armar();
  const r = await servicio.crear(u.est1, cuerpoSolicitud({ tarifa: 1 })); // la tarifa del cliente se ignora
  assert.equal(r.estado, "pendiente");
  assert.equal(r.tarifa, 40000);
  assert.equal(r.tutorNombre, "Ana Ruiz");
  assert.equal(r.estudianteNombre, "Luis Perez");
  assert.equal(m.correos[0].tipo, "nuevaSolicitud");
});

test("crear: rechaza un horario que el tutor no publicó", async () => {
  const { u, servicio } = armar();
  await assert.rejects(() => servicio.crear(u.est1, cuerpoSolicitud({ horaInicio: "18:00", horaFin: "19:00" })), { status: 409 });
});

test("crear: rechaza fechas pasadas y datos inválidos", async () => {
  const { u, servicio } = armar();
  await assert.rejects(() => servicio.crear(u.est1, cuerpoSolicitud({ fecha: "2026-11-10", horaInicio: "09:00", horaFin: "10:00" })), { status: 400 });
  await assert.rejects(() => servicio.crear(u.est1, cuerpoSolicitud({ horaInicio: "16:00", horaFin: "15:00" })), { status: 400 });
  await assert.rejects(() => servicio.crear(u.est1, cuerpoSolicitud({ fecha: "12/11/2026" })), { status: 400 });
  await assert.rejects(() => servicio.crear(u.est1, cuerpoSolicitud({ materia: "" })), { status: 400 });
});

test("crear: no permite duplicar una solicitud pendiente", async () => {
  const { u, servicio } = armar();
  await servicio.crear(u.est1, cuerpoSolicitud());
  await assert.rejects(() => servicio.crear(u.est1, cuerpoSolicitud()), { status: 409 });
});

test("crear: tutor inexistente o no aprobado => 404", async () => {
  const { m, u, servicio } = armar();
  await assert.rejects(() => servicio.crear(u.est1, cuerpoSolicitud({ tutorId: "nadie" })), { status: 404 });
  m.datos.usuarios.get("tutor1").estado = "pendiente";
  await assert.rejects(() => servicio.crear(u.est1, cuerpoSolicitud()), { status: 404 });
});

test("aceptar: crea la tutoría con enlace de Jitsi y notifica a ambos", async () => {
  const { m, u, servicio } = armar();
  const sol = await servicio.crear(u.est1, cuerpoSolicitud());
  const r = await servicio.aceptar(u.tutorUsuario, sol.id);
  assert.equal(r.solicitud.estado, "aceptada");
  assert.equal(r.tutoria.estado, "programada");
  assert.match(r.tutoria.enlaceReunion, /meet\.jit\.si/);
  assert.equal(m.datos.solicitudes.get(sol.id).estado, "aceptada");
  const correo = m.correos.find((c) => c.tipo === "tutoriaProgramada");
  assert.equal(correo.estudiante.email, "luis@test.com");
});

test("aceptar: una tutoría presencial no genera enlace", async () => {
  const { u, servicio } = armar();
  const sol = await servicio.crear(u.est1, cuerpoSolicitud({ horaInicio: "15:30", horaFin: "16:30", modalidad: "Presencial" }));
  const r = await servicio.aceptar(u.tutorUsuario, sol.id);
  assert.equal(r.tutoria.enlaceReunion, "");
});

test("aceptar: dos solicitudes que se cruzan => la segunda falla (sin doble reserva)", async () => {
  const { m, u, servicio } = armar();
  const a = await servicio.crear(u.est1, cuerpoSolicitud());
  const b = await servicio.crear(u.est2, cuerpoSolicitud({ horaInicio: "15:30", horaFin: "16:30", modalidad: "Presencial" }));
  await servicio.aceptar(u.tutorUsuario, a.id);
  await assert.rejects(() => servicio.aceptar(u.tutorUsuario, b.id), { status: 409 });
  assert.equal(m.datos.tutorias.size, 1);
  assert.equal(m.datos.solicitudes.get(b.id).estado, "pendiente");
});

test("aceptar: no se puede aceptar dos veces ni la solicitud de otro tutor", async () => {
  const { m, u, servicio } = armar();
  const sol = await servicio.crear(u.est1, cuerpoSolicitud());
  await assert.rejects(() => servicio.aceptar({ ...u.tutorUsuario, id: "otro" }, sol.id), { status: 403 });
  await servicio.aceptar(u.tutorUsuario, sol.id);
  await assert.rejects(() => servicio.aceptar(u.tutorUsuario, sol.id), { status: 409 });
  assert.equal(m.datos.tutorias.size, 1);
});

test("aceptar: un tutor no aprobado no puede aceptar", async () => {
  const { u, servicio } = armar();
  const sol = await servicio.crear(u.est1, cuerpoSolicitud());
  await assert.rejects(() => servicio.aceptar({ ...u.tutorUsuario, estado: "pendiente" }, sol.id), { status: 403 });
});

test("rechazar: marca rechazada, avisa al estudiante y no permite repetir", async () => {
  const { m, u, servicio } = armar();
  const sol = await servicio.crear(u.est1, cuerpoSolicitud());
  await servicio.rechazar(u.tutorUsuario, sol.id);
  assert.equal(m.datos.solicitudes.get(sol.id).estado, "rechazada");
  assert.ok(m.correos.some((c) => c.tipo === "solicitudRechazada"));
  await assert.rejects(() => servicio.rechazar(u.tutorUsuario, sol.id), { status: 409 });
});

test("cancelar: solo el estudiante dueño, y solo si está pendiente", async () => {
  const { m, u, servicio } = armar();
  const sol = await servicio.crear(u.est1, cuerpoSolicitud());
  await assert.rejects(() => servicio.cancelar(u.est2, sol.id), { status: 403 });
  await servicio.cancelar(u.est1, sol.id);
  assert.equal(m.datos.solicitudes.get(sol.id).estado, "rechazada");
  await assert.rejects(() => servicio.cancelar(u.est1, sol.id), { status: 409 });
});

test("listarMias: cada rol ve solo lo suyo", async () => {
  const { u, servicio } = armar();
  await servicio.crear(u.est1, cuerpoSolicitud());
  assert.equal((await servicio.listarMias(u.est1)).length, 1);
  assert.equal((await servicio.listarMias(u.est2)).length, 0);
  assert.equal((await servicio.listarMias(u.tutorUsuario)).length, 1);
});
