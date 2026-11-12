import test from "node:test";
import assert from "node:assert/strict";
import { CambioPerfilService } from "../src/services/CambioPerfilService.js";
import { UsuarioService } from "../src/services/UsuarioService.js";
import { AdminService } from "../src/services/AdminService.js";
import { TutorService } from "../src/services/TutorService.js";
import { crearMundo, sembrar, relojFijo } from "./helpers/fakes.js";

const PDF = "data:application/pdf;base64,JVBERi0xLjQKJcfs";
const PDF_NUEVO = "data:application/pdf;base64,JVBERi0xLjQKNEVX";

function armar() {
  const m = crearMundo();
  const u = sembrar(m);
  const reloj = relojFijo();
  // El tutor ya completó todo su perfil (como si el administrador lo hubiera aprobado).
  Object.assign(m.datos.usuarios.get("tutor1"), {
    titulo: "Ingeniería de Sistemas", nivelEstudios: "pregrado", institucion: "UNAL", nivelEnsenanza: "universitario",
    experiencia: 3, modalidad: "Virtual y presencial", franjas: ["tarde"], tieneHojaVida: true, hojaVidaPDF: "cv.pdf"
  });
  m.datos.hojasDeVida.set("tutor1", { id: "tutor1", nombreArchivo: "cv.pdf", tamano: 10, dataURL: PDF });
  return {
    m, u, reloj,
    cambios: new CambioPerfilService(m),
    usuarios: new UsuarioService({ ...m, reloj }),
    admin: new AdminService(m),
    tutores: new TutorService({ ...m, reloj })
  };
}

// El formulario completo, tal como lo manda el tutor, con lo que quiera cambiar.
const formulario = (m, extra = {}) => {
  const t = m.datos.usuarios.get("tutor1");
  return {
    titulo: t.titulo, nivelEstudios: t.nivelEstudios, institucion: t.institucion, materias: t.materias,
    nivelEnsenanza: t.nivelEnsenanza, experiencia: t.experiencia, modalidad: t.modalidad, ciudad: t.ciudad,
    tarifa: t.tarifa, franjas: t.franjas, presentacion: t.presentacion, ...extra
  };
};

test("solicitar: queda pendiente con SOLO lo que cambió y el perfil vigente no se toca", async () => {
  const { m, u, cambios } = armar();
  const r = await cambios.solicitar(u.tutorUsuario, formulario(m, { tarifa: 55000, ciudad: "Cali" }));
  assert.equal(r.estado, "pendiente");
  assert.deepEqual(r.cambios, { ciudad: "Cali", tarifa: 55000 });

  const guardada = m.datos.cambios.get("tutor1");
  assert.equal(guardada.estado, "pendiente");
  assert.equal(guardada.tutorNombre, "Ana Ruiz");
  assert.equal(guardada.tieneHojaVida, false);

  const perfil = m.datos.usuarios.get("tutor1"); // nada cambió todavía
  assert.equal(perfil.tarifa, 40000);
  assert.equal(perfil.ciudad, "Bogotá");
});

test("solicitar: si no cambió nada (aunque reordene las listas) responde 400", async () => {
  const { m, u, cambios } = armar();
  await assert.rejects(() => cambios.solicitar(u.tutorUsuario, formulario(m)), { status: 400 });
  await assert.rejects(() => cambios.solicitar(u.tutorUsuario, formulario(m, { materias: ["fisica", "matematicas"] })), { status: 400 });
});

test("solicitar: valida todo el formulario y solo lo pide un tutor aprobado", async () => {
  const { m, u, cambios } = armar();
  await assert.rejects(() => cambios.solicitar(u.tutorUsuario, formulario(m, { modalidad: "ambas" })), { status: 400 });
  await assert.rejects(() => cambios.solicitar(u.tutorUsuario, formulario(m, { materias: ["magia"] })), { status: 400 });
  await assert.rejects(() => cambios.solicitar(u.tutorUsuario, formulario(m, { tarifa: "50000" })), { status: 400 });
  await assert.rejects(() => cambios.solicitar(u.tutorUsuario, formulario(m, { hojaVida: { nombreArchivo: "x.exe", tamano: 1, dataURL: "data:text/html;base64,AAAA" } })), { status: 400 });
  await assert.rejects(() => cambios.solicitar(u.tutorNuevo, formulario(m, { tarifa: 1 })), { status: 403 });
  await assert.rejects(() => cambios.solicitar(u.est1, formulario(m, { tarifa: 1 })), { status: 403 });
  assert.equal(m.datos.cambios.size, 0);
});

