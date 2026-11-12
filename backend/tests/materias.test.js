import test from "node:test";
import assert from "node:assert/strict";
import { UsuarioService } from "../src/services/UsuarioService.js";
import { crearMundo, sembrar, relojFijo } from "./helpers/fakes.js";

const PDF = "data:application/pdf;base64,JVBERi0xLjQKJcfs";

function armar() {
  const m = crearMundo();
  const u = sembrar(m);
  return { m, u, materias: m.materiaService, usuarios: new UsuarioService({ ...m, reloj: relojFijo() }) };
}

test("listar: siempre trae las materias de base, marcadas como tales", async () => {
  const { materias } = armar();
  const lista = await materias.listar();
  assert.deepEqual(lista.map((x) => x.id), ["matematicas", "fisica", "quimica", "programacion", "idiomas", "estadistica"]);
  assert.ok(lista.every((x) => x.base === true));
});

test("crear: agrega la materia con un identificador estable y aparece en el catálogo", async () => {
  const { m, u, materias } = armar();
  const nueva = await materias.crear(u.adminUsuario, { nombre: "  inglés   técnico " });
  assert.deepEqual(nueva, { id: "ingles-tecnico", nombre: "Inglés técnico", base: false });
  assert.equal(m.datos.materias.get("ingles-tecnico").creadaPor, "admin1");

  const lista = await materias.listar();
  assert.equal(lista.length, 7);
  assert.equal(lista.at(-1).id, "ingles-tecnico"); // las nuevas van después de las de base
  assert.ok((await materias.ids()).includes("ingles-tecnico"));
});

test("crear: rechaza duplicados (también contra las de base, sin tildes ni mayúsculas) y nombres inválidos", async () => {
  const { u, materias } = armar();
  await assert.rejects(() => materias.crear(u.adminUsuario, { nombre: "Matemáticas" }), { status: 409 });
  await assert.rejects(() => materias.crear(u.adminUsuario, { nombre: "FISICA" }), { status: 409 });
  await materias.crear(u.adminUsuario, { nombre: "Dibujo técnico" });
  await assert.rejects(() => materias.crear(u.adminUsuario, { nombre: "dibujo tecnico" }), { status: 409 });

  await assert.rejects(() => materias.crear(u.adminUsuario, {}), { status: 400 });
  await assert.rejects(() => materias.crear(u.adminUsuario, { nombre: "   " }), { status: 400 });
  await assert.rejects(() => materias.crear(u.adminUsuario, { nombre: "A" }), { status: 400 });
  await assert.rejects(() => materias.crear(u.adminUsuario, { nombre: "123" }), { status: 400 });
  await assert.rejects(() => materias.crear(u.adminUsuario, { nombre: "x".repeat(41) }), { status: 400 });
  await assert.rejects(() => materias.crear(u.adminUsuario, { nombre: "<script>alert(1)</script>" }), { status: 400 });
  await assert.rejects(() => materias.crear(u.adminUsuario, { nombre: "日本語" }), { status: 400 }); // sin equivalente latino
});

test("un tutor puede elegir una materia nueva al enviar su solicitud (y una inexistente sigue rechazada)", async () => {
  const { m, u, materias, usuarios } = armar();
  const cuerpo = {
    titulo: "Lingüística", nivelEstudios: "posgrado", institucion: "UNAL", ciudad: "Bogotá", presentacion: "Hola",
    nivelEnsenanza: "ambos", experiencia: 5, modalidad: "Virtual", franjas: ["noche"], tarifa: 25000,
    hojaVida: { nombreArchivo: "cv.pdf", tamano: 10, dataURL: PDF }
  };
  await assert.rejects(() => usuarios.enviarSolicitudTutor(u.tutorNuevo, { ...cuerpo, materias: ["ingles-tecnico"] }), { status: 400 });

  await materias.crear(u.adminUsuario, { nombre: "Inglés técnico" });
  await usuarios.enviarSolicitudTutor(u.tutorNuevo, { ...cuerpo, materias: ["ingles-tecnico"] });
  assert.deepEqual(m.datos.usuarios.get("nuevo1").materias, ["ingles-tecnico"]);
});
