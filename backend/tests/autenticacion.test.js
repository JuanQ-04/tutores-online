import test from "node:test";
import assert from "node:assert/strict";
import { crearAutenticacion } from "../src/middlewares/autenticacion.js";
import { ErrorConfiguracion, NoAutenticado } from "../src/errores.js";

const usuarioRepo = { obtenerPorId: async () => null };
const pedir = (verificarToken) => {
  const { identificar } = crearAutenticacion({ verificarToken, usuarioRepo });
  return new Promise((resolve) =>
    identificar({ headers: { authorization: "Bearer abc" } }, {}, resolve)
  );
};

test("un token que Firebase rechaza sale como 401 «Token inválido o vencido»", async () => {
  const error = await pedir(async () => { throw new Error("jwt expired"); });
  assert.ok(error instanceof NoAutenticado);
  assert.equal(error.message, "Token inválido o vencido");
});

test("si faltan las credenciales del servidor no se culpa al token: el error de configuración se propaga", async () => {
  const error = await pedir(async () => { throw new ErrorConfiguracion("Faltan credenciales de Firebase"); });
  assert.ok(error instanceof ErrorConfiguracion);
  assert.ok(!(error instanceof NoAutenticado));
});