test("solicitar: un perfil antiguo (sin modalidad ni niveles) completa esos datos por esta vía", async () => {
  const { m, u, cambios } = armar();
  const t = m.datos.usuarios.get("tutor1");
  for (const campo of ["modalidad", "nivelEstudios", "nivelEnsenanza", "experiencia"]) delete t[campo];
  const r = await cambios.solicitar(u.tutorUsuario, {
    ...formulario(m), nivelEstudios: "pregrado", nivelEnsenanza: "ambos", experiencia: 4, modalidad: "Virtual"
  });
  assert.deepEqual(Object.keys(r.cambios).sort(), ["experiencia", "modalidad", "nivelEnsenanza", "nivelEstudios"]);
});

test("una solicitud nueva reemplaza a la pendiente y se puede cancelar", async () => {
  const { m, u, cambios } = armar();
  await cambios.solicitar(u.tutorUsuario, formulario(m, { tarifa: 55000 }));
  await cambios.solicitar(u.tutorUsuario, formulario(m, { ciudad: "Cali" }));
  assert.deepEqual(m.datos.cambios.get("tutor1").cambios, { ciudad: "Cali" });

  assert.deepEqual(await cambios.cancelar(u.tutorUsuario), { cancelada: true });
  assert.equal(m.datos.cambios.size, 0);
  await assert.rejects(() => cambios.cancelar(u.tutorUsuario), { status: 404 });
  assert.deepEqual((await cambios.obtenerMia(u.tutorUsuario)).solicitud, null);
});

test("el administrador aprueba: los datos pasan al perfil y la solicitud queda respondida", async () => {
  const { m, u, cambios } = armar();
  await cambios.solicitar(u.tutorUsuario, formulario(m, { tarifa: 55000, ciudad: "Cali", materias: ["matematicas"] }));
  const r = await cambios.resolver(u.adminUsuario, "tutor1", { estado: "aprobada" });
  assert.equal(r.estado, "aprobada");

  const perfil = m.datos.usuarios.get("tutor1");
  assert.equal(perfil.tarifa, 55000);
  assert.equal(perfil.ciudad, "Cali");
  assert.deepEqual(perfil.materias, ["matematicas"]);
  assert.equal(perfil.modalidad, "Virtual y presencial"); // lo que no cambió, igual

  const s = m.datos.cambios.get("tutor1");
  assert.equal(s.estado, "aprobada");
  assert.equal(s.revisadaPor, "admin1");
  await assert.rejects(() => cambios.resolver(u.adminUsuario, "tutor1", { estado: "rechazada" }), { status: 409 }); // ya respondida
});

test("el administrador rechaza: el perfil sigue igual y queda la nota para el tutor", async () => {
  const { m, u, cambios } = armar();
  await cambios.solicitar(u.tutorUsuario, formulario(m, { tarifa: 99999 }));
  await cambios.resolver(u.adminUsuario, "tutor1", { estado: "rechazada", nota: "La tarifa es muy alta" });
  assert.equal(m.datos.usuarios.get("tutor1").tarifa, 40000);
  const s = (await cambios.obtenerMia(u.tutorUsuario)).solicitud;
  assert.equal(s.estado, "rechazada");
  assert.equal(s.nota, "La tarifa es muy alta");
  // y puede volver a intentarlo
  await cambios.solicitar(u.tutorUsuario, formulario(m, { tarifa: 45000 }));
  assert.equal(m.datos.cambios.get("tutor1").estado, "pendiente");
});

