import test from "node:test";
import assert from "node:assert/strict";
import { JitsiService } from "../src/services/JitsiService.js";
import { plantillas } from "../src/services/plantillasCorreo.js";

test("Jitsi: crea una URL de sala única bajo la base configurada", () => {
  const j = new JitsiService({ baseUrl: "https://meet.jit.si/" });
  const a = j.crearSala();
  const b = j.crearSala();
  assert.match(a, /^https:\/\/meet\.jit\.si\/TutoresOnline-[0-9a-f]{18}$/);
  assert.notEqual(a, b);
});

test("Correo: el texto del usuario se escapa (sin inyección de HTML)", () => {
  const c = plantillas.nuevaSolicitud({
    estudianteNombre: "<b>Luis</b>", materia: "Mate", fecha: "2026-11-12",
    horaInicio: "15:00", horaFin: "16:00", modalidad: "Virtual", mensaje: "<script>alert(1)</script>"
  });
  assert.equal(c.html.includes("<script>"), false);
  assert.ok(c.html.includes("&lt;script&gt;"));
});

test("Correo: la tutoría programada incluye el enlace de la videollamada", () => {
  const c = plantillas.tutoriaProgramada({
    materia: "Mate", fecha: "2026-11-12", horaInicio: "15:00", horaFin: "16:00",
    modalidad: "Virtual", enlaceReunion: "https://meet.jit.si/TutoresOnline-abc"
  }, "Ana Ruiz");
  assert.ok(c.texto.includes("https://meet.jit.si/TutoresOnline-abc"));
  assert.ok(c.html.includes("Unirme a la videollamada"));
});
