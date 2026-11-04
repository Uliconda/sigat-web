import assert from "node:assert/strict";
import { test } from "node:test";
import { ESTADOS, esEstado, estaFuera } from "./estados.ts";

test("esEstado ignora mayúsculas y espacios de datos antiguos", () => {
  assert.equal(esEstado("PRESTADO", ESTADOS.PRESTADO), true);
  assert.equal(esEstado(" no responde ", ESTADOS.NO_RESPONDE), true);
  assert.equal(esEstado("Disponible", ESTADOS.PRESTADO, ESTADOS.DISPONIBLE), true);
  assert.equal(esEstado("Prestado", ESTADOS.DISPONIBLE), false);
  assert.equal(esEstado(undefined, ESTADOS.DISPONIBLE), false);
});

test("estaFuera incluye préstamos, sin entregar y faltas", () => {
  for (const estado of [ESTADOS.PRESTADO, ESTADOS.SIN_ENTREGAR, ESTADOS.NO_RESPONDE]) {
    assert.equal(estaFuera(estado), true, estado);
  }
  for (const estado of [ESTADOS.DISPONIBLE, ESTADOS.FUERA_DE_SERVICIO, null]) {
    assert.equal(estaFuera(estado), false, String(estado));
  }
});

test("los valores coinciden con los que acepta la base de datos", () => {
  assert.deepEqual(Object.values(ESTADOS).sort(), [
    "Disponible", "Fuera de Servicio", "No responde", "Prestado", "Sin entregar",
  ]);
});
