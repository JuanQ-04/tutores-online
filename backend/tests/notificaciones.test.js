import test from "node:test";
import assert from "node:assert/strict";
import { SolicitudService } from "../src/services/SolicitudService.js";
import { TutoriaService } from "../src/services/TutoriaService.js";
import { CalificacionService } from "../src/services/CalificacionService.js";
import { SoporteService } from "../src/services/SoporteService.js";
import { AdminService } from "../src/services/AdminService.js";
import { UsuarioService } from "../src/services/UsuarioService.js";
import { CambioPerfilService } from "../src/services/CambioPerfilService.js";
import { crearMundo, sembrar, relojFijo, cuerpoSolicitud } from "./helpers/fakes.js";

function armar() {
  const m = crearMundo();
  const u = sembrar(m);
  // Bloques que no se cruzan entre sí (los de la siembra sí se cruzan).
  const t = m.datos.usuarios.get("tutor1");
  ["09", "11", "13", "15"].forEach((h, i) => t.disponibilidad.push({
    id: `n${i}`, fecha: "2026-11-13", horaInicio: `${h}:00`, horaFin: `${String(Number(h) + 1).padStart(2, "0")}:00`, modalidad: "Virtual"
  }));
  const mundo = { ...m, reloj: relojFijo() };
  return {
    m, u,
    solicitudes: new SolicitudService(mundo),
    tutorias: new TutoriaService(mundo),
    calificaciones: new CalificacionService(mundo),
    soporte: new SoporteService(mundo),
    admin: new AdminService(mundo),
    usuarios: new UsuarioService(mundo),
    cambios: new CambioPerfilService(mundo)
  };
}

// Una solicitud en uno de esos bloques: 0 → 09:00, 1 → 11:00, 2 → 13:00, 3 → 15:00.
const hueco = (i) => cuerpoSolicitud({
  fecha: "2026-11-13", horaInicio: `${["09", "11", "13", "15"][i]}:00`, horaFin: `${String(Number(["09", "11", "13", "15"][i]) + 1).padStart(2, "0")}:00`, modalidad: "Virtual"
});

const bandeja = async (m, usuario) => (await m.avisos.listar(usuario)).avisos;

test("solicitud nueva → el tutor recibe una notificación que lleva a esa solicitud", async () => {
  const { m, u, solicitudes } = armar();
  const sol = await solicitudes.crear(u.est1, cuerpoSolicitud());
  const [aviso] = await bandeja(m, u.tutorUsuario);
  assert.equal(aviso.tipo, "solicitud-nueva");
  assert.deepEqual(aviso.destino, { seccion: "solicitudes", id: sol.id });
  assert.match(aviso.detalle, /Luis Perez/);
  assert.equal(aviso.leida, false);
  assert.deepEqual(await bandeja(m, u.est1), []); // el estudiante no recibe la del tutor
});

test("aceptar, rechazar y cancelar avisan a la otra parte con su destino", async () => {
  const { m, u, solicitudes } = armar();
  const a = await solicitudes.crear(u.est1, hueco(0));
  const r = await solicitudes.aceptar(u.tutorUsuario, a.id);
  const [conf] = await bandeja(m, u.est1);
  assert.equal(conf.tipo, "solicitud-aceptada");
  assert.deepEqual(conf.destino, { seccion: "tutorias", id: r.tutoria.id });

  const b = await solicitudes.crear(u.est2, hueco(1));
  await solicitudes.rechazar(u.tutorUsuario, b.id);
  assert.equal((await bandeja(m, u.est2))[0].tipo, "solicitud-rechazada");

  const c = await solicitudes.crear(u.est2, hueco(2));
  await solicitudes.cancelar(u.est2, c.id);
  const deTutor = await bandeja(m, u.tutorUsuario);
  assert.equal(deTutor[0].tipo, "solicitud-cancelada");
  assert.deepEqual(deTutor[0].destino, { seccion: "solicitudes", id: c.id });
});

