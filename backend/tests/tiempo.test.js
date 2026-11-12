import test from "node:test";
import assert from "node:assert/strict";
import { seSolapan, esVirtual, Reloj } from "../src/utils/tiempo.js";

test("seSolapan: detecta cruces y deja pasar franjas contiguas", () => {
  const base = { fecha: "2026-11-12", horaInicio: "15:00", horaFin: "16:00" };
  assert.equal(seSolapan(base, { ...base, horaInicio: "15:30", horaFin: "16:30" }), true);
  assert.equal(seSolapan(base, { ...base, horaInicio: "16:00", horaFin: "17:00" }), false);
  assert.equal(seSolapan(base, { ...base, fecha: "2026-11-13" }), false);
});

test("esVirtual: Virtual y 'Virtual y presencial' sí; Presencial no", () => {
  assert.equal(esVirtual("Virtual"), true);
  assert.equal(esVirtual("Virtual y presencial"), true);
  assert.equal(esVirtual("Presencial"), false);
});

test("Reloj: usa la hora de Bogotá (UTC-5)", () => {
  const r = new Reloj({ zona: "America/Bogota", ahoraFn: () => new Date("2026-11-12T03:30:00Z") });
  assert.deepEqual(r.ahora(), { fecha: "2026-11-11", hora: "22:30" });
  assert.equal(r.yaPaso("2026-11-11", "22:00"), true);
  assert.equal(r.yaPaso("2026-11-11", "23:00"), false);
  assert.equal(r.yaPaso("2026-11-12", "01:00"), false);
});
