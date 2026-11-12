import test from "node:test";
import assert from "node:assert/strict";
import { UsuarioService } from "../src/services/UsuarioService.js";
import { SolicitudService } from "../src/services/SolicitudService.js";
import { crearMundo, sembrar, relojFijo, cuerpoSolicitud } from "./helpers/fakes.js";

const PDF = "data:application/pdf;base64,JVBERi0xLjQKJcfs";
const FOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";

function armar() {
  const m = crearMundo();
  const u = sembrar(m);
  const reloj = relojFijo(); // 2026-11-11 10:00 en Bogotá
  return { m, u, reloj, usuarios: new UsuarioService({ ...m, reloj }) };
}

const solicitudTutor = (extra = {}) => ({
  titulo: "Ingeniería de Sistemas", nivelEstudios: "pregrado", institucion: "Universidad Nacional", ciudad: "Bogotá",
  presentacion: "Ingeniera con experiencia", materias: ["matematicas", "fisica"], nivelEnsenanza: "universitario",
  experiencia: 3, modalidad: "Presencial", franjas: ["tarde"], tarifa: 30000,
  hojaVida: { nombreArchivo: "cv.pdf", tamano: 1234, dataURL: PDF }, ...extra
});

// ------------------------------------------------------------------ registro
test("registrar: crea el perfil de estudiante y de tutor con su estado inicial", async () => {
  const { usuarios } = armar();
  const est = await usuarios.registrar({ id: "u1", email: "a@test.com", perfil: null }, { nombre: "Ana", apellido: "Ruiz", rol: "estudiante" });
  assert.equal(est.creado, true);
  assert.equal(est.perfil.estado, "activo");
  assert.equal(est.perfil.email, "a@test.com"); // el correo sale del token, no del cuerpo

  const tut = await usuarios.registrar({ id: "u2", email: "b@test.com", perfil: null }, { nombre: "Beto", apellido: "Paz", rol: "tutor" });
  assert.equal(tut.perfil.estado, "incompleto");
  assert.equal(tut.perfil.activo, true);
});

test("registrar: no se puede pedir rol admin ni datos inválidos", async () => {
  const { usuarios } = armar();
  const id = { id: "u1", email: "a@test.com", perfil: null };
  await assert.rejects(() => usuarios.registrar(id, { nombre: "Ana", apellido: "Ruiz", rol: "admin" }), { status: 400 });
  await assert.rejects(() => usuarios.registrar(id, { nombre: "123", apellido: "Ruiz", rol: "estudiante" }), { status: 400 });
  await assert.rejects(() => usuarios.registrar(id, { apellido: "Ruiz", rol: "estudiante" }), { status: 400 });
  await assert.rejects(() => usuarios.registrar({ ...id, email: "" }, { nombre: "Ana", apellido: "Ruiz", rol: "estudiante" }), { status: 400 });
});

test("registrar: si el perfil ya existe lo devuelve sin tocarlo (login repetido con Google)", async () => {
  const { m, usuarios } = armar();
  const perfil = m.datos.usuarios.get("tutor1");
  const r = await usuarios.registrar({ id: "tutor1", email: "ana@test.com", perfil }, { nombre: "X", apellido: "Y", rol: "estudiante" });
  assert.equal(r.creado, false);
  assert.equal(m.datos.usuarios.get("tutor1").rol, "tutor"); // no cambió de rol
});

test("miPerfil: 404 si todavía no existe", async () => {
  const { usuarios } = armar();
  await assert.rejects(() => usuarios.miPerfil({ id: "x", perfil: null }), { status: 404 });
});

// -------------------------------------------------------------------- perfil
test("actualizarPerfil: solo campos permitidos según el rol", async () => {
  const { m, u, usuarios } = armar();
  await usuarios.actualizarPerfil(u.est1, { nombre: "Luisa", rol: "admin", estado: "aprobado", ciudad: "Cali", tarifa: 1 });
  const est = m.datos.usuarios.get("est1");
  assert.equal(est.nombre, "Luisa");
  assert.equal(est.rol, "estudiante"); // ignorado
  assert.equal(est.estado, "activo");   // ignorado
  assert.equal(est.ciudad, undefined);  // solo el tutor tiene ciudad/tarifa

  // Un tutor solo cambia su nombre: los datos profesionales pasan por la aprobación de un administrador.
  await usuarios.actualizarPerfil(u.tutorUsuario, { nombre: "Anita", ciudad: "Medellín", tarifa: 50000, presentacion: "Hola mundo" });
  const tutor = m.datos.usuarios.get("tutor1");
  assert.equal(tutor.nombre, "Anita");
  assert.equal(tutor.ciudad, "Bogotá");
  assert.equal(tutor.tarifa, 40000);
  assert.equal(tutor.presentacion, "Ingeniera");
  await assert.rejects(() => usuarios.actualizarPerfil(u.tutorUsuario, { tarifa: 50000 }), { status: 400 });
});