test("tutoría completada o cancelada y calificación recibida avisan a quien corresponde", async () => {
  const { m, u, solicitudes, tutorias, calificaciones } = armar();
  const s1 = await solicitudes.crear(u.est1, hueco(0));
  const { tutoria } = await solicitudes.aceptar(u.tutorUsuario, s1.id);

  await tutorias.completar(u.tutorUsuario, tutoria.id);
  const [fin] = await bandeja(m, u.est1);
  assert.equal(fin.tipo, "tutoria-completada");
  assert.deepEqual(fin.destino, { seccion: "tutorias", id: tutoria.id });

  await calificaciones.crear(u.est1, { tutoriaId: tutoria.id, estrellas: 5 });
  const recibidos = await bandeja(m, u.tutorUsuario);
  assert.equal(recibidos[0].tipo, "calificacion-nueva");
  assert.match(recibidos[0].titulo, /5 estrellas/);

  const s2 = await solicitudes.crear(u.est2, hueco(1));
  const t2 = (await solicitudes.aceptar(u.tutorUsuario, s2.id)).tutoria;
  await tutorias.cancelar(u.est2, t2.id);
  assert.equal((await bandeja(m, u.tutorUsuario))[0].tipo, "tutoria-cancelada");
});

test("soporte: el caso nuevo llega a TODOS los administradores y a nadie más; la respuesta llega al usuario", async () => {
  const { m, u, soporte, admin } = armar();
  m.datos.usuarios.set("admin2", { id: "admin2", rol: "admin", estado: "activo", nombre: "Otro", apellido: "Admin", email: "a2@test.com" });
  const caso = await soporte.crear(u.est1, { asunto: "No puedo reservar", mensaje: "Me sale un error" });

  for (const id of ["admin1", "admin2"]) {
    const [aviso] = (await m.avisos.listar({ id })).avisos;
    assert.equal(aviso.tipo, "soporte-nuevo");
    assert.deepEqual(aviso.destino, { seccion: "soporte", id: caso.id });
  }
  assert.deepEqual(await bandeja(m, u.est1), []);
  assert.deepEqual(await bandeja(m, u.tutorUsuario), []);

  await admin.actualizarCaso(u.adminUsuario, caso.id, { estado: "revision" });
  assert.equal((await bandeja(m, u.est1))[0].tipo, "soporte-estado");

  await admin.actualizarCaso(u.adminUsuario, caso.id, { estado: "resuelto", respuesta: "Ya quedó corregido, intenta de nuevo." });
  const [resp] = await bandeja(m, u.est1);
  assert.equal(resp.tipo, "soporte-respuesta");
  assert.equal(resp.detalle, "Ya quedó corregido, intenta de nuevo.");
  assert.equal(m.datos.soporte.get(caso.id).respuesta, "Ya quedó corregido, intenta de nuevo.");
  assert.equal(m.datos.soporte.get(caso.id).respondidoPor, "admin1");
});

test("soporte: respuesta vacía o sin cambios se rechazan", async () => {
  const { u, soporte, admin } = armar();
  const caso = await soporte.crear(u.est1, { asunto: "a", mensaje: "b" });
  await assert.rejects(() => admin.actualizarCaso(u.adminUsuario, caso.id, {}), { status: 400 });
  await assert.rejects(() => admin.actualizarCaso(u.adminUsuario, caso.id, { respuesta: "  " }), { status: 400 });
  await assert.rejects(() => admin.actualizarCaso(u.adminUsuario, caso.id, { respuesta: "x".repeat(1001) }), { status: 400 });
});