test("resolver: decisión inválida, solicitud inexistente y solo para quien la pide", async () => {
  const { m, u, cambios } = armar();
  await assert.rejects(() => cambios.resolver(u.adminUsuario, "tutor1", { estado: "aprobada" }), { status: 404 });
  await cambios.solicitar(u.tutorUsuario, formulario(m, { tarifa: 55000 }));
  await assert.rejects(() => cambios.resolver(u.adminUsuario, "tutor1", { estado: "quizas" }), { status: 400 });
  await assert.rejects(() => cambios.resolver(u.adminUsuario, "tutor1", { estado: "aprobada", nota: "x".repeat(301) }), { status: 400 });
  assert.equal(m.datos.cambios.get("tutor1").estado, "pendiente");
});

test("hoja de vida nueva: espera aparte hasta la aprobación y entonces reemplaza a la vigente", async () => {
  const { m, u, cambios, admin } = armar();
  await cambios.solicitar(u.tutorUsuario, formulario(m, {
    hojaVida: { nombreArchivo: "cv-2026.pdf", tamano: 20, dataURL: PDF_NUEVO }
  }));
  assert.equal(m.datos.hojasDeVida.get("tutor1").dataURL, PDF);          // la vigente no se toca
  assert.equal(m.datos.hojasPendientes.get("tutor1").dataURL, PDF_NUEVO);
  assert.equal((await admin.obtenerHojaVida("tutor1", { pendiente: true })).dataURL, PDF_NUEVO);
  assert.equal((await admin.obtenerHojaVida("tutor1")).dataURL, PDF);

  await cambios.resolver(u.adminUsuario, "tutor1", { estado: "aprobada" });
  assert.equal(m.datos.hojasDeVida.get("tutor1").dataURL, PDF_NUEVO);
  assert.equal(m.datos.hojasPendientes.size, 0);
  assert.equal(m.datos.usuarios.get("tutor1").hojaVidaPDF, "cv-2026.pdf");
});

test("si rechazan o cancelan, el PDF propuesto se descarta", async () => {
  const { m, u, cambios } = armar();
  const conPdf = () => formulario(m, { hojaVida: { nombreArchivo: "n.pdf", tamano: 20, dataURL: PDF_NUEVO } });
  await cambios.solicitar(u.tutorUsuario, conPdf());
  await cambios.resolver(u.adminUsuario, "tutor1", { estado: "rechazada" });
  assert.equal(m.datos.hojasPendientes.size, 0);
  assert.equal(m.datos.hojasDeVida.get("tutor1").dataURL, PDF);

  await cambios.solicitar(u.tutorUsuario, conPdf());
  await cambios.cancelar(u.tutorUsuario);
  assert.equal(m.datos.hojasPendientes.size, 0);
});

// ------------------------------------------------ la modalidad del perfil manda
test("buscar: la modalidad sale del perfil del tutor, no de las clases que tiene", async () => {
  const { m, tutores } = armar();
  const t = m.datos.usuarios.get("tutor1");

  // Virtual y presencial: aparece en los dos filtros aunque sus bloques sean de un solo tipo.
  t.disponibilidad = [{ id: "b1", fecha: "2026-11-12", horaInicio: "15:00", horaFin: "16:00", modalidad: "Virtual" }];
  assert.equal((await tutores.buscar({ modalidad: "virtual" })).total, 1);
  assert.equal((await tutores.buscar({ modalidad: "presencial" })).total, 1);

  // Solo Virtual: no aparece como presencial aunque tenga un bloque presencial viejo.
  t.modalidad = "Virtual";
  t.disponibilidad.push({ id: "b9", fecha: "2026-11-13", horaInicio: "10:00", horaFin: "11:00", modalidad: "Presencial" });
  assert.equal((await tutores.buscar({ modalidad: "virtual" })).total, 1);
  assert.equal((await tutores.buscar({ modalidad: "presencial" })).total, 0);

  // Solo Presencial, sin ningún bloque: igual aparece como presencial.
  t.modalidad = "Presencial";
  t.disponibilidad = [];
  assert.equal((await tutores.buscar({ modalidad: "presencial" })).total, 1);
  assert.equal((await tutores.buscar({ modalidad: "virtual" })).total, 0);

  const [publico] = (await tutores.buscar({})).tutores;
  assert.equal(publico.modalidad, "Presencial");
});