test("actualizarPerfil: rechaza vacíos, tarifas absurdas y cuerpos sin cambios", async () => {
  const { u, usuarios } = armar();
  await assert.rejects(() => usuarios.actualizarPerfil(u.est1, {}), { status: 400 });
  await assert.rejects(() => usuarios.actualizarPerfil(u.est1, { rol: "admin" }), { status: 400 });
  await assert.rejects(() => usuarios.actualizarPerfil(u.est1, { nombre: "   " }), { status: 400 });
});

test("guardarFoto: acepta imágenes en data URL y rechaza todo lo demás", async () => {
  const { m, u, usuarios } = armar();
  await usuarios.guardarFoto(u.est1, FOTO);
  assert.equal(m.datos.usuarios.get("est1").fotoURL, FOTO);
  await assert.rejects(() => usuarios.guardarFoto(u.est1, "https://sitio.com/foto.jpg"), { status: 400 });
  await assert.rejects(() => usuarios.guardarFoto(u.est1, "data:image/svg+xml;base64,AAAA"), { status: 400 });
  await assert.rejects(() => usuarios.guardarFoto(u.est1, "data:image/png;base64," + "A".repeat(200_100)), { status: 400 });
  await assert.rejects(() => usuarios.guardarFoto(u.est1, undefined), { status: 400 });
});

// ------------------------------------------------------------- disponibilidad
const bloque = (extra = {}) => ({ fecha: "2026-11-20", horaInicio: "10:00", horaFin: "11:00", modalidad: "Virtual", ...extra });

test("agregarBloque: crea el bloque con id del servidor y lo guarda en el perfil", async () => {
  const { m, u, usuarios } = armar();
  const { bloque: nuevo, disponibilidad } = await usuarios.agregarBloque(u.tutorUsuario, bloque());
  assert.match(nuevo.id, /^block-[0-9a-f]+$/);
  assert.equal(disponibilidad.length, 4); // 3 sembrados + 1
  assert.ok(m.datos.usuarios.get("tutor1").disponibilidad.some((b) => b.id === nuevo.id));
});

test("agregarBloque: valida formato, horario permitido, pasado y modalidad", async () => {
  const { u, usuarios } = armar();
  const t = u.tutorUsuario;
  await assert.rejects(() => usuarios.agregarBloque(t, bloque({ horaFin: "09:00" })), { status: 400 });
  await assert.rejects(() => usuarios.agregarBloque(t, bloque({ horaInicio: "07:00", horaFin: "08:00" })), { status: 400 });
  await assert.rejects(() => usuarios.agregarBloque(t, bloque({ horaInicio: "10:15", horaFin: "11:00" })), { status: 400 });
  await assert.rejects(() => usuarios.agregarBloque(t, bloque({ horaInicio: "19:30", horaFin: "20:30" })), { status: 400 });
  await assert.rejects(() => usuarios.agregarBloque(t, bloque({ fecha: "2026-11-10" })), { status: 400 }); // ayer
  await assert.rejects(() => usuarios.agregarBloque(t, bloque({ modalidad: "Por teléfono" })), { status: 400 });
  await assert.rejects(() => usuarios.agregarBloque(t, bloque({ fecha: "mañana" })), { status: 400 });
});

test("agregarBloque: no se cruza con otro bloque ni con una tutoría programada", async () => {
  const { m, u, reloj, usuarios } = armar();
  await assert.rejects(() => usuarios.agregarBloque(u.tutorUsuario, bloque({ fecha: "2026-11-12", horaInicio: "15:30", horaFin: "16:30" })), { status: 409 });

  // Reserva real: b1 (15:00-16:00) queda como tutoría programada.
  const sol = await new SolicitudService({ ...m, reloj }).crear(u.est1, cuerpoSolicitud());
  await new SolicitudService({ ...m, reloj }).aceptar(u.tutorUsuario, sol.id);
  m.datos.usuarios.get("tutor1").disponibilidad = []; // sin bloques, solo la tutoría
  await assert.rejects(() => usuarios.agregarBloque(u.tutorUsuario, bloque({ fecha: "2026-11-12", horaInicio: "15:00", horaFin: "15:30" })), { status: 409 });
});

test("agregarBloque / quitarBloque: solo tutores aprobados", async () => {
  const { u, usuarios } = armar();
  await assert.rejects(() => usuarios.agregarBloque(u.tutorNuevo, bloque()), { status: 403 });
  await assert.rejects(() => usuarios.agregarBloque(u.est1, bloque()), { status: 403 });
  await assert.rejects(() => usuarios.quitarBloque(u.tutorNuevo, "b1"), { status: 403 });
});