test("tutor nuevo y aprobación: los administradores se enteran, y el tutor de la decisión", async () => {
  const { m, u, usuarios, admin } = armar();
  const hoja = { nombreArchivo: "cv.pdf", tamano: 10, dataURL: "data:application/pdf;base64,JVBERi0xLjQK" };
  await usuarios.enviarSolicitudTutor(u.tutorNuevo, {
    titulo: "Ingeniería", nivelEstudios: "pregrado", institucion: "UNAL", materias: ["fisica"], nivelEnsenanza: "ambos",
    experiencia: 2, modalidad: "Virtual", ciudad: "Bogotá", tarifa: 30000, franjas: ["tarde"], presentacion: "Hola", hojaVida: hoja
  });
  const [paraAdmin] = await bandeja(m, u.adminUsuario);
  assert.equal(paraAdmin.tipo, "tutor-solicitud");
  assert.deepEqual(paraAdmin.destino, { seccion: "tutores", pestana: "pending", id: "nuevo1" });

  await admin.revisarTutor(u.adminUsuario, "nuevo1", { estado: "aprobado" });
  const [paraTutor] = await bandeja(m, u.tutorNuevo);
  assert.equal(paraTutor.tipo, "tutor-aprobado");
  assert.deepEqual(paraTutor.destino, { seccion: "disponibilidad" });
});

test("actualización de datos: se avisa a los admins al pedirla y al tutor al responderla", async () => {
  const { m, u, cambios } = armar();
  await cambios.solicitar(u.tutorUsuario, {
    titulo: "Física", nivelEstudios: "posgrado", institucion: "UNAL", materias: ["fisica"], nivelEnsenanza: "universitario",
    experiencia: 5, modalidad: "Presencial", ciudad: "Bogotá", tarifa: 50000, franjas: ["noche"], presentacion: "Hola"
  });
  const [paraAdmin] = await bandeja(m, u.adminUsuario);
  assert.equal(paraAdmin.tipo, "cambio-solicitado");
  assert.deepEqual(paraAdmin.destino, { seccion: "tutores", pestana: "updates", id: "tutor1" });
  assert.match(paraAdmin.detalle, /modalidad/);

  await cambios.resolver(u.adminUsuario, "tutor1", { estado: "rechazada", nota: "Falta evidencia" });
  const [paraTutor] = await bandeja(m, u.tutorUsuario);
  assert.equal(paraTutor.tipo, "cambio-rechazado");
  assert.equal(paraTutor.detalle, "Falta evidencia");
});

test("leer: marcar una, marcar todas, y no se puede tocar la de otra persona", async () => {
  const { m, u, solicitudes } = armar();
  await solicitudes.crear(u.est1, hueco(0));
  await solicitudes.crear(u.est2, hueco(1));

  let r = await m.avisos.listar(u.tutorUsuario);
  assert.equal(r.avisos.length, 2);
  assert.equal(r.sinLeer, 2);

  await assert.rejects(() => m.avisos.marcarLeida(u.est1, r.avisos[0].id), { status: 404 }); // es del tutor
  await m.avisos.marcarLeida(u.tutorUsuario, r.avisos[0].id);
  assert.equal((await m.avisos.listar(u.tutorUsuario)).sinLeer, 1);
  await m.avisos.marcarLeida(u.tutorUsuario, r.avisos[0].id); // repetir no falla

  assert.deepEqual(await m.avisos.marcarTodas(u.tutorUsuario), { marcadas: 1 });
  r = await m.avisos.listar(u.tutorUsuario);
  assert.equal(r.sinLeer, 0);
  assert.equal(r.avisos.length, 2); // siguen guardadas: se ven como leídas
  assert.equal((await m.avisos.listar(u.tutorUsuario)).avisos[0].creadaEn, "2026-11-11T15:00:00.000Z");
});

test("si no se puede guardar la notificación, la operación principal NO se deshace", async () => {
  const { m, u, solicitudes } = armar();
  const original = console.error;
  console.error = () => {};
  m.bandejaRepo.crear = async () => { throw new Error("Firestore caído"); };
  try {
    const sol = await solicitudes.crear(u.est1, cuerpoSolicitud());
    assert.equal(sol.estado, "pendiente");
  } finally {
    console.error = original;
  }
});