test("buscar: un perfil antiguo sin modalidad se deduce de sus bloques hasta que la complete", async () => {
  const { m, tutores } = armar();
  const t = m.datos.usuarios.get("tutor1");
  delete t.modalidad;
  t.disponibilidad = [{ id: "b1", fecha: "2026-11-12", horaInicio: "15:00", horaFin: "16:00", modalidad: "Presencial" }];
  assert.equal((await tutores.buscar({ modalidad: "presencial" })).total, 1);
  assert.equal((await tutores.buscar({ modalidad: "virtual" })).total, 0);
  t.disponibilidad = [];
  assert.equal((await tutores.buscar({ modalidad: "virtual" })).total, 0); // sin dato ni bloques: no se adivina
});

test("buscar: la fecha sigue dependiendo de la agenda, la modalidad no", async () => {
  const { m, tutores } = armar();
  m.datos.usuarios.get("tutor1").modalidad = "Presencial";
  m.datos.usuarios.get("tutor1").disponibilidad = [{ id: "b1", fecha: "2026-11-12", horaInicio: "15:00", horaFin: "16:00", modalidad: "Presencial" }];
  assert.equal((await tutores.buscar({ modalidad: "presencial", fecha: "2026-11-12" })).total, 1);
  assert.equal((await tutores.buscar({ modalidad: "presencial", fecha: "2026-11-20" })).total, 0);
});

// ------------------------------------------------ disponibilidad limitada a la modalidad
const bloque = (extra = {}) => ({ fecha: "2026-11-20", horaInicio: "10:00", horaFin: "11:00", modalidad: "Virtual", ...extra });

test("agregarBloque: solo de la modalidad que el tutor eligió en su perfil", async () => {
  const { m, u, usuarios } = armar();
  const t = m.datos.usuarios.get("tutor1");

  t.modalidad = "Virtual";
  await usuarios.agregarBloque(u.tutorUsuario, bloque());
  await assert.rejects(() => usuarios.agregarBloque(u.tutorUsuario, bloque({ horaInicio: "12:00", horaFin: "13:00", modalidad: "Presencial" })), { status: 400 });
  await assert.rejects(() => usuarios.agregarBloque(u.tutorUsuario, bloque({ horaInicio: "12:00", horaFin: "13:00", modalidad: "Virtual y presencial" })), { status: 400 });

  t.modalidad = "Presencial";
  await usuarios.agregarBloque(u.tutorUsuario, bloque({ fecha: "2026-11-21", modalidad: "Presencial" }));
  await assert.rejects(() => usuarios.agregarBloque(u.tutorUsuario, bloque({ fecha: "2026-11-22" })), { status: 400 });

  t.modalidad = "Virtual y presencial"; // las tres opciones
  for (const [i, modalidad] of ["Virtual", "Presencial", "Virtual y presencial"].entries()) {
    await usuarios.agregarBloque(u.tutorUsuario, bloque({ fecha: `2026-11-2${3 + i}`, modalidad }));
  }

  delete t.modalidad; // perfil antiguo: sin restricción hasta que la complete
  await usuarios.agregarBloque(u.tutorUsuario, bloque({ fecha: "2026-11-27", modalidad: "Presencial" }));
});

test("al aprobar un cambio de modalidad, los bloques que ya no encajan se ajustan", async () => {
  const { m, u, cambios } = armar();
  m.datos.usuarios.get("tutor1").disponibilidad = [
    { id: "v", fecha: "2026-11-20", horaInicio: "10:00", horaFin: "11:00", modalidad: "Virtual" },
    { id: "p", fecha: "2026-11-20", horaInicio: "12:00", horaFin: "13:00", modalidad: "Presencial" },
    { id: "a", fecha: "2026-11-21", horaInicio: "10:00", horaFin: "11:00", modalidad: "Virtual y presencial" }
  ];
  await cambios.solicitar(u.tutorUsuario, formulario(m, { modalidad: "Virtual" }));
  assert.equal(m.datos.usuarios.get("tutor1").disponibilidad.length, 3); // pendiente: no se toca nada

  await cambios.resolver(u.adminUsuario, "tutor1", { estado: "aprobada" });
  const bloques = m.datos.usuarios.get("tutor1").disponibilidad;
  assert.deepEqual(bloques.map((b) => [b.id, b.modalidad]), [["v", "Virtual"], ["a", "Virtual"]]);
});