test("quitarBloque: elimina el bloque y falla si no existe", async () => {
  const { m, u, usuarios } = armar();
  const { disponibilidad } = await usuarios.quitarBloque(u.tutorUsuario, "b1");
  assert.deepEqual(disponibilidad.map((b) => b.id), ["b2", "b3"]);
  assert.equal(m.datos.usuarios.get("tutor1").disponibilidad.length, 2);
  await assert.rejects(() => usuarios.quitarBloque(u.tutorUsuario, "b1"), { status: 404 });
});

// ---------------------------------------------------- solicitud de verificación
test("enviarSolicitudTutor: guarda el PDF aparte y pasa el estado a pendiente", async () => {
  const { m, u, usuarios } = armar();
  const r = await usuarios.enviarSolicitudTutor(u.tutorNuevo, solicitudTutor());
  assert.deepEqual(r, { estado: "pendiente" });

  const perfil = m.datos.usuarios.get("nuevo1");
  assert.equal(perfil.estado, "pendiente");
  assert.equal(perfil.tieneHojaVida, true);
  assert.equal(perfil.hojaVidaPDF, "cv.pdf");
  assert.deepEqual(perfil.materias, ["matematicas", "fisica"]);
  // Los campos del formulario que antes se perdían ahora se guardan.
  assert.equal(perfil.modalidad, "Presencial");
  assert.equal(perfil.nivelEstudios, "pregrado");
  assert.equal(perfil.nivelEnsenanza, "universitario");
  assert.equal(perfil.experiencia, 3);
  assert.equal("hojaVida" in perfil, false);
  assert.equal(perfil.dataURL, undefined); // el PDF NO queda en el perfil
  assert.equal(m.datos.hojasDeVida.get("nuevo1").dataURL, PDF);
});

test("enviarSolicitudTutor: solo mientras está incompleto (no se reenvía ni se salta la revisión)", async () => {
  const { u, usuarios } = armar();
  await usuarios.enviarSolicitudTutor(u.tutorNuevo, solicitudTutor());
  await assert.rejects(() => usuarios.enviarSolicitudTutor({ ...u.tutorNuevo, estado: "pendiente" }, solicitudTutor()), { status: 409 });
  await assert.rejects(() => usuarios.enviarSolicitudTutor({ ...u.tutorNuevo, estado: "aprobado" }, solicitudTutor()), { status: 409 });
});

test("enviarSolicitudTutor: valida materias, franjas, tarifa y que el archivo sea un PDF", async () => {
  const { m, u, usuarios } = armar();
  const t = u.tutorNuevo;
  await assert.rejects(() => usuarios.enviarSolicitudTutor(t, solicitudTutor({ materias: [] })), { status: 400 });
  await assert.rejects(() => usuarios.enviarSolicitudTutor(t, solicitudTutor({ materias: ["magia"] })), { status: 400 });
  await assert.rejects(() => usuarios.enviarSolicitudTutor(t, solicitudTutor({ franjas: ["madrugada"] })), { status: 400 });
  await assert.rejects(() => usuarios.enviarSolicitudTutor(t, solicitudTutor({ tarifa: "30000" })), { status: 400 });
  await assert.rejects(() => usuarios.enviarSolicitudTutor(t, solicitudTutor({ modalidad: "ambas" })), { status: 400 });
  await assert.rejects(() => usuarios.enviarSolicitudTutor(t, solicitudTutor({ modalidad: undefined })), { status: 400 });
  await assert.rejects(() => usuarios.enviarSolicitudTutor(t, solicitudTutor({ nivelEstudios: "doctor" })), { status: 400 });
  await assert.rejects(() => usuarios.enviarSolicitudTutor(t, solicitudTutor({ nivelEnsenanza: undefined })), { status: 400 });
  await assert.rejects(() => usuarios.enviarSolicitudTutor(t, solicitudTutor({ experiencia: -1 })), { status: 400 });
  await assert.rejects(() => usuarios.enviarSolicitudTutor(t, solicitudTutor({ experiencia: "3" })), { status: 400 });
  await assert.rejects(() => usuarios.enviarSolicitudTutor(t, solicitudTutor({ presentacion: "x".repeat(501) })), { status: 400 });
  await assert.rejects(() => usuarios.enviarSolicitudTutor(t, solicitudTutor({ hojaVida: undefined })), { status: 400 });
  await assert.rejects(() => usuarios.enviarSolicitudTutor(t, solicitudTutor({
    hojaVida: { nombreArchivo: "x.exe", tamano: 10, dataURL: "data:application/x-msdownload;base64,AAAA" }
  })), { status: 400 });
  assert.equal(m.datos.usuarios.get("nuevo1").estado, "incompleto"); // nada quedó a medias
  assert.equal(m.datos.hojasDeVida.size, 0);
});
